"use client";

import { useEffect, useState } from "react";
import { RESET_CONFIRMATION } from "@/lib/admin-reset-constants.mjs";

type Availability = { available: boolean; reason?: string };
type Notice = { kind: "error" | "success"; message: string };

type BackupFile = {
  format: string;
  counts: { products: number; orders: number; orderItems: number };
};

export default function ResetConsole() {
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [busy, setBusy] = useState(false);
  const [backupToken, setBackupToken] = useState("");
  const [backupFile, setBackupFile] = useState<BackupFile | null>(null);
  const [backupSaved, setBackupSaved] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/reset", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not check reset availability.");
        if (active) setAvailability(data);
      })
      .catch((error: unknown) => {
        if (active) {
          setNotice({
            kind: "error",
            message: error instanceof Error ? error.message : "Could not check reset availability.",
          });
        }
      })
      .finally(() => {
        if (active) setLoadingStatus(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function createBackup() {
    setBusy(true);
    setNotice(null);
    setBackupToken("");
    setBackupFile(null);
    setBackupSaved(false);
    setConfirmation("");
    try {
      const response = await fetch("/api/admin/reset/backup", { method: "POST" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "The backup could not be created.");
      }
      const token = response.headers.get("X-OrderIT-Reset-Backup-Token");
      if (!token) throw new Error("The backup was returned without reset authorization. Nothing was reset.");
      const backup = await response.json();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `orderit-reset-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setBackupToken(token);
      setBackupFile({ format: backup.format, counts: backup.counts });
      setNotice({ kind: "success", message: "Backup generated and download started. Save it somewhere safe before continuing." });
    } catch (error) {
      setNotice({
        kind: "error",
        message: error instanceof Error ? error.message : "The backup could not be created.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function resetData() {
    if (!backupToken || !backupSaved || confirmation !== RESET_CONFIRMATION || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backupToken, backupSaved, confirmation }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The reset was not completed.");
      setBackupToken("");
      setBackupFile(null);
      setBackupSaved(false);
      setConfirmation("");
      setNotice({
        kind: "success",
        message: `Reset complete: ${data.deleted.products} products and ${data.deleted.orders} orders removed. Shop and admin accounts were preserved.`,
      });
    } catch (error) {
      setNotice({
        kind: "error",
        message: error instanceof Error ? error.message : "The reset was not completed.",
      });
    } finally {
      setBusy(false);
    }
  }

  const canReset = Boolean(
    availability?.available &&
      backupToken &&
      backupSaved &&
      confirmation === RESET_CONFIRMATION &&
      !busy
  );

  return (
    <main className="pb-10">
      <header className="py-2 mb-5">
        <div className="text-2xl font-bold">Reset products and orders</div>
        <p className="text-sm text-muted mt-2">
          This admin-only action clears the shared product catalog and order history.
        </p>
      </header>

      <section className="card p-4 mb-4 border-red-200">
        <h2 className="font-semibold text-danger">Exactly what changes</h2>
        <ul className="text-sm text-ink mt-3 space-y-2 list-disc pl-5">
          <li><strong>Removed:</strong> all products and all orders.</li>
          <li>Order items are removed automatically with their parent orders.</li>
          <li><strong>Preserved:</strong> every shop account, every admin account, and all user records.</li>
        </ul>
        <p className="text-sm text-muted mt-3">
          This cannot be undone in the app. Use the downloaded backup if recovery is needed.
        </p>
      </section>

      {loadingStatus ? (
        <section className="card p-4 mb-4 text-sm text-muted">Checking reset availability…</section>
      ) : availability && !availability.available ? (
        <section className="card p-4 mb-4 border-amber-300 bg-amber-50" role="status">
          <h2 className="font-semibold text-ink">Reset unavailable</h2>
          <p className="text-sm text-muted mt-1">{availability.reason}</p>
        </section>
      ) : null}

      {availability?.available && (
        <>
          <section className="card p-4 mb-4">
            <h2 className="font-semibold text-ink">1. Create a backup</h2>
            <p className="text-sm text-muted mt-1">
              Download a JSON snapshot of the products and orders that will be cleared. The reset is blocked unless this exact snapshot still matches the database.
            </p>
            <button
              type="button"
              onClick={createBackup}
              disabled={busy}
              className="btn-secondary w-full mt-4"
            >
              {busy ? "Working…" : "Create and download backup"}
            </button>
            {backupFile && (
              <div className="mt-3 rounded-xl bg-surface p-3 text-sm text-ink" role="status">
                Backup prepared: {backupFile.counts.products} products, {backupFile.counts.orders} orders, and {backupFile.counts.orderItems} order items.
              </div>
            )}
            {backupToken && (
              <label className="flex gap-3 items-start mt-4 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={backupSaved}
                  onChange={(event) => setBackupSaved(event.target.checked)}
                  className="mt-1 h-4 w-4 accent-navy"
                />
                <span>I saved the downloaded backup file in a safe location.</span>
              </label>
            )}
          </section>

          <section className="card p-4 border-red-200">
            <h2 className="font-semibold text-ink">2. Confirm the reset</h2>
            <label htmlFor="reset-confirmation" className="block text-sm text-muted mt-2">
              Type <span className="font-mono font-semibold text-danger">{RESET_CONFIRMATION}</span> exactly.
            </label>
            <input
              id="reset-confirmation"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder={RESET_CONFIRMATION}
              className="w-full h-12 px-3 mt-2 rounded-xl border border-gray-200 bg-white text-sm font-mono outline-none focus:border-danger"
            />
            <button
              type="button"
              onClick={resetData}
              disabled={!canReset}
              className="w-full h-12 mt-4 rounded-xl bg-danger text-white font-semibold disabled:opacity-40 disabled:pointer-events-none"
            >
              {busy ? "Working…" : "Permanently reset products and orders"}
            </button>
            <p className="text-xs text-muted mt-3">
              The server verifies the backup, takes a transaction lock, and removes only products and orders. If catalog or order data changed since the backup, the reset is refused.
            </p>
          </section>
        </>
      )}

      {notice && (
        <div
          role={notice.kind === "error" ? "alert" : "status"}
          className={`mt-4 rounded-xl p-3 text-sm ${
            notice.kind === "error" ? "bg-red-50 text-danger" : "bg-green-50 text-success"
          }`}
        >
          {notice.message}
        </div>
      )}
    </main>
  );
}
