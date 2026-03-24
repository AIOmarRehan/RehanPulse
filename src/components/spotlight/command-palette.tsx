'use client';

import { useEffect, useState, useCallback } from 'react';
import { Command } from 'cmdk';
import { motion, AnimatePresence } from 'framer-motion';

export interface SpotlightAction {
  id: string;
  label: string;
  icon: string;
  keywords?: string;
  onSelect: () => void;
  group: string;
}

export function CommandPalette({
  actions,
  open,
  onOpenChange,
}: {
  actions: SpotlightAction[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [search, setSearch] = useState('');

  // Reset search when opened
  useEffect(() => {
    if (open) setSearch('');
  }, [open]);

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
      if (e.key === 'Escape' && open) {
        onOpenChange(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onOpenChange]);

  const handleSelect = useCallback(
    (action: SpotlightAction) => {
      onOpenChange(false);
      // Small delay so the palette closes smoothly
      requestAnimationFrame(() => action.onSelect());
    },
    [onOpenChange],
  );

  // Group actions
  const groups = actions.reduce<Record<string, SpotlightAction[]>>((acc, action) => {
    const group = action.group;
    if (!acc[group]) acc[group] = [];
    acc[group]!.push(action);
    return acc;
  }, {});

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            onClick={() => onOpenChange(false)}
          />

          {/* Palette */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="fixed left-1/2 top-[20%] z-50 w-full max-w-lg -translate-x-1/2"
          >
            <Command
              className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl shadow-black/20 dark:border-white/[0.08] dark:bg-[#1a1a2e]"
              loop
            >
              {/* Search input */}
              <div className="flex items-center gap-3 border-b border-gray-100 px-4 dark:border-white/[0.06]">
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4 shrink-0 text-gray-400 dark:text-white/30"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <Command.Input
                  value={search}
                  onValueChange={setSearch}
                  placeholder="Type a command or search..."
                  className="flex-1 border-0 bg-transparent py-3.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-white dark:placeholder:text-white/30"
                />
                <kbd className="hidden rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-400 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/30 sm:inline-block">
                  ESC
                </kbd>
              </div>

              {/* Results */}
              <Command.List className="max-h-72 overflow-y-auto p-2">
                <Command.Empty className="py-8 text-center text-sm text-gray-400 dark:text-white/30">
                  No results found.
                </Command.Empty>

                {Object.entries(groups).map(([group, items]) => (
                  <Command.Group
                    key={group}
                    heading={group}
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-gray-400 dark:[&_[cmdk-group-heading]]:text-white/25"
                  >
                    {items.map((action) => (
                      <Command.Item
                        key={action.id}
                        value={`${action.label} ${action.keywords ?? ''}`}
                        onSelect={() => handleSelect(action)}
                        className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-gray-700 transition-colors data-[selected=true]:bg-gray-100 data-[selected=true]:text-gray-900 dark:text-white/60 dark:data-[selected=true]:bg-white/[0.06] dark:data-[selected=true]:text-white"
                      >
                        <span className="text-base">{action.icon}</span>
                        <span className="flex-1">{action.label}</span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                ))}
              </Command.List>

              {/* Footer */}
              <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2 dark:border-white/[0.06]">
                <div className="flex items-center gap-2 text-[10px] text-gray-400 dark:text-white/25">
                  <span className="flex items-center gap-1">
                    <kbd className="rounded border border-gray-200 bg-gray-50 px-1 py-0.5 font-mono dark:border-white/[0.08] dark:bg-white/[0.04]">↑↓</kbd>
                    navigate
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="rounded border border-gray-200 bg-gray-50 px-1 py-0.5 font-mono dark:border-white/[0.08] dark:bg-white/[0.04]">↵</kbd>
                    select
                  </span>
                </div>
                <span className="text-[10px] text-gray-300 dark:text-white/15">RehanPulse</span>
              </div>
            </Command>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
