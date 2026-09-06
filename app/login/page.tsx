"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Enter your username and password.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        setSubmitting(false);
        return;
      }
      const next = searchParams.get("next") || "/";
      router.push(next);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-[80vh] flex flex-col justify-center max-w-sm mx-auto w-full">
      <div className="text-center mb-8">
        <div className="text-2xl font-bold text-navy">OrderIT</div>
        <div className="text-sm text-muted mt-1">Sign in to your account</div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="block text-sm font-medium text-muted mb-2">
            Username
          </label>
          <input
            autoFocus
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setError("");
            }}
            placeholder="Enter your username"
            className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-white text-[15px] outline-none focus:border-accent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-muted mb-2">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
            }}
            placeholder="Enter your password"
            className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-white text-[15px] outline-none focus:border-accent"
          />
          {error && <div className="text-sm text-danger mt-2">{error}</div>}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="btn-primary w-full mt-2"
        >
          {submitting ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <div className="text-center text-sm text-muted mt-6">
        New shop?{" "}
        <Link href="/register" className="text-navy font-semibold">
          Register your shop
        </Link>
      </div>
    </div>
  );
}
