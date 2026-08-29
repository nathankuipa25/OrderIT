export default function ProductRow({
  name,
  selected,
  onToggle,
}: {
  name: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full flex items-center justify-between px-4 py-3.5 min-h-[52px] rounded-xl border text-left transition ${
        selected
          ? "bg-accent-light border-accent"
          : "bg-white border-gray-200"
      }`}
    >
      <span
        className={`font-medium ${selected ? "text-navy" : "text-ink"}`}
      >
        {name}
      </span>
      {selected ? (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" fill="#0f9d9d" />
          <path
            d="M8 12.5l2.5 2.5L16 9.5"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9.2" stroke="#d1d5db" strokeWidth="1.6" />
        </svg>
      )}
    </button>
  );
}
