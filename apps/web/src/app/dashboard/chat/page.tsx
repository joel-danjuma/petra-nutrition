'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@petra/shared';
import { Send, Plus, MessageSquare, Loader2, ChefHat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') break;
            try {
              const parsed = JSON.parse(data);
              const token = parsed.choices?.[0]?.delta?.content || parsed.content || '';
              if (token) {
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    content: updated[updated.length - 1].content + token,
                  };
                  return updated;
                });
              }
            } catch {
              // non-JSON chunk, ignore
            }
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
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                    msg.role === 'user'
                      ? 'bg-primary text-white rounded-tr-sm'
                      : 'bg-secondary text-foreground rounded-tl-sm'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  {msg.role === 'assistant' && isStreaming && i === messages.length - 1 && msg.content === '' && (
                    <span className="inline-block w-2 h-4 bg-secondary animate-pulse" />
                  )}
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
