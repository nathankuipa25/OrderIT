(function () {
  if (!window.OrderItNative || window.__orderItShopBridgeInstalled) return;
  window.__orderItShopBridgeInstalled = true;

  var nativeApp = window.OrderItNative;
  var offlineShell = !!document.getElementById("app") && /Shop Workspace/i.test(document.title);
  var objectUrls = new Map();
  var originalCreateObjectURL = URL.createObjectURL.bind(URL);
  var originalRevokeObjectURL = URL.revokeObjectURL.bind(URL);
  var originalAnchorClick = HTMLAnchorElement.prototype.click;

  URL.createObjectURL = function (value) {
    var url = originalCreateObjectURL(value);
    if (value instanceof Blob) objectUrls.set(url, value);
    return url;
  };
  URL.revokeObjectURL = function (url) {
    objectUrls.delete(url);
    return originalRevokeObjectURL(url);
  };

  HTMLAnchorElement.prototype.click = function () {
    var href = this.href || this.getAttribute("href") || "";
    var blob = objectUrls.get(href);
    if (this.hasAttribute("download") && blob && blob.type === "image/png") {
      var filename = this.download || "order.png";
      var reader = new FileReader();
      reader.onload = function () {
        var result = String(reader.result || "");
        var outcome = nativeApp.saveOrderPng(filename, result);
        if (outcome === "error") nativeApp.showMessage("Could not save the order image.");
      };
      reader.onerror = function () {
        nativeApp.showMessage("Could not prepare the order image.");
      };
      reader.readAsDataURL(blob);
      return;
    }
    return originalAnchorClick.call(this);
  };

  function wrapText(context, text, maxWidth) {
    var words = String(text || "").split(/\s+/).filter(Boolean);
    var lines = [];
    var line = "";
    words.forEach(function (word) {
      var candidate = line ? line + " " + word : word;
      if (line && context.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    });
    if (line) lines.push(line);
    return lines.length ? lines : [""];
  }

  function saveOfflineOrderImage(title, status, items, filenameBase) {
    var cleanItems = (items || []).map(function (item) { return String(item || "").trim(); }).filter(Boolean);
    if (!cleanItems.length) {
      nativeApp.showMessage("Add products before saving an order image.");
      return;
    }

    var pages = [];
    for (var offset = 0; offset < cleanItems.length; offset += 25) {
      pages.push({ offset: offset, items: cleanItems.slice(offset, offset + 25) });
    }
    nativeApp.showMessage("Preparing order image…");

    pages.forEach(function (page, pageIndex) {
      var canvas = document.createElement("canvas");
      var width = 900;
      var padding = 56;
      canvas.width = width;
      var context = canvas.getContext("2d");
      if (!context) {
        nativeApp.showMessage("Could not prepare the order image.");
        return;
      }

      context.font = "700 26px Arial, sans-serif";
      var titleLines = wrapText(context, title || "Order preview", width - padding * 2);
      context.font = "18px Arial, sans-serif";
      var itemLines = page.items.map(function (item) {
        return wrapText(context, item, width - padding * 2 - 54);
      });
      var contentHeight = itemLines.reduce(function (sum, lines) { return sum + lines.length * 34 + 18; }, 0);
      canvas.height = 340 + titleLines.length * 38 + contentHeight;

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.textBaseline = "top";
      context.fillStyle = "#0f2340";
      context.font = "700 30px Arial, sans-serif";
      context.fillText("OrderIT", padding, 40);
      context.fillStyle = "#687386";
      context.font = "16px Arial, sans-serif";
      context.fillText("SHOP ORDER", padding, 82);
      context.strokeStyle = "#e4e8ee";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(padding, 116);
      context.lineTo(width - padding, 116);
      context.stroke();

      var y = 144;
      context.fillStyle = "#1c1f26";
      context.font = "700 26px Arial, sans-serif";
      titleLines.forEach(function (line) {
        context.fillText(line, padding, y);
        y += 38;
      });
      context.fillStyle = "#687386";
      context.font = "17px Arial, sans-serif";
      context.fillText(String(status || "Saved on this device"), padding, y + 4);
      y += 48;
      context.fillStyle = "#0f2340";
      context.font = "700 18px Arial, sans-serif";
      context.fillText("Products · " + cleanItems.length, padding, y);
      y += 38;

      page.items.forEach(function (_item, itemIndex) {
        var absoluteIndex = page.offset + itemIndex + 1;
        context.fillStyle = "#687386";
        context.font = "18px Arial, sans-serif";
        context.fillText(String(absoluteIndex) + ".", padding, y);
        context.fillStyle = "#1c1f26";
        context.font = "18px Arial, sans-serif";
        itemLines[itemIndex].forEach(function (line) {
          context.fillText(line, padding + 48, y);
          y += 34;
        });
        y += 18;
      });

      context.strokeStyle = "#e4e8ee";
      context.beginPath();
      context.moveTo(padding, canvas.height - 74);
      context.lineTo(width - padding, canvas.height - 74);
      context.stroke();
      context.fillStyle = "#687386";
      context.font = "15px Arial, sans-serif";
      var pageLabel = pages.length > 1 ? " · Page " + (pageIndex + 1) + " of " + pages.length : "";
      context.fillText("Generated on this device · " + new Date().toLocaleString() + pageLabel, padding, canvas.height - 54);

      canvas.toBlob(function (blob) {
        if (!blob) {
          nativeApp.showMessage("Could not prepare the order image.");
          return;
        }
        var url = URL.createObjectURL(blob);
        var link = document.createElement("a");
        var suffix = pages.length > 1 ? "-page-" + (pageIndex + 1) + "-of-" + pages.length : "";
        link.href = url;
        link.download = (filenameBase || "order-preview") + suffix + ".png";
        link.click();
        URL.revokeObjectURL(url);
      }, "image/png");
    });
  }

  function addOfflineImageActions() {
    if (!offlineShell) return;

    document.querySelectorAll("#app section.card").forEach(function (card) {
      var heading = card.querySelector("h2");
      if (!heading || heading.textContent.trim().toLowerCase() !== "review order") return;
      var actions = card.querySelector(".actions");
      if (!actions || actions.querySelector("[data-native-offline-image='review']")) return;
      var button = document.createElement("button");
      button.type = "button";
      button.className = "button secondary";
      button.textContent = "Save image";
      button.setAttribute("data-native-offline-image", "review");
      button.addEventListener("click", function () {
        var items = Array.from(card.querySelectorAll("ol li")).map(function (item) { return item.textContent.trim(); });
        saveOfflineOrderImage("Order preview", "Preview · Not yet submitted", items, "order-preview");
      });
      actions.appendChild(button);
    });

    document.querySelectorAll("#app article.order-card").forEach(function (card) {
      if (card.querySelector("[data-native-offline-image='saved']")) return;
      var title = card.querySelector(".order-title");
      var badge = card.querySelector(".badge");
      var productList = card.querySelector(".order-items");
      if (!productList) return;
      var actions = card.querySelector(".actions");
      if (!actions) {
        actions = document.createElement("div");
        actions.className = "actions";
        card.appendChild(actions);
      }
      var button = document.createElement("button");
      button.type = "button";
      button.className = "button secondary small";
      button.textContent = "Save image";
      button.setAttribute("data-native-offline-image", "saved");
      button.addEventListener("click", function () {
        var orderTitle = title ? title.textContent.trim() : "Saved order";
        var orderStatus = badge ? badge.textContent.trim() : "Saved on this device";
        var items = productList.textContent.split(" · ").map(function (item) { return item.trim(); }).filter(Boolean);
        var filename = orderTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "saved-order";
        saveOfflineOrderImage(orderTitle, orderStatus, items, filename);
      });
      actions.appendChild(button);
    });
  }

  function tidyShopUi() {
    document.querySelectorAll('a[href^="/register"]').forEach(function (link) {
      var parent = link.parentElement;
      link.remove();
      if (parent && /new shop|register your shop/i.test(parent.textContent || "")) parent.remove();
    });

    document.querySelectorAll("a").forEach(function (link) {
      var label = (link.textContent || "").trim();
      if (/^(full app|open full app)$/i.test(label)) link.remove();
    });

    document.querySelectorAll("button").forEach(function (button) {
      var label = (button.textContent || "").trim();
      if (/^(share|generate pdf|preparing\.\.\.|generating\.\.\.)$/i.test(label)) {
        button.style.display = "none";
      }
    });

    document.querySelectorAll('[role="status"]').forEach(function (status) {
      var label = (status.textContent || "").trim();
      if (/^✓?\s*(?:\d+\s+)?images? saved$/i.test(label)) status.style.display = "none";
    });

    addOfflineImageActions();
  }

  tidyShopUi();
  new MutationObserver(tidyShopUi).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  var originalFetch = window.fetch.bind(window);
  function requestPath(input) {
    try {
      var url = typeof input === "string" ? input : input.url;
      return new URL(url, location.href).pathname;
    } catch (_) {
      return "";
    }
  }

  window.fetch = function (input, init) {
    var path = requestPath(input);
    var request = originalFetch(input, init);
    if (path !== "/api/auth/login") return request;

    return request.then(async function (response) {
      if (!response.ok) return response;
      var payload;
      try {
        payload = await response.clone().json();
      } catch (_) {
        return response;
      }
      var role = payload && payload.user && payload.user.role;
      if (role === "ADMIN") {
        originalFetch("/api/auth/logout", { method: "POST" }).catch(function () {});
        nativeApp.allowShopUi();
        return new Response(JSON.stringify({ error: "This app is for shop accounts only." }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (role === "SHOP") nativeApp.allowShopUi();
      return response;
    });
  };

  async function verifyShopSession() {
    if (offlineShell) {
      nativeApp.allowShopUi();
      return;
    }

    var loginPage = location.pathname === "/login";
    try {
      var response = await originalFetch("/api/auth/me", { cache: "no-store" });
      if (response.ok) {
        var payload = await response.json();
        var role = payload && payload.user && payload.user.role;
        if (role === "SHOP") {
          nativeApp.allowShopUi();
          if (loginPage) location.replace("/");
          return;
        }
        if (role === "ADMIN") {
          await originalFetch("/api/auth/logout", { method: "POST" }).catch(function () {});
          if (!loginPage) {
            location.replace("/login");
            return;
          }
          nativeApp.allowShopUi();
          return;
        }
      }
      if (loginPage) nativeApp.allowShopUi();
      else location.replace("/login");
    } catch (_) {
      if (loginPage) nativeApp.allowShopUi();
      else location.replace("/login");
    }
  }

  verifyShopSession();
})();
