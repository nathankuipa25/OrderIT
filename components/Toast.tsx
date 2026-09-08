export type ToastVariant = "success" | "error";

export default function Toast({
  message,
  variant,
}: {
  message: string;
  variant: ToastVariant;
}) {
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-subtle z-50 flex items-center gap-2 ${
        variant === "error" ? "bg-danger" : "bg-navy"
      }`}
    >
      {variant === "error" && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0">
          <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="1.8" />
          <path d="M12 8v5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="12" cy="16" r="0.9" fill="white" />
        </svg>
      )}
      {message}
    </div>
  );
}
