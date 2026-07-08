import {
  ACTIVE_CONVERSATION_STORAGE_KEY,
  CONVERSATIONS_STORAGE_KEY,
  MAX_CONVERSATIONS,
  PROJECTS_STORAGE_KEY
} from './config';
import { createId, normalizeWorkspacePath, workspaceLabelFromPath } from './formatters';

export function readJsonStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return value ?? fallback;
  } catch (_) {
    return fallback;
  }
}

export function createWelcomeMessages() {
  return [{
    id: 'welcome',
    type: 'system',
    title: 'Agent OS 已就绪',
    text: 'Hermes、Stream、Yachiyo 和 Settings 已作为桌面应用固定到任务栏。',
    at: Date.now()
  }];
}

export function sanitizeMessage(item) {
  return {
    id: item.id || createId('msg'),
    type: item.type || 'message',
    title: item.title || '',
    text: String(item.text || '').slice(0, 24000),
    data: item.data || null,
    at: item.at || Date.now()
  };
}

export function sanitizeProcessEvent(item) {
  return {
    id: item.id || createId('evt'),
    type: item.type || 'event',
    title: item.title || '',
    text: String(item.text || '').slice(0, 24000),
    at: item.at || Date.now()
  };
}

export function conversationTitleFromText(text) {
  const title = String(text || '').replace(/\s+/g, ' ').trim();
  return title ? title.slice(0, 34) : '新对话';
}

export function sanitizeConversation(item) {
  const createdAt = Number(item.createdAt) || Date.now();
  const updatedAt = Number(item.updatedAt) || createdAt;
  return {
    id: item.id || createId('conv'),
    title: conversationTitleFromText(item.title || ''),
    projectPath: normalizeWorkspacePath(item.projectPath),
    messages: Array.isArray(item.messages) ? item.messages.slice(-80).map(sanitizeMessage) : [],
    processEvents: Array.isArray(item.processEvents) ? item.processEvents.slice(-120).map(sanitizeProcessEvent) : [],
    createdAt,
    updatedAt
  };
}

export function readConversations() {
  const stored = readJsonStorage(CONVERSATIONS_STORAGE_KEY, []);
  return (Array.isArray(stored) ? stored : [])
    .map(sanitizeConversation)
    .filter((item) => item.id)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_CONVERSATIONS);
}

export function readProjectHistory() {
  const stored = readJsonStorage(PROJECTS_STORAGE_KEY, []);
  return (Array.isArray(stored) ? stored : [])
    .map((item) => ({
      path: normalizeWorkspacePath(item.path),
      label: item.label || workspaceLabelFromPath(item.path),
      updatedAt: Number(item.updatedAt) || Date.now()
    }))
    .filter((item) => item.path)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function readActiveConversationId(items, workspace) {
  const saved = localStorage.getItem(ACTIVE_CONVERSATION_STORAGE_KEY) || '';
  const normalizedWorkspace = normalizeWorkspacePath(workspace);
  const savedConversation = items.find((item) => item.id === saved);
  if (savedConversation && (!normalizedWorkspace || savedConversation.projectPath === normalizedWorkspace)) return saved;
  return items.find((item) => item.projectPath === normalizedWorkspace)?.id || '';
}
