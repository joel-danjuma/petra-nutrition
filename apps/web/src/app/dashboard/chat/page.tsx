'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@petra/shared';
import { Send, Plus, MessageSquare, Loader2, ChefHat, BookmarkPlus, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';

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

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export default function ChatPage() {
  const { user } = useAuth();
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
  const [savingRecipe, setSavingRecipe] = useState(false);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const token = typeof window !== 'undefined'
    ? JSON.parse(localStorage.getItem('auth-storage') || '{}')?.state?.token
    : null;

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadSessions = async () => {
    try {
      const res = await fetch(`${API_URL}/chat/sessions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setSessions(data.data.sessions || []);
        if (data.data.sessions?.length > 0) {
          await loadSession(data.data.sessions[0].id);
        }
      }
    } catch {
      toast.error('Failed to load chat sessions');
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const loadSession = async (sessionId: string) => {
    try {
      const res = await fetch(`${API_URL}/chat/sessions/${sessionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setActiveSessionId(sessionId);
        const msgs = data.data.messages || [];
        setMessages(
          msgs.map((m: any) => ({
            role: m.role === 'USER' ? 'user' : 'assistant',
            content: Array.isArray(m.content) ? m.content.map((c: any) => c.text || '').join('') : String(m.content),
            timestamp: new Date(m.timestamp),
          }))
        );
      }
    } catch {
      toast.error('Failed to load session');
    }
  };

  const newSession = async () => {
    try {
      const res = await fetch(`${API_URL}/chat/sessions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: 'New Chat' }),
      });
      const data = await res.json();
      if (data.success) {
        const session = data.data;
        setSessions(prev => [session, ...prev]);
        setActiveSessionId(session.id);
        setMessages([]);
      }
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
        const res = await fetch(`${API_URL}/chat/sessions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: input.trim().slice(0, 50) }),
        });
        const data = await res.json();
        if (data.success) {
          sessionId = data.data.id;
          setActiveSessionId(sessionId);
          setSessions(prev => [data.data, ...prev]);
        }
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
      const res = await fetch(`${API_URL}/chat/stream`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          sessionId,
          message: userMessage.content,
        }),
      });

      if (!res.ok) {
        throw new Error('Stream request failed');
      }

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
        const res = await fetch(`${API_URL}/chat/message`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, message: userMessage.content }),
        });
        const data = await res.json();
        if (data.success) {
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              ...updated[updated.length - 1],
              content: data.data?.content || data.data?.message || 'Response received.',
            };
            return updated;
          });
        }
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
  const saveGeneratedRecipe = async (index: number) => {
    const message = messages[index];
    if (!message?.generatedRecipe || message.savedRecipeId) return;

    setSavingRecipe(true);
    try {
      const res = await fetch(`${API_URL}/recipes/generated`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipe: message.generatedRecipe,
          nutrition: message.nutrition,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Save failed');

      setMessages(prev => {
        const updated = [...prev];
        updated[index] = { ...updated[index], savedRecipeId: data.data.id };
        return updated;
      });
      toast.success('Saved to your recipes');
    } catch {
      toast.error('Could not save that recipe');
    } finally {
      setSavingRecipe(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="h-[calc(100vh-9rem)] lg:h-[calc(100vh-4rem)] flex gap-4">
      {/* Sessions sidebar */}
      <div className="hidden lg:flex w-64 flex-col bg-background rounded-2xl border border-border overflow-hidden">
        <div className="p-3 border-b border-border">
          <Button onClick={newSession} size="sm" className="w-full gap-2">
            <Plus className="h-4 w-4" />
            New Chat
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {isLoadingSessions ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">
              No conversations yet
            </p>
          ) : (
            sessions.map(s => (
              <button
                key={s.id}
                onClick={() => loadSession(s.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  activeSessionId === s.id
                    ? 'bg-secondary text-primary'
                    : 'text-muted-foreground active:bg-secondary'
                }`}
              >
                <p className="font-medium truncate">{s.title || 'Untitled Chat'}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {new Date(s.updatedAt).toLocaleDateString()}
                </p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col bg-background rounded-2xl border border-border overflow-hidden">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mb-4">
                <ChefHat className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-xl font-medium text-foreground mb-2">
                How can I help you cook today?
              </h2>
              <p className="text-muted-foreground max-w-sm text-sm">
                Ask me for recipe ideas, cooking tips, ingredient substitutions, or help planning your meals.
              </p>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0 mt-1">
                    <ChefHat className="h-4 w-4 text-white" />
                  </div>
                )}
                <div className="max-w-[80%] space-y-3">
                  <div
                    className={`rounded-2xl px-4 py-3 text-sm ${
                      msg.role === 'user'
                        ? 'bg-primary text-white rounded-tr-sm'
                        : 'bg-secondary text-foreground rounded-tl-sm'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>

                    {/* What the assistant is doing, while it is doing it. */}
                    {msg.role === 'assistant' &&
                      isStreaming &&
                      i === messages.length - 1 &&
                      msg.content === '' && (
                        <p className="flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          {progress || 'Thinking'}
                        </p>
                      )}
                  </div>

                  {/* A dish the assistant wrote. No id to open — this is it. */}
                  {msg.generatedRecipe && (
                    <div className="rounded-2xl border border-border bg-background overflow-hidden">
                      <div className="p-4 space-y-1">
                        <h3 className="text-base font-medium text-foreground">
                          {msg.generatedRecipe.title}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          Serves {msg.generatedRecipe.servings} ·{' '}
                          {msg.generatedRecipe.prepTime + msg.generatedRecipe.cookTime} min ·{' '}
                          {msg.generatedRecipe.difficulty.toLowerCase()}
                        </p>
                      </div>

                      {/* Macros for the portion actually suggested. */}
                      {msg.nutrition && (
                        <div className="px-4 pb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>{Math.round(msg.nutrition.perServing.calories)} kcal</span>
                          <span>{Math.round(msg.nutrition.perServing.protein)}g protein</span>
                          <span>{Math.round(msg.nutrition.perServing.carbs)}g carbs</span>
                          <span>{Math.round(msg.nutrition.perServing.fat)}g fat</span>
                          <span>per serving</span>
                          {msg.nutrition.confidence !== 'high' && (
                            <span>· estimated</span>
                          )}
                        </div>
                      )}

                      <div className="px-4 pb-4 space-y-3">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">You need</p>
                          <p className="text-sm text-foreground">
                            {msg.generatedRecipe.ingredients
                              .filter(ing => !ing.staple)
                              .map(ing => `${ing.amount} ${ing.unit} ${ing.name}`.trim())
                              .join(', ')}
                          </p>
                        </div>

                        <ol className="space-y-2">
                          {msg.generatedRecipe.instructions.map(step => (
                            <li key={step.step} className="text-sm text-foreground flex gap-2">
                              <span className="text-muted-foreground shrink-0">{step.step}.</span>
                              <span>
                                {step.instruction}
                                {step.tip && (
                                  <span className="block text-xs text-muted-foreground mt-1">
                                    {step.tip}
                                  </span>
                                )}
                              </span>
                            </li>
                          ))}
                        </ol>

                        <Button
                          onClick={() => saveGeneratedRecipe(i)}
                          disabled={savingRecipe || !!msg.savedRecipeId}
                          size="sm"
                          variant="outline"
                          className="gap-2"
                        >
                          {msg.savedRecipeId ? (
                            <>
                              <Check className="h-4 w-4" />
                              Saved
                            </>
                          ) : (
                            <>
                              <BookmarkPlus className="h-4 w-4" />
                              Save this recipe
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* What was decided for them, and what could not be done. */}
                  {(msg.assumptions?.length || msg.compromises?.length) && (
                    <div className="space-y-1 px-1">
                      {msg.assumptions?.map((line, k) => (
                        <p key={`a${k}`} className="text-xs text-muted-foreground">
                          {line}
                        </p>
                      ))}
                      {msg.compromises?.map((line, k) => (
                        <p key={`c${k}`} className="text-xs text-muted-foreground">
                          {line}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Tappable answers to a clarifying question. */}
                  {msg.options?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {msg.options.map(option => (
                        <Button
                          key={option}
                          size="sm"
                          variant="outline"
                          disabled={isStreaming}
                          onClick={() => setInput(option)}
                        >
                          {option}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-border">
          <div className="flex gap-3 items-end">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Petra anything about cooking..."
              rows={1}
              className="flex-1 resize-none px-4 py-3 rounded-xl border border-border bg-secondary text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:border-transparent text-sm"
              style={{ minHeight: '44px', maxHeight: '120px' }}
              onInput={e => {
                const t = e.target as HTMLTextAreaElement;
                t.style.height = 'auto';
                t.style.height = `${Math.min(t.scrollHeight, 120)}px`;
              }}
            />
            <Button
              onClick={sendMessage}
              disabled={!input.trim() || isStreaming}
              size="sm"
              className="h-11 w-11 p-0 shrink-0"
            >
              {isStreaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Press Enter to send, Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}
