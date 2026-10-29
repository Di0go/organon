// The chat beside a page, as the server and the interface both see it: a message, a conversation (one per place in
// the app), and the events the app's live feed carries for it (server/chat.ts emits them; ui/chats.svelte.ts applies
// them). From Galen's shared/types.ts; the app's feed adds these events to its own (`FeedEvent | ChatEvent`).

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  at: string;
  /** The answer was stopped while it was being written: this is as far as it got. */
  stopped?: boolean;
  /** What was tagged with @ in this message, as it reads in the text, to show as chips. */
  mentions?: string[];
}

/** One conversation: a page's (by its thread name, e.g. "today", "training"), kept with it. */
export interface ChatThread {
  thread: string;
  /** The Claude Code session it continues. */
  session?: string;
  messages: ChatMessage[];
}

/** What the live feed carries for the chats. */
export type ChatEvent =
  /** A message in a chat: the person's, or the finished answer. */
  | { type: 'chat'; thread: string; message: ChatMessage }
  /** Text added to an answer being written, in order. */
  | { type: 'chat-delta'; thread: string; id: string; delta: string }
  | { type: 'chat-cleared'; thread: string };
