"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !username.trim() || !password) {
      setError("All fields are required.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          username: username.trim(),
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        setSubmitting(false);
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Something went wrong. Your shop wasn't registered.");
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-[80vh] flex flex-col justify-center max-w-sm mx-auto w-full">
      <div className="text-center mb-8">
        <div className="text-2xl font-bold text-navy">Register Shop</div>
        <div className="text-sm text-muted mt-1">
          This name appears on your generated orders
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="block text-sm font-medium text-muted mb-2">
            Shop name
          </label>
          <input
            autoFocus
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError("");
            }}
            placeholder="e.g. HenkTrust Chinakanaka"
            className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-white text-[15px] outline-none focus:border-accent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-muted mb-2">
            Username
          </label>
          <input
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setError("");
            }}
            placeholder="Choose a username"
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
            placeholder="Choose a password"
            className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-white text-[15px] outline-none focus:border-accent"
          />
          {error && <div className="text-sm text-danger mt-2">{error}</div>}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="btn-primary w-full mt-2"
        >
          {submitting ? "Registering..." : "Register Shop"}
        </button>
      </form>

      <div className="text-center text-sm text-muted mt-6">
        Already registered?{" "}
        <Link href="/login" className="text-navy font-semibold">
          Sign in
        </Link>
      </div>
    </div>
  );
}
