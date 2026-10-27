"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export default function SortableProductRow({
  id,
  index,
  total,
  name,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  id: string;
  index: number;
  total: number;
  name: string;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between gap-2 py-3 bg-white"
    >
      <div className="flex items-center gap-1 min-w-0">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Drag to reorder ${name}, position ${index + 1} of ${total}`}
          className="w-8 h-8 -ml-1.5 flex items-center justify-center text-gray-400 shrink-0 touch-none cursor-grab active:cursor-grabbing rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="8" cy="6" r="1.6" fill="currentColor" />
            <circle cx="8" cy="12" r="1.6" fill="currentColor" />
            <circle cx="8" cy="18" r="1.6" fill="currentColor" />
            <circle cx="16" cy="6" r="1.6" fill="currentColor" />
            <circle cx="16" cy="12" r="1.6" fill="currentColor" />
            <circle cx="16" cy="18" r="1.6" fill="currentColor" />
          </svg>
        </button>
        <span className="text-[15px] truncate">
          <span className="text-muted mr-2">{index + 1}.</span>
          {name}
        </span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={index === 0}
          aria-label={`Move ${name} up`}
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 text-navy disabled:opacity-40"
        >
          <span aria-hidden="true">↑</span>
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={index === total - 1}
          aria-label={`Move ${name} down`}
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-200 text-navy disabled:opacity-40"
        >
          <span aria-hidden="true">↓</span>
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          className="w-8 h-9 flex items-center justify-center text-muted text-lg"
        >
          ×
        </button>
      </div>
    </div>
  );
}
