'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChatTurnError,
  errorMessage,
  messageRole,
  messageText,
  replyFromStoredMessage,
  saveGeneratedRecipe,
  startChatTurn,
  useApi,
  type ChatReply,
  type ChatSession,
  type StoredChatMessage,
} from '@petra/shared';

/** One bubble in the conversation. */
export interface ChatEntry {
  /** Stable React key: the stored id, or a local one for this visit. */
  key: string;
  role: 'user' | 'assistant';
  /** For an assistant entry in flight, the text streamed so far. */
  content: string;
  timestamp: Date;
  /** Set on an assistant entry once its reply is complete. */
  reply?: ChatReply;
  /** The reply broke partway; `content` is what had arrived. */
  failed?: boolean;
  /** Set once the composed recipe was saved, so the card opens that copy. */
  savedRecipeId?: string;
}

export interface ChatTurnState {
  sessionId: string | null;
  entries: ChatEntry[];
  /** True from send until the reply is complete or has failed. */
  isSending: boolean;
  /** What the assistant is doing, from the stream's progress frames. */
  progress: string | null;
  /**
   * Send a message. Resolves false when nothing was sent and nothing stored,
   * so the composer can give the text back; a reply that broke partway still
   * resolves true, because the question is stored.
   */
  send: (text: string) => Promise<boolean>;
  /** Show a stored conversation. */
  open: (sessionId: string) => Promise<void>;
  /** Start afresh; the session is created with the first message. */
  reset: () => void;
  /** Keep the recipe on entry `key`; resolves to its id, or null on failure. */
  saveRecipe: (key: string) => Promise<string | null>;
}

let localKeys = 0;
const localKey = (prefix: string) => `${prefix}-${Date.now()}-${localKeys++}`;

/** A stored message as an entry; replies get their card fields back. */
const entryFromStored = (message: StoredChatMessage, i: number): ChatEntry => {
  const role = messageRole(message);
  return {
    key: message.id ?? `stored-${i}`,
    role,
    content: messageText(message.content),
    timestamp: message.timestamp ? new Date(message.timestamp) : new Date(),
    reply: role === 'assistant' ? replyFromStoredMessage(message) : undefined,
  };
};

/**
 * The web chat's conversation state, on top of the shared `startChatTurn`.
 *
 * The page used to hold all of this inline, next to an SSE parser of its own
 * and a fallback that re-sent the question after *any* failure — including
 * one halfway through a reply, which stored the question twice. Now the turn
 * rules live in `@petra/shared` (one copy, shared with mobile, tested with a
 * fake transport), and this hook only turns their callbacks into React state.
 *
 * A turn in flight is aborted when the user opens another conversation, starts
 * a new one, or leaves the page: its text would otherwise land in whichever
 * conversation is showing by then.
 */
export function useChatTurn(options: {
  /** A session was created by a first message, so the history can list it. */
  onSessionCreated?: (session: ChatSession) => void;
  /** Something the user should hear about: a failed send or save. */
  onError?: (message: string) => void;
  onSaved?: () => void;
} = {}): ChatTurnState {
  const api = useApi();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const callbacks = useRef(options);
  callbacks.current = options;

  const abort = useCallback(() => {
    inFlight.current?.abort();
    inFlight.current = null;
  }, []);

  useEffect(() => abort, [abort]);

  const patch = useCallback(
    (key: string, update: Partial<ChatEntry>) =>
      setEntries(prev =>
        prev.map(entry => (entry.key === key ? { ...entry, ...update } : entry))
      ),
    []
  );

  const send = useCallback(
    async (raw: string): Promise<boolean> => {
      const text = raw.trim();
      if (!text || inFlight.current) return false;

      const controller = new AbortController();
      inFlight.current = controller;
      const userKey = localKey('user');
      const replyKey = localKey('reply');
      setEntries(prev => [
        ...prev,
        { key: userKey, role: 'user', content: text, timestamp: new Date() },
        { key: replyKey, role: 'assistant', content: '', timestamp: new Date() },
      ]);
      setIsSending(true);
      setProgress(null);

      try {
        const result = await startChatTurn(api, {
          sessionId,
          text,
          signal: controller.signal,
          onSession: session => {
            setSessionId(session.id);
            callbacks.current.onSessionCreated?.(session);
          },
          onProgress: label => setProgress(label),
          onText: content => {
            setProgress(null);
            patch(replyKey, { content });
          },
        });
        setSessionId(result.sessionId);
        // `done` is authoritative: its text replaces what streamed.
        patch(replyKey, { content: result.reply.content, reply: result.reply });
        return true;
      } catch (err) {
        if (controller.signal.aborted) return true;
        callbacks.current.onError?.(
          errorMessage(err, 'Failed to send message')
        );
        if (err instanceof ChatTurnError) {
          // The question is stored; leave what arrived, marked as cut off.
          patch(replyKey, { content: err.partialText, failed: true });
          return true;
        }
        // Nothing was stored, so nothing stays on screen.
        setEntries(prev =>
          prev.filter(entry => entry.key !== userKey && entry.key !== replyKey)
        );
        return false;
      } finally {
        if (inFlight.current === controller) {
          inFlight.current = null;
          setIsSending(false);
          setProgress(null);
        }
      }
    },
    [api, patch, sessionId]
  );

  const open = useCallback(
    async (id: string) => {
      abort();
      setIsSending(false);
      setProgress(null);
      try {
        const session = await api.chat.getSession(id);
        setSessionId(id);
        const messages: StoredChatMessage[] = session.messages ?? [];
        setEntries(messages.map(entryFromStored));
      } catch (err) {
        callbacks.current.onError?.(errorMessage(err, 'Failed to load session'));
      }
    },
    [abort, api]
  );

  const reset = useCallback(() => {
    abort();
    setIsSending(false);
    setProgress(null);
    setSessionId(null);
    setEntries([]);
  }, [abort]);

  const saveRecipe = useCallback(
    async (key: string): Promise<string | null> => {
      const entry = entries.find(e => e.key === key);
      if (!entry?.reply?.generatedRecipe) return null;
      if (entry.savedRecipeId) return entry.savedRecipeId;
      try {
        const id = await saveGeneratedRecipe(api, entry.reply);
        patch(key, { savedRecipeId: id });
        callbacks.current.onSaved?.();
        return id;
      } catch (err) {
        callbacks.current.onError?.(
          errorMessage(err, 'Could not save that recipe')
        );
        return null;
      }
    },
    [api, entries, patch]
  );

  return { sessionId, entries, isSending, progress, send, open, reset, saveRecipe };
}
