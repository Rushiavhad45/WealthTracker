// Thin fetch wrapper for the Express API (proxied to :5000 by Vite in dev).
const BASE = '/api';
const TOKEN_KEY = 'wealthtrack_token';

export const tokenStore = {
  get() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* storage unavailable (private mode) - session just won't persist */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

export class ApiError extends Error {
  constructor(message, status, errors) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

async function request(path, { method = 'GET', body, auth = true, raw = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = tokenStore.get();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0);
  }

  if (raw && res.ok) return res;
  if (res.status === 204) return null;

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON error body */
  }

  if (!res.ok) {
    // An expired/invalid session on a protected call -> sign the user out everywhere.
    if (res.status === 401 && auth) {
      tokenStore.clear();
      window.dispatchEvent(new Event('auth:expired'));
    }
    throw new ApiError(data?.message || `Request failed (${res.status})`, res.status, data?.errors);
  }
  return data;
}

export const api = {
  register: (payload) => request('/auth/register', { method: 'POST', body: payload, auth: false }),
  login: (payload) => request('/auth/login', { method: 'POST', body: payload, auth: false }),
  me: () => request('/auth/me'),
  updateProfile: (payload) => request('/auth/me', { method: 'PATCH', body: payload }),

  listInvestments: () => request('/investments'),
  createInvestment: (payload) => request('/investments', { method: 'POST', body: payload }),
  updateInvestment: (id, payload) => request(`/investments/${id}`, { method: 'PATCH', body: payload }),
  deleteInvestment: (id) => request(`/investments/${id}`, { method: 'DELETE' }),
  refreshPrices: () => request('/investments/refresh', { method: 'POST' }),

  history: (range = 'ALL') => request(`/portfolio/history?range=${encodeURIComponent(range)}`),
  searchFunds: (q) => request(`/prices/mutual-funds/search?q=${encodeURIComponent(q)}`),

  sellInvestment: (id, payload) => request(`/investments/${id}/sell`, { method: 'POST', body: payload }),

  taxReport: (fy) => request(`/tax/report?fy=${encodeURIComponent(fy)}`),
  saveTaxSettings: (fy, payload) => request(`/tax/settings/${encodeURIComponent(fy)}`, { method: 'PUT', body: payload }),
  undoSale: (id) => request(`/tax/sales/${id}`, { method: 'DELETE' }),

  /** Download a CSV (needs the Authorization header, so not a plain link). */
  async downloadFile(path, fallbackName = 'download.csv') {
    const res = await request(path, { raw: true });
    const blob = await res.blob();
    const match = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = match?.[1] || fallbackName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  downloadCsv(type) {
    return this.downloadFile(`/investments/export.csv${type && type !== 'all' ? `?type=${type}` : ''}`, 'portfolio.csv');
  },
  downloadTaxCsv(fy) {
    return this.downloadFile(`/tax/report.csv?fy=${encodeURIComponent(fy)}`, `capital-gains-${fy}.csv`);
  },
};
