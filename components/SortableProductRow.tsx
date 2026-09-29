"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export default function SortableProductRow({
  id,
  index,
  name,
  onRemove,
}: {
  id: string;
  index: number;
  name: string;
  onRemove: () => void;
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
      className="flex items-center justify-between py-3 bg-white"
    >
      <div className="flex items-center gap-1 min-w-0">
        <button
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${name}`}
          className="w-8 h-8 -ml-1.5 flex items-center justify-center text-gray-300 shrink-0 touch-none cursor-grab active:cursor-grabbing"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
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
      <button
        onClick={onRemove}
        aria-label={`Remove ${name}`}
        className="w-8 h-8 flex items-center justify-center text-muted text-lg shrink-0"
      >
        ×
      </button>
    </div>
  );
}
