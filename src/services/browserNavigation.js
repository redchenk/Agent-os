export const AGENT_OS_SEARCH_URL_PREFIX = 'agentos://search?q=';

function safeDecode(value) {
  const source = String(value || '').replace(/\+/g, ' ');
  try {
    return decodeURIComponent(source);
  } catch (_) {
    return source;
  }
}

export function isAgentOsSearchUrl(value) {
  return String(value || '').trim().toLowerCase().startsWith(AGENT_OS_SEARCH_URL_PREFIX);
}

function queryParameterFromSearchUrl(value) {
  const source = String(value || '').trim();
  const queryIndex = source.indexOf('?');
  if (queryIndex < 0) return '';
  try {
    return new URLSearchParams(source.slice(queryIndex + 1)).get('q') || '';
  } catch (_) {
    return source.slice(AGENT_OS_SEARCH_URL_PREFIX.length);
  }
}

export function normalizeBrowserSearchQuery(value, maxDepth = 5) {
  let current = String(value || '').trim();
  for (let depth = 0; current && depth < maxDepth; depth += 1) {
    if (isAgentOsSearchUrl(current)) {
      const nested = queryParameterFromSearchUrl(current).trim();
      if (!nested || nested === current) return nested;
      current = nested;
      continue;
    }
    if (/%[0-9a-f]{2}/i.test(current)) {
      const decoded = safeDecode(current).trim();
      if (decoded !== current) {
        current = decoded;
        continue;
      }
    }
    break;
  }
  return current;
}

export function buildAgentOsSearchUrl(query) {
  return `${AGENT_OS_SEARCH_URL_PREFIX}${encodeURIComponent(normalizeBrowserSearchQuery(query))}`;
}
