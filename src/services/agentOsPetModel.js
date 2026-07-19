import { isAgentOsSearchUrl, normalizeBrowserSearchQuery } from './browserNavigation.js';

function stripCodeFence(value = '') {
  return String(value || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function extractJsonObject(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const direct = stripCodeFence(raw);
  try {
    return JSON.parse(direct);
  } catch (_) {
    // Continue with a looser object extraction below.
  }

  const start = direct.indexOf('{');
  const end = direct.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(direct.slice(start, end + 1));
  } catch (_) {
    return null;
  }
}

function normalizeApiUrl(value = '') {
  const url = String(value || '').trim().replace(/\/+$/, '');
  if (!url) return '';
  if (/\/(chat\/completions|responses)$/i.test(url)) return url;
  if (/\/v1$/i.test(url)) return `${url}/chat/completions`;
  return `${url}/v1/chat/completions`;
}

function readChatText(data) {
  if (!data || typeof data !== 'object') return '';
  const choice = data.choices?.[0];
  if (choice?.message?.content) return String(choice.message.content);
  if (choice?.text) return String(choice.text);
  if (data.output_text) return String(data.output_text);
  if (Array.isArray(data.output)) {
    return data.output
      .flatMap((item) => item.content || [])
      .map((item) => item.text || item.value || '')
      .join('');
  }
  return '';
}

export function readStreamingJsonStringField(text = '', fieldName = 'reply') {
  const source = String(text || '');
  const escapedField = String(fieldName || 'reply').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const marker = new RegExp(`"${escapedField}"\\s*:\\s*"`, 'i').exec(source);
  if (!marker) return { value: '', complete: false };

  let value = '';
  let index = marker.index + marker[0].length;
  while (index < source.length) {
    const char = source[index];
    if (char === '"') return { value, complete: true };
    if (char !== '\\') {
      value += char;
      index += 1;
      continue;
    }

    const escape = source[index + 1];
    if (!escape) break;
    if (escape === 'u') {
      const hex = source.slice(index + 2, index + 6);
      if (!/^[0-9a-f]{4}$/i.test(hex)) break;
      value += String.fromCharCode(Number.parseInt(hex, 16));
      index += 6;
      continue;
    }
    value += ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' })[escape] ?? escape;
    index += 2;
  }
  return { value, complete: false };
}

export function readStreamingJsonObjectField(text = '', fieldName = 'live2d') {
  const source = String(text || '');
  const escapedField = String(fieldName || 'live2d').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const marker = new RegExp(`"${escapedField}"\\s*:\\s*`, 'i').exec(source);
  if (!marker) return { value: null, complete: false };
  const start = source.indexOf('{', marker.index + marker[0].length);
  if (start < 0) return { value: null, complete: false };

  let depth = 0;
  let insideString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (insideString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') insideString = false;
      continue;
    }
    if (char === '"') {
      insideString = true;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') depth -= 1;
    if (depth !== 0) continue;
    try {
      return { value: JSON.parse(source.slice(start, index + 1)), complete: true };
    } catch (_) {
      return { value: null, complete: false };
    }
  }
  return { value: null, complete: false };
}

function streamedContentText(payload = {}) {
  const content = payload.choices?.[0]?.delta?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((item) => item?.text || item?.value || '').join('');
  }
  if (payload.type === 'response.output_text.delta' && typeof payload.delta === 'string') {
    return payload.delta;
  }
  return typeof payload.output_text === 'string' ? payload.output_text : '';
}

async function readPetModelEventStream(response, onContentDelta) {
  const reader = response.body?.getReader?.();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let lineBuffer = '';
  let dataLines = [];
  let content = '';

  const flushEvent = () => {
    if (!dataLines.length) return;
    const eventData = dataLines.join('\n').trim();
    dataLines = [];
    if (!eventData || eventData === '[DONE]') return;
    try {
      const delta = streamedContentText(JSON.parse(eventData));
      if (!delta) return;
      content += delta;
      onContentDelta?.(delta, content);
    } catch (_) {
      // Ignore keepalive or provider-specific SSE events that do not contain text.
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    lineBuffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    let newline = lineBuffer.indexOf('\n');
    while (newline >= 0) {
      const line = lineBuffer.slice(0, newline).replace(/\r$/, '');
      lineBuffer = lineBuffer.slice(newline + 1);
      if (!line) flushEvent();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
      newline = lineBuffer.indexOf('\n');
    }
    if (done) break;
  }
  if (lineBuffer.trim().startsWith('data:')) dataLines.push(lineBuffer.trim().slice(5).trimStart());
  flushEvent();
  return content;
}

function buildSystemPrompt({ settings, tools, state }) {
  const basePrompt = String(settings.petSystemPrompt || '').trim()
    || '你是 Agent OS 的常驻桌宠。直接调用 Agent OS 内部 app 接口完成任务，不通过 Hermes。';
  return `${basePrompt}

你只能通过 Agent OS 内部 app 接口完成操作。不要要求用户去 Hermes 中执行，也不要调用 Hermes WebSocket。

必须只返回 JSON，格式如下：
{
  "live2d": { "emotion": "happy", "actions": ["look_at_chat", "nod"] },
  "reply": "给用户看的简短中文回复",
  "actions": [
    { "name": "app.notepad.createNote", "args": { "title": "标题", "body": "内容" } }
  ]
}

可用动作：
${JSON.stringify(tools, null, 2)}

当前 Agent OS 状态：
${JSON.stringify(state, null, 2)}

浏览器搜索规则：调用 app.browser.search 时，args.query 只能填写原始搜索关键词。禁止生成或传入 agentos://search URL，也不要对关键词做 URL 编码。`;
}

export function normalizePetModelAction(action = {}) {
  const originalName = String(action?.name || '').trim();
  const name = originalName.replace(/^agentos\./, '');
  const args = action?.args && typeof action.args === 'object' ? { ...action.args } : {};

  if (name === 'app.browser.search') {
    return {
      ...action,
      name,
      args: { ...args, query: normalizeBrowserSearchQuery(args.query || args.url || '') }
    };
  }

  if (name === 'app.browser.open' && isAgentOsSearchUrl(args.url || args.query)) {
    return {
      ...action,
      name: 'app.browser.search',
      args: { query: normalizeBrowserSearchQuery(args.url || args.query) }
    };
  }

  return { ...action, name: originalName || name, args };
}

export function parsePetModelResponse(text) {
  const parsed = extractJsonObject(text);
  if (!parsed || typeof parsed !== 'object') {
    return {
      reply: String(text || '').trim() || '我没有拿到可执行的模型回复。',
      actions: [],
      live2d: null,
      raw: text
    };
  }
  return {
    reply: String(parsed.reply || parsed.message || '').trim(),
    actions: Array.isArray(parsed.actions) ? parsed.actions.map(normalizePetModelAction) : [],
    live2d: parsed.live2d || parsed.intent || null,
    raw: parsed
  };
}

export async function callPetModelStream({
  settings,
  input,
  tools,
  state,
  actionResults = [],
  previousResponse = null,
  onReplyDelta,
  onLive2D
}) {
  const apiUrl = normalizeApiUrl(settings.llmApiUrl);
  const apiKey = String(settings.llmApiKey || '').trim();
  const model = String(settings.llmModel || '').trim() || 'gpt-4o-mini';
  if (!apiUrl) throw new Error('请先在设置里填写模型 API URL。');
  if (!apiKey) throw new Error('请先在设置里填写模型 API Key。');

  const messages = [
    { role: 'system', content: buildSystemPrompt({ settings, tools, state }) },
    { role: 'user', content: String(input || '').trim() }
  ];
  if (actionResults.length) {
    messages.push(
      { role: 'assistant', content: JSON.stringify(previousResponse || { actions: [] }) },
      {
        role: 'user',
        content: `Agent OS 已执行动作。请根据下面的真实结果回答用户，不要再次调用已经完成的动作；只返回 JSON。\n${JSON.stringify(actionResults, null, 2)}`
      }
    );
  }
  const body = /\/responses$/i.test(apiUrl)
    ? {
        model,
        input: messages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join('\n\n'),
        temperature: 0.2,
        stream: true
      }
    : {
        model,
        messages,
        temperature: 0.2,
        stream: true
      };

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const data = await response.json().catch(async () => ({ error: { message: await response.text().catch(() => '') } }));
    throw new Error(data?.error?.message || `模型 API 请求失败：${response.status}`);
  }
  let publishedReply = '';
  let publishedLive2D = '';
  const publishLive2DProgress = (rawText) => {
    const nextIntent = readStreamingJsonObjectField(rawText, 'live2d').value;
    if (!nextIntent) return;
    const signature = JSON.stringify(nextIntent);
    if (signature === publishedLive2D) return;
    publishedLive2D = signature;
    onLive2D?.(nextIntent);
  };
  const publishReplyProgress = (rawText) => {
    const nextReply = readStreamingJsonStringField(rawText, 'reply').value;
    if (!nextReply || nextReply === publishedReply) return;
    const delta = nextReply.startsWith(publishedReply)
      ? nextReply.slice(publishedReply.length)
      : nextReply;
    publishedReply = nextReply;
    if (delta) onReplyDelta?.(delta, nextReply);
  };

  const contentType = String(response.headers.get('Content-Type') || '').toLowerCase();
  let rawText = '';
  if (contentType.includes('text/event-stream')) {
    rawText = await readPetModelEventStream(response, (_delta, accumulated) => {
      publishLive2DProgress(accumulated);
      publishReplyProgress(accumulated);
    });
  } else {
    const data = await response.json().catch(async () => ({
      error: { message: await response.text().catch(() => '') }
    }));
    rawText = readChatText(data);
  }

  const result = parsePetModelResponse(rawText);
  if (result.live2d && JSON.stringify(result.live2d) !== publishedLive2D) onLive2D?.(result.live2d);
  if (result.reply && result.reply !== publishedReply) {
    const delta = result.reply.startsWith(publishedReply)
      ? result.reply.slice(publishedReply.length)
      : result.reply;
    if (delta) onReplyDelta?.(delta, result.reply);
  }
  return result;
}

export function callPetModel(options) {
  return callPetModelStream(options);
}
