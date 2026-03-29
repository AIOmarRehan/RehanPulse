'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import { useChat } from '@/hooks/use-chat';

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
}

/** Wrapper that tints the Lottie animation to #7079CD */
function PulseLottie({ size }: { size: number }) {
  return (
    <div
      style={{ width: size, height: size, position: 'relative', overflow: 'hidden' }}
    >
      {/* Render lottie in grayscale then color-shift to #7079CD via CSS filter */}
      <div
        style={{
          width: size,
          height: size,
          filter: 'brightness(0) saturate(100%) invert(48%) sepia(12%) saturate(1600%) hue-rotate(199deg) brightness(92%) contrast(87%)',
        }}
      >
        <DotLottieReact
          src="/animated-icons/pulse.lottie"
          loop
          autoplay
          style={{ width: size, height: size }}
        />
      </div>
    </div>
  );
}

function timeLabel(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return d.toLocaleDateString();
}

export function ChatPanel({ open, onClose }: ChatPanelProps) {
  const {
    messages,
    isStreaming,
    send,
    stop,
    clear,
    conversations,
    conversationId,
    loadConversation,
    newConversation,
    deleteConversation,
  } = useChat();
  const [input, setInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (open && !showHistory) {
      const t = setTimeout(() => inputRef.current?.focus(), 200);
      return () => clearTimeout(t);
    }
  }, [open, showHistory]);

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
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#7079CD]/15 overflow-hidden">
                <PulseLottie size={20} />
              </div>
              <span className="text-xs font-semibold text-gray-900 dark:text-white">
                Pulse AI
              </span>
              {isStreaming && (
                <span className="text-[10px] text-[#7079CD] animate-pulse">
                  thinking...
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {/* History toggle */}
              <button
                onClick={() => setShowHistory((v) => !v)}
                className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                  showHistory
                    ? 'bg-[#7079CD]/20 text-[#7079CD]'
                    : 'text-gray-400 dark:text-white/30 hover:bg-white/50 dark:hover:bg-white/[0.08] hover:text-gray-600 dark:hover:text-white/50'
                }`}
                aria-label="Chat history"
                title="Chat history"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </button>
              {/* New chat */}
              <button
                onClick={() => { newConversation(); setShowHistory(false); }}
                className="flex h-6 w-6 items-center justify-center rounded-md text-gray-400 dark:text-white/30 transition-colors hover:bg-white/50 dark:hover:bg-white/[0.08] hover:text-gray-600 dark:hover:text-white/50"
                aria-label="New chat"
                title="New chat"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
              {/* Delete current chat */}
              {messages.length > 0 && (
                <button
                  onClick={clear}
                  className="flex h-6 w-6 items-center justify-center rounded-md text-gray-400 dark:text-white/30 transition-colors hover:bg-white/50 dark:hover:bg-white/[0.08] hover:text-gray-600 dark:hover:text-white/50"
                  aria-label="Delete chat"
                  title="Delete chat"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
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
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {/* History sidebar overlay */}
          <AnimatePresence>
            {showHistory && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.15 }}
                className="absolute inset-0 top-[49px] z-10 flex flex-col bg-white/90 dark:bg-[#0c0c1d]/95 backdrop-blur-xl"
              >
                <div className="px-3 pt-3 pb-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-white/30">
                    Past conversations
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-thumb]:bg-white/10">
                  {conversations.length === 0 && (
                    <p className="px-2 py-6 text-center text-[11px] text-gray-400 dark:text-white/25">
                      No past conversations
                    </p>
                  )}
                  {conversations.map((conv) => (
                    <div
                      key={conv.id}
                      className={`group flex items-center gap-2 rounded-lg px-2.5 py-2 cursor-pointer transition-colors ${
                        conv.id === conversationId
                          ? 'bg-[#7079CD]/15 text-[#7079CD]'
                          : 'text-gray-600 dark:text-white/60 hover:bg-white/50 dark:hover:bg-white/[0.06]'
                      }`}
                      onClick={() => { loadConversation(conv.id); setShowHistory(false); }}
                    >
                      <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0 opacity-50" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium truncate">{conv.title}</p>
                        <p className="text-[10px] opacity-50">{timeLabel(conv.updatedAt)} &middot; {conv.messageCount} msgs</p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                        className="hidden group-hover:flex h-5 w-5 items-center justify-center rounded text-gray-400 dark:text-white/30 hover:text-red-400 transition-colors"
                        aria-label="Delete conversation"
                      >
                        <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2}>
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-3 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-thumb]:bg-white/10">
            {messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#7079CD]/10 mb-3 overflow-hidden">
                  <PulseLottie size={36} />
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
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed overflow-hidden break-words ${
                    msg.role === 'user'
                      ? 'bg-indigo-500 text-white'
                      : 'bg-white/50 dark:bg-white/[0.06] text-gray-700 dark:text-white/80 border border-white/[0.3] dark:border-white/[0.06]'
                  }`}
                >
                  {msg.content ? (
                    msg.role === 'assistant' ? (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                          ul: ({ children }) => <ul className="list-disc pl-4 mb-2 last:mb-0">{children}</ul>,
                          ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 last:mb-0">{children}</ol>,
                          li: ({ children }) => <li className="mb-0.5">{children}</li>,
                          code: ({ className, children }) => {
                            const match = /language-(\w+)/.exec(className || '');
                            const codeStr = String(children).replace(/\n$/, '');
                            return match ? (
                              <SyntaxHighlighter
                                style={oneDark}
                                language={match[1]}
                                PreTag="div"
                                customStyle={{
                                  margin: '4px 0',
                                  padding: '8px 10px',
                                  borderRadius: '8px',
                                  fontSize: '11px',
                                  lineHeight: '1.5',
                                  background: 'rgba(0,0,0,0.85)',
                                }}
                              >
                                {codeStr}
                              </SyntaxHighlighter>
                            ) : (
                              <code className="bg-black/10 dark:bg-white/10 rounded px-1 py-0.5 text-[11px]">
                                {children}
                              </code>
                            );
                          },
                          pre: ({ children }) => <>{children}</>,
                          a: ({ href, children }) => (
                            <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#7079CD] underline underline-offset-2">
                              {children}
                            </a>
                          ),
                          h1: ({ children }) => <p className="font-bold mb-1">{children}</p>,
                          h2: ({ children }) => <p className="font-bold mb-1">{children}</p>,
                          h3: ({ children }) => <p className="font-semibold mb-1">{children}</p>,
                          blockquote: ({ children }) => (
                            <blockquote className="border-l-2 border-[#7079CD]/50 pl-2 my-1 opacity-80">
                              {children}
                            </blockquote>
                          ),
                          table: ({ children }) => (
                            <div className="overflow-x-auto my-1">
                              <table className="text-[11px] border-collapse">{children}</table>
                            </div>
                          ),
                          th: ({ children }) => <th className="border border-white/10 px-1.5 py-0.5 text-left font-semibold">{children}</th>,
                          td: ({ children }) => <td className="border border-white/10 px-1.5 py-0.5">{children}</td>,
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    ) : (
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    )
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <div className="h-5 w-5 overflow-hidden">
                        <PulseLottie size={20} />
                      </div>
                      <span className="text-[10px] opacity-50">Generating...</span>
                    </div>
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
                className="flex-1 rounded-lg border border-white/[0.3] dark:border-white/[0.08] bg-white/40 dark:bg-white/[0.04] px-3 py-2 text-xs text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/25 outline-none focus:ring-1 focus:ring-[#7079CD]/50 transition-shadow"
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
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#7079CD]/20 text-[#7079CD] transition-colors hover:bg-[#7079CD]/30 disabled:opacity-30 disabled:cursor-not-allowed"
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
