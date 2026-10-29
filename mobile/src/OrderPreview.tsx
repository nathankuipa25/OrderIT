import React, { useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Check, Image as ImageIcon } from "lucide-react-native";
import { captureRef } from "react-native-view-shot";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { OrderRecord } from "./offline-core.mjs";
import { paginateOrderItems } from "./orderImagePages.mjs";
import { saveOrderImage } from "./saveOrderImage";
import { colors, radius } from "./theme";

type Props = {
  order: OrderRecord;
  shopName: string;
  onImageSaved: (message: string) => void;
  onImageError: (message: string) => void;
};

export default function OrderPreview({ order, shopName, onImageSaved, onImageError }: Props) {
  const insets = useSafeAreaInsets();
  const pages = useMemo(() => paginateOrderItems(order.items), [order.items]);
  const pageRefs = useRef<Array<View | null>>([]);
  const [saving, setSaving] = useState(false);

  const saveImages = async () => {
    if (saving || !order.items.length) return;
    setSaving(true);
    let saved = 0;
    try {
      const baseName = `Order_${order.orderNumber ?? order.localId}`;
      for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
        const page = pageRefs.current[pageIndex];
        if (!page) throw new Error("An order image page could not be prepared.");
        const uri = await captureRef(page, { format: "png", quality: 1, result: "tmpfile" });
        await saveOrderImage(uri, `${baseName}_page_${pageIndex + 1}_of_${pages.length}`);
        saved += 1;
      }
      onImageSaved(`${saved} order image${saved === 1 ? "" : "s"} saved to Pictures.`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Could not save the order images.";
      onImageError(saved ? `Saved ${saved} of ${pages.length} pages. ${reason}` : reason);
    } finally {
      setSaving(false);
    }
  };

  const status = order.status === "synced" ? "SYNCED" : order.status === "needs_attention" ? "REVIEW" : "PENDING";

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <View style={styles.summaryCopy}>
              <Text style={styles.shopName}>{shopName}</Text>
              <Text style={styles.summaryTitle}>{order.orderNumber ? `Order #${order.orderNumber}` : "Saved order"}</Text>
              <Text style={styles.summaryDate}>{formatDate(order.createdAt)}</Text>
            </View>
            <Text style={[styles.statusBadge, order.status === "needs_attention" && styles.statusNeedsAttention]}>{status}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <Text style={styles.listHeading}>{order.items.length} product{order.items.length === 1 ? "" : "s"}</Text>
          {order.items.map((item, index) => (
            <View key={`${item.productId}-${index}`} style={styles.previewRow}>
              <Text style={styles.previewNumber}>{String(index + 1).padStart(2, "0")}</Text>
              <Text style={styles.previewName}>{item.name}</Text>
            </View>
          ))}
          {order.status === "pending" && <Text style={styles.pendingNote}>Saved on this phone · Order number assigned after sync</Text>}
          {order.status === "needs_attention" && !!order.attentionReason && <Text style={styles.attentionNote}>{order.attentionReason}</Text>}
        </View>
        <View style={styles.pageHint}>
          <ImageIcon size={17} color={colors.navy} />
          <Text style={styles.pageHintText}>{pages.length} compact image page{pages.length === 1 ? "" : "s"} · up to 25 products per page</Text>
        </View>
      </ScrollView>

      <View style={[styles.bottomAction, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <Pressable style={[styles.primaryButton, saving && styles.disabledButton]} onPress={() => void saveImages()} disabled={saving} accessibilityRole="button">
          {saving ? <ActivityIndicator color={colors.white} /> : <ImageIcon size={18} color={colors.white} />}
          <Text style={styles.primaryButtonText}>{saving ? "Saving images…" : `Save ${pages.length} image${pages.length === 1 ? "" : "s"}`}</Text>
          {!saving && <Check size={18} color={colors.white} />}
        </Pressable>
      </View>

      <View pointerEvents="none" style={styles.captureHost} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {pages.map((items, pageIndex) => (
          <OrderImagePage
            key={`${order.localId}-${pageIndex}`}
            ref={(node) => { pageRefs.current[pageIndex] = node; }}
            shopName={shopName}
            orderNumber={order.orderNumber}
            createdAt={order.createdAt}
            items={items}
            startIndex={pages.slice(0, pageIndex).reduce((count, pageItems) => count + pageItems.length, 0)}
            totalCount={order.items.length}
            pageNumber={pageIndex + 1}
            totalPages={pages.length}
            showFooter={pageIndex === pages.length - 1}
          />
        ))}
      </View>
    </View>
  );
}

const OrderImagePage = React.forwardRef<View, {
  shopName: string;
  orderNumber: number | null;
  createdAt: string;
  items: OrderRecord["items"];
  startIndex: number;
  totalCount: number;
  pageNumber: number;
  totalPages: number;
  showFooter: boolean;
}>(function OrderImagePage({ shopName, orderNumber, createdAt, items, startIndex, totalCount, pageNumber, totalPages, showFooter }, ref) {
  return (
    <View ref={ref} collapsable={false} style={styles.imagePage}>
      <Text style={styles.imageTitle}>{shopName.toUpperCase()}</Text>
      <Text style={styles.imageDate}>{formatDate(createdAt).toUpperCase()}</Text>
      <Text style={styles.imageOrder}>{orderNumber ? `ORDER #${String(orderNumber).padStart(3, "0")}` : "SAVED ORDER · AWAITING SYNC"}</Text>
      {totalPages > 1 && <Text style={styles.imagePageNumber}>PAGE {pageNumber} OF {totalPages}</Text>}
      <View style={styles.imageProductList}>
        <Text style={styles.imageProductsHeading}>PRODUCTS</Text>
        {items.map((item, index) => (
          <View key={`${item.productId}-${index}`} style={styles.imageProductRow}>
            <Text style={styles.imageProductNumber}>{String(startIndex + index + 1).padStart(2, "0")}</Text>
            <Text style={styles.imageProductName}>{item.name}</Text>
          </View>
        ))}
      </View>
      {showFooter ? (
        <Text style={styles.imageFooter}>{totalCount} PRODUCT{totalCount === 1 ? "" : "S"} · SHOP ORDER</Text>
      ) : (
        <Text style={styles.imageContinued}>CONTINUED ON NEXT PAGE →</Text>
      )}
    </View>
  );
});

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "long", year: "numeric" });
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollContent: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 20 },
  summaryCard: { padding: 16, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  summaryTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  summaryCopy: { flex: 1 },
  shopName: { color: colors.muted, fontSize: 12, fontWeight: "600", marginBottom: 4 },
  summaryTitle: { color: colors.ink, fontSize: 18, fontWeight: "700" },
  summaryDate: { color: colors.muted, fontSize: 12, marginTop: 5 },
  statusBadge: { color: colors.accent, backgroundColor: colors.accentSoft, overflow: "hidden", borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 5, fontSize: 9, fontWeight: "800", letterSpacing: 0.45 },
  statusNeedsAttention: { color: colors.amber, backgroundColor: colors.amberSoft },
  summaryDivider: { height: 1, backgroundColor: colors.border, marginTop: 14, marginBottom: 12 },
  listHeading: { color: colors.ink, fontSize: 13, fontWeight: "700", marginBottom: 5 },
  previewRow: { flexDirection: "row", alignItems: "flex-start", gap: 9, paddingVertical: 4 },
  previewNumber: { width: 23, color: colors.subtle, fontSize: 12, lineHeight: 18, fontWeight: "600" },
  previewName: { flex: 1, color: colors.ink, fontSize: 14, lineHeight: 19 },
  pendingNote: { marginTop: 12, color: colors.navy, fontSize: 11, lineHeight: 16, fontWeight: "600" },
  attentionNote: { marginTop: 11, color: colors.amber, fontSize: 11, lineHeight: 16 },
  pageHint: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 13, paddingHorizontal: 12, paddingVertical: 11, backgroundColor: colors.blueSoft, borderRadius: radius.md },
  pageHintText: { flex: 1, color: colors.navy, fontSize: 12, fontWeight: "600" },
  bottomAction: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 14, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background },
  primaryButton: { minHeight: 52, paddingHorizontal: 17, borderRadius: radius.md, backgroundColor: colors.navy, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  primaryButtonText: { color: colors.white, fontSize: 14, fontWeight: "700" },
  disabledButton: { opacity: 0.55 },
  captureHost: { position: "absolute", left: -10000, top: 0 },
  imagePage: { width: 360, paddingHorizontal: 18, paddingVertical: 20, backgroundColor: colors.white },
  imageTitle: { alignSelf: "stretch", color: colors.navyDeep, fontSize: 17, lineHeight: 22, fontWeight: "800", letterSpacing: 0.5, textAlign: "center", marginBottom: 7 },
  imageDate: { color: colors.ink, fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textAlign: "center" },
  imageOrder: { color: colors.muted, fontSize: 11, textAlign: "center", marginTop: 3 },
  imagePageNumber: { color: colors.accent, fontSize: 10, fontWeight: "800", letterSpacing: 0.7, textAlign: "center", marginTop: 5, marginBottom: 7 },
  imageProductList: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 7, marginTop: 11, marginBottom: 10 },
  imageProductsHeading: { color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 1.2, marginBottom: 3 },
  imageProductRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 1 },
  imageProductNumber: { width: 24, color: colors.subtle, fontSize: 10, lineHeight: 15, fontWeight: "600" },
  imageProductName: { flex: 1, color: colors.ink, fontSize: 12, lineHeight: 15, fontWeight: "500" },
  imageFooter: { color: colors.navyDeep, fontSize: 10, fontWeight: "800", letterSpacing: 0.5, textAlign: "center", paddingVertical: 3 },
  imageContinued: { color: colors.subtle, fontSize: 9, fontWeight: "700", letterSpacing: 0.6, textAlign: "center", paddingVertical: 3 },
});
