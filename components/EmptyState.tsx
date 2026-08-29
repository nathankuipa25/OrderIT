export default function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center text-center px-6 py-10 mt-4">
      <div className="w-12 h-12 rounded-full bg-surface flex items-center justify-center mb-4">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect
            x="5"
            y="3.5"
            width="14"
            height="17"
            rx="2"
            stroke="#9ca3af"
            strokeWidth="1.6"
          />
          <path
            d="M8.5 8h7M8.5 12h7M8.5 16h4"
            stroke="#9ca3af"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="font-semibold text-ink">{title}</div>
      <div className="text-sm text-muted mt-1 max-w-[240px]">{description}</div>
      {action && <div className="mt-5 w-full">{action}</div>}
    </div>
  );
}
