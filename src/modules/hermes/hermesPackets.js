export function stringifyPacket(packet) {
  try {
    return JSON.stringify(packet?.data || packet?.raw || packet, null, 2);
  } catch (_) {
    return String(packet?.data || packet?.raw || packet || '');
  }
}

export function readablePacketTitle(type) {
  if (/delta|stream/i.test(type)) return '流式输出';
  if (/tool|command|exec/i.test(type)) return '工具事件';
  if (/live2d|avatar/i.test(type)) return 'Live2D 控制';
  if (/error/i.test(type)) return '错误';
  if (/final|complete|result/i.test(type)) return '最终结果';
  return String(type || '消息');
}

export function contentText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((item) => {
      if (typeof item === 'string') return item;
      return item?.text || item?.content || item?.input_text || item?.output_text || '';
    }).filter(Boolean).join('\n');
  }
  if (content && typeof content === 'object') {
    return content.text || content.content || content.message || content.reply || content.delta || content.output_text || '';
  }
  return '';
}

export function responseOutputText(output) {
  if (typeof output === 'string') return output;
  if (!Array.isArray(output)) return '';
  return output.map((item) => {
    if (typeof item === 'string') return item;
    return item?.text
      || item?.message
      || item?.reply
      || item?.output_text
      || contentText(item?.content)
      || contentText(item?.message?.content)
      || '';
  }).filter(Boolean).join('\n');
}

export function responsePayload(data = {}) {
  return data.response || data.result || data.output || data.message || data.content || data.final || data;
}

export function assistantTextFromPayload(data = {}) {
  const payload = responsePayload(data);
  if (typeof payload === 'string') return payload;
  return payload?.reply
    || payload?.text
    || payload?.message
    || payload?.content
    || payload?.output_text
    || responseOutputText(payload?.output)
    || contentText(payload?.choices?.[0]?.message?.content);
}

export function packetText(packet) {
  const data = packet?.data || packet?.raw || packet || {};
  return packet?.text || packet?.message || packet?.reply || data.text || data.message || data.reply || data.delta || contentText(data.content) || assistantTextFromPayload(data);
}

export function isStreamingPacket(type, packet = null) {
  const data = packet?.data || packet?.raw || packet || {};
  return /delta|stream|chunk|token|content\.part/i.test(type)
    || Boolean(data.delta && !data.final && !data.done && data.status !== 'completed');
}

export function isToolResultPayload(type, packet) {
  const data = packet?.data || packet?.raw || packet || {};
  if (/tool|skill|command|exec|delegate|browser|shell|stdout|stderr|log/i.test(type)) return true;
  if (data.tool || data.tool_name || data.skill || data.command || data.stdout || data.stderr || data.trace || data.steps) return true;
  if (Array.isArray(data.items) || Array.isArray(data.events)) return true;
  return false;
}

export function isFinalPacket(type, packet, text) {
  const data = packet?.data || packet?.raw || packet || {};
  if (/final|complete|completed|result|response\.done|message\.done|run\.finished/i.test(type)) return true;
  if (data.final === true || data.done === true || data.completed === true || data.status === 'completed') return true;
  const hasResponseShape = data.response || data.result || data.output || data.choices?.[0]?.message;
  return Boolean(hasResponseShape && text && !isStreamingPacket(type, packet));
}

export function finalResultText(packet, text) {
  const data = packet?.data || packet?.raw || packet || {};
  return assistantTextFromPayload(data) || text || stringifyPacket(packet);
}
