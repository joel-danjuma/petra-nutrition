'use client';

import { useState, useEffect, useRef, type KeyboardEvent } from 'react';
import { ArrowUp, History, Loader2, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { useApi, type ChatSession } from '@petra/shared';

import { ComposedCookCard, LibraryCookCard } from '@/components/app/cook-card';
import { Sheet } from '@/components/app/sheet';
import { Chip } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { useChatTurn } from '@/hooks/use-chat-turn';
import { cn } from '@/lib/utils';

const STARTERS = [
  'Something with what needs using, 20 minutes',
  'A vegetarian dinner for two',
  'What can I make without shopping?',
] as const;

export default function ChatPage() {
  const api = useApi();
  const [historyOpen, setHistoryOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [input, setInput] = useState('');
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // The turn — streaming, fallback, session creation — is the hook's; this
  // page lays it out.
  const chat = useChatTurn({
    onSessionCreated: session => setSessions(prev => [session, ...prev]),
    onError: message => toast.error(message),
    onSaved: () => toast.success('Saved to your recipes'),
  });
  const { entries, isSending, progress } = chat;

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  const loadSessions = async () => {
    try {
      const data = await api.chat.getSessions();
      setSessions(data.sessions || []);
      if (data.sessions?.length) {
        await chat.open(data.sessions[0].id);
      }
    } catch {
      toast.error('Failed to load chat sessions');
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isSending) return;
    setInput('');
    // Nothing was sent: give the text back rather than lose it.
    if (!(await chat.send(text))) setInput(text);
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

  const last = entries[entries.length - 1];
  const suggestions =
    !isSending && last?.role === 'assistant' ? last.reply?.suggestions ?? [] : [];

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
          {/* The session itself is created by the first message, so an
              abandoned "New" leaves no empty conversation behind. */}
          <Button variant="secondary" onClick={chat.reset} aria-label="New conversation">
            <Plus className="h-4 w-4" aria-hidden />
            <span className="hidden min-[420px]:inline">New</span>
          </Button>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-3.5" aria-live="polite">
        {entries.length === 0 ? (
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
          entries.map((msg, i) => {
            if (msg.role === 'user') {
              return (
                <p
                  key={msg.key}
                  className="m-0 max-w-[82%] self-end whitespace-pre-wrap rounded-lg rounded-br-xs bg-signature-dark px-md py-3.5 text-body-lg leading-normal text-white"
                >
                  {msg.content}
                </p>
              );
            }

            const reply = msg.reply;
            const inFlight = isSending && i === entries.length - 1;
            const notes = [...(reply?.assumptions ?? []), ...(reply?.compromises ?? [])];

            return (
              <div key={msg.key} className="flex max-w-[92%] flex-col gap-2.5 self-start">
                {msg.content || !inFlight ? (
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

                {msg.failed ? (
                  <p className="m-0 px-1 text-label-sm text-muted-foreground">
                    This reply was cut off. Ask again to get the rest.
                  </p>
                ) : null}

                {/* Every recipe turn ends on something to cook from. */}
                {reply?.generatedRecipe ? (
                  <ComposedCookCard
                    recipe={reply.generatedRecipe}
                    calories={reply.nutrition?.perServing.calories}
                    estimated={reply.nutrition ? reply.nutrition.confidence !== 'high' : undefined}
                    savedId={msg.savedRecipeId}
                    onSave={() => chat.saveRecipe(msg.key)}
                  />
                ) : reply?.recipeId ? (
                  <LibraryCookCard recipeId={reply.recipeId} />
                ) : null}

                {/* What was decided for them, and what could not be done. */}
                {notes.length ? (
                  <div className="flex flex-col gap-1 px-1">
                    {notes.map((line, k) => (
                      <p key={k} className="m-0 text-label-sm text-muted-foreground">
                        {line}
                      </p>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })
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
            disabled={!input.trim() || isSending}
            aria-label="Send"
            className="rounded-md"
          >
            {isSending ? (
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
                    chat.open(s.id);
                    setHistoryOpen(false);
                  }}
                  aria-current={chat.sessionId === s.id ? 'true' : undefined}
                  className={cn(
                    'flex min-h-[56px] w-full flex-col justify-center rounded-sm px-sm text-left active:bg-surface-soft',
                    chat.sessionId === s.id && 'bg-surface-soft'
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
