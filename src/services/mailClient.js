import {
  noStoreTsukuyomiUrl,
  parseTsukuyomiResponse,
  tsukuyomiAuthFetch
} from './tsukuyomiAuth.js';

async function mailRequest(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const response = await tsukuyomiAuthFetch(
    method === 'GET' ? noStoreTsukuyomiUrl(path) : path,
    {
      cache: 'no-store',
      ...options,
      headers: {
        Accept: 'application/json',
        ...(method !== 'GET' ? { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' } : {}),
        ...(options.headers || {})
      }
    }
  );
  const result = await parseTsukuyomiResponse(response);
  if (!response.ok || !result.success) {
    const error = new Error(result.message || `閭璇锋眰澶辫触锛欻TTP ${response.status}`);
    error.status = response.status;
    error.code = result.code || 'MAIL_REQUEST_FAILED';
    throw error;
  }
  return result;
}

export async function listMailProviders() {
  return (await mailRequest('/api/mail/providers')).data || [];
}

export async function listMailAccounts() {
  return (await mailRequest('/api/mail/accounts')).data || [];
}

export async function connectMailAccount(input) {
  return (await mailRequest('/api/mail/accounts', {
    method: 'POST',
    body: JSON.stringify(input)
  })).data;
}

export async function updateMailAccount(accountId, input) {
  return (await mailRequest(`/api/mail/accounts/${encodeURIComponent(accountId)}`, {
    method: 'PUT',
    body: JSON.stringify(input)
  })).data;
}

export async function deleteMailAccount(accountId) {
  await mailRequest(`/api/mail/accounts/${encodeURIComponent(accountId)}`, { method: 'DELETE' });
}

export async function testMailAccount(accountId) {
  await mailRequest(`/api/mail/accounts/${encodeURIComponent(accountId)}/test`, {
    method: 'POST',
    body: '{}'
  });
}

export async function listInbox({ accountId = '', limit = 40, offset = 0, query = '' } = {}) {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (accountId) params.set('accountId', accountId);
  if (query) params.set('query', query);
  const result = await mailRequest(`/api/mail/inbox?${params}`);
  return { messages: result.data || [], errors: result.errors || [], hasMore: Boolean(result.hasMore) };
}

export async function readMailMessage(accountId, uid) {
  return (await mailRequest(`/api/mail/accounts/${encodeURIComponent(accountId)}/messages/${encodeURIComponent(uid)}`)).data;
}

export async function updateMailFlags(accountId, uid, changes) {
  return (await mailRequest(`/api/mail/accounts/${encodeURIComponent(accountId)}/messages/${encodeURIComponent(uid)}`, {
    method: 'PATCH',
    body: JSON.stringify(changes)
  })).data;
}

export async function sendMailMessage(accountId, input) {
  return (await mailRequest(`/api/mail/accounts/${encodeURIComponent(accountId)}/send`, {
    method: 'POST',
    body: JSON.stringify(input)
  })).data;
}

