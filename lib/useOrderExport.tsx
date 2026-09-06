"use client";

import { useMemo, useRef, useState } from "react";
import OrderDocument from "@/components/OrderDocument";
import { computeMaxPageHeightPx, paginateItems } from "@/lib/orderPagination";

type Item = { id: string; product: { name: string } };

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

const PAUSE_BETWEEN_DOWNLOADS_MS = 300;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useOrderExport({
  orderNumber,
  createdAt,
  items,
  title,
  filenameBase,
}: {
  orderNumber: number;
  createdAt: string;
  items: Item[];
  title?: string;
  /** Defaults to order-###. Review preview passes its own base since there's no order number yet. */
  filenameBase?: string;
}) {
  const maxPageHeightPx = useMemo(() => computeMaxPageHeightPx(), []);
  const pages = useMemo(
    () => paginateItems(items, maxPageHeightPx),
    [items, maxPageHeightPx]
  );

  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [busy, setBusy] = useState<"" | "image" | "pdf" | "share">("");
  const [toast, setToast] = useState("");

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2400);
  }

  function baseName() {
    return filenameBase ?? `order-${String(orderNumber).padStart(3, "0")}`;
  }

  async function renderPagePng(index: number): Promise<Blob | null> {
    const node = pageRefs.current[index];
    if (!node) return null;
    const { toBlob } = await import("html-to-image");
    return toBlob(node, { pixelRatio: 3, backgroundColor: "#ffffff" });
  }

  async function saveImages() {
    if (pages.length === 0 || items.length === 0) return;
    setBusy("image");
    try {
      const multi = pages.length > 1;
      for (let i = 0; i < pages.length; i++) {
        const blob = await renderPagePng(i);
        if (!blob) throw new Error("render failed");
        const suffix = multi ? `-page-${i + 1}-of-${pages.length}` : "";
        downloadBlob(blob, `${baseName()}${suffix}.png`);
        if (i < pages.length - 1) await sleep(PAUSE_BETWEEN_DOWNLOADS_MS);
      }
      showToast(multi ? `✓ ${pages.length} images saved` : "✓ Image saved");
    } catch {
      showToast("Something went wrong generating the image.");
    } finally {
      setBusy("");
    }
  }

  async function share() {
    if (pages.length === 0 || items.length === 0) return;
    setBusy("share");
    try {
      const multi = pages.length > 1;
      const files: File[] = [];
      for (let i = 0; i < pages.length; i++) {
        const blob = await renderPagePng(i);
        if (!blob) throw new Error("render failed");
        const suffix = multi ? `-page-${i + 1}-of-${pages.length}` : "";
        files.push(
          new File([blob], `${baseName()}${suffix}.png`, { type: "image/png" })
        );
      }
      if (navigator.share && navigator.canShare?.({ files })) {
        await navigator.share({ files, title: baseName() });
      } else {
        for (let i = 0; i < files.length; i++) {
          downloadBlob(files[i], files[i].name);
          if (i < files.length - 1) await sleep(PAUSE_BETWEEN_DOWNLOADS_MS);
        }
        showToast("Sharing isn't supported here — image(s) downloaded instead.");
      }
    } catch {
      // user cancelled the share sheet, or share failed — no error toast needed
    } finally {
      setBusy("");
    }
  }

  async function generatePdf() {
    if (pages.length === 0 || items.length === 0) return;
    setBusy("pdf");
    try {
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const pageWidthPt = pdf.internal.pageSize.getWidth();
      const marginPt = 40;
      const usableWidthPt = pageWidthPt - marginPt * 2;

      for (let i = 0; i < pages.length; i++) {
        const blob = await renderPagePng(i);
        if (!blob) throw new Error("render failed");
        const dataUrl = await blobToDataUrl(blob);
        const img = await loadImage(dataUrl);
        const imgHeightPt = (img.height / img.width) * usableWidthPt;

        if (i > 0) pdf.addPage();
        pdf.addImage(dataUrl, "PNG", marginPt, marginPt, usableWidthPt, imgHeightPt);
      }

      pdf.save(`${baseName()}.pdf`);
      showToast("✓ PDF generated");
    } catch (err) {
      console.error("PDF generation error:", err);
      showToast("Something went wrong generating the PDF.");
    } finally {
      setBusy("");
    }
  }

  const totalCount = items.length;

  const hiddenPages = (
    <div
      aria-hidden
      style={{ position: "fixed", top: 0, left: -99999, pointerEvents: "none" }}
    >
      {pages.map((pageItems, i) => {
        const startIndex = pages
          .slice(0, i)
          .reduce((sum, p) => sum + p.length, 0);
        return (
          <div
            key={i}
            ref={(el) => {
              pageRefs.current[i] = el;
            }}
          >
            <OrderDocument
              orderNumber={orderNumber}
              createdAt={createdAt}
              items={pageItems}
              title={title}
              startIndex={startIndex}
              totalCount={totalCount}
              pageNumber={i + 1}
              totalPages={pages.length}
              showFooter={i === pages.length - 1}
            />
          </div>
        );
      })}
    </div>
  );

  return { pages, hiddenPages, saveImages, share, generatePdf, busy, toast };
}
