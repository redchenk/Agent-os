import { ref } from 'vue';
import { formatBytes } from '../modules/agentOs/formatters';

const HERMES_REFERENCE_PATTERN = /^@(file|folder|git|url):.+|^@(diff|staged)$/i;
const MAX_INLINE_UPLOAD_BYTES = 1024 * 1024;
const MAX_INLINE_UPLOAD_CHARS = 120000;
const TEXT_FILE_PATTERN = /\.(txt|md|markdown|json|jsonl|csv|tsv|xml|yaml|yml|toml|ini|env|log|html?|css|scss|less|js|jsx|ts|tsx|vue|svelte|py|rb|go|rs|java|kt|kts|c|cc|cpp|h|hpp|cs|php|swift|sh|bash|zsh|ps1|bat|cmd|sql|graphql|gql|dockerfile|gitignore|editorconfig)$/i;

export function useAgentComposer({ prompt }) {
  const attachedItems = ref([]);
  const composerDragging = ref(false);

  function normalizeHermesReference(input) {
    const value = String(input || '').trim();
    if (!value) return '';
    if (HERMES_REFERENCE_PATTERN.test(value)) return value;
    if (/^https?:\/\//i.test(value)) return `@url:${value}`;
    if (/[/\\]$/.test(value)) return `@folder:${value.replace(/[/\\]+$/, '')}`;
    return `@file:${value}`;
  }

  function isTextUpload(file) {
    return /^(text\/|application\/json|application\/xml|application\/yaml|application\/x-yaml)/i.test(file.type || '')
      || TEXT_FILE_PATTERN.test(file.name || '');
  }

  function createAttachmentItem(file) {
    const isImage = /^image\//i.test(file.type || '') || /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name || '');
    const item = {
      id: `att_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`,
      kind: 'file',
      name: file.name || 'untitled',
      size: file.size || 0,
      type: file.type || 'application/octet-stream',
      preview: isImage ? URL.createObjectURL(file) : '',
      status: 'ready',
      detail: formatBytes(file.size || 0),
      content: '',
      includeInPrompt: false
    };

    if (isTextUpload(file) && file.size <= MAX_INLINE_UPLOAD_BYTES) {
      item.status = 'reading';
      item.detail = 'Reading file';
      file.text()
        .then((content) => {
          const truncated = content.length > MAX_INLINE_UPLOAD_CHARS;
          item.content = content.slice(0, MAX_INLINE_UPLOAD_CHARS);
          item.status = 'ready';
          item.detail = truncated ? `Inline text, truncated at ${formatBytes(MAX_INLINE_UPLOAD_CHARS)}` : 'Inline text upload';
          item.includeInPrompt = true;
        })
        .catch(() => {
          item.status = 'unsupported';
          item.detail = '读取失败，请改用 @file: 引用 workspace 内路径。';
        });
      return item;
    }

    item.status = 'unsupported';
    item.detail = isTextUpload(file)
      ? `文件超过 ${formatBytes(MAX_INLINE_UPLOAD_BYTES)}，请改用 @file: 引用。`
      : 'Hermes 不支持直接上传此类型，请使用 @file: 或 @folder: 引用 workspace 内路径。';
    return item;
  }

  function attachAgentFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    attachedItems.value.push(...files.map(createAttachmentItem));
  }

  function onAgentFileChange(event) {
    attachAgentFiles(event.target.files);
    event.target.value = '';
  }

  function addContextReference(rawReference = '') {
    const fallback = prompt.value.match(/@(?:file|folder|git|url):\S+|@(diff|staged)/i)?.[0] || '';
    const reference = normalizeHermesReference(rawReference || window.prompt('输入 Hermes context reference，例如 @file:src/App.vue 或 @folder:src', fallback) || '');
    if (!reference) return;
    attachedItems.value.push({
      id: `ref_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`,
      kind: 'reference',
      name: reference,
      size: reference.length,
      type: 'hermes/context-reference',
      preview: '',
      status: 'ready',
      detail: 'Hermes context reference',
      reference,
      content: '',
      includeInPrompt: true
    });
  }

  function removeAttachedItem(id) {
    const item = attachedItems.value.find((entry) => entry.id === id);
    if (item?.preview) URL.revokeObjectURL(item.preview);
    attachedItems.value = attachedItems.value.filter((entry) => entry.id !== id);
  }

  function clearAttachedItems() {
    attachedItems.value.forEach((item) => {
      if (item.preview) URL.revokeObjectURL(item.preview);
    });
    attachedItems.value = [];
  }

  function onAgentPaste(event) {
    const files = [...(event.clipboardData?.files || [])];
    if (files.length) {
      event.preventDefault();
      attachAgentFiles(files);
      return;
    }
    const text = event.clipboardData?.getData('text') || '';
    if (text.length <= 300) return;
    event.preventDefault();
    attachedItems.value.push({
      id: `paste_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`,
      kind: 'paste',
      name: 'Pasted context',
      size: text.length,
      type: 'text/plain',
      preview: '',
      status: 'ready',
      detail: 'Pasted text',
      content: text.slice(0, 20000)
    });
    if (!prompt.value.trim()) prompt.value = 'Analyze the pasted context.';
  }

  function onComposerDragOver(event) {
    event.preventDefault();
    composerDragging.value = true;
  }

  function onComposerDragLeave(event) {
    event.preventDefault();
    composerDragging.value = false;
  }

  function onComposerDrop(event) {
    event.preventDefault();
    composerDragging.value = false;
    attachAgentFiles(event.dataTransfer?.files);
  }

  function buildPromptInput(input) {
    if (!attachedItems.value.length) return input;
    const references = attachedItems.value
      .filter((item) => item.kind === 'reference' && item.reference)
      .map((item) => item.reference);
    const inlineFiles = attachedItems.value.filter((item) => item.kind === 'file' && item.includeInPrompt && item.content);
    const pastedContext = attachedItems.value.filter((item) => item.kind === 'paste' && item.content);
    if (!references.length && !inlineFiles.length && !pastedContext.length) return input;

    const parts = [input || 'Please analyze the referenced context.'];
    if (references.length) parts.push(references.join(' '));
    if (inlineFiles.length) {
      const uploads = inlineFiles.map((item, index) => {
        return `Uploaded file ${index + 1}: ${item.name} (${item.type}, ${formatBytes(item.size)})\n\`\`\`\n${item.content}\n\`\`\``;
      }).join('\n\n');
      parts.push(`[Agent OS uploaded files]\n${uploads}`);
    }
    if (pastedContext.length) {
      const context = pastedContext.map((item, index) => {
        const header = `${index + 1}. ${item.name} (${item.type}, ${formatBytes(item.size)})`;
        return item.content ? `${header}\n${item.content}` : header;
      }).join('\n\n');
      parts.push(`[Agent OS pasted context]\n${context}`);
    }
    return parts.filter(Boolean).join('\n\n');
  }

  return {
    addContextReference,
    attachAgentFiles,
    attachedItems,
    buildPromptInput,
    clearAttachedItems,
    composerDragging,
    onAgentFileChange,
    onAgentPaste,
    onComposerDragLeave,
    onComposerDragOver,
    onComposerDrop,
    removeAttachedItem
  };
}
