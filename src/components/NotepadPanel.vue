<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import {
  ClipboardCopy,
  Download,
  Eye,
  FileText,
  PencilLine,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash2,
  Upload
} from 'lucide-vue-next';

const NOTES_STORAGE_KEY = 'hermesAgentOsNotes:v1';
const ACTIVE_NOTE_STORAGE_KEY = 'hermesAgentOsActiveNote:v1';

function now() {
  return Date.now();
}

function noteTitleFromBody(body) {
  return body.split(/\r?\n/).find((line) => line.trim())?.trim().slice(0, 48) || '未命名笔记';
}

function createNote(seed = {}) {
  const timestamp = now();
  return {
    id: `note_${timestamp.toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    title: seed.title || '未命名笔记',
    body: seed.body || '',
    pinned: Boolean(seed.pinned),
    createdAt: seed.createdAt || timestamp,
    updatedAt: seed.updatedAt || timestamp
  };
}

function readNotes() {
  try {
    const saved = JSON.parse(localStorage.getItem(NOTES_STORAGE_KEY) || '[]');
    if (!Array.isArray(saved)) return [];
    return saved
      .filter((note) => note?.id)
      .map((note) => ({
        ...createNote(),
        ...note,
        title: note.title || noteTitleFromBody(note.body || ''),
        body: note.body || '',
        pinned: Boolean(note.pinned),
        createdAt: Number(note.createdAt) || now(),
        updatedAt: Number(note.updatedAt) || now()
      }));
  } catch (_) {
    return [];
  }
}

function writeNotes(notes) {
  localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
}

function formatDate(value) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function safeFileName(value) {
  return (value || 'note').replace(/[\\/:*?"<>|]/g, '_').slice(0, 64) || 'note';
}

const notes = ref(readNotes());
const savedActiveNoteId = localStorage.getItem(ACTIVE_NOTE_STORAGE_KEY) || '';
const activeNoteId = ref(
  notes.value.some((note) => note.id === savedActiveNoteId)
    ? savedActiveNoteId
    : notes.value[0]?.id || ''
);
const searchQuery = ref('');
const viewMode = ref('edit');
const saveState = ref('已保存');
const importInputRef = ref(null);
let saveTimer = 0;

const activeNote = computed(() => notes.value.find((note) => note.id === activeNoteId.value) || null);
const filteredNotes = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  return notes.value
    .filter((note) => {
      if (!query) return true;
      return `${note.title} ${note.body}`.toLowerCase().includes(query);
    })
    .sort((left, right) => {
      if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
      return right.updatedAt - left.updatedAt;
    });
});
const noteStats = computed(() => {
  const body = activeNote.value?.body || '';
  const words = body.trim() ? body.trim().split(/\s+/).length : 0;
  return {
    chars: body.length,
    lines: body ? body.split(/\r?\n/).length : 0,
    words
  };
});
const editorTitle = computed({
  get: () => activeNote.value?.title || '',
  set: (value) => updateActiveNote({ title: value || '未命名笔记' })
});
const editorBody = computed({
  get: () => activeNote.value?.body || '',
  set: (value) => updateActiveNote({ body: value })
});

watch(notes, () => {
  saveState.value = '保存中';
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    writeNotes(notes.value);
    saveState.value = '已保存';
  }, 120);
}, { deep: true });

watch(activeNoteId, (id) => {
  if (id) localStorage.setItem(ACTIVE_NOTE_STORAGE_KEY, id);
  else localStorage.removeItem(ACTIVE_NOTE_STORAGE_KEY);
});

function selectNote(note) {
  activeNoteId.value = note.id;
}

function updateActiveNote(patch) {
  const note = activeNote.value;
  if (!note) return;
  Object.assign(note, patch, { updatedAt: now() });
}

function addNote(seed = {}) {
  const note = createNote(seed);
  notes.value.unshift(note);
  activeNoteId.value = note.id;
  viewMode.value = 'edit';
  return note;
}

function duplicateNote() {
  if (!activeNote.value) return;
  addNote({
    title: `${activeNote.value.title} 副本`,
    body: activeNote.value.body,
    pinned: false
  });
}

function deleteNote() {
  if (!activeNote.value) return;
  const confirmed = window.confirm(`删除「${activeNote.value.title}」？`);
  if (!confirmed) return;
  const index = notes.value.findIndex((note) => note.id === activeNoteId.value);
  notes.value.splice(index, 1);
  activeNoteId.value = notes.value[Math.max(0, index - 1)]?.id || notes.value[0]?.id || '';
}

function togglePinned() {
  if (!activeNote.value) return;
  updateActiveNote({ pinned: !activeNote.value.pinned });
}

async function copyNote() {
  if (!activeNote.value) return;
  await navigator.clipboard?.writeText(activeNote.value.body || '');
  saveState.value = '已复制';
  window.setTimeout(() => {
    saveState.value = '已保存';
  }, 900);
}

function exportNote() {
  if (!activeNote.value) return;
  const blob = new Blob([activeNote.value.body || ''], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${safeFileName(activeNote.value.title)}.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function importNotes(event) {
  const files = Array.from(event.target.files || []);
  for (const file of files) {
    const body = await file.text();
    addNote({
      title: file.name.replace(/\.(txt|md|markdown)$/i, '') || noteTitleFromBody(body),
      body
    });
  }
  event.target.value = '';
}

function openImportPicker() {
  importInputRef.value?.click();
}

onBeforeUnmount(() => {
  window.clearTimeout(saveTimer);
  writeNotes(notes.value);
});

defineExpose({
  createNote: (seed = {}) => addNote(seed),
  appendActiveNote: (text = '') => {
    if (!activeNote.value) addNote();
    updateActiveNote({ body: `${activeNote.value?.body || ''}${text}` });
    return activeNote.value;
  },
  updateActiveNote: (patch = {}) => {
    if (!activeNote.value) addNote();
    updateActiveNote(patch);
    return activeNote.value;
  },
  readActiveNote: () => activeNote.value,
  listNotes: () => filteredNotes.value.map((note) => ({
    id: note.id,
    title: note.title,
    pinned: note.pinned,
    updatedAt: note.updatedAt
  })),
  searchNotes: (query = '') => {
    searchQuery.value = String(query || '');
    return filteredNotes.value.map((note) => ({
      id: note.id,
      title: note.title,
      body: note.body.slice(0, 500),
      updatedAt: note.updatedAt
    }));
  }
});
</script>

<template>
  <section class="notepad-panel">
    <aside class="notepad-sidebar">
      <header class="notepad-sidebar-head">
        <strong>记事本</strong>
        <button type="button" title="新建笔记" @click="addNote()">
          <Plus :size="15" />
        </button>
      </header>

      <label class="notepad-search">
        <Search :size="15" />
        <input v-model="searchQuery" placeholder="搜索笔记" />
      </label>

      <div class="notepad-list" aria-label="笔记列表">
        <button
          v-for="note in filteredNotes"
          :key="note.id"
          type="button"
          class="notepad-note-item"
          :class="{ active: note.id === activeNoteId, pinned: note.pinned }"
          @click="selectNote(note)"
        >
          <span class="notepad-note-icon">
            <Pin v-if="note.pinned" :size="13" />
            <FileText v-else :size="14" />
          </span>
          <span>
            <strong>{{ note.title }}</strong>
            <small>{{ formatDate(note.updatedAt) }}</small>
          </span>
        </button>
        <p v-if="!filteredNotes.length" class="notepad-empty-list">暂无笔记</p>
      </div>
    </aside>

    <main class="notepad-editor">
      <template v-if="activeNote">
        <header class="notepad-editor-head">
          <input v-model="editorTitle" class="notepad-title-input" />
          <div class="notepad-actions">
            <button type="button" :title="activeNote.pinned ? '取消置顶' : '置顶'" @click="togglePinned">
              <PinOff v-if="activeNote.pinned" :size="15" />
              <Pin v-else :size="15" />
            </button>
            <button type="button" title="复制内容" @click="copyNote">
              <ClipboardCopy :size="15" />
            </button>
            <button type="button" title="导入文本" @click="openImportPicker">
              <Upload :size="15" />
            </button>
            <button type="button" title="导出文本" @click="exportNote">
              <Download :size="15" />
            </button>
            <button type="button" title="复制为新笔记" @click="duplicateNote">
              <FileText :size="15" />
            </button>
            <button type="button" title="删除笔记" @click="deleteNote">
              <Trash2 :size="15" />
            </button>
          </div>
        </header>

        <div class="notepad-mode-row">
          <button type="button" :class="{ active: viewMode === 'edit' }" @click="viewMode = 'edit'">
            <PencilLine :size="14" />
            编辑
          </button>
          <button type="button" :class="{ active: viewMode === 'preview' }" @click="viewMode = 'preview'">
            <Eye :size="14" />
            阅读
          </button>
          <span>{{ saveState }}</span>
        </div>

        <textarea
          v-if="viewMode === 'edit'"
          v-model="editorBody"
          class="notepad-body-input"
          spellcheck="false"
          placeholder="写点什么"
        ></textarea>
        <article v-else class="notepad-preview">
          <p v-if="editorBody">{{ editorBody }}</p>
          <small v-else>空白笔记</small>
        </article>

        <footer class="notepad-footer">
          <span>{{ noteStats.chars }} 字符</span>
          <span>{{ noteStats.lines }} 行</span>
          <span>{{ noteStats.words }} 词</span>
          <span>{{ formatDate(activeNote.updatedAt) }}</span>
        </footer>
      </template>

      <section v-else class="notepad-empty-editor">
        <FileText :size="34" />
        <strong>还没有笔记</strong>
        <p>创建第一篇笔记，内容会自动保存在本机。</p>
        <button type="button" class="accent-btn" @click="addNote()"><Plus :size="15" /> 新建笔记</button>
      </section>

      <input
        ref="importInputRef"
        class="hidden-file-input"
        type="file"
        accept=".txt,.md,.markdown,text/plain,text/markdown"
        multiple
        @change="importNotes"
      />
    </main>
  </section>
</template>
