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

function buildSystemPrompt({ settings, tools, state }) {
  const basePrompt = String(settings.petSystemPrompt || '').trim()
    || '你是 Agent OS 的常驻桌宠。直接调用 Agent OS 内部 app 接口完成任务，不通过 Hermes。';
  return `${basePrompt}

你只能通过 Agent OS 内部 app 接口完成操作。不要要求用户去 Hermes 中执行，也不要调用 Hermes WebSocket。

必须只返回 JSON，格式如下：
{
  "reply": "给用户看的简短中文回复",
  "actions": [
    { "name": "app.notepad.createNote", "args": { "title": "标题", "body": "内容" } }
  ],
  "live2d": { "emotion": "happy", "actions": ["look_at_chat", "nod"] }
}

可用动作：
${JSON.stringify(tools, null, 2)}

当前 Agent OS 状态：
${JSON.stringify(state, null, 2)}`;
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
    actions: Array.isArray(parsed.actions) ? parsed.actions : [],
    live2d: parsed.live2d || parsed.intent || null,
    raw: parsed
  };
}

export async function callPetModel({ settings, input, tools, state, actionResults = [], previousResponse = null }) {
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
        temperature: 0.2
      }
    : {
        model,
        messages,
        temperature: 0.2
      };

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(async () => ({ error: { message: await response.text().catch(() => '') } }));
  if (!response.ok) {
    throw new Error(data?.error?.message || `模型 API 请求失败：${response.status}`);
  }
  return parsePetModelResponse(readChatText(data));
}
