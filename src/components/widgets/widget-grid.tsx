'use client';

import { useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { WidgetErrorBoundary } from './widget-error-boundary';

/* ─── Types ─── */
export interface WidgetConfig {
  id: string;
  title: string;
  icon: React.ReactNode;
  colSpan?: 1 | 2;
  rowSpan?: 1 | 2;
}

interface DragState {
  draggedId: string | null;
  overId: string | null;
}

/* ─── Widget Card ─── */
function WidgetCard({
  widget,
  children,
  isDragging,
  isOver,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  widget: WidgetConfig;
  children: React.ReactNode;
  isDragging: boolean;
  isOver: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
}) {
  return (
    <motion.div
      layout
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`
        group relative rounded-xl border backdrop-blur-[28px] backdrop-saturate-[180%] transition-all
        ${widget.colSpan === 2 ? 'col-span-2' : 'col-span-1'}
        ${widget.rowSpan === 2 ? 'row-span-2' : 'row-span-1'}
        ${isDragging
          ? 'z-50 scale-[1.02] border-indigo-400/40 bg-white/70 shadow-xl shadow-indigo-500/10 dark:border-indigo-400/30 dark:bg-[#0c0c1d]/80'
          : isOver
            ? 'border-indigo-400/30 bg-indigo-50/40 dark:border-indigo-400/20 dark:bg-indigo-500/[0.06]'
            : 'border-white/[0.85] bg-white/40 shadow-[0_8px_32px_rgba(100,120,200,0.1),inset_0_1px_0_rgba(255,255,255,0.9)] dark:border-white/[0.08] dark:bg-[#0c0c1d]/60 dark:shadow-[0_8px_32px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.12)]'
        }
      `}
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.18] px-4 py-3 dark:border-white/[0.06]">
        <div className="flex items-center gap-2">
          <span className="text-sm">{widget.icon}</span>
          <h3 className="text-xs font-semibold text-gray-700 dark:text-white/70">{widget.title}</h3>
        </div>
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <div className="h-1 w-1 rounded-full bg-gray-300 dark:bg-white/20" />
          <div className="h-1 w-1 rounded-full bg-gray-300 dark:bg-white/20" />
          <div className="h-1 w-1 rounded-full bg-gray-300 dark:bg-white/20" />
        </div>
      </div>
      {/* Content */}
      <div className="p-4">{children}</div>
    </motion.div>
  );
}

/* ─── Widget Grid ─── */
export function WidgetGrid({
  widgets,
  renderWidget,
}: {
  widgets: WidgetConfig[];
  renderWidget: (widget: WidgetConfig) => React.ReactNode;
}) {
  const [order, setOrder] = useState<string[]>(() => widgets.map((w) => w.id));
  const [drag, setDrag] = useState<DragState>({ draggedId: null, overId: null });
  const dragCounter = useRef(0);

  const handleDragStart = useCallback((id: string) => {
    setDrag((prev) => ({ ...prev, draggedId: id }));
  }, []);

  const handleDragEnd = useCallback(() => {
    setDrag((prev) => {
      if (prev.draggedId && prev.overId && prev.draggedId !== prev.overId) {
        setOrder((currentOrder) => {
          const newOrder = [...currentOrder];
          const fromIdx = newOrder.indexOf(prev.draggedId!);
          const toIdx = newOrder.indexOf(prev.overId!);
          if (fromIdx !== -1 && toIdx !== -1) {
            newOrder.splice(fromIdx, 1);
            newOrder.splice(toIdx, 0, prev.draggedId!);
          }
          return newOrder;
        });
      }
      return { draggedId: null, overId: null };
    });
    dragCounter.current = 0;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    setDrag((prev) => (prev.overId !== id ? { ...prev, overId: id } : prev));
  }, []);

  const widgetMap = new Map(widgets.map((w) => [w.id, w]));
  const orderedWidgets = order
    .map((id) => widgetMap.get(id))
    .filter((w): w is WidgetConfig => w !== undefined);

  return (
    <div className="grid auto-rows-[minmax(180px,auto)] grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      {orderedWidgets.map((widget) => (
        <WidgetCard
          key={widget.id}
          widget={widget}
          isDragging={drag.draggedId === widget.id}
          isOver={drag.overId === widget.id && drag.draggedId !== widget.id}
          onDragStart={() => handleDragStart(widget.id)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => handleDragOver(e, widget.id)}
          onDrop={handleDragEnd}
        >
          <WidgetErrorBoundary>
            {renderWidget(widget)}
          </WidgetErrorBoundary>
        </WidgetCard>
      ))}
    </div>
  );
}
