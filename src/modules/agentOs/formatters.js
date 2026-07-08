export function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`;
}

export function normalizeWorkspacePath(path) {
  return String(path || '').trim();
}

export function workspaceLabelFromPath(path) {
  const parts = normalizeWorkspacePath(path).split(/[\\/]+/).filter(Boolean);
  return parts.at(-1) || 'workspace';
}

export function formatTime(timestamp = Date.now()) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(timestamp);
}

export function formatDate(timestamp = Date.now()) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit'
  }).format(timestamp);
}

export function formatBytes(bytes = 0) {
  const value = Number(bytes) || 0;
  if (!value) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}
