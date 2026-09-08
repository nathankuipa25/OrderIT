"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-6">
      <div className="w-14 h-14 rounded-full bg-surface flex items-center justify-center mb-5">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="#dc2626" strokeWidth="1.8" />
          <path d="M12 8v5" stroke="#dc2626" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="12" cy="16" r="1" fill="#dc2626" />
        </svg>
      </div>
      <div className="font-semibold text-ink text-lg mb-1">
        Something went wrong
      </div>
      <div className="text-sm text-muted max-w-xs mb-6">
        An unexpected error occurred. You can try again, or head back home.
      </div>
      <div className="flex flex-col gap-2.5 w-full max-w-xs">
        <button onClick={() => reset()} className="btn-primary w-full">
          Try Again
        </button>
        <Link href="/" className="btn-secondary w-full">
          Back to Home
        </Link>
      </div>
    </div>
  );
}
