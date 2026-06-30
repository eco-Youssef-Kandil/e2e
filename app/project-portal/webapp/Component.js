sap.ui.define([
  "sap/fe/core/AppComponent"
], function (AppComponent) {
  "use strict";

  return AppComponent.extend("projectportal.Component", {
    metadata: {
      manifest: "json"
    },

    init: function () {
      // Inject the chosen demo account's Basic-Auth header into every OData
      // request, so Fiori Elements runs authenticated without the browser's
      // native login popup. The token was set by login.html in sessionStorage.
      var token = sessionStorage.getItem("e2e-auth");
      if (!token) {
        window.location.replace("login.html");
        return;
      }
      var oModel = this.getModel();
      if (oModel && oModel.changeHttpHeaders) {
        oModel.changeHttpHeaders({ Authorization: token });
      }

      AppComponent.prototype.init.apply(this, arguments);

      this._addTopBar();
      this._guardAuditTab();
    },

    // The audit log ("Change History") is Manager-only. The data is already
    // protected server-side (employees get 403), so here we simply hide the
    // tab from non-managers on the Object Page so they never see a dead tab.
    _guardAuditTab: function () {
      if (sessionStorage.getItem("e2e-user-role") === "Manager") {
        return; // managers keep the tab
      }
      var hide = function () {
        // The Object Page renders its sections as an IconTabBar (.sapMITBItem).
        // Hide the tab whose text is exactly "Change History", plus the matching
        // section in the "expanded" (anchor) layout, for non-managers.
        var tabTexts = document.querySelectorAll(".sapMITBText, .sapMITHTextContent");
        tabTexts.forEach(function (span) {
          if (/^Change History$/i.test((span.innerText || span.textContent || "").trim())) {
            var item = span.closest(".sapMITBItem");
            if (item) { item.style.display = "none"; }
          }
        });
        // Anchor-bar layout (when the page is wide / sections are inline).
        var anchors = document.querySelectorAll(".sapUxAPAnchorBarButton, .sapUxAPObjectPageSection");
        anchors.forEach(function (el) {
          if (/^Change History$/i.test((el.innerText || el.textContent || "").trim())) {
            el.style.display = "none";
          }
        });
      };
      // Run now and keep enforcing it as the user navigates between projects
      // (the Object Page re-renders its anchor bar on each navigation).
      hide();
      var mo = new MutationObserver(function () { hide(); });
      mo.observe(document.body, { childList: true, subtree: true });
    },

    // A solid branded header bar at the very top of the page. It is a real
    // layout band (not an overlay): the app content is pushed down below it,
    // so it never collides with the Fiori filter bar. Holds a context-aware
    // "Back to Projects" link, the app title, the current user, and Sign out.
    _addTopBar: function () {
      if (document.getElementById("e2eTopBar")) {
        return;
      }
      var that = this;
      var BAR_H = 48;
      // NADEC brand: white + royal blue from the logo (#0033A0).
      var NADEC_BLUE = "#0033A0";
      var NADEC_BLUE_2 = "#002673";
      var name = sessionStorage.getItem("e2e-user-name") || "";
      var role = sessionStorage.getItem("e2e-user-role") || "";

      var bar = document.createElement("div");
      bar.id = "e2eTopBar";
      bar.style.cssText =
        "position:fixed;top:0;left:0;right:0;height:" + BAR_H + "px;z-index:1000;" +
        "display:flex;align-items:center;gap:12px;padding:0 16px;box-sizing:border-box;" +
        "background:linear-gradient(135deg," + NADEC_BLUE + "," + NADEC_BLUE_2 + ");" +
        "color:#fff;box-shadow:0 2px 4px rgba(0,0,0,0.18);" +
        "font-family:'72','72full',Arial,sans-serif;font-size:13px;";

      // Left: back link (hidden on the list page)
      var back = document.createElement("button");
      back.id = "e2eBack";
      back.textContent = "← Projects";
      back.style.cssText =
        "display:none;padding:5px 12px;font-size:13px;font-weight:600;color:#fff;" +
        "cursor:pointer;background:rgba(255,255,255,0.14);" +
        "border:1px solid rgba(255,255,255,0.5);border-radius:6px;";
      back.onclick = function () {
        that._navToList();
      };

      // Center: app title
      var title = document.createElement("span");
      title.textContent = "NADEC E2E Delivery Governance";
      title.style.cssText = "font-weight:600;font-size:15px;letter-spacing:0.3px;white-space:nowrap;";

      // Spacer pushes the user block to the right edge
      var spacer = document.createElement("div");
      spacer.style.cssText = "flex:1 1 auto;";

      // Right: (manager-only) Manage Lists + user + sign out
      var manage = null;
      if (role === "Manager") {
        manage = document.createElement("button");
        manage.id = "e2eManageLists";
        manage.textContent = "Manage Lists";
        manage.style.cssText =
          "padding:5px 12px;font-size:13px;font-weight:600;color:#fff;cursor:pointer;" +
          "background:rgba(255,255,255,0.14);border:1px solid rgba(255,255,255,0.5);border-radius:6px;";
        manage.onclick = function () {
          // Same origin / same browser tab session → the auth header in
          // sessionStorage carries over to the admin page.
          window.location.href = "../../admin-lists/webapp/index.html";
        };
      }

      var who = document.createElement("span");
      who.textContent = name + (role ? " · " + role : "");
      who.style.cssText = "opacity:0.85;font-size:13px;white-space:nowrap;";
      var out = document.createElement("button");
      out.textContent = "Sign out";
      out.style.cssText =
        "padding:5px 14px;font-size:13px;font-weight:600;color:" + NADEC_BLUE + ";cursor:pointer;" +
        "background:#fff;border:1px solid #fff;border-radius:6px;";
      out.onclick = function () {
        sessionStorage.removeItem("e2e-auth");
        sessionStorage.removeItem("e2e-user-name");
        sessionStorage.removeItem("e2e-user-role");
        window.location.replace("login.html");
      };

      bar.appendChild(back);
      bar.appendChild(title);
      bar.appendChild(spacer);
      if (manage) { bar.appendChild(manage); }
      bar.appendChild(who);
      bar.appendChild(out);
      document.body.appendChild(bar);

      // Reserve space for the fixed bar at the BODY level (via a stylesheet
      // rule, which UI5 cannot overwrite during relayout) so neither the list
      // filter bar nor the object-page sticky header slides underneath it.
      var styleId = "e2eTopBarOffset";
      if (!document.getElementById(styleId)) {
        var st = document.createElement("style");
        st.id = styleId;
        st.textContent =
          "html, body { height: 100%; margin: 0; box-sizing: border-box; }" +
          "body#content { padding-top: " + BAR_H + "px !important; }" +
          "#rootComponentContainer { height: 100% !important; }";
        document.head.appendChild(st);
      }

      // Toggle the back link based on the URL hash: it shows whenever we are
      // on an object page (hash contains "Projects(") and hides on the list.
      function syncBack() {
        var onObjectPage = /Projects\(/.test(window.location.hash);
        back.style.display = onObjectPage ? "inline-block" : "none";
      }
      window.addEventListener("hashchange", syncBack);
      syncBack();
    },

    // Navigate from an object page back to the list report.
    _navToList: function () {
      try {
        var proxy = this.getRouterProxy && this.getRouterProxy();
        if (proxy && proxy.navToHome) {
          proxy.navToHome();
          return;
        }
      } catch (e) { /* fall through */ }
      // Fallback: clear the hash so the default (list) route loads.
      window.location.hash = "";
    },

    // A small fixed "Sign out" control in the page corner. Lives outside the
    // sap.fe control tree so it works regardless of the shell template.
    _addLogoutButton: function () {
      if (document.getElementById("e2eLogout")) {
        return;
      }
      var name = sessionStorage.getItem("e2e-user-name") || "";
      var role = sessionStorage.getItem("e2e-user-role") || "";
      var bar = document.createElement("div");
      bar.id = "e2eLogout";
      bar.style.cssText =
        "position:fixed;top:8px;right:12px;z-index:9999;display:flex;align-items:center;" +
        "gap:10px;font-family:'72',Arial,sans-serif;font-size:13px;";
      var who = document.createElement("span");
      who.textContent = name + (role ? " (" + role + ")" : "");
      who.style.cssText = "color:#fff;opacity:0.95;";
      var btn = document.createElement("button");
      btn.textContent = "Sign out";
      btn.style.cssText =
        "padding:5px 12px;font-size:12px;font-weight:600;color:#fff;cursor:pointer;" +
        "background:rgba(255,255,255,0.18);border:1px solid rgba(255,255,255,0.5);border-radius:6px;";
      btn.onclick = function () {
        sessionStorage.removeItem("e2e-auth");
        sessionStorage.removeItem("e2e-user-name");
        sessionStorage.removeItem("e2e-user-role");
        window.location.replace("login.html");
      };
      bar.appendChild(who);
      bar.appendChild(btn);
      document.body.appendChild(bar);
    }
  });
});
