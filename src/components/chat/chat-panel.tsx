'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChat } from '@/hooks/use-chat';

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
}

export function ChatPanel({ open, onClose }: ChatPanelProps) {
  const { messages, isStreaming, send, stop, clear } = useChat();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) {
      // Delay focus to let the animation finish
      const t = setTimeout(() => inputRef.current?.focus(), 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    send(input);
    setInput('');
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 sm:inset-auto sm:bottom-20 sm:right-4 z-[70] flex sm:h-[520px] sm:w-[380px] flex-col overflow-hidden sm:rounded-2xl border border-white/[0.85] dark:border-white/[0.08] bg-white/70 dark:bg-[#0c0c1d]/80 backdrop-blur-[28px] backdrop-saturate-[180%] shadow-[0_8px_32px_rgba(100,120,200,0.15),inset_0_1px_0_rgba(255,255,255,0.9)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.12)]"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/[0.3] dark:border-white/[0.08] bg-white/30 dark:bg-white/[0.03] backdrop-blur-xl px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500/20">
                <svg
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5 text-indigo-400"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <span className="text-xs font-semibold text-gray-900 dark:text-white">
                Pulse AI
              </span>
              {isStreaming && (
                <span className="text-[10px] text-indigo-400 animate-pulse">
                  thinking...
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  onClick={clear}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-gray-400 dark:text-white/30 transition-colors hover:bg-white/50 dark:hover:bg-white/[0.08] hover:text-gray-600 dark:hover:text-white/50"
                  aria-label="Clear chat"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              )}
              <button
                onClick={onClose}
                className="flex h-6 w-6 items-center justify-center rounded-md text-gray-400 dark:text-white/30 transition-colors hover:bg-white/50 dark:hover:bg-white/[0.08] hover:text-gray-600 dark:hover:text-white/50"
                aria-label="Close chat"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-3 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-thumb]:bg-white/10">
            {messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-500/10 mb-3">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5 text-indigo-400"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <p className="text-xs font-medium text-gray-600 dark:text-white/50">
                  Pulse AI
                </p>
                <p className="mt-1 text-[11px] text-gray-400 dark:text-white/25 max-w-[240px]">
                  Ask about your repos, deployments, alerts, or anything in your
                  dashboard.
                </p>
              </div>
            )}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-indigo-500 text-white'
                      : 'bg-white/50 dark:bg-white/[0.06] text-gray-700 dark:text-white/80 border border-white/[0.3] dark:border-white/[0.06]'
                  }`}
                >
                  {msg.content || (
                    <span className="inline-flex gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60 animate-bounce [animation-delay:0ms]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60 animate-bounce [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60 animate-bounce [animation-delay:300ms]" />
                    </span>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form
            onSubmit={handleSubmit}
            className="border-t border-white/[0.3] dark:border-white/[0.08] bg-white/30 dark:bg-white/[0.03] backdrop-blur-xl px-3 py-2.5"
          >
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask Pulse AI..."
                className="flex-1 rounded-lg border border-white/[0.3] dark:border-white/[0.08] bg-white/40 dark:bg-white/[0.04] px-3 py-2 text-xs text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/25 outline-none focus:ring-1 focus:ring-indigo-400/50 transition-shadow"
                disabled={isStreaming}
              />
              {isStreaming ? (
                <button
                  type="button"
                  onClick={stop}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-500/20 text-red-400 transition-colors hover:bg-red-500/30"
                  aria-label="Stop generating"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-400 transition-colors hover:bg-indigo-500/30 disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Send message"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              )}
            </div>
          </form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
