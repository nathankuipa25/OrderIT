"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import Skeleton from "@/components/Skeleton";
import Toast from "@/components/Toast";
import { getLoadState } from "@/lib/load-state.mjs";
import {
  summarizeProductSelection,
  toggleLoadedProductSelection,
  toggleProductSelection,
} from "@/lib/product-selection.mjs";

type Product = { id: string; name: string; active: boolean };
type ImportRow = {
  line: number;
  rowNumber: number;
  name: string;
  active: boolean;
  errors: string[];
  status: "invalid" | "duplicate-file" | "already-exists" | "ready";
};
type ImportSummary = {
  total: number;
  ready: number;
  invalid: number;
  alreadyExists: number;
  duplicateFile: number;
};
type ImportResult = {
  created: number;
  skippedExisting: number;
  skippedDuplicate: number;
  invalid: number;
  skippedRace: number;
};
type ImportPreview = {
  fileName: string;
  csv: string;
  rows: ImportRow[];
  summary: ImportSummary;
  result?: ImportResult;
};

function importStatusLabel(status: ImportRow["status"]) {
  if (status === "ready") return "Ready to add";
  if (status === "already-exists") return "Already in catalog";
  if (status === "duplicate-file") return "Repeated in CSV";
  return "Needs correction";
}

function importStatusClass(status: ImportRow["status"]) {
  if (status === "ready") return "text-success";
  if (status === "invalid") return "text-danger";
  return "text-muted";
}

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [failedPage, setFailedPage] = useState<"initial" | "more" | null>(null);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const latestQueryRef = useRef(debouncedQuery);
  latestQueryRef.current = debouncedQuery;

  const [selectMode, setSelectMode] = useState(false);
  const [selectedProductsById, setSelectedProductsById] = useState<Map<string, string>>(
    new Map()
  );
  const [bulkBusy, setBulkBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const selectionSummary = summarizeProductSelection(selectedProductsById);
  const selectedIds = new Set(selectionSummary.ids);

  function showToast(message: string, variant: "success" | "error" = "success") {
    setToast({ message, variant });
    setTimeout(() => setToast(null), 2600);
  }

  // Debounce search input so we're not hitting the API on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const skipRef = useRef(0);
  const loadingRef = useRef(false);
  const pendingResetRef = useRef(false);

  const fetchPage = useCallback(
    async (opts: { reset: boolean }) => {
      if (loadingRef.current) {
        if (opts.reset) pendingResetRef.current = true;
        return;
      }
      loadingRef.current = true;
      if (opts.reset) {
        setInitialLoading(true);
        skipRef.current = 0;
        setProducts([]);
        setHasMore(false);
      } else {
        setLoadingMore(true);
      }
      setError("");
      setFailedPage(null);

      try {
        const params = new URLSearchParams({
          take: String(PAGE_SIZE),
          skip: String(opts.reset ? 0 : skipRef.current),
        });
        if (latestQueryRef.current) params.set("q", latestQueryRef.current);

        const res = await fetch(`/api/products?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load");

        const newProducts: Product[] = data.products ?? [];
        setProducts((prev) => (opts.reset ? newProducts : [...prev, ...newProducts]));
        setHasMore(Boolean(data.hasMore));
        skipRef.current = (opts.reset ? 0 : skipRef.current) + newProducts.length;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Something went wrong loading products."
        );
        setFailedPage(opts.reset ? "initial" : "more");
      } finally {
        loadingRef.current = false;
        setInitialLoading(false);
        setLoadingMore(false);
        if (pendingResetRef.current) {
          pendingResetRef.current = false;
          window.setTimeout(() => {
            void fetchPage({ reset: true });
          }, 0);
        }
      }
    },
    []
  );

  // Reload from scratch whenever the (debounced) search term changes.
  useEffect(() => {
    fetchPage({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  // Infinite scroll: observe a sentinel at the bottom of the list.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingRef.current && !error) {
          fetchPage({ reset: false });
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, fetchPage, error]);

  function toggleSelectMode() {
    if (selectMode) setSelectedProductsById(new Map());
    setSelectMode((v) => !v);
  }

  function toggleSelected(id: string, name: string) {
    setSelectedProductsById((prev) => toggleProductSelection(prev, { id, name }));
  }

  function toggleAllLoadedProducts() {
    setSelectedProductsById((prev) => toggleLoadedProductSelection(prev, products));
  }

  async function handleBulkSetActive(active: boolean) {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      const res = await fetch("/api/products/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      showToast(
        `✓ ${data.updated} product${data.updated === 1 ? "" : "s"} ${
          active ? "activated" : "deactivated"
        }`
      );
      setSelectMode(false);
      setSelectedProductsById(new Map());
      fetchPage({ reset: true });
    } catch {
      showToast("Something went wrong. Products weren't updated.", "error");
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0 || bulkBusy) return;
    setBulkBusy(true);
    try {
      const res = await fetch("/api/products/bulk-delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "The selected products weren't deleted.");
      showToast(`Deleted ${data.deleted} product${data.deleted === 1 ? "" : "s"}.`);
      setDeleteConfirmOpen(false);
      setSelectedProductsById(new Map());
      setSelectMode(false);
      fetchPage({ reset: true });
    } catch (err) {
      showToast(
        err instanceof Error
          ? err.message
          : "Something went wrong. The selected products weren't deleted.",
        "error"
      );
    } finally {
      setBulkBusy(false);
    }
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;

    setImporting(true);
    try {
      const text = await file.text();
      const res = await fetch("/api/products/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", csv: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not preview that CSV file.");
      setImportPreview({
        fileName: file.name,
        csv: text,
        rows: data.rows ?? [],
        summary: data.summary ?? {
          total: 0,
          ready: 0,
          invalid: 0,
          alreadyExists: 0,
          duplicateFile: 0,
        },
      });
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Something went wrong reading that CSV file.",
        "error"
      );
    } finally {
      setImporting(false);
    }
  }

  async function handleConfirmImport() {
    if (!importPreview || importPreview.summary.ready === 0 || importing) return;
    setImporting(true);
    try {
      const res = await fetch("/api/products/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import", csv: importPreview.csv }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not import those products.");
      setImportPreview((current) =>
        current
          ? {
              ...current,
              rows: data.rows ?? current.rows,
              summary: data.summary ?? current.summary,
              result: {
                created: data.created ?? 0,
                skippedExisting: data.skippedExisting ?? 0,
                skippedDuplicate: data.skippedDuplicate ?? 0,
                invalid: data.invalid ?? 0,
                skippedRace: data.skippedRace ?? 0,
              },
            }
          : current
      );
      fetchPage({ reset: true });
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Something went wrong importing that CSV file.",
        "error"
      );
    } finally {
      setImporting(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch("/api/products/export");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not export products.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "orderit-products.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast("Product CSV exported.");
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Something went wrong exporting products.",
        "error"
      );
    } finally {
      setExporting(false);
    }
  }

  const loadState = getLoadState({
    loading: initialLoading,
    error: Boolean(error && products.length === 0),
    itemCount: products.length,
  });
  const allLoadedSelected =
    products.length > 0 && products.every((product) => selectedProductsById.has(product.id));
  const someLoadedSelected = products.some((product) => selectedProductsById.has(product.id));

  return (
    <div className={selectMode && selectedIds.size > 0 ? "pb-40" : "pb-10"}>
      <header className="flex items-center justify-between py-2 mb-5 gap-2">
        <div className="text-2xl font-bold">
          {selectedIds.size > 0 ? `${selectedIds.size} selected` : "Products"}
        </div>
        <div className="flex items-center gap-3">
          {selectMode ? (
            <button
              onClick={toggleSelectMode}
              className="text-navy font-semibold text-sm"
            >
              Done
            </button>
          ) : (
            <>
              <button
                onClick={handleImportClick}
                disabled={importing}
                className="text-navy font-semibold text-sm"
              >
                {importing ? "Working..." : "Import"}
              </button>
              <button
                onClick={handleExport}
                disabled={exporting}
                className="text-navy font-semibold text-sm"
              >
                {exporting ? "Exporting..." : "Export"}
              </button>
              <button
                onClick={toggleSelectMode}
                className="text-navy font-semibold text-sm"
              >
                Select
              </button>
              <Link
                href="/products/new"
                className="text-navy font-semibold text-sm flex items-center gap-1"
              >
                <span className="text-lg leading-none">+</span> Add
              </Link>
            </>
          )}
        </div>
      </header>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleFileSelected}
        className="hidden"
      />

      {selectMode && products.length > 0 && (
        <div className="card mb-4 flex items-center justify-between gap-3 px-4 py-3">
          <label className="flex min-h-[44px] items-center gap-3 text-sm font-medium text-ink">
            <input
              type="checkbox"
              checked={allLoadedSelected}
              ref={(input) => {
                if (input) input.indeterminate = someLoadedSelected && !allLoadedSelected;
              }}
              onChange={toggleAllLoadedProducts}
              aria-label={`Select all ${products.length} loaded products`}
              className="h-5 w-5 accent-teal-600"
            />
            <span>Select all {products.length} loaded products</span>
          </label>
          <span className="shrink-0 text-sm text-muted" aria-live="polite">
            {selectedIds.size} selected
          </span>
        </div>
      )}

      <div className="relative mb-5">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            className="absolute left-3.5 top-1/2 -translate-y-1/2"
          >
            <circle cx="11" cy="11" r="7" stroke="#9ca3af" strokeWidth="1.8" />
            <path
              d="M21 21l-4.3-4.3"
              stroke="#9ca3af"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          <input
            aria-label="Search products"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products..."
            className="w-full h-12 pl-11 pr-4 rounded-xl border border-gray-200 bg-white text-[15px] outline-none focus:border-accent"
          />
      </div>

      {error && products.length > 0 && failedPage === "initial" && (
        <div role="alert" className="text-sm text-danger mb-4">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => fetchPage({ reset: true })}
            className="btn-secondary mt-3 px-4"
          >
            Retry loading products
          </button>
        </div>
      )}

      {loadState === "loading" ? (
        <div role="status" aria-busy="true" aria-label="Loading products" className="flex flex-col gap-2.5">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : loadState === "error" ? (
        <div role="alert" className="card p-5 text-center">
          <div className="font-semibold text-ink">Products couldn&rsquo;t load</div>
          <p className="text-sm text-muted mt-1">{error}</p>
          <button
            type="button"
            onClick={() => fetchPage({ reset: true })}
            className="btn-primary w-full mt-4"
          >
            Retry loading products
          </button>
        </div>
      ) : loadState === "empty" ? (
        debouncedQuery ? (
          <div className="text-center py-10">
            <div className="font-semibold text-ink">No products found</div>
            <div className="text-sm text-muted mt-1">Try a different search.</div>
          </div>
        ) : (
          <EmptyState
            title="No products yet"
            description="Add products to create your shop catalog."
            action={
              <Link href="/products/new" className="btn-primary w-full">
                Add Product
              </Link>
            }
          />
        )
      ) : (
        <>
          <div className="flex flex-col gap-2.5">
            {products.map((p) => {
              const row = (
                <div className="flex w-full min-w-0 items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-ink truncate">{p.name}</div>
                      <div
                        className={`text-xs mt-0.5 font-medium ${
                          p.active ? "text-success" : "text-muted"
                        }`}
                      >
                        {p.active ? "Active" : "Inactive"}
                      </div>
                    </div>
                  </div>
                  {!selectMode && (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0">
                      <path
                        d="M9 6l6 6-6 6"
                        stroke="#9ca3af"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
              );

              return selectMode ? (
                <label
                  key={p.id}
                  className="card flex min-h-[52px] cursor-pointer items-center gap-3 px-4 py-3.5 text-left"
                >
                  <input
                    type="checkbox"
                    checked={selectedProductsById.has(p.id)}
                    onChange={() => toggleSelected(p.id, p.name)}
                    aria-label={`Select ${p.name}`}
                    className="h-5 w-5 shrink-0 accent-teal-600"
                  />
                  {row}
                </label>
              ) : (
                <Link
                  key={p.id}
                  href={`/products/${p.id}/edit`}
                  className="card flex items-center justify-between px-4 py-3.5 min-h-[44px]"
                >
                  {row}
                </Link>
              );
            })}
          </div>

          {/* Sentinel: crossing into view triggers the next page load */}
          {hasMore && (
            <>
              <div ref={sentinelRef} aria-hidden="true" className="h-px" />
              {loadingMore && (
                <div role="status" aria-busy="true" aria-label="Loading more products" className="flex flex-col gap-2.5 mt-2.5">
                  <Skeleton className="h-16" />
                  <Skeleton className="h-16" />
                </div>
              )}
              {error && products.length > 0 && failedPage === "more" && (
                <div role="alert" className="text-sm text-danger text-center mt-3">
                  <p>{error}</p>
                  <button
                    type="button"
                    onClick={() => fetchPage({ reset: false })}
                    className="btn-secondary mt-3 px-4"
                  >
                    Retry loading more products
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={() => fetchPage({ reset: false })}
                disabled={loadingMore}
                aria-busy={loadingMore}
                className="btn-secondary w-full mt-3"
              >
                {loadingMore ? "Loading more products…" : "Load more products"}
              </button>
            </>
          )}
        </>
      )}

      {selectMode && selectedIds.size > 0 && (
        <div className="fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom))] left-0 right-0 z-40 bg-white border-t border-gray-100 md:bottom-0 md:pl-56">
          <div className="page-container px-4 py-3 flex gap-2">
            <button
              type="button"
              onClick={() => handleBulkSetActive(true)}
              disabled={bulkBusy}
              className="btn-secondary flex-1 px-2 text-sm"
            >
              {bulkBusy ? "Updating..." : "Activate"}
            </button>
            <button
              type="button"
              onClick={() => handleBulkSetActive(false)}
              disabled={bulkBusy}
              className="btn-primary flex-1 px-2 text-sm"
            >
              {bulkBusy ? "Updating..." : "Deactivate"}
            </button>
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={bulkBusy}
              className="flex-1 rounded-xl bg-red-600 px-2 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              Delete selected
            </button>
          </div>
        </div>
      )}

      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-delete-title"
            aria-describedby="bulk-delete-description"
            onKeyDown={(event) => {
              if (event.key === "Escape" && !bulkBusy) setDeleteConfirmOpen(false);
            }}
            className="w-full max-w-lg rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
          >
            <h2 id="bulk-delete-title" className="text-lg font-bold text-ink">
              Delete {selectionSummary.count} selected product{selectionSummary.count === 1 ? "" : "s"} from the catalog?
            </h2>
            <p id="bulk-delete-description" className="mt-2 text-sm text-muted">
              Scope: {selectionSummary.scope} ({selectionSummary.count}). Search filters and loaded pages do not change this selection. Products used in order history cannot be deleted; if any selected product is protected or missing, none will be deleted.
            </p>
            <ul className="mt-3 max-h-40 overflow-y-auto rounded-xl bg-gray-50 px-4 py-2 text-sm text-ink">
              {selectionSummary.products.map((product) => (
                <li key={product.id} className="py-1">
                  {product.name}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex gap-2.5">
              <button
                type="button"
                autoFocus
                disabled={bulkBusy}
                onClick={() => setDeleteConfirmOpen(false)}
                className="btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={bulkBusy || selectionSummary.count === 0}
                onClick={handleBulkDelete}
                className="flex-1 rounded-xl bg-red-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
              >
                {bulkBusy ? "Deleting..." : `Delete ${selectionSummary.count} product${selectionSummary.count === 1 ? "" : "s"}`}
              </button>
            </div>
          </section>
        </div>
      )}

      {importPreview && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-import-title"
            className="w-full max-w-xl max-h-[90vh] overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white shadow-xl flex flex-col"
          >
            <div className="px-5 pt-5 pb-4 border-b border-gray-100">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 id="product-import-title" className="text-lg font-bold text-ink">
                    {importPreview.result ? "Import results" : "Review product import"}
                  </h2>
                  <p className="text-sm text-muted mt-1 truncate">{importPreview.fileName}</p>
                </div>
                <button
                  type="button"
                  disabled={importing}
                  onClick={() => setImportPreview(null)}
                  className="text-muted text-sm font-semibold disabled:opacity-50"
                >
                  Close
                </button>
              </div>

              {importPreview.result ? (
                <div className="mt-4 rounded-xl bg-gray-50 p-3 text-sm text-ink">
                  <div className="font-semibold">
                    Added {importPreview.result.created} product{importPreview.result.created === 1 ? "" : "s"}.
                  </div>
                  <div className="mt-1 text-muted">
                    Skipped {importPreview.result.skippedExisting} already in the catalog, {importPreview.result.skippedDuplicate} repeated in the CSV, {importPreview.result.skippedRace} added by another import, and {importPreview.result.invalid} invalid row{importPreview.result.invalid === 1 ? "" : "s"}.
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-4 text-sm">
                  <div className="text-success">{importPreview.summary.ready} ready to add</div>
                  <div className="text-muted">{importPreview.summary.alreadyExists} already in catalog</div>
                  <div className="text-muted">{importPreview.summary.duplicateFile} repeated in CSV</div>
                  <div className={importPreview.summary.invalid ? "text-danger" : "text-muted"}>
                    {importPreview.summary.invalid} need correction
                  </div>
                </div>
              )}
              {!importPreview.result && (
                <p className="text-xs text-muted mt-3">
                  Name is required. Enabled is optional; blank values default to enabled. Other CSV columns are ignored.
                </p>
              )}
            </div>

            <div className="overflow-y-auto px-5 py-3">
              {importPreview.rows.length === 0 ? (
                <p className="text-sm text-muted py-3">No product rows were found in this file.</p>
              ) : (
                <>
                  <div className="text-xs text-muted mb-2">
                    Showing {Math.min(importPreview.rows.length, 150)} of {importPreview.rows.length} data rows.
                  </div>
                  <div className="divide-y divide-gray-100">
                    {importPreview.rows.slice(0, 150).map((row, index) => (
                      <div key={`${row.rowNumber}-${index}`} className="py-2.5 flex items-start justify-between gap-3 text-sm">
                        <div className="min-w-0">
                          <div className="font-medium text-ink break-words">
                            {row.name || <span className="italic text-muted">(blank Name)</span>}
                          </div>
                          <div className="text-xs text-muted mt-0.5">
                            Row {row.rowNumber}{row.errors.length === 0 ? ` · ${row.active ? "Enabled" : "Disabled"}` : ""}
                          </div>
                          {row.errors.length > 0 && (
                            <div className="text-xs text-danger mt-1">{row.errors.join(" ")}</div>
                          )}
                        </div>
                        <span className={`shrink-0 text-xs font-semibold ${importStatusClass(row.status)}`}>
                          {importStatusLabel(row.status)}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="border-t border-gray-100 p-4 flex gap-2.5">
              {importPreview.result ? (
                <button
                  type="button"
                  onClick={() => setImportPreview(null)}
                  className="btn-primary w-full"
                >
                  Done
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={importing}
                    onClick={() => setImportPreview(null)}
                    className="btn-secondary flex-1"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={importing || importPreview.summary.ready === 0}
                    onClick={handleConfirmImport}
                    className="btn-primary flex-1"
                  >
                    {importing
                      ? "Importing..."
                      : importPreview.summary.ready === 0
                        ? "Nothing to import"
                        : `Import ${importPreview.summary.ready} product${importPreview.summary.ready === 1 ? "" : "s"}`}
                  </button>
                </>
              )}
            </div>
          </section>
        </div>
      )}

      {toast && <Toast message={toast.message} variant={toast.variant} />}
    </div>
  );
}
