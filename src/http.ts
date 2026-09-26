export interface HttpOptions {
  method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: string;
  signal?: AbortSignal; maxBytes?: number; timeoutMs?: number;
}

// Never interpolate URLs, request bodies, credentials or remote error bodies in errors.
export async function requestText(url: string | URL, options: HttpOptions = {}): Promise<string> {
  const target = new URL(url);
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) throw new Error('Unsupported HTTP endpoint');
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 15000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  let response: Response;
  try { response = await fetch(target, { method: options.method ?? 'GET', headers: options.headers, body: options.body, signal, redirect: 'error' }); }
  catch { throw new Error('Service request failed or timed out; check connectivity and service configuration'); }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Service returned HTTP ${response.status}; check permissions, availability or rate limits`);
  }
  const max = options.maxBytes ?? 2_000_000;
  if (Number(response.headers.get('content-length')) > max) { await response.body?.cancel(); throw new Error('Service response exceeds byte limit'); }
  const reader = response.body?.getReader();
  if (!reader) return '';
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) { await reader.cancel(); throw new Error('Service response exceeds byte limit'); }
      chunks.push(value);
    }
  } catch { throw new Error('Service response could not be read within its bounds'); }
  return Buffer.concat(chunks).toString('utf8');
}
export async function requestJson<T = unknown>(url: string | URL, options: HttpOptions = {}): Promise<T> {
  const text = await requestText(url, options);
  try { return JSON.parse(text) as T; } catch { throw new Error('Service returned invalid JSON'); }
}
export function loopbackUrl(value: string): URL {
  const url = new URL(value);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Local service endpoint must be a loopback HTTP URL without credentials');
  return url;
}
export function workspaceUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('DATABRICKS_HOST must be an HTTPS workspace origin without credentials or paths');
  return url;
}
