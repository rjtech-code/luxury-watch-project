/** Thin fetch wrapper: cookies for auth, CSRF header on writes, one silent refresh on 401. */
const BASE = import.meta.env.VITE_API_URL ?? '';
const SESSION_FLAG = 'lw_session';

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message ?? 'Something went wrong. Please try again.');
    this.status = status;
    this.code = body?.error?.code;
    this.details = body?.error?.details;
  }
}

export const hasSessionHint = () => {
  try { return localStorage.getItem(SESSION_FLAG) === '1'; } catch { return false; }
};
export const setSessionHint = (on) => {
  try { on ? localStorage.setItem(SESSION_FLAG, '1') : localStorage.removeItem(SESSION_FLAG); } catch { /* storage unavailable */ }
};

function qs(query) {
  if (!query) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
    p.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function send(path, { method = 'GET', body, query, signal, headers = {} } = {}) {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const res = await fetch(`${BASE}${path}${qs(query)}`, {
    method,
    credentials: 'include',
    signal,
    headers: { ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}), ...(method !== 'GET' ? { 'X-LW-CSRF': '1' } : {}), ...headers },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  return res;
}

let refreshing = null;
export function refreshSession() {
  refreshing ??= send('/api/auth/refresh', { method: 'POST' }).then((r) => r.ok).finally(() => { refreshing = null; });
  return refreshing;
}

export async function api(path, opts = {}) {
  let res = await send(path, opts);
  if (res.status === 401 && !path.startsWith('/api/auth/') && hasSessionHint()) {
    if (await refreshSession()) res = await send(path, opts);
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const get = (path, query, signal) => api(path, { query, signal });
export const post = (path, body) => api(path, { method: 'POST', body: body ?? {} });
export const put = (path, body) => api(path, { method: 'PUT', body: body ?? {} });
export const patch = (path, body) => api(path, { method: 'PATCH', body: body ?? {} });
export const del = (path) => api(path, { method: 'DELETE' });
export const csvUrl = (path, query) => `${BASE}${path}${qs(query)}`;
