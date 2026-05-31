import { API_BASE } from './client';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  /** Which engine produced this message — drives the Coordinator pipeline UI. */
  mode?: 'granite' | 'coordinator';
}

export interface ChatRequest {
  messages: ChatMessage[];
  mode: 'granite' | 'coordinator';
  current_state?: Record<string, unknown>;
}

/**
 * Streams chat completion chunks from the FastAPI /chat proxy.
 * The proxy forwards either to watsonx.ai (granite mode) or to the
 * Orchestrate Coordinator (coordinator mode) and emits SSE.
 */
export async function* streamChat(req: ChatRequest): AsyncGenerator<string> {
  const res = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Chat ${res.status}: ${text.slice(0, 400)}`);
  }
  if (!res.body) throw new Error('Chat: empty response body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data) continue;
      if (data === '[DONE]') return;
      try {
        const parsed = JSON.parse(data);
        if (parsed.content) yield parsed.content as string;
      } catch {
        // skip malformed line
      }
    }
  }
}
