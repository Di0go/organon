// The chats beside pages, as the page holds them: each thread's messages, loaded when first shown, and the answer
// being written, kept current by the chat's events on the app's live feed (shared/chat.ts ChatEvent). The app's feed
// owns one and hands it its events and its reloads, so the transport stays the feed's (live.svelte.ts):
//
//   readonly chats = new ChatStore();
//   reload: async () => { …; await this.chats.reload(); … },
//   apply: (event) => { if (this.chats.apply(event)) return; … },
//
// From Galen's feed.svelte.ts (its chats, chatDrafts and loadChat), the part that is the chat's (docs/plano.md,
// «FeedState»: the records the feed carries are the app's, the chat's are the core's).

import type { ChatEvent, ChatMessage } from '../shared/chat.ts';
import { getJson } from './live.svelte.ts';

export class ChatStore {
  /** Each thread's messages, oldest first, once loaded. */
  messages = $state<Record<string, ChatMessage[]>>({});
  /** The answer being written, by thread: its id and the text so far. */
  drafts = $state<Record<string, { id: string; text: string }>>({});
  private readonly prefix: string;

  /** `prefix`: where the chat's routes are (server/chat.ts chatRoutes). */
  constructor(prefix = '/api/chats/') {
    this.prefix = prefix;
  }

  /** A thread's messages, loaded once; later ones arrive over the live feed. */
  async load(thread: string) {
    if (this.messages[thread]) return;
    this.messages[thread] = await getJson<ChatMessage[]>(this.url(thread));
  }

  /** The threads already open, read again on a (re)connect, so nothing said while disconnected is missed. */
  async reload() {
    const threads = Object.keys(this.messages);
    const lists = await Promise.all(threads.map((t) => getJson<ChatMessage[]>(this.url(t))));
    for (const [i, t] of threads.entries()) this.messages[t] = lists[i] ?? [];
  }

  /** One event from the feed: true when it was the chat's, applied. */
  apply(event: ChatEvent | { type: string }): boolean {
    const e = event as ChatEvent;
    switch (e.type) {
      case 'chat': {
        const list = this.messages[e.thread];
        if (list && !list.some((m) => m.id === e.message.id)) list.push(e.message);
        if (e.message.role === 'assistant') delete this.drafts[e.thread];
        return true;
      }
      case 'chat-cleared':
        this.messages[e.thread] = [];
        delete this.drafts[e.thread];
        return true;
      case 'chat-delta': {
        // Each delta is appended to the answer it belongs to; a new id starts a new one.
        const draft = this.drafts[e.thread];
        const before = draft?.id === e.id ? draft.text : '';
        this.drafts[e.thread] = { id: e.id, text: before + e.delta };
        return true;
      }
      default:
        return false;
    }
  }

  /** The thread's route: its messages (GET), a message (POST), starting over (DELETE). */
  url(thread: string): string {
    return `${this.prefix}${encodeURIComponent(thread)}`;
  }
}
