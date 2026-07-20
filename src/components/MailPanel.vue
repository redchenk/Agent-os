<script setup>
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Edit3,
  Inbox,
  LoaderCircle,
  Mail,
  MailOpen,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  Server,
  Settings2,
  Star,
  Trash2,
  X
} from 'lucide-vue-next';
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import {
  connectMailAccount,
  deleteMailAccount,
  listInbox,
  listMailAccounts,
  listMailProviders,
  readMailMessage,
  sendMailMessage,
  testMailAccount,
  updateMailAccount,
  updateMailFlags
} from '../services/mailClient';

const providers = ref([]);
const accounts = ref([]);
const messages = ref([]);
const selectedAccountId = ref('');
const selectedMessage = ref(null);
const searchQuery = ref('');
const bootBusy = ref(true);
const inboxBusy = ref(false);
const detailBusy = ref(false);
const accountBusy = ref(false);
const sendBusy = ref(false);
const errorMessage = ref('');
const statusMessage = ref('');
const inboxErrors = ref([]);
const accountDialogOpen = ref(false);
const editingAccountId = ref('');
const composeOpen = ref(false);
const mobileDetailOpen = ref(false);
let refreshTimer = 0;

const accountForm = reactive({
  provider: 'qq',
  email: '',
  displayName: '',
  authType: 'app_password',
  credential: '',
  imapHost: '',
  imapPort: 993,
  smtpHost: '',
  smtpPort: 465
});

const draft = reactive({ accountId: '', to: '', subject: '', body: '' });
const busy = computed(() => bootBusy.value || inboxBusy.value || detailBusy.value || accountBusy.value || sendBusy.value);
const providerMap = computed(() => Object.fromEntries(providers.value.map(provider => [provider.id, provider])));
const activeAccount = computed(() => accounts.value.find(account => account.id === selectedAccountId.value) || null);
const selectedProvider = computed(() => providerMap.value[accountForm.provider] || providers.value[0] || null);
const filteredMessages = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return messages.value;
  return messages.value.filter(message => {
    const addresses = [...(message.from || []), ...(message.to || [])]
      .map(address => `${address.name || ''} ${address.address || ''}`)
      .join(' ');
    return `${message.subject || ''} ${addresses}`.toLowerCase().includes(query);
  });
});
const unreadByAccount = computed(() => {
  const counts = {};
  for (const message of messages.value) {
    if (!message.seen) counts[message.accountId] = (counts[message.accountId] || 0) + 1;
  }
  return counts;
});
const allUnread = computed(() => messages.value.filter(message => !message.seen).length);

function providerName(id) {
  return providerMap.value[id]?.name || id || '閭';
}

function sender(message) {
  const first = message?.from?.[0];
  return first?.name || first?.address || '鏈煡鍙戜欢浜?;
}

function senderAddress(message) {
  return message?.from?.[0]?.address || '';
}

function senderInitial(message) {
  return sender(message).trim().slice(0, 1).toUpperCase() || 'M';
}

function formatMessageDate(value, detailed = false) {
  const date = new Date(value || 0);
  if (!Number.isFinite(date.getTime())) return '';
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (!detailed && sameDay) return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(date);
  return new Intl.DateTimeFormat('zh-CN', detailed
    ? { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { month: 'numeric', day: 'numeric' }).format(date);
}

function resetFeedback() {
  errorMessage.value = '';
  statusMessage.value = '';
}

async function loadAccounts() {
  accounts.value = await listMailAccounts();
  if (selectedAccountId.value && !accounts.value.some(account => account.id === selectedAccountId.value)) {
    selectedAccountId.value = '';
  }
  if (draft.accountId && !accounts.value.some(account => account.id === draft.accountId)) {
    draft.accountId = accounts.value[0]?.id || '';
  }
  return accounts.value;
}

async function refreshInbox({ silent = false } = {}) {
  if (!accounts.value.length) {
    messages.value = [];
    return [];
  }
  if (!silent) inboxBusy.value = true;
  errorMessage.value = '';
  try {
    const result = await listInbox({ accountId: selectedAccountId.value, limit: 50 });
    messages.value = result.messages;
    inboxErrors.value = result.errors;
    return messages.value;
  } catch (error) {
    errorMessage.value = error?.message || '鏀朵欢绠卞埛鏂板け璐?;
    return [];
  } finally {
    inboxBusy.value = false;
  }
}

async function loadInitial() {
  bootBusy.value = true;
  resetFeedback();
  try {
    [providers.value] = await Promise.all([listMailProviders(), loadAccounts()]);
    await refreshInbox({ silent: true });
  } catch (error) {
    errorMessage.value = error?.message || '閭鍔犺浇澶辫触';
  } finally {
    bootBusy.value = false;
  }
}

async function selectAccount(accountId = '') {
  selectedAccountId.value = accountId;
  selectedMessage.value = null;
  composeOpen.value = false;
  mobileDetailOpen.value = false;
  await refreshInbox();
}

async function openMessage(messageOrId) {
  const source = typeof messageOrId === 'object'
    ? messageOrId
    : messages.value.find(message => message.id === messageOrId || String(message.uid) === String(messageOrId));
  if (!source) return null;
  detailBusy.value = true;
  errorMessage.value = '';
  composeOpen.value = false;
  mobileDetailOpen.value = true;
  try {
    selectedMessage.value = await readMailMessage(source.accountId, source.uid);
    const local = messages.value.find(message => message.id === source.id);
    if (local && !local.seen) {
      local.seen = true;
      selectedMessage.value.seen = true;
      updateMailFlags(source.accountId, source.uid, { seen: true }).catch(() => {
        local.seen = false;
      });
    }
    return selectedMessage.value;
  } catch (error) {
    selectedMessage.value = null;
    errorMessage.value = error?.message || '閭欢璇诲彇澶辫触';
    return null;
  } finally {
    detailBusy.value = false;
  }
}

async function toggleFlag(message) {
  const next = !message.flagged;
  message.flagged = next;
  if (selectedMessage.value?.id === message.id) selectedMessage.value.flagged = next;
  try {
    await updateMailFlags(message.accountId, message.uid, { flagged: next });
  } catch (error) {
    message.flagged = !next;
    if (selectedMessage.value?.id === message.id) selectedMessage.value.flagged = !next;
    errorMessage.value = error?.message || '鏄熸爣鏇存柊澶辫触';
  }
}

function blankAccountForm() {
  Object.assign(accountForm, {
    provider: 'qq', email: '', displayName: '', authType: 'app_password', credential: '',
    imapHost: '', imapPort: 993, smtpHost: '', smtpPort: 465
  });
}

function openAccountDialog(account = null) {
  resetFeedback();
  editingAccountId.value = account?.id || '';
  if (!account) {
    blankAccountForm();
  } else {
    Object.assign(accountForm, {
      provider: account.provider,
      email: account.email,
      displayName: account.displayName || '',
      authType: account.authType,
      credential: '',
      imapHost: account.imapHost || '',
      imapPort: account.imapPort || 993,
      smtpHost: account.smtpHost || '',
      smtpPort: account.smtpPort || 465
    });
  }
  accountDialogOpen.value = true;
}

function closeAccountDialog() {
  if (accountBusy.value) return;
  accountDialogOpen.value = false;
  accountForm.credential = '';
}

async function saveAccount() {
  accountBusy.value = true;
  resetFeedback();
  try {
    const input = { ...accountForm };
    if (!input.credential) delete input.credential;
    if (editingAccountId.value) await updateMailAccount(editingAccountId.value, input);
    else await connectMailAccount(input);
    accountForm.credential = '';
    accountDialogOpen.value = false;
    await loadAccounts();
    await refreshInbox();
    statusMessage.value = editingAccountId.value ? '閭宸叉洿鏂? : '閭宸茶繛鎺?;
  } catch (error) {
    errorMessage.value = error?.message || '閭杩炴帴澶辫触';
  } finally {
    accountBusy.value = false;
  }
}

async function checkAccount(account) {
  accountBusy.value = true;
  resetFeedback();
  try {
    await testMailAccount(account.id);
    await loadAccounts();
    statusMessage.value = `${account.email} 杩炴帴姝ｅ父`;
  } catch (error) {
    errorMessage.value = error?.message || '杩炴帴娴嬭瘯澶辫触';
  } finally {
    accountBusy.value = false;
  }
}

async function removeAccount(account) {
  if (!window.confirm(`鏂紑 ${account.email}锛熸湰鍦颁笉浼氫繚鐣欒閭鐨勭櫥褰曞嚟鎹€俙)) return;
  accountBusy.value = true;
  resetFeedback();
  try {
    await deleteMailAccount(account.id);
    await loadAccounts();
    await refreshInbox();
    statusMessage.value = '閭宸叉柇寮€';
  } catch (error) {
    errorMessage.value = error?.message || '閭鏂紑澶辫触';
  } finally {
    accountBusy.value = false;
  }
}

function startCompose(input = {}) {
  if (!accounts.value.length) {
    openAccountDialog();
    return null;
  }
  Object.assign(draft, {
    accountId: input.accountId || selectedAccountId.value || accounts.value[0].id,
    to: Array.isArray(input.to) ? input.to.join(', ') : String(input.to || ''),
    subject: String(input.subject || ''),
    body: String(input.body || '')
  });
  selectedMessage.value = null;
  composeOpen.value = true;
  mobileDetailOpen.value = true;
  return { ...draft };
}

async function sendDraft() {
  sendBusy.value = true;
  resetFeedback();
  try {
    await sendMailMessage(draft.accountId, {
      to: draft.to.split(',').map(value => value.trim()).filter(Boolean),
      subject: draft.subject,
      body: draft.body
    });
    composeOpen.value = false;
    mobileDetailOpen.value = false;
    Object.assign(draft, { to: '', subject: '', body: '' });
    statusMessage.value = '閭欢宸插彂閫?;
    await refreshInbox({ silent: true });
  } catch (error) {
    errorMessage.value = error?.message || '閭欢鍙戦€佸け璐?;
  } finally {
    sendBusy.value = false;
  }
}

function searchMessages(query = '') {
  searchQuery.value = String(query || '');
  return filteredMessages.value;
}

watch(() => accountForm.provider, providerId => {
  const provider = providerMap.value[providerId];
  if (provider && !provider.authTypes.includes(accountForm.authType)) accountForm.authType = provider.authTypes[0];
});

onMounted(() => {
  loadInitial();
  refreshTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible' && !busy.value) refreshInbox({ silent: true });
  }, 60000);
});

onBeforeUnmount(() => window.clearInterval(refreshTimer));

defineExpose({
  listAccounts: () => accounts.value.map(account => ({ ...account })),
  openMessage,
  refreshInbox,
  searchMessages,
  startCompose
});
</script>

<template>
  <section class="mail-app" :aria-busy="busy ? 'true' : 'false'">
    <div v-if="busy" class="mail-loading" role="status" aria-label="姝ｅ湪鍔犺浇">
      <span></span>
    </div>

    <aside class="mail-sidebar">
      <div class="mail-sidebar-head">
        <strong>閭</strong>
        <button class="mail-icon-button" type="button" title="杩炴帴閭" @click="openAccountDialog()"><Plus :size="17" /></button>
      </div>
      <button class="mail-folder" :class="{ active: !selectedAccountId }" type="button" @click="selectAccount('')">
        <Inbox :size="17" />
        <span>鎵€鏈夋敹浠剁</span>
        <b v-if="allUnread">{{ allUnread }}</b>
      </button>
      <div class="mail-account-list">
        <article v-for="account in accounts" :key="account.id" class="mail-account" :class="{ active: selectedAccountId === account.id }">
          <button class="mail-account-main" type="button" @click="selectAccount(account.id)">
            <span class="mail-provider-mark">{{ account.email.slice(0, 1).toUpperCase() }}</span>
            <span class="mail-account-copy">
              <strong>{{ account.displayName || account.email.split('@')[0] }}</strong>
              <small>{{ account.email }}</small>
            </span>
            <b v-if="unreadByAccount[account.id]">{{ unreadByAccount[account.id] }}</b>
          </button>
          <div class="mail-account-actions">
            <span :class="['mail-account-status', account.status]">{{ account.status === 'active' ? '姝ｅ父' : '闇€妫€鏌? }}</span>
            <button type="button" title="娴嬭瘯杩炴帴" @click="checkAccount(account)"><Server :size="13" /></button>
            <button type="button" title="缂栬緫閭" @click="openAccountDialog(account)"><Settings2 :size="13" /></button>
            <button type="button" title="鏂紑閭" @click="removeAccount(account)"><Trash2 :size="13" /></button>
          </div>
        </article>
      </div>
      <button class="mail-compose-button" type="button" @click="startCompose()"><Pencil :size="16" />鍐欓偖浠?/button>
    </aside>

    <section class="mail-list-pane" :class="{ 'mobile-hidden': mobileDetailOpen }">
      <header class="mail-list-toolbar">
        <label class="mail-search">
          <Search :size="15" />
          <input v-model="searchQuery" aria-label="鎼滅储閭欢" placeholder="鎼滅储閭欢" />
          <button v-if="searchQuery" type="button" title="娓呯┖鎼滅储" @click="searchQuery = ''"><X :size="13" /></button>
        </label>
        <select v-model="selectedAccountId" class="mail-mobile-account" aria-label="閫夋嫨閭" @change="selectAccount(selectedAccountId)">
          <option value="">鎵€鏈夋敹浠剁</option>
          <option v-for="account in accounts" :key="account.id" :value="account.id">{{ account.email }}</option>
        </select>
        <button class="mail-icon-button mail-mobile-add" type="button" title="杩炴帴閭" @click="openAccountDialog()"><Plus :size="16" /></button>
        <button class="mail-icon-button" type="button" title="鍒锋柊" :disabled="inboxBusy" @click="refreshInbox()"><RefreshCw :size="16" :class="{ spinning: inboxBusy }" /></button>
      </header>

      <div v-if="errorMessage" class="mail-feedback error">{{ errorMessage }}</div>
      <div v-else-if="statusMessage" class="mail-feedback success"><Check :size="14" />{{ statusMessage }}</div>
      <div v-else-if="inboxErrors.length" class="mail-feedback warning">閮ㄥ垎閭鏆傛椂鏃犳硶鍚屾</div>

      <div v-if="!bootBusy && !accounts.length" class="mail-empty">
        <Mail :size="32" />
        <strong>杩炴帴绗竴涓偖绠?/strong>
        <button type="button" @click="openAccountDialog()"><Plus :size="15" />杩炴帴閭</button>
      </div>
      <div v-else-if="!inboxBusy && !filteredMessages.length" class="mail-empty">
        <Inbox :size="30" />
        <strong>{{ searchQuery ? '娌℃湁鍖归厤閭欢' : '鏀朵欢绠变负绌? }}</strong>
      </div>
      <div v-else class="mail-message-list" aria-label="閭欢鍒楄〃">
        <article
          v-for="message in filteredMessages"
          :key="message.id"
          class="mail-message-row"
          :class="{ unread: !message.seen, active: selectedMessage?.id === message.id }"
        >
          <button class="mail-message-main" type="button" @click="openMessage(message)">
            <span class="mail-avatar">{{ senderInitial(message) }}</span>
            <span class="mail-message-copy">
              <span class="mail-message-meta"><strong>{{ sender(message) }}</strong><time>{{ formatMessageDate(message.date) }}</time></span>
              <span class="mail-message-subject">{{ message.subject }}</span>
              <small>{{ message.mailbox }}</small>
            </span>
          </button>
          <span class="mail-row-actions">
            <button type="button" :title="message.flagged ? '鍙栨秷鏄熸爣' : '娣诲姞鏄熸爣'" @click.stop="toggleFlag(message)">
              <Star :size="15" :fill="message.flagged ? 'currentColor' : 'none'" />
            </button>
          </span>
        </article>
      </div>
    </section>

    <section class="mail-detail-pane" :class="{ 'mobile-visible': mobileDetailOpen }">
      <header class="mail-detail-toolbar">
        <button class="mail-icon-button mail-mobile-back" type="button" title="杩斿洖閭欢鍒楄〃" @click="mobileDetailOpen = false"><ArrowLeft :size="17" /></button>
        <span>{{ composeOpen ? '鏂伴偖浠? : selectedMessage ? providerName(selectedMessage.provider) : '閭欢' }}</span>
        <div>
          <button v-if="selectedMessage" class="mail-icon-button" type="button" :title="selectedMessage.flagged ? '鍙栨秷鏄熸爣' : '娣诲姞鏄熸爣'" @click="toggleFlag(selectedMessage)">
            <Star :size="16" :fill="selectedMessage.flagged ? 'currentColor' : 'none'" />
          </button>
          <button v-if="!composeOpen" class="mail-compose-compact" type="button" @click="startCompose()"><Edit3 :size="15" />鍐欓偖浠?/button>
        </div>
      </header>

      <form v-if="composeOpen" class="mail-compose" @submit.prevent="sendDraft">
        <label>
          <span>鍙戜欢绠?/span>
          <select v-model="draft.accountId" required>
            <option v-for="account in accounts" :key="account.id" :value="account.id">{{ account.email }}</option>
          </select>
        </label>
        <label><span>鏀朵欢浜?/span><input v-model="draft.to" type="text" autocomplete="off" placeholder="name@example.com" required /></label>
        <label><span>涓婚</span><input v-model="draft.subject" type="text" maxlength="200" placeholder="涓婚" /></label>
        <textarea v-model="draft.body" maxlength="200000" aria-label="閭欢姝ｆ枃" placeholder="閭欢姝ｆ枃" required></textarea>
        <footer>
          <button type="button" class="mail-secondary-button" @click="composeOpen = false; mobileDetailOpen = false">鍙栨秷</button>
          <button type="submit" class="mail-primary-button" :disabled="sendBusy"><LoaderCircle v-if="sendBusy" class="spinning" :size="15" /><Send v-else :size="15" />鍙戦€?/button>
        </footer>
      </form>

      <article v-else-if="selectedMessage" class="mail-reader">
        <header>
          <h2>{{ selectedMessage.subject }}</h2>
          <div class="mail-reader-sender">
            <span class="mail-avatar large">{{ senderInitial(selectedMessage) }}</span>
            <span><strong>{{ sender(selectedMessage) }}</strong><small>{{ senderAddress(selectedMessage) }}</small></span>
            <time>{{ formatMessageDate(selectedMessage.date, true) }}</time>
          </div>
        </header>
        <pre>{{ selectedMessage.body }}</pre>
        <section v-if="selectedMessage.attachments?.length" class="mail-attachments">
          <strong>闄勪欢</strong>
          <span v-for="attachment in selectedMessage.attachments" :key="`${attachment.filename}-${attachment.size}`">{{ attachment.filename }}</span>
        </section>
      </article>

      <div v-else-if="detailBusy" class="mail-empty" role="status"><LoaderCircle class="spinning" :size="24" /><strong>姝ｅ湪璇诲彇</strong></div>
      <div v-else class="mail-empty mail-detail-empty"><MailOpen :size="34" /><strong>閫夋嫨涓€灏侀偖浠?/strong></div>
    </section>

    <div v-if="accountDialogOpen" class="mail-dialog-backdrop" @mousedown.self="closeAccountDialog">
      <form class="mail-dialog" @submit.prevent="saveAccount">
        <header><div><strong>{{ editingAccountId ? '缂栬緫閭' : '杩炴帴閭' }}</strong><small>鍑嵁鍔犲瘑淇濆瓨鍦ㄤ綘鐨勮处鍙蜂笅</small></div><button type="button" title="鍏抽棴" @click="closeAccountDialog"><X :size="17" /></button></header>
        <div class="mail-provider-grid">
          <button v-for="provider in providers" :key="provider.id" type="button" :class="{ active: accountForm.provider === provider.id }" @click="accountForm.provider = provider.id">
            <Mail :size="17" /><span>{{ provider.name }}</span>
          </button>
        </div>
        <div class="mail-form-grid">
          <label><span>閭鍦板潃</span><input v-model="accountForm.email" type="email" autocomplete="username" required /></label>
          <label><span>鏄剧ず鍚嶇О</span><input v-model="accountForm.displayName" type="text" maxlength="64" /></label>
          <label>
            <span>鐧诲綍鏂瑰紡</span>
            <span class="mail-select-wrap"><select v-model="accountForm.authType"><option v-for="type in selectedProvider?.authTypes || []" :key="type" :value="type">{{ type === 'oauth2' ? 'OAuth2 璁块棶浠ょ墝' : type === 'password' ? '閭瀵嗙爜' : '搴旂敤瀵嗙爜 / 鎺堟潈鐮? }}</option></select><ChevronDown :size="14" /></span>
          </label>
          <label>
            <span>{{ selectedProvider?.credentialLabel || '鐧诲綍鍑嵁' }}</span>
            <input v-model="accountForm.credential" type="password" autocomplete="new-password" :required="!editingAccountId" :placeholder="editingAccountId ? '鐣欑┖鍒欎繚鎸佷笉鍙? : ''" />
          </label>
        </div>
        <details v-if="accountForm.provider === 'custom'" class="mail-advanced" open>
          <summary><MoreHorizontal :size="15" />鏈嶅姟鍣ㄨ缃?/summary>
          <div class="mail-form-grid server-fields">
            <label><span>IMAP 涓绘満</span><input v-model="accountForm.imapHost" type="text" placeholder="imap.example.com" required /></label>
            <label><span>IMAP 绔彛</span><input v-model.number="accountForm.imapPort" type="number" value="993" readonly /></label>
            <label><span>SMTP 涓绘満</span><input v-model="accountForm.smtpHost" type="text" placeholder="smtp.example.com" required /></label>
            <label><span>SMTP 绔彛</span><select v-model.number="accountForm.smtpPort"><option :value="465">465 TLS</option><option :value="587">587 STARTTLS</option></select></label>
          </div>
        </details>
        <p v-if="selectedProvider?.hint" class="mail-provider-hint">{{ selectedProvider.hint }}</p>
        <p v-if="errorMessage" class="mail-dialog-error">{{ errorMessage }}</p>
        <footer><button type="button" class="mail-secondary-button" @click="closeAccountDialog">鍙栨秷</button><button class="mail-primary-button" type="submit" :disabled="accountBusy"><LoaderCircle v-if="accountBusy" class="spinning" :size="15" /><Check v-else :size="15" />{{ editingAccountId ? '楠岃瘉骞朵繚瀛? : '楠岃瘉骞惰繛鎺? }}</button></footer>
      </form>
    </div>
  </section>
</template>

<style scoped>
.mail-app {
  position: relative;
  display: grid;
  grid-template-columns: 210px minmax(290px, 340px) minmax(340px, 1fr);
  min-height: 0;
  flex: 1;
  overflow: hidden;
  color: var(--ts-text);
  background: var(--os-panel);
}

button, input, select, textarea { color: inherit; }
button { border: 0; }

.mail-loading { position: absolute; inset: 0 0 auto; z-index: 20; height: 2px; overflow: hidden; background: transparent; }
.mail-loading span { display: block; width: 32%; height: 100%; border-radius: 999px; background: var(--fluent-accent); animation: mail-progress 1s ease-in-out infinite; }
@keyframes mail-progress { from { transform: translateX(-110%); } to { transform: translateX(420%); } }
@keyframes mail-spin { to { transform: rotate(360deg); } }
.spinning { animation: mail-spin 0.9s linear infinite; }

.mail-sidebar, .mail-list-pane, .mail-detail-pane { min-width: 0; min-height: 0; }
.mail-sidebar { display: flex; flex-direction: column; gap: 0.45rem; border-right: 1px solid var(--os-border); padding: 0.8rem; background: var(--os-panel-muted); }
.mail-sidebar-head { display: flex; height: 36px; align-items: center; justify-content: space-between; padding: 0 0.2rem 0.25rem; }
.mail-sidebar-head strong { font-size: 1rem; }
.mail-icon-button { display: grid; width: 34px; height: 34px; flex: 0 0 34px; place-items: center; border-radius: 10px; background: transparent; }
.mail-icon-button:hover { background: var(--os-control-hover); }
.mail-icon-button:disabled { opacity: 0.48; cursor: default; }
.mail-folder { display: grid; grid-template-columns: 20px minmax(0, 1fr) auto; align-items: center; gap: 0.45rem; min-height: 38px; border-radius: 10px; padding: 0 0.65rem; text-align: left; background: transparent; }
.mail-folder:hover, .mail-folder.active { background: var(--os-active); }
.mail-folder span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mail-folder b, .mail-account-main b { min-width: 20px; border-radius: 999px; padding: 0.1rem 0.35rem; color: white; background: var(--fluent-accent); font-size: 0.68rem; text-align: center; }
.mail-account-list { display: flex; min-height: 0; flex: 1; flex-direction: column; gap: 0.35rem; overflow: auto; scrollbar-width: thin; }
.mail-account { border: 1px solid transparent; border-radius: 10px; overflow: hidden; }
.mail-account:hover, .mail-account.active { border-color: var(--os-border); background: var(--os-control); }
.mail-account-main { display: grid; width: 100%; grid-template-columns: 30px minmax(0, 1fr) auto; align-items: center; gap: 0.5rem; padding: 0.55rem; text-align: left; background: transparent; }
.mail-provider-mark, .mail-avatar { display: grid; width: 30px; height: 30px; flex: 0 0 30px; place-items: center; border-radius: 50%; color: white; background: var(--fluent-accent); font-size: 0.76rem; font-weight: 800; }
.mail-account-copy { display: grid; min-width: 0; gap: 0.08rem; }
.mail-account-copy strong, .mail-account-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mail-account-copy strong { font-size: 0.78rem; }
.mail-account-copy small { font-size: 0.68rem; opacity: 0.68; }
.mail-account-actions { display: flex; align-items: center; justify-content: flex-end; gap: 0.1rem; padding: 0 0.38rem 0.35rem; }
.mail-account-actions button { display: grid; width: 25px; height: 25px; place-items: center; border-radius: 8px; background: transparent; }
.mail-account-actions button:hover { background: var(--os-control-hover); }
.mail-account-status { margin-right: auto; font-size: 0.65rem; opacity: 0.7; }
.mail-account-status.error { color: #d83b55; opacity: 1; }
.mail-compose-button, .mail-compose-compact, .mail-primary-button, .mail-secondary-button, .mail-empty button { display: inline-flex; min-height: 36px; align-items: center; justify-content: center; gap: 0.42rem; border-radius: 11px; padding: 0 0.85rem; font-weight: 700; }
.mail-compose-button { width: 100%; margin-top: auto; color: white; background: var(--fluent-accent); }
.mail-list-pane { display: flex; flex-direction: column; border-right: 1px solid var(--os-border); background: var(--os-panel); }
.mail-list-toolbar, .mail-detail-toolbar { display: flex; min-height: 52px; align-items: center; gap: 0.45rem; border-bottom: 1px solid var(--os-border); padding: 0.55rem 0.65rem; }
.mail-search { display: flex; min-width: 0; flex: 1; align-items: center; gap: 0.4rem; border: 1px solid var(--os-border); border-radius: 11px; padding: 0 0.65rem; background: var(--os-control); }
.mail-search:focus-within { border-color: var(--os-border-strong); }
.mail-search input { width: 100%; min-width: 0; height: 32px; border: 0; outline: 0; background: transparent; }
.mail-search button { display: grid; width: 24px; height: 24px; place-items: center; border-radius: 8px; background: transparent; }
.mail-mobile-account, .mail-mobile-add, .mail-mobile-back { display: none; }
.mail-feedback { display: flex; min-height: 34px; align-items: center; gap: 0.35rem; padding: 0.4rem 0.75rem; font-size: 0.75rem; }
.mail-feedback.error, .mail-dialog-error { color: #c62f49; }
.mail-feedback.success { color: #217a54; }
.mail-feedback.warning { color: #9b6500; }
.mail-message-list { min-height: 0; flex: 1; overflow: auto; overscroll-behavior: contain; scrollbar-width: thin; }
.mail-message-row { position: relative; display: grid; width: 100%; grid-template-columns: minmax(0, 1fr) 30px; align-items: start; border-bottom: 1px solid var(--os-border); background: transparent; }
.mail-message-row:hover, .mail-message-row.active { background: var(--os-control); }
.mail-message-row.unread::before { content: ''; position: absolute; left: 2px; top: 18px; width: 3px; height: 18px; border-radius: 999px; background: var(--fluent-accent); }
.mail-message-main { display: grid; min-width: 0; grid-template-columns: 34px minmax(0, 1fr); align-items: start; gap: 0.55rem; padding: 0.72rem 0 0.72rem 0.65rem; text-align: left; background: transparent; }
.mail-message-copy { display: grid; min-width: 0; gap: 0.18rem; }
.mail-message-meta { display: flex; min-width: 0; align-items: baseline; justify-content: space-between; gap: 0.5rem; }
.mail-message-meta strong, .mail-message-subject, .mail-message-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mail-message-meta strong { font-size: 0.78rem; }
.mail-message-row.unread .mail-message-meta strong, .mail-message-row.unread .mail-message-subject { font-weight: 850; }
.mail-message-meta time, .mail-message-copy small { font-size: 0.66rem; opacity: 0.62; }
.mail-message-subject { font-size: 0.78rem; }
.mail-row-actions { padding-top: 0.68rem; }
.mail-row-actions button { display: grid; width: 25px; height: 25px; place-items: center; border-radius: 8px; color: #a56c00; background: transparent; }
.mail-row-actions button:hover { background: var(--os-control-hover); }
.mail-detail-pane { display: flex; flex-direction: column; background: var(--os-panel-strong); }
.mail-detail-toolbar { justify-content: space-between; }
.mail-detail-toolbar > span { overflow: hidden; font-size: 0.76rem; font-weight: 700; opacity: 0.72; text-overflow: ellipsis; white-space: nowrap; }
.mail-detail-toolbar > div { display: flex; gap: 0.35rem; }
.mail-compose-compact { min-height: 34px; background: var(--os-control); }
.mail-reader { min-height: 0; flex: 1; padding: 1.4rem 1.6rem; overflow: auto; scrollbar-width: thin; }
.mail-reader h2 { margin: 0 0 1rem; overflow-wrap: anywhere; font-size: 1.15rem; line-height: 1.35; }
.mail-reader-sender { display: grid; grid-template-columns: 38px minmax(0, 1fr) auto; align-items: center; gap: 0.65rem; padding-bottom: 1rem; border-bottom: 1px solid var(--os-border); }
.mail-avatar.large { width: 38px; height: 38px; }
.mail-reader-sender > span { display: grid; min-width: 0; gap: 0.12rem; }
.mail-reader-sender strong, .mail-reader-sender small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mail-reader-sender small, .mail-reader-sender time { font-size: 0.7rem; opacity: 0.62; }
.mail-reader pre { margin: 1.35rem 0; overflow-wrap: anywhere; color: inherit; font: inherit; font-size: 0.84rem; line-height: 1.72; white-space: pre-wrap; }
.mail-attachments { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; border-top: 1px solid var(--os-border); padding-top: 0.8rem; font-size: 0.72rem; }
.mail-attachments span { border: 1px solid var(--os-border); border-radius: 8px; padding: 0.4rem 0.55rem; background: var(--os-control); }
.mail-empty { display: grid; min-height: 0; flex: 1; place-content: center; justify-items: center; gap: 0.65rem; padding: 1.2rem; text-align: center; opacity: 0.7; }
.mail-empty button { color: white; background: var(--fluent-accent); opacity: 1; }
.mail-compose { display: grid; min-height: 0; flex: 1; grid-template-rows: auto auto auto minmax(140px, 1fr) auto; padding: 0.85rem 1rem; }
.mail-compose label { display: grid; grid-template-columns: 72px minmax(0, 1fr); align-items: center; border-bottom: 1px solid var(--os-border); }
.mail-compose label span { font-size: 0.74rem; opacity: 0.66; }
.mail-compose input, .mail-compose select { height: 40px; border: 0; outline: 0; background: transparent; }
.mail-compose textarea { min-height: 140px; margin-top: 0.75rem; resize: none; border: 0; outline: 0; background: transparent; line-height: 1.65; }
.mail-compose footer, .mail-dialog footer { display: flex; justify-content: flex-end; gap: 0.5rem; padding-top: 0.65rem; }
.mail-primary-button { color: white; background: var(--fluent-accent); }
.mail-secondary-button { background: var(--os-control); }
.mail-primary-button:disabled { opacity: 0.55; cursor: default; }

.mail-dialog-backdrop { position: absolute; inset: 0; z-index: 30; display: grid; place-items: center; padding: 1rem; background: rgba(9, 24, 38, 0.3); backdrop-filter: blur(8px); }
.mail-dialog { display: grid; width: min(660px, 100%); max-height: 100%; gap: 0.8rem; border: 1px solid var(--os-border); border-radius: 14px; padding: 1rem; overflow: auto; background: var(--fluent-glass-strong); box-shadow: var(--fluent-shadow); }
.mail-dialog > header { display: flex; align-items: start; justify-content: space-between; gap: 1rem; }
.mail-dialog > header div { display: grid; gap: 0.15rem; }
.mail-dialog > header strong { font-size: 1rem; }
.mail-dialog > header small { font-size: 0.7rem; opacity: 0.64; }
.mail-dialog > header button { display: grid; width: 32px; height: 32px; place-items: center; border-radius: 10px; background: transparent; }
.mail-provider-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.4rem; }
.mail-provider-grid button { display: flex; min-width: 0; min-height: 40px; align-items: center; gap: 0.45rem; border: 1px solid var(--os-border); border-radius: 10px; padding: 0 0.65rem; text-align: left; background: var(--os-control); }
.mail-provider-grid button.active { border-color: var(--os-border-strong); background: var(--os-active); }
.mail-provider-grid span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mail-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.65rem; }
.mail-form-grid label { display: grid; min-width: 0; gap: 0.28rem; }
.mail-form-grid label > span:first-child { font-size: 0.7rem; font-weight: 700; opacity: 0.7; }
.mail-form-grid input, .mail-form-grid select { width: 100%; height: 38px; border: 1px solid var(--os-border); border-radius: 10px; padding: 0 0.65rem; outline: 0; background: var(--os-control); }
.mail-form-grid input:focus, .mail-form-grid select:focus { border-color: var(--os-border-strong); }
.mail-select-wrap { position: relative; display: block; }
.mail-select-wrap svg { position: absolute; top: 12px; right: 10px; pointer-events: none; }
.mail-select-wrap select { appearance: none; padding-right: 2rem; }
.mail-advanced { border-top: 1px solid var(--os-border); padding-top: 0.65rem; }
.mail-advanced summary { display: inline-flex; align-items: center; gap: 0.4rem; cursor: pointer; font-size: 0.75rem; font-weight: 700; }
.mail-advanced .server-fields { margin-top: 0.6rem; }
.mail-provider-hint { margin: 0; font-size: 0.72rem; line-height: 1.5; opacity: 0.7; }
.mail-dialog-error { margin: 0; font-size: 0.75rem; }

@media (max-width: 900px) {
  .mail-app { grid-template-columns: 190px minmax(270px, 320px) minmax(300px, 1fr); }
}

@media (max-width: 760px) {
  .mail-app { display: block; }
  .mail-sidebar { display: none; }
  .mail-list-pane, .mail-detail-pane { position: absolute; inset: 0; border: 0; }
  .mail-detail-pane { display: none; }
  .mail-detail-pane.mobile-visible { display: flex; }
  .mail-list-pane.mobile-hidden { display: none; }
  .mail-mobile-account { display: block; width: min(42vw, 180px); height: 34px; border: 1px solid var(--os-border); border-radius: 10px; padding: 0 0.45rem; background: var(--os-control); }
  .mail-mobile-add, .mail-mobile-back { display: grid; }
  .mail-search { min-width: 80px; }
  .mail-reader { padding: 1rem; }
  .mail-provider-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 520px) {
  .mail-list-toolbar { flex-wrap: wrap; }
  .mail-search { order: 2; flex-basis: 100%; }
  .mail-mobile-account { flex: 1; width: auto; }
  .mail-form-grid { grid-template-columns: 1fr; }
  .mail-dialog { border-radius: 12px; padding: 0.8rem; }
  .mail-provider-grid { grid-template-columns: 1fr 1fr; }
  .mail-reader-sender { grid-template-columns: 36px minmax(0, 1fr); }
  .mail-reader-sender time { grid-column: 2; }
}
</style>

