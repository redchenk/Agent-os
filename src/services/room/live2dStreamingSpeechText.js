const STRONG_BOUNDARIES = new Set(['.', '!', '?', ';', '\n', '\u3002', '\uff01', '\uff1f', '\uff1b']);
const CLAUSE_BOUNDARIES = new Set([',', ':', '\u3001', '\uff0c', '\uff1a']);

function compactLength(value) {
  return String(value || '').replace(/\s+/g, '').length;
}

function strongBoundaryIndex(value) {
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (!STRONG_BOUNDARIES.has(char)) continue;
    if (char === '.') {
      if (/\d/.test(value[index - 1] || '') && /\d/.test(value[index + 1] || '')) continue;
      const tokenStart = Math.max(value.lastIndexOf(' ', index), value.lastIndexOf('\n', index)) + 1;
      if (/^https?:\/\//i.test(value.slice(tokenStart, index + 1))) continue;
    }
    return index;
  }
  return -1;
}

function clauseBoundaryIndex(value, minChars, maxChars) {
  let best = -1;
  for (let index = 0; index < value.length; index += 1) {
    if (!CLAUSE_BOUNDARIES.has(value[index])) continue;
    const length = compactLength(value.slice(0, index + 1));
    if (length < minChars) continue;
    best = index;
    if (length >= maxChars) break;
  }
  return best;
}

export function mergeStreamingText(previous, incoming) {
  const current = String(previous || '');
  const next = String(incoming || '');
  if (!next) return current;
  if (!current) return next;
  if (next === current) return current;
  if (next.startsWith(current)) return next;
  if (next.length >= 8 && current.startsWith(next)) return current;
  return `${current}${next}`;
}

export function cleanStreamingSpeechChunk(value) {
  return String(value || '')
    .replace(/`[^`\n]*`/g, '')
    .replace(/https?:\/\/[^\s)\]}>\uff0c\u3002\uff01\uff1f!?\uff1b;]+/giu, '')
    .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]\s|\d+[.)]\s)\s*/gm, '')
    .replace(/[*_~]{1,3}/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+([,.!?;:\u3001\u3002\uff0c\uff01\uff1f\uff1b\uff1a])/gu, '$1')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export function createStreamingSpeechTextBuffer(options = {}) {
  const firstClauseMinChars = Math.max(Number(options.firstClauseMinChars) || 24, 12);
  const preferredChunkChars = Math.max(Number(options.preferredChunkChars) || 42, firstClauseMinChars);
  const maxChunkChars = Math.max(Number(options.maxChunkChars) || 72, preferredChunkChars);
  let receivedText = '';
  let pendingText = '';
  let fenceCarry = '';
  let insideCodeFence = false;

  function filterCodeFences(fragment, final = false) {
    let input = `${fenceCarry}${String(fragment || '')}`;
    fenceCarry = '';
    if (!final) {
      const trailing = input.match(/`{1,2}$/)?.[0] || '';
      if (trailing) {
        fenceCarry = trailing;
        input = input.slice(0, -trailing.length);
      }
    }

    let output = '';
    while (input) {
      const marker = input.indexOf('```');
      if (marker < 0) {
        if (!insideCodeFence) output += input;
        break;
      }
      if (!insideCodeFence) output += input.slice(0, marker);
      insideCodeFence = !insideCodeFence;
      input = input.slice(marker + 3);
    }
    return output;
  }

  function drain(final = false) {
    const chunks = [];
    while (pendingText) {
      const strongIndex = strongBoundaryIndex(pendingText);
      let splitIndex = strongIndex;
      if (splitIndex < 0) {
        const length = compactLength(pendingText);
        if (!final && length < firstClauseMinChars) break;
        splitIndex = clauseBoundaryIndex(pendingText, firstClauseMinChars, preferredChunkChars);
        if (splitIndex < 0 && !final && length < maxChunkChars) break;
        if (splitIndex < 0 && !final) splitIndex = Math.min(pendingText.length - 1, maxChunkChars - 1);
        if (splitIndex < 0 && final) splitIndex = pendingText.length - 1;
      }

      const rawChunk = pendingText.slice(0, splitIndex + 1);
      pendingText = pendingText.slice(splitIndex + 1);
      const cleaned = cleanStreamingSpeechChunk(rawChunk);
      if (cleaned) chunks.push(cleaned);
    }
    return chunks;
  }

  function append(fragment, final = false) {
    const merged = mergeStreamingText(receivedText, fragment);
    const delta = merged.startsWith(receivedText) ? merged.slice(receivedText.length) : String(fragment || '');
    receivedText = merged;
    pendingText += filterCodeFences(delta, final);
    return drain(final);
  }

  return {
    push(fragment) {
      return append(fragment, false);
    },
    finish(finalText = '') {
      const chunks = append(finalText, false);
      pendingText += filterCodeFences('', true);
      return [...chunks, ...drain(true)];
    },
    getText() {
      return receivedText;
    },
    reset() {
      receivedText = '';
      pendingText = '';
      fenceCarry = '';
      insideCodeFence = false;
    }
  };
}
