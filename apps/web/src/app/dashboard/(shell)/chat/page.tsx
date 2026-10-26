'use client';

import { useState, useEffect, useRef, type KeyboardEvent } from 'react';
import { ArrowUp, History, Loader2, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { useApi } from '@petra/shared';

import { ComposedCookCard, LibraryCookCard } from '@/components/app/cook-card';
import { Sheet } from '@/components/app/sheet';
import { Chip } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface GeneratedRecipe {
  title: string;
  description?: string;
  servings: number;
  prepTime: number;
  cookTime: number;
  difficulty: string;
  ingredients: { name: string; amount: number; unit: string; notes?: string; staple?: boolean }[];
  instructions: { step: number; instruction: string; tip?: string }[];
  inspiredBy: string[];
}

interface Nutrition {
  perServing: { calories: number; protein: number; carbs: number; fat: number };
  confidence: 'high' | 'medium' | 'low';
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  /** Present when the assistant recommended a recipe from the library. */
  recipeId?: string;
  /** Present when the assistant composed a dish rather than finding one. */
  generatedRecipe?: GeneratedRecipe;
  nutrition?: Nutrition;
  /** What the assistant decided on the user's behalf, and what it could not do. */
  assumptions?: string[];
  compromises?: string[];
  /** Tappable answers to a clarifying question. */
  options?: string[];
  /** Set once the user has saved this generation, so the button settles. */
  savedRecipeId?: string;
}

interface Session {
  id: string;
  title: string | null;
  updatedAt: string;
}

const STARTERS = [
  'Something with what needs using, 20 minutes',
  'A vegetarian dinner for two',
  'What can I make without shopping?',
] as const;

export default function ChatPage() {
  const api = useApi();
  const [historyOpen, setHistoryOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  /**
   * What the assistant is doing right now, from the stream's `node` frames.
   *
   * Composing a recipe and then computing macros takes several seconds of
   * silent work, and a bare spinner for that long reads as a hang rather than
   * as thinking.
   */
  const [progress, setProgress] = useState<string | null>(null);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadSessions = async () => {
    try {
      const data = await api.client.get<{ sessions?: Session[] }>(
        '/chat/sessions'
      );
      setSessions(data.sessions || []);
      if (data.sessions?.length) {
        await loadSession(data.sessions[0].id);
      }
    } catch {
      toast.error('Failed to load chat sessions');
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const loadSession = async (sessionId: string) => {
    try {
      const data = await api.client.get<{ messages?: unknown[] }>(
        `/chat/sessions/${sessionId}`
      );
      setActiveSessionId(sessionId);
      const msgs = data.messages || [];
      setMessages(
        msgs.map((m: any) => ({
          role: m.role === 'USER' ? 'user' : 'assistant',
          content: Array.isArray(m.content) ? m.content.map((c: any) => c.text || '').join('') : String(m.content),
          timestamp: new Date(m.timestamp),
          // The API stores what the reply was about alongside its text, so
          // reopening a conversation brings its recipe cards back rather
          // than leaving the prose with nothing to cook from.
          recipeId: m.metadata?.recipeId ?? undefined,
          generatedRecipe: m.metadata?.generatedRecipe ?? undefined,
          nutrition: m.metadata?.nutrition ?? undefined,
          assumptions: m.metadata?.assumptions ?? undefined,
          compromises: m.metadata?.compromises ?? undefined,
        }))
      );
    } catch {
      toast.error('Failed to load session');
    }
  };

  const newSession = async () => {
    try {
      const session = await api.client.post<Session>('/chat/sessions', {
        title: 'New Chat',
      });
      setSessions(prev => [session, ...prev]);
      setActiveSessionId(session.id);
      setMessages([]);
    } catch {
      toast.error('Failed to create new chat session');
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || isStreaming) return;

    const userMessage: Message = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    let sessionId = activeSessionId;

    if (!sessionId) {
      try {
        const session = await api.client.post<Session>('/chat/sessions', {
          title: input.trim().slice(0, 50),
        });
        sessionId = session.id;
        setActiveSessionId(sessionId);
        setSessions(prev => [session, ...prev]);
      } catch {
        toast.error('Failed to start session');
        return;
      }
    }

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsStreaming(true);

    const assistantMessage: Message = {
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, assistantMessage]);

    try {
      // Through the shared client for the session token and the refresh on a
      // 401; it rejects on a non-2xx, which lands in the fallback below. The
      // frames are still decoded here, for now.
      const res = await api.chat.stream({
        sessionId,
        message: userMessage.content,
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error('No response body');

      /**
       * Parse the SSE frames, event name included.
       *
       * The previous version looked only at `data:` lines and appended
       * anything with a `content` field, which meant the `done` frame — whose
       * payload is the whole reply — was appended on top of the text already
       * streamed, duplicating it. Now that the stream also carries `node` and
       * `interrupt` frames, the event name has to be read rather than guessed
       * at.
       *
       * Buffered across reads because a frame can be split across TCP chunks;
       * splitting each `value` on its own loses whatever straddled the
       * boundary.
       */
      let buffer = '';
      let currentEvent = 'chunk';

      const patchLast = (patch: Partial<Message>) =>
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { ...updated[updated.length - 1], ...patch };
          return updated;
        });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Complete lines only; the remainder stays in the buffer.
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith(':')) continue; // heartbeat

          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
            continue;
          }

          if (!line.startsWith('data: ')) continue;

          const raw = line.slice(6).trim();
          if (!raw || raw === '[DONE]') continue;

          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(raw);
          } catch {
            continue;
          }

          if (currentEvent === 'node') {
            setProgress(typeof parsed.label === 'string' ? parsed.label : null);
          } else if (currentEvent === 'chunk') {
            setProgress(null);
            const token = typeof parsed.content === 'string' ? parsed.content : '';
            if (token) {
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                updated[updated.length - 1] = { ...last, content: last.content + token };
                return updated;
              });
            }
          } else if (currentEvent === 'interrupt') {
            // The question itself also arrives as ordinary text, so only the
            // tappable answers are taken from here.
            patchLast({
              options: Array.isArray(parsed.options)
                ? (parsed.options as string[])
                : undefined,
            });
          } else if (currentEvent === 'done') {
            // Authoritative: whatever was accumulated is replaced, which makes
            // any streaming imperfection self-correcting.
            setProgress(null);
            patchLast({
              content: typeof parsed.content === 'string' ? parsed.content : undefined,
              recipeId: typeof parsed.recipeId === 'string' ? parsed.recipeId : undefined,
              generatedRecipe: parsed.generatedRecipe as GeneratedRecipe | undefined,
              nutrition: parsed.nutrition as Nutrition | undefined,
              assumptions: parsed.assumptions as string[] | undefined,
              compromises: parsed.compromises as string[] | undefined,
              options: Array.isArray(parsed.suggestions)
                ? (parsed.suggestions as string[])
                : undefined,
            });
          } else if (currentEvent === 'error') {
            setProgress(null);
            toast.error(
              typeof parsed.message === 'string' ? parsed.message : 'Something went wrong'
            );
          }
        }
      }
    } catch {
      // Fall back to non-streaming endpoint
      try {
        const data = await api.chat.sendMessage<{
          content?: string;
          message?: string;
        } | null>({ sessionId, message: userMessage.content });
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content: data?.content || data?.message || 'Response received.',
          };
          return updated;
        });
      } catch {
        toast.error('Failed to send message');
        setMessages(prev => prev.slice(0, -1));
      }
    } finally {
      setIsStreaming(false);
      setProgress(null);
    }
  };

  /**
   * Keep a recipe the assistant wrote.
   *
   * Generated recipes are ephemeral by default — shown, cooked from, and
   * forgotten. This is the explicit action that makes one permanent, and it
   * sends the payload straight back rather than rebuilding it, so what gets
   * saved is exactly what was on screen.
   */
  const saveGeneratedRecipe = async (index: number): Promise<string | null> => {
    const message = messages[index];
    if (!message?.generatedRecipe) return null;
    if (message.savedRecipeId) return message.savedRecipeId;

    try {
      const saved = await api.recipes.saveGenerated({
        recipe: message.generatedRecipe,
        nutrition: message.nutrition,
      });

      setMessages(prev => {
        const updated = [...prev];
        updated[index] = { ...updated[index], savedRecipeId: saved.id };
        return updated;
      });
      toast.success('Saved to your recipes');
      return saved.id;
    } catch {
      toast.error('Could not save that recipe');
      return null;
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // A chip fills the composer rather than sending, so it can be edited first.
  const fillSuggestion = (text: string) => {
    setInput(text);
    inputRef.current?.focus();
  };

  const last = messages[messages.length - 1];
  const suggestions = !isStreaming && last?.role === 'assistant' ? last.options ?? [] : [];

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-220px)] w-full max-w-reading flex-col gap-5 nav:min-h-[calc(100dvh-80px)]">
      <header className="flex flex-wrap items-end justify-between gap-md">
        <div>
          <h1 className="m-0 text-section text-ink">Ask Petra</h1>
          <p className="m-0 mt-xs text-body-lg text-muted-foreground">
            Reads your pantry before it answers.
          </p>
        </div>
        <div className="flex gap-xs">
          <Button variant="secondary" onClick={() => setHistoryOpen(true)}>
            <History className="h-4 w-4" aria-hidden />
            History
          </Button>
          <Button variant="secondary" onClick={newSession} aria-label="New conversation">
            <Plus className="h-4 w-4" aria-hidden />
            <span className="hidden min-[420px]:inline">New</span>
          </Button>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-3.5" aria-live="polite">
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-start justify-center gap-md py-xl">
            <p className="m-0 max-w-[36ch] text-title-md text-ink">
              Ask for dinner, the week, or what to do with what is in the fridge.
            </p>
            <div className="flex flex-col items-start gap-xs">
              {STARTERS.map(s => (
                <Chip key={s} onClick={() => fillSuggestion(s)}>
                  {s}
                </Chip>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) =>
            msg.role === 'user' ? (
              <p
                key={i}
                className="m-0 max-w-[82%] self-end whitespace-pre-wrap rounded-lg rounded-br-xs bg-signature-dark px-md py-3.5 text-body-lg leading-normal text-white"
              >
                {msg.content}
              </p>
            ) : (
              <div key={i} className="flex max-w-[92%] flex-col gap-2.5 self-start">
                {msg.content || !(isStreaming && i === messages.length - 1) ? (
                  <div className="whitespace-pre-wrap rounded-lg rounded-bl-xs border border-border bg-background px-md py-3.5 text-body-lg leading-[1.55] text-ink">
                    {msg.content}
                  </div>
                ) : (
                  // What the assistant is doing, while it is doing it.
                  <p className="m-0 flex items-center gap-xs px-1 text-body-md text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    {progress || 'Thinking'}
                  </p>
                )}

                {/* Every recipe turn ends on something to cook from. */}
                {msg.generatedRecipe ? (
                  <ComposedCookCard
                    recipe={msg.generatedRecipe}
                    calories={msg.nutrition?.perServing.calories}
                    estimated={msg.nutrition ? msg.nutrition.confidence !== 'high' : undefined}
                    savedId={msg.savedRecipeId}
                    onSave={() => saveGeneratedRecipe(i)}
                  />
                ) : msg.recipeId ? (
                  <LibraryCookCard recipeId={msg.recipeId} />
                ) : null}

                {/* What was decided for them, and what could not be done. */}
                {msg.assumptions?.length || msg.compromises?.length ? (
                  <div className="flex flex-col gap-1 px-1">
                    {[...(msg.assumptions ?? []), ...(msg.compromises ?? [])].map((line, k) => (
                      <p key={k} className="m-0 text-label-sm text-muted-foreground">
                        {line}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          )
        )}
        <div ref={messagesEndRef} />
      </div>

      {suggestions.length ? (
        <div role="group" aria-label="Suggested replies" className="scroll-row gap-xs pb-1">
          {suggestions.map(option => (
            <Chip key={option} onClick={() => fillSuggestion(option)}>
              {option}
            </Chip>
          ))}
        </div>
      ) : null}

      {/* Sticks above the tab bar on a phone, to the bottom of the window on wider screens. */}
      <form
        onSubmit={e => {
          e.preventDefault();
          sendMessage();
        }}
        className="sticky bottom-[calc(var(--tab-bar-height)+env(safe-area-inset-bottom,0px))] z-20 -mx-1 bg-surface-soft px-1 py-xs nav:bottom-0"
      >
        <div className="flex items-end gap-xs rounded-lg border border-border bg-background py-1.5 pl-md pr-1.5">
          <label htmlFor="chat-input" className="sr-only">
            Message Petra
          </label>
          <textarea
            id="chat-input"
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What should we cook?"
            rows={1}
            className="max-h-[120px] min-h-target min-w-0 flex-1 resize-none bg-transparent py-2.5 text-label-md text-ink placeholder:text-muted-foreground focus-visible:outline-none"
            onInput={e => {
              const t = e.currentTarget;
              t.style.height = 'auto';
              t.style.height = `${Math.min(t.scrollHeight, 120)}px`;
            }}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || isStreaming}
            aria-label="Send"
            className="rounded-md"
          >
            {isStreaming ? (
              <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden />
            ) : (
              <ArrowUp className="h-[18px] w-[18px]" aria-hidden />
            )}
          </Button>
        </div>
      </form>

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen} title="Conversations">
        {isLoadingSessions ? (
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading" />
        ) : sessions.length === 0 ? (
          <p className="m-0 text-body-md text-muted-foreground">No conversations yet.</p>
        ) : (
          <ul className="m-0 list-none divide-y divide-border p-0">
            {sessions.map(s => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    loadSession(s.id);
                    setHistoryOpen(false);
                  }}
                  aria-current={activeSessionId === s.id ? 'true' : undefined}
                  className={cn(
                    'flex min-h-[56px] w-full flex-col justify-center rounded-sm px-sm text-left active:bg-surface-soft',
                    activeSessionId === s.id && 'bg-surface-soft'
                  )}
                >
                  <span className="truncate text-body-lg text-ink">{s.title || 'Untitled'}</span>
                  <span className="text-label-sm text-muted-foreground">
                    {new Date(s.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </div>
  );
}
