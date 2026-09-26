import { vi } from 'vitest';

export interface MockCall {
  method: string;
  path: string;
  body: unknown;
  headers: Headers;
}

export interface MockResponse {
  status?: number;
  body?: unknown;
  /** Send this text verbatim instead of JSON (e.g. an HTML error page). */
  raw?: string;
  /** Make fetch reject, as it does when the server is unreachable. */
  networkError?: boolean;
  /** Hold the response back, to simulate a slow server. */
  delayMs?: number;
}

export type MockHandler = (call: MockCall) => MockResponse | Promise<MockResponse>;

/** Replaces global fetch with a route table keyed "METHOD /path" (path without the /api prefix). */
export function mockApi(routes: Record<string, MockResponse | MockHandler>) {
  const calls: MockCall[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const call: MockCall = {
      method: (init?.method ?? 'GET').toUpperCase(),
      path: url.pathname.replace(/^\/api/, ''),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      headers: new Headers(init?.headers),
    };
    calls.push(call);

    const route = routes[`${call.method} ${call.path}`];
    const response: MockResponse = route
      ? typeof route === 'function'
        ? await route(call)
        : route
      : { status: 404, body: { error: { code: 'NOT_FOUND', message: `No mock for ${call.method} ${call.path}` } } };

    if (response.delayMs) await new Promise((resolve) => setTimeout(resolve, response.delayMs));
    if (response.networkError) throw new TypeError('Failed to fetch');
    const text = response.raw ?? (response.body === undefined ? null : JSON.stringify(response.body));
    return new Response(text, {
      status: response.status ?? 200,
      headers: { 'Content-Type': response.raw ? 'text/html' : 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls };
}

/** Returns the given responses one per call, then keeps repeating the last one. */
export function sequence(...responses: MockResponse[]): MockHandler {
  let index = 0;
  return () => responses[Math.min(index++, responses.length - 1)];
}
