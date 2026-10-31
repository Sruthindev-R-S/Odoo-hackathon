/**
 * Central HTTP API Client for Brightloop Backend
 *
 * Base URL defaults to http://192.168.0.155:3000 (overridable via VITE_API_BASE_URL).
 * Automatically attaches X-Company-User-Id when an authenticated Admin or Staff
 * company user session is active.
 */

const CURRENT_USER_STORAGE_KEY = 'brightloop_current_user_v1';

const viteEnvBaseUrl =
  typeof import.meta !== 'undefined' &&
  import.meta.env &&
  import.meta.env.VITE_API_BASE_URL
    ? String(import.meta.env.VITE_API_BASE_URL).trim()
    : '';

export const API_BASE_URL = (
  viteEnvBaseUrl || 'http://192.168.0.155:3000'
).replace(/\/+$/, '');

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return UUID_REGEX.test(String(value || '').trim());
}

export class ApiError extends Error {
  constructor(message, { status = 0, data = null, isNetworkError = false } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    this.isNetworkError = isNetworkError;
  }
}

export function isNetworkOfflineError(error) {
  return Boolean(error && error.isNetworkError === true);
}

export function getStoredCurrentUser() {
  try {
    const raw = localStorage.getItem(CURRENT_USER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Resolve X-Company-User-Id header value for authenticated company users (Admin / Staff).
 * Never sends a company user header when signed in as a Customer.
 */
export function resolveCompanyUserId(explicitActor = null) {
  const actor = explicitActor || getStoredCurrentUser();
  if (!actor) return null;
  if (actor.role !== 'admin' && actor.role !== 'staff') return null;

  const candidate = actor.companyUserId ?? actor.id;
  if (candidate === undefined || candidate === null || candidate === '') {
    return null;
  }
  // Backend company_users.id is a positive integer
  const numericId = Number(candidate);
  if (Number.isInteger(numericId) && numericId > 0) {
    return String(numericId);
  }
  return null;
}

function buildUrl(path, query) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${API_BASE_URL}${cleanPath}`);

  if (query && typeof query === 'object') {
    Object.entries(query).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        url.searchParams.set(key, String(val));
      }
    });
  }

  return url.toString();
}

export async function apiRequest(
  path,
  {
    method = 'GET',
    body = undefined,
    query = undefined,
    headers = {},
    actorUser = null,
    includeCompanyHeader = true,
  } = {}
) {
  if (typeof globalThis.fetch !== 'function') {
    throw new ApiError('Fetch API unavailable in current runtime', {
      isNetworkError: true,
    });
  }

  const url = buildUrl(path, query);
  const reqHeaders = { ...headers };

  if (body !== undefined && !reqHeaders['Content-Type']) {
    reqHeaders['Content-Type'] = 'application/json';
  }

  if (includeCompanyHeader && !reqHeaders['X-Company-User-Id']) {
    const companyUserId = resolveCompanyUserId(actorUser);
    if (companyUserId) {
      reqHeaders['X-Company-User-Id'] = companyUserId;
    }
  }

  let response;
  try {
    response = await globalThis.fetch(url, {
      method,
      headers: reqHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    throw new ApiError(
      networkErr?.message || `Unable to reach backend at ${API_BASE_URL}`,
      {
        status: 0,
        isNetworkError: true,
      }
    );
  }

  let payload = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
  } else {
    try {
      const text = await response.text();
      payload = text ? { message: text } : null;
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const errMessage =
      payload?.error ||
      payload?.message ||
      `Request failed with status ${response.status}`;
    throw new ApiError(errMessage, {
      status: response.status,
      data: payload,
      isNetworkError: false,
    });
  }

  return payload;
}

export const apiClient = {
  get: (path, options = {}) => apiRequest(path, { ...options, method: 'GET' }),
  post: (path, body, options = {}) =>
    apiRequest(path, { ...options, method: 'POST', body }),
  patch: (path, body, options = {}) =>
    apiRequest(path, { ...options, method: 'PATCH', body }),
  delete: (path, options = {}) =>
    apiRequest(path, { ...options, method: 'DELETE' }),
};

