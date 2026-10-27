# OrderIT offline shop workspace

## What shops can do

A shop must first sign in online and complete a full catalog and order-history sync on that device. The installable start page is `/offline.html`. After initialization, it can use the last synced active catalog, review and save new orders locally, and browse the history already stored on that device. New local orders show as **Pending sync** and do not receive an order number until the server accepts them. The workspace shows the last complete sync, connectivity/service status, and pending or needs-attention counts. A visible retry button, app launch/foreground, and reconnect all trigger another service check. First-time sign-in, registration, account management, and admin pages remain online-only.

The static offline workspace is deliberately separate from authenticated Next.js HTML. If a navigation fails, the worker returns the generic shop shell only for shop routes; other routes receive a no-data connection-required page. The worker never intercepts `/api/` requests or stores private API responses, authenticated page HTML, or mutation responses in Cache Storage.

## Local data and account safety

The IndexedDB database is `orderit-shop-offline`, schema version 1. It contains:

- `accounts`: the shop ID, display name, first-initialized time, and last successful full-sync time.
- `products`: the currently synced active product IDs and names, partitioned by shop ID.
- `orders`: synced history and local order snapshots, including product IDs/names, server ID/order number when known, and `pending`, `synced`, or `needs_attention` state.
- `outbox`: the same shop-partitioned local ID, ordered product IDs, stable idempotency key, and retry/attention state needed to submit a draft.
- `settings`: only the active local role and user ID. It contains no password, cookie, JWT, or reusable session credential.

Every product/order/outbox key includes the authenticated shop ID. A new online account becomes the active device context; prior accounts' records are preserved but hidden. A successful admin session sets the context to admin so the offline shell does not expose a previous shop's data. Shop logout asks for confirmation, marks the device signed out, and preserves queued orders; the same shop must sign in online again before its offline records can be opened or synced. Clearing browser storage, losing the device, or using a shared unlocked device can expose or destroy local data. The database is not encrypted; offline data is only as protected as the device and browser profile. Do not use this feature on a shared or untrusted device.

The worker uses the versioned Cache Storage name `orderit-app-shell-v4` for the static shell and hashed build assets only. Activation removes older caches whose names start with `orderit-`; it does not clear IndexedDB order data. Browser storage eviction or user-cleared site data can still remove the local database.

## Order sync and conflict policy

The shop-only `GET /api/orders?sync=1&take=100&skip=0` contract returns one page of that authenticated shop's order IDs, order numbers, timestamps, idempotency keys, and ordered product IDs/names. It has no admin/shop-owner fields and is subject to the app's private/no-store API response policy. Catalog sync requests only active products. The client pages through the shop's existing history before recording a complete sync time.

Each locally created order gets a stable idempotency key and an immutable local snapshot. The existing `POST /api/orders` route authorizes the shop, validates product IDs and activity, assigns authoritative order numbers/timestamps, and replays an identical key/selection rather than creating another order. A local outbox item is removed only after a confirmed acknowledgement or when a later history sync finds the same idempotency key on the server (covering a response lost after commit). Transient network/server failures keep the item pending.

If a selected product has become inactive, the server's 409 response changes the draft to `needs_attention`, refreshes the active catalog, and retains the original product IDs and names. The user must explicitly review, remove inactive products, and save a changed selection; the retry key is retained. The client never silently rewrites or drops the selection. Other authorization or idempotency conflicts also stay visible for attention and are not automatically discarded.

## Installed assets and platform limits

The manifest declares separate regular and maskable Android icon PNGs at 192×192 and 512×512. Their central artwork is inset for maskable cropping. The page also declares an 180×180 Apple touch icon and startup images for iPhone 6.7-inch, iPhone 6.1-inch, and 12.9-inch iPad portrait dimensions. Android Chrome normally derives its installed-PWA launch screen from the manifest name, background/theme colors, and selected icon; this project does not promise that the explicit iOS artwork is used identically by every browser/OS version. iOS home-screen launch styling and startup-image matching require device validation.

## Automated checks and remaining device work

Run `npm test`, `npx tsc --noEmit`, and `npm run build`. Offline behavior tests cover account partitioning, IndexedDB-style persistence across new reads, lost acknowledgement reconciliation without a second POST, stale-product preservation and explicit correction, shop-only sync response shape, and safe service-worker routing. The database test double and worker emulator are not a real browser, live PostgreSQL integration, installed app, or platform background-sync test.

Real-device acceptance is still required before claiming end-to-end offline PWA behavior:

1. On Android Chrome over HTTPS, sign in as a shop, wait for the first complete sync, install the PWA, then enable airplane mode. Launch it, browse cached products/history, create and review an order, close/reopen the app, and confirm the order remains pending. Reconnect, retry, and verify one server order and one authoritative order number. Also test inactive products, admin login after shop use, logout, and a second shop account.
2. On iOS Safari, sign in and sync online, use **Add to Home Screen**, then repeat the offline create/reopen/reconnect and account-isolation checks. Check the launch image and status-bar appearance on the actual iOS/iPadOS versions in scope.
3. Verify the service worker controls the installed page, the generic shell never reveals admin data, private APIs are not in Cache Storage, and a server error leaves local drafts recoverable. Confirm whether Background Sync is supported on each target; foreground/reconnect/manual retry must remain the fallback.

These real-device and live-service checks have not been run in this sandbox. No deployment, production database, Android device, or iOS device was available here.
