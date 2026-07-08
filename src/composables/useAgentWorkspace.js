import { computed, ref, watch } from 'vue';
import {
  ACTIVE_CONVERSATION_STORAGE_KEY,
  CONVERSATIONS_STORAGE_KEY,
  MAX_CONVERSATIONS,
  PROJECTS_STORAGE_KEY
} from '../modules/agentOs/config';
import { createId, normalizeWorkspacePath, workspaceLabelFromPath } from '../modules/agentOs/formatters';
import {
  conversationTitleFromText,
  createWelcomeMessages,
  readActiveConversationId,
  readConversations,
  readProjectHistory,
  sanitizeConversation,
  sanitizeMessage,
  sanitizeProcessEvent
} from '../modules/agentOs/conversationStore';
import { readablePacketTitle } from '../modules/hermes/hermesPackets';

export function useAgentWorkspace({ settings, sidebarSearchOpen, sidebarSearchQuery }) {
  const projectHistory = ref(readProjectHistory());
  const conversations = ref(readConversations());
  const activeConversationId = ref(readActiveConversationId(conversations.value, settings.workspace));
  const initialConversation = conversations.value.find((item) => item.id === activeConversationId.value);

  if (!settings.workspace && initialConversation?.projectPath) settings.workspace = initialConversation.projectPath;

  const messages = ref(initialConversation?.messages?.length ? initialConversation.messages.map(sanitizeMessage) : createWelcomeMessages());
  const processEvents = ref(initialConversation?.processEvents?.map(sanitizeProcessEvent) || []);

  const messageCount = computed(() => messages.value.length);
  const visibleMessages = computed(() => messages.value
    .filter((item) => ['user', 'assistant', 'system', 'error', 'final'].includes(item.type))
    .slice(-12));
  const visibleProcessEvents = computed(() => processEvents.value.slice(-16).reverse());
  const normalizedSidebarSearchQuery = computed(() => sidebarSearchQuery.value.trim().toLowerCase());
  const displayedMessages = computed(() => {
    const query = normalizedSidebarSearchQuery.value;
    if (!query) return visibleMessages.value;
    return visibleMessages.value.filter((item) => `${item.title} ${item.text} ${readablePacketTitle(item.type)}`.toLowerCase().includes(query));
  });
  const displayedProcessEvents = computed(() => {
    const query = normalizedSidebarSearchQuery.value;
    if (!query) return visibleProcessEvents.value;
    return visibleProcessEvents.value.filter((item) => `${item.title} ${item.text} ${item.type}`.toLowerCase().includes(query));
  });
  const workspaceName = computed(() => workspaceLabelFromPath(settings.workspace));
  const sidebarProjects = computed(() => {
    const byPath = new Map();
    const addProject = (path, updatedAt = Date.now()) => {
      const normalized = normalizeWorkspacePath(path);
      if (!normalized) return;
      const existing = byPath.get(normalized);
      byPath.set(normalized, {
        path: normalized,
        label: existing?.label || workspaceLabelFromPath(normalized),
        updatedAt: Math.max(existing?.updatedAt || 0, updatedAt),
        conversationCount: conversations.value.filter((item) => item.projectPath === normalized).length
      });
    };
    projectHistory.value.forEach((item) => addProject(item.path, item.updatedAt));
    conversations.value.forEach((item) => addProject(item.projectPath, item.updatedAt));
    addProject(settings.workspace, Date.now());
    return [...byPath.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  });
  const visibleSidebarProjects = computed(() => {
    const query = normalizedSidebarSearchQuery.value;
    if (!query) return sidebarProjects.value;
    return sidebarProjects.value.filter((item) => `${item.label} ${item.path}`.toLowerCase().includes(query));
  });
  const visibleSidebarConversations = computed(() => {
    const query = normalizedSidebarSearchQuery.value;
    const workspace = normalizeWorkspacePath(settings.workspace);
    return conversations.value
      .filter((item) => item.projectPath === workspace)
      .filter((item) => {
        if (!query) return true;
        const lastMessage = item.messages.at(-1)?.text || '';
        return `${item.title} ${lastMessage}`.toLowerCase().includes(query);
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  });

  function rememberWorkspace(path) {
    const normalized = normalizeWorkspacePath(path);
    if (!normalized) return;
    projectHistory.value = [
      { path: normalized, label: workspaceLabelFromPath(normalized), updatedAt: Date.now() },
      ...projectHistory.value.filter((item) => item.path !== normalized)
    ].slice(0, 12);
  }

  function getActiveConversation() {
    return conversations.value.find((item) => item.id === activeConversationId.value) || null;
  }

  function hasConversationContent(items = messages.value) {
    return items.some((item) => ['user', 'assistant', 'final', 'error', 'live2d'].includes(item.type));
  }

  function persistActiveConversation() {
    const conversation = getActiveConversation();
    if (!conversation) return;
    conversation.projectPath = normalizeWorkspacePath(conversation.projectPath || settings.workspace);
    conversation.messages = messages.value.map(sanitizeMessage);
    conversation.processEvents = processEvents.value.map(sanitizeProcessEvent);
    conversation.updatedAt = Date.now();
    conversation.title = conversationTitleFromText(conversation.messages.find((item) => item.type === 'user')?.text || conversation.title);
  }

  function createConversation(title = '新对话', workspace = settings.workspace) {
    const nowTime = Date.now();
    const conversation = {
      id: createId('conv'),
      title: conversationTitleFromText(title),
      projectPath: normalizeWorkspacePath(workspace),
      messages: [],
      processEvents: [],
      createdAt: nowTime,
      updatedAt: nowTime
    };
    conversations.value = [conversation, ...conversations.value].slice(0, MAX_CONVERSATIONS);
    activeConversationId.value = conversation.id;
    rememberWorkspace(conversation.projectPath);
    return conversation;
  }

  function ensureActiveConversation(title = '新对话') {
    const conversation = getActiveConversation();
    const workspace = normalizeWorkspacePath(settings.workspace);
    if (conversation && conversation.projectPath === workspace) {
      if (conversation.title === '新对话' && title) conversation.title = conversationTitleFromText(title);
      return conversation;
    }
    return createConversation(title);
  }

  function loadConversation(conversation) {
    if (!conversation) return;
    activeConversationId.value = conversation.id;
    settings.workspace = conversation.projectPath || settings.workspace;
    messages.value = conversation.messages?.length ? conversation.messages.map(sanitizeMessage) : [];
    processEvents.value = conversation.processEvents?.map(sanitizeProcessEvent) || [];
    sidebarSearchOpen.value = false;
    sidebarSearchQuery.value = '';
  }

  function selectProject(project) {
    settings.workspace = project.path;
    rememberWorkspace(project.path);
    const latestConversation = conversations.value
      .filter((item) => item.projectPath === project.path)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (latestConversation) {
      loadConversation(latestConversation);
      return true;
    }
    activeConversationId.value = '';
    messages.value = createWelcomeMessages();
    processEvents.value = [];
    sidebarSearchOpen.value = false;
    sidebarSearchQuery.value = '';
    return false;
  }

  function addMessage(entry) {
    messages.value.push({
      id: entry.id || createId('msg'),
      type: entry.type || 'message',
      title: entry.title || '',
      text: entry.text || '',
      data: entry.data || null,
      at: entry.at || Date.now()
    });
  }

  function addProcessEvent(entry) {
    processEvents.value.push({
      id: entry.id || createId('evt'),
      type: entry.type || 'event',
      title: entry.title || readablePacketTitle(entry.type || 'event'),
      text: entry.text || '',
      at: entry.at || Date.now()
    });
    if (processEvents.value.length > 120) processEvents.value.splice(0, processEvents.value.length - 120);
  }

  function clearConversationEvents() {
    messages.value = [];
    processEvents.value = [];
  }

  watch(() => settings.workspace, (workspace) => {
    rememberWorkspace(workspace);
  }, { immediate: true });

  watch(projectHistory, () => {
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projectHistory.value));
  }, { deep: true });

  watch(conversations, () => {
    localStorage.setItem(CONVERSATIONS_STORAGE_KEY, JSON.stringify(conversations.value.map(sanitizeConversation)));
  }, { deep: true });

  watch(activeConversationId, (id) => {
    if (id) localStorage.setItem(ACTIVE_CONVERSATION_STORAGE_KEY, id);
    else localStorage.removeItem(ACTIVE_CONVERSATION_STORAGE_KEY);
  });

  watch(messages, persistActiveConversation, { deep: true });
  watch(processEvents, persistActiveConversation, { deep: true });

  return {
    activeConversationId,
    addMessage,
    addProcessEvent,
    clearConversationEvents,
    conversations,
    createConversation,
    displayedMessages,
    displayedProcessEvents,
    ensureActiveConversation,
    getActiveConversation,
    hasConversationContent,
    loadConversation,
    messageCount,
    messages,
    normalizedSidebarSearchQuery,
    processEvents,
    rememberWorkspace,
    selectProject,
    visibleSidebarConversations,
    visibleSidebarProjects,
    workspaceName
  };
}
