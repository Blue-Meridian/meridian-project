// Sanitise the configured base URL. A stray BOM (﻿), surrounding quotes,
// whitespace, or a trailing slash would otherwise corrupt every request — e.g.
// a leading BOM makes the browser treat the URL as relative, so calls resolve
// against the Vercel origin and 405. Strip all of that defensively so a dirty
// env var (it has happened) can never break the deployed app again.
const _RAW_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
  'http://localhost:8000';

export const API_BASE = _RAW_BASE
  .replace(/^﻿/, '') // byte-order mark
  .trim()
  .replace(/^["']|["']$/g, '') // accidental surrounding quotes
  .replace(/\/+$/, ''); // trailing slash(es)

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GET ${path} → ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`POST ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}
