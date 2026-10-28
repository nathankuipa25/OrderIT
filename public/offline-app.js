import {
  enqueueOrder,
  getDeviceContext,
  getShopData,
  reviseQueuedOrder,
  syncShop,
} from "/offline-store.mjs";

const root = document.getElementById("app");
let shopId = null;
let accountData = null;
let syncInfo = { reachable: false, error: null };
let currentView = location.hash === "#orders" ? "orders" : "create";
let selectedIds = new Set();
let editingLocalId = null;
let busy = false;
let toastMessage = "";
let toastKind = "ok";
let toastTimer = null;

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
function flashToast(message, kind = "ok") {
  toastMessage = message;
  toastKind = kind;
  if (toastTimer) clearTimeout(toastTimer);
  render();
  toastTimer = setTimeout(() => {
    toastMessage = "";
    toastTimer = null;
    render();
  }, 3400);
}
function gate(message, actionLabel, actionHref = "/login?next=%2Foffline.html", kind = "warn") {
  root.innerHTML = `<section class="card"><h1>Shop offline workspace</h1><div class="status" data-kind="${kind}"><span class="status-dot"></span><p>${escapeHTML(message)}</p></div><div class="actions"><a class="button" href="${escapeHTML(actionHref)}">${escapeHTML(actionLabel)}</a><button class="button secondary" type="button" data-action="retry">Try again</button></div><p class="subtle">First-time sign-in and initial catalog/history sync require an internet connection. Admin pages and data are not available offline.</p></section>`;
}
function renderProductChoice(product, checked, disabled = false, stale = false) {
  return `<label class="product-row"><input type="checkbox" data-product-id="${escapeHTML(product.id)}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}><span class="product-name">${escapeHTML(product.name)}</span>${stale ? '<span class="badge attention">No longer active</span>' : ""}</label>`;
}
function selectedNames() {
  const byId = new Map((accountData?.products || []).map((product) => [product.id, product.name]));
  const oldItems = editingLocalId ? accountData.orders.find((order) => order.localId === editingLocalId)?.items || [] : [];
  for (const item of oldItems) if (!byId.has(item.productId)) byId.set(item.productId, item.name);
  return [...selectedIds].map((id) => byId.get(id) || "Unavailable product");
}
function renderCreate() {
  const products = accountData.products.filter((product) => product.active);
  if (!products.length) return `<section class="card"><h2>Product catalog</h2><div class="empty">No active products were included in the last complete sync. Connect to the internet and try again.</div></section>`;
  return `<section class="card"><h2>${editingLocalId ? "Review saved order" : "Create an order"}</h2><p class="subtle">Choose from the most recently synced active catalog. Your selection is saved on this device before it syncs.</p><div class="product-list" style="margin-top:14px">${products.map((product) => renderProductChoice(product, selectedIds.has(product.id))).join("")}</div><div class="actions"><button class="button" data-action="review" ${selectedIds.size === 0 ? "disabled" : ""}>${editingLocalId ? "Continue review" : "Review order"}</button>${editingLocalId ? '<button class="button secondary" data-action="cancel-edit">Cancel</button>' : ""}</div></section>`;
}
function renderEditStale(order) {
  const oldById = new Map(order.items.map((item) => [item.productId, item]));
  const currentById = new Map(accountData.products.filter((product) => product.active).map((product) => [product.id, product]));
  const rows = [];
  for (const item of order.items) {
    const active = currentById.get(item.productId);
    rows.push(renderProductChoice(active || { id: item.productId, name: item.name }, selectedIds.has(item.productId), false, !active));
  }
  for (const product of accountData.products.filter((item) => item.active && !oldById.has(item.id))) {
    rows.push(renderProductChoice(product, selectedIds.has(product.id)));
  }
  return `<section class="card"><h2>Resolve inactive products</h2><div class="alert">This order includes one or more products that are no longer active. Nothing was removed or changed. Uncheck inactive items and, if needed, choose current products before saving the revised selection.</div><div class="product-list">${rows.join("")}</div><div class="actions"><button class="button" data-action="save-revision" ${selectedIds.size === 0 ? "disabled" : ""}>Save revised selection</button><button class="button secondary" data-action="cancel-edit">Cancel</button></div></section>`;
}
function renderReview() {
  const names = selectedNames();
  return `<section class="card"><h2>Review order</h2><p class="subtle">${names.length} product${names.length === 1 ? "" : "s"} · this order is saved on this device first and syncs when a connection is available.</p><ol style="padding-left:22px;line-height:1.7">${names.map((name) => `<li>${escapeHTML(name)}</li>`).join("")}</ol><div class="actions"><button class="button" data-action="save-order" ${busy ? "disabled" : ""}>${busy ? "Saving…" : "Save order to this device"}</button><button class="button secondary" data-action="back-create">Edit products</button></div></section>`;
}
function renderOrders() {
  if (!accountData.orders.length) return `<section class="card"><h2>Orders on this device</h2><div class="empty">No synced history or saved orders are stored for this shop on this device.</div></section>`;
  const cards = accountData.orders.map((order) => {
    const status = order.status === "synced" ? "synced" : order.status === "needs_attention" ? "attention" : "pending";
    const label = status === "synced" ? `Synced · Order #${escapeHTML(order.orderNumber)}` : status === "attention" ? "Needs attention" : "Pending sync";
    const items = order.items.map((item) => item.name).join(" · ");
    const canEdit = order.status === "needs_attention" && order.attentionCode === "stale_products";
    return `<article class="order-card"><div class="order-top"><div class="order-title">${order.orderNumber ? `Order #${escapeHTML(order.orderNumber)}` : "Saved order"}</div><span class="badge ${status}">${label}</span></div><div class="order-date">${escapeHTML(formatDate(order.createdAt))}</div><p class="order-items">${escapeHTML(items)}</p>${order.attentionReason ? `<p class="order-note">${escapeHTML(order.attentionReason)}</p>` : order.status === "pending" ? '<p class="order-note">Saved on this device. An order number is assigned after sync.</p>' : ""}${canEdit ? `<div class="actions"><button class="button secondary small" data-action="edit-stale" data-id="${escapeHTML(order.localId)}">Review product selection</button></div>` : ""}</article>`;
  }).join("");
  return `<section class="card"><div class="order-top"><h2 style="margin:0">Orders on this device</h2><span class="badge">${accountData.orders.length}</span></div><p class="subtle" style="margin:7px 0 14px">History is limited to records previously synced to this device, plus orders saved here.</p><div class="order-list">${cards}</div></section>`;
}
function render() {
  if (!shopId || !accountData?.account?.initializedAt) return;
  const editingOrder = editingLocalId ? accountData.orders.find((order) => order.localId === editingLocalId) : null;
  const brand = document.querySelector(".brand span");
  if (brand) brand.textContent = accountData.account.name || "Shop Orders";
  root.innerHTML = `<section class="card"><div class="order-top"><div><p class="subtle">Shop workspace</p><h1>${escapeHTML(accountData.account.name)}</h1></div><button class="button secondary small" data-action="retry" ${busy ? "disabled" : ""}>${busy ? "Syncing…" : "Sync now"}</button></div><p class="subtle">${accountData.products.length} active products · ${accountData.orders.length} saved orders on this device</p></section><div class="tabs" role="tablist" aria-label="Shop workspace"><button class="tab" role="tab" aria-selected="${currentView !== "orders"}" data-action="tab-create">Create order</button><button class="tab" role="tab" aria-selected="${currentView === "orders"}" data-action="tab-orders">Orders</button></div>${toastMessage ? `<div class="status toast" data-kind="${toastKind}" role="status"><span class="status-dot"></span><p>${escapeHTML(toastMessage)}</p></div>` : ""}${currentView === "orders" ? renderOrders() : editingOrder ? renderEditStale(editingOrder) : currentView === "review" ? renderReview() : renderCreate()}`;
}
async function loadCurrentShop() {
  if (!shopId) return;
  accountData = await getShopData(shopId);
  render();
}
async function startSync() {
  if (busy) return;
  busy = true;
  render();
  let completionMessage = "";
  let completionKind = "ok";
  try {
    syncInfo = await syncShop();
    if (syncInfo.role === "SHOP" && syncInfo.shopId) {
      shopId = syncInfo.shopId;
      if (syncInfo.reachable === false) {
        completionMessage = "You’re offline. Saved orders remain on this device.";
        completionKind = "warn";
      } else if (syncInfo.error) {
        completionMessage = "Some shop data couldn’t sync. Saved orders remain on this device.";
        completionKind = "warn";
      } else if (syncInfo.queue?.attention) {
        completionMessage = `${syncInfo.queue.attention} order${syncInfo.queue.attention === 1 ? " needs" : "s need"} attention; saved drafts were kept.`;
        completionKind = "warn";
      } else if (syncInfo.queue?.pending) {
        completionMessage = `${syncInfo.queue.pending} order${syncInfo.queue.pending === 1 ? " is" : "s are"} still queued.`;
      } else completionMessage = "Shop data is up to date.";
      accountData = await getShopData(shopId);
    } else {
      shopId = null;
      accountData = null;
    }
  } catch (error) {
    syncInfo = { reachable: false, error: error instanceof Error ? error.message : "Sync check failed." };
    completionMessage = "Sync couldn’t finish. Saved orders remain on this device.";
    completionKind = "warn";
    const context = await getDeviceContext().catch(() => ({ role: "SIGNED_OUT", userId: null }));
    if (context.role === "SHOP" && context.userId) {
      shopId = context.userId;
      accountData = await getShopData(shopId).catch(() => null);
    }
  } finally {
    busy = false;
  }
  if (!shopId) {
    const context = await getDeviceContext().catch(() => ({ role: "SIGNED_OUT", userId: null }));
    if (syncInfo.role === "ADMIN" || context.role === "ADMIN") {
      gate("This workspace is for shop accounts. Sign in with a shop account to continue.", "Sign in online");
    } else if (syncInfo.reachable && syncInfo.role === null) {
      gate("Sign in with a shop account and complete the first sync while connected to the internet to start using this workspace offline.", "Sign in online");
    } else {
      gate("No initialized shop workspace is available for the current device account. Previously saved orders remain partitioned on this device and are not deleted.", "Sign in online");
    }
    return;
  }
  if (!accountData?.account?.initializedAt) {
    gate("Complete the first shop sync while connected to the internet before using this workspace offline.", "Sign in online", "/login?next=%2Foffline.html", "warn");
    return;
  }
  render();
  if (completionMessage) flashToast(completionMessage, completionKind);
}
async function retrySync() {
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = null;
  toastMessage = "";
  await startSync();
}

root.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  try {
    if (action === "retry") await retrySync();
    else if (action === "tab-create") { currentView = "create"; editingLocalId = null; selectedIds = new Set(); toastMessage = ""; render(); }
    else if (action === "tab-orders") { currentView = "orders"; editingLocalId = null; toastMessage = ""; await loadCurrentShop(); }
    else if (action === "review") { currentView = "review"; render(); }
    else if (action === "back-create") { currentView = "create"; render(); }
    else if (action === "save-order") {
      busy = true; render();
      let shouldSync = false;
      try {
        await enqueueOrder(shopId, [...selectedIds]);
        selectedIds = new Set(); currentView = "orders"; flashToast("Order saved on this device. Sync will retry when a connection is available.");
        await loadCurrentShop();
        shouldSync = navigator.onLine;
      } finally { busy = false; render(); }
      if (shouldSync) void startSync();
    } else if (action === "edit-stale") {
      const order = accountData.orders.find((item) => item.localId === button.dataset.id);
      if (order) { editingLocalId = order.localId; selectedIds = new Set(order.items.map((item) => item.productId)); currentView = "create"; render(); }
    } else if (action === "save-revision") {
      await reviseQueuedOrder(shopId, editingLocalId, [...selectedIds]);
      editingLocalId = null; currentView = "orders"; flashToast("Revised selection saved. The original draft is preserved.");
      await loadCurrentShop();
      if (navigator.onLine) void startSync();
    } else if (action === "cancel-edit") {
      editingLocalId = null; selectedIds = new Set(); currentView = "orders"; await loadCurrentShop();
    }
  } catch (error) {
    flashToast(error instanceof Error ? error.message : "The action could not be completed.", "warn");
  }
});
root.addEventListener("change", (event) => {
  const input = event.target.closest("input[data-product-id]");
  if (!input) return;
  const id = input.dataset.productId;
  if (input.checked) selectedIds.add(id); else selectedIds.delete(id);
  render();
});

window.addEventListener("online", () => { void startSync(); });
window.addEventListener("offline", () => { syncInfo = { reachable: false, error: null }; if (shopId) { void loadCurrentShop(); flashToast("You’re offline. Saved orders remain on this device.", "warn"); } });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void startSync(); });

async function registerWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.register("/service-worker.js", { type: "module" });
    if (registration.sync && shopId) registration.sync.register("orderit-shop-sync").catch(() => {});
  } catch (error) {
    console.warn("Offline shell worker registration was unavailable", error);
  }
}
await registerWorker();
await startSync();
if (shopId) await registerWorker();
