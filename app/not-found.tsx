import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-6">
      <div className="font-semibold text-ink text-lg mb-1">Page not found</div>
      <div className="text-sm text-muted max-w-xs mb-6">
        The page you're looking for doesn't exist or may have moved.
      </div>
      <Link href="/" className="btn-primary w-full max-w-xs">
        Back to Home
      </Link>
    </div>
  );
}
