import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import NetInfo from "@react-native-community/netinfo";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Home,
  Image as ImageIcon,
  LogOut,
  Package,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  UserRound,
  Wifi,
  WifiOff,
} from "lucide-react-native";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { captureRef } from "react-native-view-shot";
import {
  enqueueOrder,
  getShopData,
  hasCompletedLegacyMigration,
  importLegacyIndexedDb,
  reviseQueuedOrder,
  setDeviceContext,
  syncShop,
  type ShopData,
  type ShopUser,
  type SyncResult,
} from "./nativeStore";
import { getApiBaseUrl } from "./config";
import { clearNativeSession, readNativeSession, saveNativeSession, type NativeSession } from "./session";
import { saveOrderImage } from "./saveOrderImage";
import { colors, radius } from "./theme";
import type { OrderRecord } from "./offline-core.mjs";

const LEGACY_EXPORT_HTML = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><script>
(function(){
  const names = ["accounts", "products", "orders", "outbox", "settings"];
  function send(message) { try { window.ReactNativeWebView.postMessage(JSON.stringify(message)); } catch (e) {} }
  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("orderit-shop-offline", 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("accounts")) db.createObjectStore("accounts", { keyPath: "shopId" });
        if (!db.objectStoreNames.contains("products")) { const store = db.createObjectStore("products", { keyPath: "key" }); store.createIndex("shopId", "shopId", { unique: false }); }
        if (!db.objectStoreNames.contains("orders")) { const store = db.createObjectStore("orders", { keyPath: "key" }); store.createIndex("shopId", "shopId", { unique: false }); }
        if (!db.objectStoreNames.contains("outbox")) { const store = db.createObjectStore("outbox", { keyPath: "key" }); store.createIndex("shopId", "shopId", { unique: false }); }
        if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open previous shop data."));
      request.onblocked = () => reject(new Error("Close the previous app window and retry the import."));
    });
  }
  openDatabase().then(db => new Promise((resolve, reject) => {
    const available = names.filter(name => db.objectStoreNames.contains(name));
    if (!available.length) { db.close(); resolve({}); return; }
    const tx = db.transaction(available, "readonly");
    const data = {};
    let remaining = available.length;
    available.forEach(name => {
      const request = tx.objectStore(name).getAll();
      request.onsuccess = () => { data[name] = request.result || []; if (--remaining === 0) { db.close(); resolve(data); } };
      request.onerror = () => { db.close(); reject(request.error || new Error("Could not read previous shop data.")); };
    });
    tx.onerror = () => { db.close(); reject(tx.error || new Error("Could not read previous shop data.")); };
  })).then(data => send({ type: "LEGACY_DATA", payload: data })).catch(error => send({ type: "LEGACY_ERROR", message: String(error && error.message || "Previous shop data could not be checked.") }));
})();
</script></body></html>`;

type Screen = "loading" | "migration" | "login" | "firstSync" | "home" | "orders" | "create" | "review" | "account";
type ToastTone = "success" | "warning" | "neutral";
type ToastState = { message: string; tone: ToastTone } | null;
type AppIcon = typeof ShoppingBag;

function AppIconBadge({ icon: Icon, tone = "green", size = 42 }: { icon: AppIcon; tone?: "green" | "blue" | "amber"; size?: number }) {
  const tint = tone === "green" ? colors.accentSoft : tone === "amber" ? colors.amberSoft : colors.blueSoft;
  const ink = tone === "green" ? colors.accent : tone === "amber" ? colors.amber : colors.navy;
  return <View style={[styles.iconBadge, { width: size, height: size, borderRadius: 14, backgroundColor: tint }]}><Icon size={21} color={ink} strokeWidth={2.1} /></View>;
}

function AppRoot() {
  const insets = useSafeAreaInsets();
  const [screen, setScreen] = useState<Screen>("loading");
  const [session, setSession] = useState<NativeSession | null>(null);
  const sessionRef = useRef<NativeSession | null>(null);
  sessionRef.current = session;
  const [data, setData] = useState<ShopData | null>(null);
  const [apiBaseUrl, setApiBaseUrl] = useState("https://orderit-ruddy.vercel.app");
  const apiRef = useRef(apiBaseUrl);
  apiRef.current = apiBaseUrl;
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const syncInFlight = useRef(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingLocalId, setEditingLocalId] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [migrationError, setMigrationError] = useState("");
  const [migrationRetryKey, setMigrationRetryKey] = useState(0);
  const migrationDone = useRef(false);

  const showToast = useCallback((message: string, tone: ToastTone = "success") => {
    setToast({ message, tone });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const loadShop = useCallback(async (shopId: string) => {
    const next = await getShopData(shopId);
    setData(next);
    return next;
  }, []);

  const syncForSession = useCallback(async (current: NativeSession, notify = false): Promise<SyncResult | null> => {
    if (syncInFlight.current) return null;
    syncInFlight.current = true;
    setSyncing(true);
    try {
      const result = await syncShop(current.token, apiRef.current);
      if (result.unauthorized) {
        await clearNativeSession();
        await setDeviceContext("SIGNED_OUT");
        setSession(null);
        setData(null);
        setScreen("login");
        if (notify) showToast("Please sign in again to sync this shop.", "warning");
        return result;
      }
      if (result.role === "ADMIN") {
        await clearNativeSession();
        setSession(null);
        setData(null);
        setScreen("login");
        if (notify) showToast("This app is for shop accounts only.", "warning");
        return result;
      }
      const shopId = result.shopId || current.user.id;
      const next = await loadShop(shopId).catch(() => null);
      if (notify) {
        if (!result.reachable) showToast("You’re offline. Saved orders stay on this phone.", "neutral");
        else if (result.error && !next?.account?.initializedAt) showToast("Connect to finish the first shop sync.", "warning");
        else if ((result.queue?.attention || 0) > 0) showToast(`${result.queue?.attention} saved order${result.queue?.attention === 1 ? " needs" : "s need"} review.`, "warning");
        else if ((result.queue?.pending || 0) > 0) showToast(`${result.queue?.pending} order${result.queue?.pending === 1 ? " is" : "s are"} still waiting to sync.`, "neutral");
        else if (result.error) showToast("Some shop data could not sync. Your saved work is kept here.", "warning");
        else showToast("Shop data is up to date.", "success");
      }
      return result;
    } catch {
      if (notify) showToast("Sync couldn’t finish. Saved orders stay on this phone.", "warning");
      return null;
    } finally {
      syncInFlight.current = false;
      setSyncing(false);
    }
  }, [loadShop, showToast]);

  const bootstrap = useCallback(async () => {
    const saved = await readNativeSession();
    if (!saved) {
      setScreen("login");
      return;
    }
    setSession(saved);
    const local = await getShopData(saved.user.id);
    setData(local);
    setScreen(local.account?.initializedAt ? "home" : "firstSync");
    const result = await syncForSession(saved, false);
    if (result?.unauthorized) return;
    const latest = await getShopData(saved.user.id).catch(() => local);
    setData(latest);
    setScreen(latest.account?.initializedAt ? "home" : "firstSync");
  }, [syncForSession]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const base = await getApiBaseUrl();
      if (!alive) return;
      const cleanBase = base.replace(/\/+$/, "");
      apiRef.current = cleanBase;
      setApiBaseUrl(cleanBase);
      const migrationDone = await hasCompletedLegacyMigration();
      if (!alive) return;
      if (!migrationDone) {
        setScreen("migration");
        return;
      }
      await bootstrap();
    })().catch(() => {
      if (alive) setScreen("login");
    });
    return () => { alive = false; };
  }, [bootstrap]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = state.isConnected === true;
      setOnline(connected);
      const current = sessionRef.current;
      if (connected && current) void syncForSession(current, false);
    });
    const appState = AppState.addEventListener("change", (state) => {
      const current = sessionRef.current;
      if (state === "active" && current) void syncForSession(current, false);
    });
    void NetInfo.fetch().then((state) => setOnline(state.isConnected === true)).catch(() => {});
    return () => {
      unsubscribe();
      appState.remove();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [syncForSession]);

  const finishMigration = useCallback(async (snapshot: Record<string, Array<Record<string, unknown>>>) => {
    if (migrationDone.current) return;
    migrationDone.current = true;
    const imported = await importLegacyIndexedDb(snapshot);
    const details = imported.queued > 0
      ? `Imported ${imported.queued} queued order${imported.queued === 1 ? "" : "s"}.`
      : imported.orders > 0
        ? `Restored ${imported.orders} saved order${imported.orders === 1 ? "" : "s"}.`
        : "Your shop data is ready.";
    setMigrationError("");
    showToast(details, "success");
    const saved = await readNativeSession();
    if (!saved) {
      setScreen("login");
      return;
    }
    setSession(saved);
    const local = await getShopData(saved.user.id);
    setData(local);
    setScreen(local.account?.initializedAt ? "home" : "firstSync");
    const result = await syncForSession(saved, false);
    if (result?.unauthorized) return;
    const latest = await getShopData(saved.user.id).catch(() => local);
    setData(latest);
    setScreen(latest.account?.initializedAt ? "home" : "firstSync");
  }, [showToast, syncForSession]);

  const onMigrationMessage = useCallback((event: WebViewMessageEvent) => {
    let message: { type?: string; payload?: Record<string, Array<Record<string, unknown>>>; message?: string };
    try { message = JSON.parse(event.nativeEvent.data); } catch { setMigrationError("The saved-order check returned an unreadable response."); return; }
    if (message.type === "LEGACY_DATA" && message.payload) {
      void finishMigration(message.payload).catch(() => {
        migrationDone.current = false;
        setMigrationError("The previous shop data could not be imported. Retry before continuing.");
      });
    } else if (message.type === "LEGACY_ERROR") {
      setMigrationError(message.message || "Previous shop data could not be checked.");
    }
  }, [finishMigration]);

  const login = useCallback(async () => {
    if (loginBusy) return;
    setLoginError("");
    setLoginBusy(true);
    try {
      const response = await fetch(`${apiRef.current}/api/auth/mobile/login`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      let body: Record<string, any> = {};
      try { body = await response.json(); } catch {}
      if (!response.ok || typeof body.token !== "string" || body.user?.role !== "SHOP") {
        setLoginError(String(body.error || "Sign in could not be completed."));
        return;
      }
      const signedIn: NativeSession = { token: body.token, user: body.user as ShopUser };
      await saveNativeSession(signedIn);
      await setDeviceContext("SHOP", signedIn.user.id);
      setSession(signedIn);
      setPassword("");
      const result = await syncForSession(signedIn, false);
      if (result?.unauthorized) return;
      const local = await getShopData(signedIn.user.id);
      setData(local);
      setScreen(local.account?.initializedAt ? "home" : "firstSync");
      if (!local.account?.initializedAt) setLoginError("Connect to the internet to complete the first catalog and order-history sync.");
    } catch {
      setLoginError("Couldn’t reach the shop service. Check your connection and try again.");
    } finally {
      setLoginBusy(false);
    }
  }, [loginBusy, password, syncForSession, username]);

  const signOut = useCallback(() => {
    Alert.alert(
      "Sign out of this shop?",
      "Saved orders remain on this phone. Sign in online again to access or sync them.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: () => {
            void (async () => {
              await clearNativeSession();
              await setDeviceContext("SIGNED_OUT");
              setSession(null);
              setData(null);
              setSelectedIds(new Set());
              setEditingLocalId(null);
              setScreen("login");
            })();
          },
        },
      ],
    );
  }, []);

  const activeProducts = useMemo(() => (data?.products || []).filter((item) => item.active), [data]);
  const editingOrder = useMemo(() => data?.orders.find((item) => item.localId === editingLocalId) || null, [data, editingLocalId]);
  const visibleProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    const existing = editingOrder?.items || [];
    const activeById = new Map(activeProducts.map((item) => [item.id, item]));
    const stale = existing
      .filter((item) => !activeById.has(item.productId))
      .map((item) => ({ id: item.productId, name: item.name, active: false }));
    return [...stale, ...activeProducts].filter((product) => !term || product.name.toLowerCase().includes(term));
  }, [activeProducts, editingOrder, search]);
  const selectedItems = useMemo(() => {
    const currentById = new Map(activeProducts.map((item) => [item.id, item.name]));
    for (const item of editingOrder?.items || []) if (!currentById.has(item.productId)) currentById.set(item.productId, item.name);
    return [...selectedIds].map((id) => ({ id, name: currentById.get(id) || "Unavailable product" }));
  }, [activeProducts, editingOrder, selectedIds]);
  const pendingCount = data?.outbox.filter((item) => item.status === "pending").length || 0;

  const toggleProduct = useCallback((id: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const beginCreate = useCallback(() => {
    setEditingLocalId(null);
    setSelectedIds(new Set());
    setSearch("");
    setScreen("create");
  }, []);

  const saveOrder = useCallback(async () => {
    if (!session || selectedIds.size === 0 || savingOrder) return;
    setSavingOrder(true);
    try {
      if (editingLocalId) {
        await reviseQueuedOrder(session.user.id, editingLocalId, [...selectedIds]);
        setEditingLocalId(null);
        setSelectedIds(new Set());
        await loadShop(session.user.id);
        setScreen("orders");
        showToast("Revised order saved. The original retry key is retained.");
        if (online) void syncForSession(session, false);
        return;
      }
      await enqueueOrder(session.user.id, [...selectedIds]);
      await loadShop(session.user.id);
      setSelectedIds(new Set());
      setScreen("orders");
      showToast("Order saved on this phone. It will sync when connected.", "neutral");
      if (online) void syncForSession(session, false);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "The order could not be saved.", "warning");
    } finally {
      setSavingOrder(false);
    }
  }, [editingLocalId, loadShop, online, savingOrder, selectedIds, session, showToast, syncForSession]);

  const startReview = useCallback(() => {
    if (selectedIds.size) setScreen("review");
  }, [selectedIds]);

  const reviewStaleOrder = useCallback((order: OrderRecord) => {
    setEditingLocalId(order.localId);
    setSelectedIds(new Set(order.items.map((item) => item.productId)));
    setSearch("");
    setScreen("create");
  }, []);

  const manualSync = useCallback(() => {
    if (session) void syncForSession(session, true);
  }, [session, syncForSession]);

  const onImageSaved = useCallback((path: string) => showToast(`Saved to ${path}.`), [showToast]);
  const onImageError = useCallback((message: string) => showToast(message, "warning"), [showToast]);

  if (screen === "loading") {
    return <View style={styles.loadingScreen}><StatusBar backgroundColor={colors.navyDeep} barStyle="light-content" /><ActivityIndicator size="large" color={colors.accent} /><Text style={styles.loadingCopy}>Opening your shop</Text></View>;
  }

  if (screen === "migration") {
    return (
      <SafeAreaView style={styles.migrationScreen} edges={["top", "bottom", "left", "right"]}>
        <StatusBar backgroundColor={colors.navyDeep} barStyle="light-content" />
        <View style={styles.migrationContent}>
          <AppIconBadge icon={ShoppingBag} size={58} />
          <Text style={styles.migrationTitle}>{migrationError ? "Checking saved orders" : "Preparing your shop"}</Text>
          <Text style={styles.migrationCopy}>
            {migrationError ? "The previous shop data could not be imported yet. Retry before using the new app so any saved orders stay available." : "Checking this phone for saved orders from the previous app version. This only runs once."}
          </Text>
          {migrationError ? (
            <Pressable style={styles.primaryButton} onPress={() => { migrationDone.current = false; setMigrationError(""); setMigrationRetryKey((value) => value + 1); }} accessibilityRole="button">
              <RefreshCw size={18} color={colors.white} /><Text style={styles.primaryButtonText}>Retry import</Text>
            </Pressable>
          ) : <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 12 }} />}
        </View>
        <View style={styles.hiddenWebView}>
          <WebView
            key={migrationRetryKey}
            source={{ html: LEGACY_EXPORT_HTML, baseUrl: `${apiBaseUrl.replace(/\/+$/, "")}/` }}
            javaScriptEnabled
            domStorageEnabled
            originWhitelist={["https://*"]}
            onMessage={onMigrationMessage}
            onError={() => setMigrationError("The previous shop data could not be checked. Retry before continuing.")}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (screen === "login" || screen === "firstSync") {
    const needsFirstSync = screen === "firstSync";
    return (
      <SafeAreaView style={styles.authScreen} edges={["top", "bottom", "left", "right"]}>
        <StatusBar backgroundColor={colors.navyDeep} barStyle="light-content" />
        {needsFirstSync && (
          <View style={styles.authTopBar}>
            <Pressable onPress={signOut} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Sign out">
              <ArrowLeft size={21} color={colors.navy} />
            </Pressable>
            <Text style={styles.authTopName} numberOfLines={1}>{session?.user.name || "Your shop"}</Text>
          </View>
        )}
        <KeyboardAvoidingView style={styles.authContent} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.brandMark}><ShoppingBag size={31} color={colors.white} strokeWidth={2.2} /></View>
          {needsFirstSync ? (
            <>
              <Text style={styles.authTitle}>Finish setting up offline access</Text>
              <Text style={styles.authDescription}>Connect once to download this shop’s active catalog and order history. After that, saved shop data and new orders are available offline.</Text>
              <View style={styles.firstSyncCard}>
                <View style={styles.firstSyncIcon}><WifiOff size={20} color={colors.navy} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.firstSyncCardTitle}>{online ? "First sync not finished" : "Connect to the internet"}</Text>
                  <Text style={styles.firstSyncCardText}>The first catalog and history sync needs a connection.</Text>
                </View>
              </View>
              <Pressable style={[styles.primaryButton, syncing && styles.buttonDisabled]} disabled={syncing} onPress={manualSync} accessibilityRole="button">
                {syncing ? <ActivityIndicator color={colors.white} /> : <RefreshCw size={18} color={colors.white} />}
                <Text style={styles.primaryButtonText}>{syncing ? "Syncing shop data…" : "Sync catalog & orders"}</Text>
              </Pressable>
              <Text style={styles.authError}>{data?.account?.initializedAt ? "" : "Your shop data will be stored on this phone after the first sync."}</Text>
            </>
          ) : (
            <>
              <Text style={styles.authTitle}>Sign in to your shop</Text>
              <Text style={styles.authDescription}>Use the shop account details provided to you.</Text>
              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Username</Text>
                <TextInput value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} autoComplete="username" textContentType="username" style={styles.textInput} placeholder="Enter your username" placeholderTextColor={colors.subtle} returnKeyType="next" editable={!loginBusy} />
              </View>
              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Password</Text>
                <TextInput value={password} onChangeText={setPassword} autoCapitalize="none" autoComplete="current-password" textContentType="password" secureTextEntry style={styles.textInput} placeholder="Enter your password" placeholderTextColor={colors.subtle} returnKeyType="done" onSubmitEditing={() => void login()} editable={!loginBusy} />
              </View>
              {!!loginError && <Text style={styles.formError} accessibilityRole="alert">{loginError}</Text>}
              <Pressable style={[styles.primaryButton, loginBusy && styles.buttonDisabled]} disabled={loginBusy || !username.trim() || !password} onPress={() => void login()} accessibilityRole="button">
                {loginBusy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>Sign in</Text>}
                {!loginBusy && <ArrowRight size={18} color={colors.white} />}
              </Pressable>
              <Text style={styles.loginFootnote}>Shop accounts only</Text>
            </>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  const account = data?.account;
  const screenTitle = screen === "home" ? account?.name || session?.user.name || "Shop" : screen === "orders" ? "Orders" : screen === "create" ? (editingLocalId ? "Review saved order" : "New order") : screen === "review" ? "Review order" : "Account";
  const showBack = screen === "create" || screen === "review";
  const currentTab = screen === "orders" ? "orders" : screen === "account" ? "account" : screen === "create" || screen === "review" ? "create" : "home";

  return (
    <SafeAreaView style={styles.appRoot} edges={["top", "left", "right"]}>
      <StatusBar backgroundColor={colors.navyDeep} barStyle="light-content" />
      <View style={styles.appBody}>
        <View style={styles.topBar}>
          {showBack ? (
            <Pressable onPress={() => setScreen(screen === "review" ? "create" : editingLocalId ? "orders" : "home")} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back">
              <ArrowLeft size={21} color={colors.navy} />
            </Pressable>
          ) : null}
          <View style={styles.topTitleWrap}>
            <Text style={styles.topTitle} numberOfLines={1}>{screenTitle}</Text>
          </View>
          {screen === "home" && (
            <Pressable onPress={manualSync} style={styles.syncButton} accessibilityRole="button" accessibilityLabel="Sync shop data" disabled={syncing}>
              {syncing ? <ActivityIndicator size="small" color={colors.navy} /> : <RefreshCw size={19} color={colors.navy} strokeWidth={2.1} />}
            </Pressable>
          )}
        </View>

        {screen !== "create" && screen !== "review" && screen !== "account" && (
          <View style={styles.connectionRow}>
            {online ? <Wifi size={14} color={colors.accent} /> : <WifiOff size={14} color={colors.amber} />}
            <Text style={[styles.connectionText, !online && { color: colors.amber }]}>{syncing ? "Syncing" : online ? "Online" : "Offline mode"}</Text>
          </View>
        )}

        {screen === "home" && (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.heroCard}>
              <View style={styles.heroCopy}>
                <Text style={styles.heroEyebrow}>ORDER REQUESTS</Text>
                <Text style={styles.heroTitle}>Ready to place an order?</Text>
                <Text style={styles.heroDescription}>Choose items from your shop’s saved catalog.</Text>
              </View>
              <Pressable style={styles.heroButton} onPress={beginCreate} accessibilityRole="button">
                <Plus size={19} color={colors.white} strokeWidth={2.6} /><Text style={styles.heroButtonText}>New order</Text>
              </Pressable>
            </View>

            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Recent orders</Text>
              {(data?.orders.length || 0) > 0 && <Pressable onPress={() => setScreen("orders")} style={styles.textAction} accessibilityRole="button"><Text style={styles.textActionText}>See all</Text><ChevronRight size={16} color={colors.navy} /></Pressable>}
            </View>
            {(data?.orders.length || 0) === 0 ? (
              <View style={styles.emptyCard}>
                <AppIconBadge icon={Package} tone="blue" />
                <Text style={styles.emptyTitle}>No orders yet</Text>
                <Text style={styles.emptyDescription}>Your synced shop orders and saved drafts will appear here.</Text>
              </View>
            ) : (
              <View style={styles.orderList}>
                {(data?.orders || []).slice(0, 3).map((order) => <MiniOrderRow key={order.localId} order={order} onPress={() => setScreen("orders")} />)}
              </View>
            )}

            <View style={styles.homeFootnote}>
              <CheckCircle2 size={15} color={colors.accent} />
              <Text style={styles.homeFootnoteText}>{data?.products.length || 0} active items in your saved catalog</Text>
            </View>
          </ScrollView>
        )}

        {screen === "orders" && (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.ordersIntro}>
              <Text style={styles.ordersIntroCopy}>Synced orders and drafts saved on this phone.</Text>
            </View>
            {(data?.orders.length || 0) === 0 ? (
              <View style={styles.emptyCard}>
                <AppIconBadge icon={Package} tone="blue" />
                <Text style={styles.emptyTitle}>No orders on this phone</Text>
                <Text style={styles.emptyDescription}>Create an order to get started. Your new request will be saved here before it syncs.</Text>
                <Pressable style={styles.secondaryButton} onPress={beginCreate} accessibilityRole="button"><Plus size={17} color={colors.navy} /><Text style={styles.secondaryButtonText}>Create order</Text></Pressable>
              </View>
            ) : (
              <View style={styles.orderList}>
                {(data?.orders || []).map((order) => (
                  <OrderCard key={order.localId} order={order} shopName={account?.name || session?.user.name || "Shop"} onImageSaved={onImageSaved} onImageError={onImageError} onReview={() => reviewStaleOrder(order)} />
                ))}
              </View>
            )}
          </ScrollView>
        )}

        {screen === "create" && (
          <View style={styles.screenFill}>
            <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: 18 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.createIntro}>
                <Text style={styles.createTitle}>{editingLocalId ? "Update the product selection" : "Choose products"}</Text>
                <Text style={styles.createDescription}>{editingLocalId ? "Unavailable items remain marked until you remove them." : "Select the items you want to include."}</Text>
              </View>
              <View style={styles.searchBox}>
                <Search size={18} color={colors.subtle} />
                <TextInput value={search} onChangeText={setSearch} style={styles.searchInput} placeholder="Search products" placeholderTextColor={colors.subtle} returnKeyType="search" autoCorrect={false} />
                {!!search && <Pressable onPress={() => setSearch("")} accessibilityRole="button" accessibilityLabel="Clear search"><Text style={styles.clearSearch}>×</Text></Pressable>}
              </View>
              {visibleProducts.length === 0 ? (
                <View style={styles.emptyCard}>
                  <AppIconBadge icon={Package} tone="blue" />
                  <Text style={styles.emptyTitle}>{activeProducts.length ? "No matches" : "Catalog unavailable"}</Text>
                  <Text style={styles.emptyDescription}>{activeProducts.length ? "Try a different product name." : "Connect and sync this shop’s catalog before creating an order."}</Text>
                  {!activeProducts.length && <Pressable onPress={manualSync} style={styles.textAction}><Text style={styles.textActionText}>Sync catalog</Text><ChevronRight size={16} color={colors.navy} /></Pressable>}
                </View>
              ) : (
                <View style={styles.productList}>
                  {visibleProducts.map((product) => {
                    const checked = selectedIds.has(product.id);
                    const unavailable = product.active !== true;
                    return (
                      <Pressable key={product.id} onPress={() => toggleProduct(product.id)} style={[styles.productRow, checked && styles.productRowSelected]} accessibilityRole="checkbox" accessibilityState={{ checked }}>
                        <View style={[styles.checkbox, checked && styles.checkboxSelected]}>{checked && <Check size={15} color={colors.white} strokeWidth={3} />}</View>
                        <View style={styles.productTextWrap}>
                          <Text style={[styles.productName, unavailable && styles.staleProductName]}>{product.name}</Text>
                          {unavailable && <Text style={styles.staleProductHint}>No longer active</Text>}
                        </View>
                        {unavailable && <View style={styles.staleBadge}><Text style={styles.staleBadgeText}>REVIEW</Text></View>}
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </ScrollView>
            <View style={[styles.bottomAction, { paddingBottom: Math.max(insets.bottom, 12) }]}>
              <Text style={styles.selectionCount}>{selectedIds.size} selected</Text>
              <Pressable style={[styles.primaryButton, styles.bottomPrimary, !selectedIds.size && styles.buttonDisabled]} disabled={!selectedIds.size} onPress={editingLocalId ? () => void saveOrder() : startReview} accessibilityRole="button">
                {savingOrder ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>{editingLocalId ? "Save changes" : "Review order"}</Text>}
                {!savingOrder && <ArrowRight size={18} color={colors.white} />}
              </Pressable>
            </View>
          </View>
        )}

        {screen === "review" && (
          <View style={styles.screenFill}>
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              <View style={styles.reviewIntro}>
                <View style={styles.reviewIcon}><ShoppingBag size={20} color={colors.navy} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.reviewTitle}>{selectedItems.length} item{selectedItems.length === 1 ? "" : "s"}</Text>
                  <Text style={styles.reviewDescription}>Your order saves to this phone first.</Text>
                </View>
              </View>
              <View style={styles.reviewCard}>
                {selectedItems.map((item, index) => (
                  <View key={item.id} style={[styles.reviewItem, index === selectedItems.length - 1 && styles.reviewItemLast]}>
                    <View style={styles.reviewBullet}><Check size={13} color={colors.accent} strokeWidth={3} /></View>
                    <Text style={styles.reviewItemName}>{item.name}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.reviewNote}>
                <Clock3 size={16} color={colors.navy} />
                <Text style={styles.reviewNoteText}>The order number is assigned after the service confirms the sync.</Text>
              </View>
            </ScrollView>
            <View style={[styles.bottomAction, { paddingBottom: Math.max(insets.bottom, 12) }]}>
              <Pressable style={styles.secondaryButton} onPress={() => setScreen("create")} accessibilityRole="button"><ArrowLeft size={17} color={colors.navy} /><Text style={styles.secondaryButtonText}>Edit</Text></Pressable>
              <Pressable style={[styles.primaryButton, styles.bottomPrimary, savingOrder && styles.buttonDisabled]} disabled={savingOrder} onPress={() => void saveOrder()} accessibilityRole="button">
                {savingOrder ? <ActivityIndicator color={colors.white} /> : <Text style={styles.primaryButtonText}>Save order</Text>}
                {!savingOrder && <Check size={18} color={colors.white} />}
              </Pressable>
            </View>
          </View>
        )}

        {screen === "account" && (
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.accountHero}>
              <View style={styles.accountAvatar}><Text style={styles.accountInitial}>{(account?.name || session?.user.name || "S").slice(0, 1).toUpperCase()}</Text></View>
              <Text style={styles.accountName}>{account?.name || session?.user.name || "Shop"}</Text>
              <Text style={styles.accountType}>Shop account</Text>
            </View>
            <View style={styles.accountCard}>
              <AccountInfoRow label="Connection" value={online ? "Online" : "Offline mode"} icon={online ? Wifi : WifiOff} />
              <AccountInfoRow label="Last complete sync" value={formatDate(account?.lastSyncAt)} icon={RefreshCw} />
              <AccountInfoRow label="Catalog items" value={String(data?.products.length || 0)} icon={Package} />
              <AccountInfoRow label="Saved orders" value={String(data?.orders.length || 0)} icon={ShoppingBag} last />
            </View>
            <Pressable onPress={manualSync} style={styles.accountAction} accessibilityRole="button">
              <View style={styles.accountActionIcon}><RefreshCw size={18} color={colors.navy} /></View>
              <View style={{ flex: 1 }}><Text style={styles.accountActionTitle}>Sync shop data</Text><Text style={styles.accountActionCopy}>Refresh catalog, history and queued orders</Text></View>
              {syncing ? <ActivityIndicator size="small" color={colors.navy} /> : <ChevronRight size={18} color={colors.subtle} />}
            </Pressable>
            <Pressable onPress={signOut} style={styles.signOutButton} accessibilityRole="button">
              <LogOut size={18} color={colors.red} /><Text style={styles.signOutText}>Sign out</Text>
            </Pressable>
            <Text style={styles.accountFootnote}>Saved orders remain on this phone after sign-out.</Text>
          </ScrollView>
        )}
      </View>

      {!!session && !!data?.account?.initializedAt && ["home", "orders", "account"].includes(screen) && <BottomNavigation current={currentTab} pending={pendingCount} onSelect={(tab) => {
        if (tab === "home") setScreen("home");
        else if (tab === "orders") setScreen("orders");
        else if (tab === "create") beginCreate();
        else setScreen("account");
      }} bottomInset={insets.bottom} />}

      {toast && <View pointerEvents="none" style={[styles.toast, toast.tone === "warning" ? styles.toastWarning : toast.tone === "neutral" ? styles.toastNeutral : styles.toastSuccess, { bottom: Math.max(insets.bottom, 12) + 72 }]} accessibilityLiveRegion="polite"><View style={styles.toastDot} /><Text style={styles.toastText}>{toast.message}</Text></View>}
    </SafeAreaView>
  );
}

function BottomNavigation({ current, pending, onSelect, bottomInset }: { current: string; pending: number; onSelect: (tab: string) => void; bottomInset: number }) {
  const tabs: Array<{ id: string; label: string; icon: AppIcon }> = [
    { id: "home", label: "Home", icon: Home },
    { id: "orders", label: "Orders", icon: Package },
    { id: "create", label: "New order", icon: Plus },
    { id: "account", label: "Account", icon: UserRound },
  ];
  return (
    <View style={[styles.bottomNav, { paddingBottom: Math.max(bottomInset, 8) }]}>
      {tabs.map(({ id, label, icon: Icon }) => {
        const active = id === current;
        return (
          <Pressable key={id} onPress={() => onSelect(id)} style={styles.navItem} accessibilityRole="tab" accessibilityState={{ selected: active }}>
            <View style={[styles.navIconWrap, active && styles.navIconActive, id === "create" && styles.navCreateIcon]}>
              <Icon size={id === "create" ? 22 : 20} color={id === "create" ? colors.white : active ? colors.navy : colors.subtle} strokeWidth={id === "create" ? 2.7 : 2.1} />
              {id === "orders" && pending > 0 && <View style={styles.navBadge}><Text style={styles.navBadgeText}>{pending > 9 ? "9+" : pending}</Text></View>}
            </View>
            <Text style={[styles.navLabel, active && styles.navLabelActive]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function MiniOrderRow({ order, onPress }: { order: OrderRecord; onPress: () => void }) {
  const status = statusDetails(order);
  return (
    <Pressable onPress={onPress} style={styles.miniOrderRow} accessibilityRole="button">
      <View style={styles.miniOrderIcon}><ShoppingBag size={17} color={colors.navy} /></View>
      <View style={styles.miniOrderMain}>
        <Text style={styles.miniOrderTitle}>{order.orderNumber ? `Order #${order.orderNumber}` : "Saved order"}</Text>
        <Text style={styles.miniOrderMeta}>{order.items.length} item{order.items.length === 1 ? "" : "s"} · {formatDate(order.createdAt)}</Text>
      </View>
      <View style={[styles.statusBadge, status.style]}><Text style={[styles.statusBadgeText, status.textStyle]}>{status.label}</Text></View>
    </Pressable>
  );
}

function OrderCard({ order, shopName, onImageSaved, onImageError, onReview }: { order: OrderRecord; shopName: string; onImageSaved: (path: string) => void; onImageError: (message: string) => void; onReview: () => void }) {
  const contentRef = useRef<View>(null);
  const [savingImage, setSavingImage] = useState(false);
  const status = statusDetails(order);
  const saveImage = async () => {
    if (!contentRef.current || savingImage) return;
    setSavingImage(true);
    try {
      const uri = await captureRef(contentRef, { format: "png", quality: 1, result: "tmpfile" });
      const path = await saveOrderImage(uri, `Order_${order.orderNumber || order.localId}`);
      onImageSaved(path);
    } catch (error) {
      onImageError(error instanceof Error ? error.message : "Could not save the order image.");
    } finally {
      setSavingImage(false);
    }
  };
  const canReview = order.status === "needs_attention" && order.attentionCode === "stale_products";
  return (
    <View style={styles.orderCardShell}>
      <View ref={contentRef} collapsable={false} style={styles.orderImageContent}>
        <View style={styles.orderCardTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.orderShopLabel} numberOfLines={1}>{shopName}</Text>
            <Text style={styles.orderCardNumber}>{order.orderNumber ? `Order #${order.orderNumber}` : "Saved order"}</Text>
          </View>
          <View style={[styles.statusBadge, status.style]}><Text style={[styles.statusBadgeText, status.textStyle]}>{status.label}</Text></View>
        </View>
        <View style={styles.orderDivider} />
        <Text style={styles.orderDate}>{formatDate(order.createdAt)}</Text>
        <Text style={styles.orderItemsHeading}>{order.items.length} item{order.items.length === 1 ? "" : "s"}</Text>
        <View style={styles.orderItemList}>
          {order.items.slice(0, 8).map((item, index) => <Text key={`${item.productId}-${index}`} style={styles.orderItemText}>•  {item.name}</Text>)}
          {order.items.length > 8 && <Text style={styles.orderItemMore}>+{order.items.length - 8} more</Text>}
        </View>
        {order.status === "pending" && <Text style={styles.orderImageNote}>Saved on this phone · Number assigned after sync</Text>}
        {order.status === "needs_attention" && !!order.attentionReason && <Text style={styles.orderAttentionNote}>{order.attentionReason}</Text>}
      </View>
      <View style={styles.orderCardActions}>
        <Pressable onPress={() => void saveImage()} style={styles.orderActionButton} disabled={savingImage} accessibilityRole="button">
          {savingImage ? <ActivityIndicator size="small" color={colors.navy} /> : <ImageIcon size={16} color={colors.navy} />}
          <Text style={styles.orderActionText}>{savingImage ? "Saving…" : "Save image"}</Text>
        </Pressable>
        {canReview && <Pressable onPress={onReview} style={styles.reviewActionButton} accessibilityRole="button"><Text style={styles.reviewActionText}>Review products</Text><ArrowRight size={15} color={colors.amber} /></Pressable>}
      </View>
    </View>
  );
}

function AccountInfoRow({ label, value, icon: Icon, last = false }: { label: string; value: string; icon: AppIcon; last?: boolean }) {
  return (
    <View style={[styles.accountInfoRow, last && { borderBottomWidth: 0 }]}>
      <View style={styles.accountInfoIcon}><Icon size={16} color={colors.navy} /></View>
      <Text style={styles.accountInfoLabel}>{label}</Text>
      <Text style={styles.accountInfoValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function statusDetails(order: OrderRecord): { label: string; style: object; textStyle: object } {
  if (order.status === "synced") return { label: "SYNCED", style: styles.statusSynced, textStyle: styles.statusSyncedText };
  if (order.status === "needs_attention") return { label: "REVIEW", style: styles.statusAttention, textStyle: styles.statusAttentionText };
  return { label: "PENDING", style: styles.statusPending, textStyle: styles.statusPendingText };
}

function formatDate(value?: string | null): string {
  if (!value) return "Not yet synced";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function App() {
  return <SafeAreaProvider><AppRoot /></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  appRoot: { flex: 1, backgroundColor: colors.background },
  appBody: { flex: 1 },
  loadingScreen: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  loadingCopy: { marginTop: 14, color: colors.muted, fontSize: 14, fontWeight: "500" },
  authScreen: { flex: 1, backgroundColor: colors.background },
  authContent: { flex: 1, justifyContent: "center", paddingHorizontal: 26, paddingBottom: 24 },
  brandMark: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.navyDeep, alignItems: "center", justifyContent: "center", marginBottom: 26 },
  authTitle: { color: colors.ink, fontSize: 28, lineHeight: 34, fontWeight: "700", letterSpacing: -0.45, marginBottom: 8 },
  authDescription: { color: colors.muted, fontSize: 15, lineHeight: 22, marginBottom: 28 },
  formField: { marginBottom: 17 },
  fieldLabel: { color: colors.ink, fontSize: 13, fontWeight: "600", marginBottom: 8 },
  textInput: { minHeight: 54, paddingHorizontal: 16, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, color: colors.ink, fontSize: 16 },
  primaryButton: { minHeight: 54, paddingHorizontal: 18, borderRadius: radius.md, backgroundColor: colors.navy, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  primaryButtonText: { color: colors.white, fontSize: 15, fontWeight: "700" },
  buttonDisabled: { opacity: 0.52 },
  formError: { color: colors.red, fontSize: 13, lineHeight: 19, marginBottom: 16 },
  authError: { color: colors.muted, fontSize: 13, textAlign: "center", lineHeight: 19, marginTop: 16 },
  loginFootnote: { color: colors.subtle, fontSize: 12, textAlign: "center", marginTop: 19 },
  authTopBar: { height: 56, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 10 },
  authTopName: { flex: 1, fontSize: 16, fontWeight: "700", color: colors.ink },
  firstSyncCard: { flexDirection: "row", gap: 13, alignItems: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 15, marginBottom: 19 },
  firstSyncIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.blueSoft, alignItems: "center", justifyContent: "center" },
  firstSyncCardTitle: { color: colors.ink, fontSize: 14, fontWeight: "700", marginBottom: 3 },
  firstSyncCardText: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  topBar: { minHeight: 62, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: 10 },
  topTitleWrap: { flex: 1, minWidth: 0 },
  topTitle: { color: colors.ink, fontSize: 20, fontWeight: "700", letterSpacing: -0.3 },
  syncButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  backButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  connectionRow: { height: 36, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 6 },
  connectionText: { color: colors.accent, fontSize: 12, fontWeight: "600" },
  scrollContent: { paddingHorizontal: 18, paddingBottom: 28 },
  heroCard: { backgroundColor: colors.navyDeep, borderRadius: radius.xl, padding: 21, marginTop: 9, marginBottom: 26, overflow: "hidden" },
  heroCopy: { marginBottom: 18 },
  heroEyebrow: { color: "#A9BFCE", fontSize: 10, letterSpacing: 1.1, fontWeight: "800", marginBottom: 8 },
  heroTitle: { color: colors.white, fontSize: 21, lineHeight: 27, fontWeight: "700", letterSpacing: -0.3, maxWidth: 270 },
  heroDescription: { color: "#C0CBD5", fontSize: 13, lineHeight: 19, marginTop: 6 },
  heroButton: { alignSelf: "flex-start", minHeight: 44, paddingHorizontal: 16, borderRadius: 13, backgroundColor: colors.accent, flexDirection: "row", alignItems: "center", gap: 8 },
  heroButtonText: { color: colors.white, fontSize: 14, fontWeight: "700" },
  sectionHeading: { marginBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: "700", letterSpacing: -0.2 },
  textAction: { flexDirection: "row", alignItems: "center", gap: 1, paddingVertical: 6, paddingLeft: 7 },
  textActionText: { color: colors.navy, fontSize: 13, fontWeight: "700" },
  emptyCard: { minHeight: 198, paddingHorizontal: 22, paddingVertical: 24, alignItems: "center", justifyContent: "center", borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  iconBadge: { alignItems: "center", justifyContent: "center" },
  emptyTitle: { color: colors.ink, fontSize: 16, fontWeight: "700", marginTop: 15, marginBottom: 6, textAlign: "center" },
  emptyDescription: { maxWidth: 270, color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: "center", marginBottom: 7 },
  orderList: { gap: 10 },
  homeFootnote: { marginTop: 20, flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center" },
  homeFootnoteText: { color: colors.muted, fontSize: 12, fontWeight: "500" },
  miniOrderRow: { minHeight: 77, paddingHorizontal: 13, paddingVertical: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 11 },
  miniOrderIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.blueSoft, alignItems: "center", justifyContent: "center" },
  miniOrderMain: { flex: 1 },
  miniOrderTitle: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  miniOrderMeta: { color: colors.muted, fontSize: 11, marginTop: 4 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: radius.pill, alignSelf: "flex-start" },
  statusBadgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.45 },
  statusSynced: { backgroundColor: colors.accentSoft },
  statusSyncedText: { color: colors.accent },
  statusPending: { backgroundColor: colors.blueSoft },
  statusPendingText: { color: colors.navy },
  statusAttention: { backgroundColor: colors.amberSoft },
  statusAttentionText: { color: colors.amber },
  ordersIntro: { paddingTop: 6, paddingBottom: 14 },
  ordersIntroCopy: { color: colors.muted, fontSize: 13, marginTop: 4 },
  orderCardShell: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  orderImageContent: { padding: 16, backgroundColor: colors.surface },
  orderCardTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  orderShopLabel: { color: colors.muted, fontSize: 11, fontWeight: "600", marginBottom: 4 },
  orderCardNumber: { color: colors.ink, fontSize: 16, fontWeight: "700", letterSpacing: -0.2 },
  orderDivider: { height: 1, backgroundColor: colors.border, marginTop: 13, marginBottom: 11 },
  orderDate: { color: colors.muted, fontSize: 11 },
  orderItemsHeading: { color: colors.ink, fontSize: 12, fontWeight: "700", marginTop: 12, marginBottom: 5 },
  orderItemList: { gap: 4 },
  orderItemText: { color: colors.ink, fontSize: 13, lineHeight: 18 },
  orderItemMore: { color: colors.muted, fontSize: 12, marginTop: 2 },
  orderImageNote: { marginTop: 12, color: colors.navy, fontSize: 11, fontWeight: "600" },
  orderAttentionNote: { marginTop: 11, color: colors.amber, fontSize: 11, lineHeight: 16 },
  orderCardActions: { minHeight: 48, paddingHorizontal: 13, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  orderActionButton: { flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 9 },
  orderActionText: { color: colors.navy, fontSize: 12, fontWeight: "700" },
  reviewActionButton: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 9 },
  reviewActionText: { color: colors.amber, fontSize: 11, fontWeight: "700" },
  createIntro: { paddingTop: 7, paddingBottom: 14 },
  createTitle: { color: colors.ink, fontSize: 18, fontWeight: "700", letterSpacing: -0.2 },
  createDescription: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  searchBox: { minHeight: 48, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 9, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, marginBottom: 12 },
  searchInput: { flex: 1, paddingVertical: 9, color: colors.ink, fontSize: 14 },
  clearSearch: { color: colors.subtle, fontSize: 22, lineHeight: 24, paddingHorizontal: 3 },
  productList: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: "hidden" },
  productRow: { minHeight: 60, paddingHorizontal: 14, paddingVertical: 11, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  productRowSelected: { backgroundColor: "#F5FAF8" },
  checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: "#B8C2CC", backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  checkboxSelected: { borderColor: colors.accent, backgroundColor: colors.accent },
  productTextWrap: { flex: 1 },
  productName: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  staleProductName: { color: colors.muted },
  staleProductHint: { color: colors.amber, fontSize: 10, fontWeight: "600", marginTop: 3 },
  staleBadge: { backgroundColor: colors.amberSoft, paddingHorizontal: 7, paddingVertical: 4, borderRadius: radius.pill },
  staleBadgeText: { color: colors.amber, fontSize: 8, fontWeight: "800", letterSpacing: 0.4 },
  screenFill: { flex: 1 },
  bottomAction: { paddingHorizontal: 18, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 11 },
  selectionCount: { minWidth: 76, color: colors.muted, fontSize: 12, fontWeight: "600" },
  bottomPrimary: { flex: 1 },
  secondaryButton: { minHeight: 50, paddingHorizontal: 15, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  secondaryButtonText: { color: colors.navy, fontSize: 14, fontWeight: "700" },
  reviewIntro: { paddingTop: 8, paddingBottom: 17, flexDirection: "row", alignItems: "center", gap: 12 },
  reviewIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.blueSoft, alignItems: "center", justifyContent: "center" },
  reviewTitle: { color: colors.ink, fontSize: 18, fontWeight: "700" },
  reviewDescription: { color: colors.muted, fontSize: 12, marginTop: 3 },
  reviewCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: 14 },
  reviewItem: { minHeight: 54, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", alignItems: "center", gap: 11 },
  reviewItemLast: { borderBottomWidth: 0 },
  reviewBullet: { width: 24, height: 24, borderRadius: 8, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
  reviewItemName: { color: colors.ink, fontSize: 14, fontWeight: "600", flex: 1 },
  reviewNote: { marginTop: 14, padding: 14, borderRadius: radius.md, backgroundColor: colors.blueSoft, flexDirection: "row", alignItems: "flex-start", gap: 9 },
  reviewNoteText: { flex: 1, color: colors.navy, fontSize: 12, lineHeight: 18 },
  bottomNav: { minHeight: 68, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 10, paddingTop: 7, flexDirection: "row", justifyContent: "space-around", alignItems: "center" },
  navItem: { flex: 1, minHeight: 53, alignItems: "center", justifyContent: "center", gap: 3 },
  navIconWrap: { width: 48, height: 29, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  navIconActive: { backgroundColor: colors.blueSoft },
  navCreateIcon: { width: 42, height: 42, backgroundColor: colors.navy, marginTop: -16, borderWidth: 4, borderColor: colors.surface },
  navLabel: { color: colors.subtle, fontSize: 10, fontWeight: "600" },
  navLabelActive: { color: colors.navy, fontWeight: "700" },
  navBadge: { position: "absolute", right: 3, top: -2, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", paddingHorizontal: 3 },
  navBadgeText: { color: colors.white, fontSize: 8, fontWeight: "800" },
  accountHero: { alignItems: "center", paddingVertical: 20 },
  accountAvatar: { width: 70, height: 70, borderRadius: 23, backgroundColor: colors.navy, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  accountInitial: { color: colors.white, fontSize: 28, fontWeight: "700" },
  accountName: { color: colors.ink, fontSize: 19, fontWeight: "700" },
  accountType: { color: colors.muted, fontSize: 12, marginTop: 4 },
  accountCard: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 14, paddingVertical: 4 },
  accountInfoRow: { minHeight: 51, flexDirection: "row", alignItems: "center", gap: 9, borderBottomWidth: 1, borderBottomColor: colors.border },
  accountInfoIcon: { width: 27, alignItems: "center" },
  accountInfoLabel: { color: colors.muted, fontSize: 12, flex: 1 },
  accountInfoValue: { maxWidth: 155, color: colors.ink, fontSize: 12, fontWeight: "700", textAlign: "right" },
  accountAction: { marginTop: 13, paddingHorizontal: 13, minHeight: 70, flexDirection: "row", alignItems: "center", gap: 11, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg },
  accountActionIcon: { width: 39, height: 39, borderRadius: 13, backgroundColor: colors.blueSoft, alignItems: "center", justifyContent: "center" },
  accountActionTitle: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  accountActionCopy: { color: colors.muted, fontSize: 11, marginTop: 3 },
  signOutButton: { marginTop: 20, minHeight: 50, borderRadius: radius.md, backgroundColor: colors.redSoft, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  signOutText: { color: colors.red, fontSize: 14, fontWeight: "700" },
  accountFootnote: { textAlign: "center", color: colors.subtle, fontSize: 11, marginTop: 12 },
  toast: { position: "absolute", left: 18, right: 18, minHeight: 48, paddingHorizontal: 15, paddingVertical: 12, borderRadius: 15, flexDirection: "row", alignItems: "center", gap: 10, elevation: 7, shadowColor: "#000", shadowOpacity: 0.14, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
  toastSuccess: { backgroundColor: colors.navyDeep },
  toastWarning: { backgroundColor: "#7A4A0B" },
  toastNeutral: { backgroundColor: "#34475B" },
  toastDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#90D8BE" },
  toastText: { flex: 1, color: colors.white, fontSize: 12, fontWeight: "600", lineHeight: 17 },
  migrationScreen: { flex: 1, backgroundColor: colors.background },
  migrationContent: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30 },
  migrationTitle: { color: colors.ink, fontSize: 22, fontWeight: "700", marginTop: 20, marginBottom: 7 },
  migrationCopy: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: "center", marginBottom: 17 },
  hiddenWebView: { position: "absolute", left: 0, bottom: 0, width: 1, height: 1, opacity: 0 },
});
