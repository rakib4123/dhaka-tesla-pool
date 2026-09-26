/** An error we can show to a person: the API's own message, or a friendly one for transport failures. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function toApiError(err: unknown): ApiError {
  return err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Something went wrong. Please try again.');
}

const BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const TOKEN_KEY = 'teslapool.token';

/** localStorage can throw (private mode, blocked storage), so every access is guarded. */
export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string): void {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      // The session then lasts only for this page load.
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      // Nothing stored, nothing to clear.
    }
  },
};

let onUnauthorized: () => void = () => {};

/** AuthContext registers a handler so an expired session anywhere sends the user back to sign in. */
export function setUnauthorizedHandler(handler: () => void): () => void {
  onUnauthorized = handler;
  return () => {
    if (onUnauthorized === handler) onUnauthorized = () => {};
  };
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string; details?: unknown };
}

const SERVER_TROUBLE = 'The server is having trouble. Please try again in a moment.';

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined; // an HTML error page, or index.html from a misconfigured host
  }
}

export async function apiFetch<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = tokenStore.get();
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/api${path}`, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body !== undefined && { 'Content-Type': 'application/json' }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', "Can't reach the server. Check your connection and try again.");
  }

  const payload = await readJson(res);
  if (!res.ok) {
    const envelope = (payload as ErrorEnvelope | undefined)?.error;
    if (res.status === 401 && token) onUnauthorized();
    throw new ApiError(res.status, envelope?.code ?? 'SERVER_UNAVAILABLE', envelope?.message ?? SERVER_TROUBLE, envelope?.details);
  }
  if (payload === undefined) throw new ApiError(res.status, 'SERVER_UNAVAILABLE', SERVER_TROUBLE);
  return payload as T;
}
