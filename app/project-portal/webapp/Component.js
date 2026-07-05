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

      this._resetStaleTableLayout();
      this._addTopBar();
      this._guardAuditTab();
    },

    // Keep the table on its annotation default every load. Variant management
    // is OFF (manifest: variantManagement "None"), but Fiori Elements' flexi-
    // bility layer (sap.ui.fl / LREP / p13n) can still cache a stale column
    // layout in local/sessionStorage that hid the new "Completeness" column and
    // reapplied it on refresh + after re-login. We clear those cache keys on
    // EVERY load so the table always renders the default —
    // ID · Project · Completeness · IT Owner · Phase. There is no saved user
    // variant to preserve, so this is safe. Our own e2e-* keys are left intact.
    _resetStaleTableLayout: function () {
      try {
        [localStorage, sessionStorage].forEach(function (store) {
          if (!store) { return; }
          var kill = [];
          for (var i = 0; i < store.length; i++) {
            var k = store.key(i);
            if (!k || k.indexOf("e2e-") === 0) { continue; } // keep our auth keys
            if (/flex|variant|p13n|personali|sap\.ui\.fl|LREP/i.test(k)) {
              kill.push(k);
            }
          }
          kill.forEach(function (k) { store.removeItem(k); });
        });
      } catch (e) { /* storage disabled — nothing to clean */ }
    },

    // Two DOM tweaks that must keep re-applying as Fiori Elements re-renders
    // (on navigation / scroll / section lazy-load), both run from ONE
    // rAF-debounced MutationObserver so they never storm the main thread:
    //   1. Hide the Manager-only "Change History" tab for non-managers.
    //   2. Colour every completeness progress bar (header + section bars on the
    //      Object Page) red → green by %, matching the List Report column.
    //      FE's native DataPoint bars render neutral grey otherwise.
    _guardAuditTab: function () {
      // Admin inherits every Manager capability (incl. the audit trail).
      var role = sessionStorage.getItem("e2e-user-role");
      var isManager = role === "Manager" || role === "Admin";

      var hide = function () {
        if (isManager) { return; } // managers keep the Change History tab
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

      // Colour every progress bar on the page by its percentage. We read the
      // rendered aria-valuenow (0..100) that UI5 puts on the ProgressIndicator,
      // so it works for both the header "Overall Complete" and the 6 section
      // bars — none of which we could reach with an annotation-side colour.
      var bandColor = function (v) {
        return v < 20 ? "#d20a0a"        // red
             : v < 40 ? "#e8730c"        // orange
             : v < 60 ? "#e0a800"        // yellow
             : v < 80 ? "#7dbd3a"        // light green
             : "#0a7d33";                // green
      };
      var paintBars = function () {
        var pis = document.querySelectorAll(".sapMPI");
        pis.forEach(function (pi) {
          var now = pi.getAttribute("aria-valuenow");
          if (now === null) {
            var inner = pi.querySelector("[aria-valuenow]");
            now = inner && inner.getAttribute("aria-valuenow");
          }
          if (now === null || now === undefined || now === "") { return; }
          var v = Number(now);
          if (isNaN(v)) { return; }
          var bar = pi.querySelector(".sapMPIBar");
          if (bar) { bar.style.backgroundColor = bandColor(v); }
        });
      };

      // Hide the ROLE-based Project actions (Create / Delete) from Employees.
      // These are Manager/Admin-only, but Fiori Elements ignores the server's
      // @UI.CreateHidden/@UI.DeleteHidden path values on the root List Report, so
      // we hide them here by their stable control ids. The IT-Owner–only Edit
      // button is handled server-side (@UI.UpdateHidden), and the Risks section's
      // own Add/Delete buttons (different ids) are left intact so an owner can
      // still manage risks on their project. The server still enforces the rules.
      var hideRoleButtons = function () {
        if (isManager) { return; } // Manager & Admin keep Create/Delete
        var sels = [
          '[id$="LineItem::StandardAction::Create"]',            // List Report: Create
          '[id$="LineItem::StandardAction::Delete"]',            // List Report: Delete
          '[id$="ProjectsObjectPage--fe::StandardAction::Delete"]' // Object Page header: Delete
        ];
        sels.forEach(function (s) {
          document.querySelectorAll(s).forEach(function (btn) { btn.style.display = "none"; });
        });
      };

      var apply = function () { hide(); paintBars(); hideRoleButtons(); };

      // Run now and keep enforcing it as the user navigates between projects
      // (the Object Page re-renders its bars/tab bar on each navigation).
      //
      // IMPORTANT: coalesce mutations with requestAnimationFrame so we run at
      // most once per frame. Running the full-DOM queries on EVERY mutation
      // stormed the main thread during scroll / section lazy-load and made the
      // Object Page feel janky and "empty then loads".
      apply();
      var scheduled = false;
      var run = function () { scheduled = false; apply(); };
      var root = document.getElementById("rootComponentContainer") || document.body;
      var mo = new MutationObserver(function () {
        if (scheduled) { return; }
        scheduled = true;
        window.requestAnimationFrame(run);
      });
      mo.observe(root, { childList: true, subtree: true });
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

      // Right: Portfolio Health (all roles) + (manager-only) Manage Lists + user
      var health = document.createElement("button");
      health.id = "e2ePortfolioHealth";
      health.textContent = "Portfolio Health";
      health.style.cssText =
        "padding:5px 12px;font-size:13px;font-weight:600;color:#fff;cursor:pointer;" +
        "background:rgba(255,255,255,0.14);border:1px solid rgba(255,255,255,0.5);border-radius:6px;";
      health.onclick = function () {
        window.location.href = "../../portfolio-health/webapp/index.html";
      };

      // Manage Lists — Manager & Admin (Admin ⊇ Manager).
      var manage = null;
      if (role === "Manager" || role === "Admin") {
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

      // Users & Roles — Admin only.
      var users = null;
      if (role === "Admin") {
        users = document.createElement("button");
        users.id = "e2eUsers";
        users.textContent = "Users";
        users.style.cssText =
          "padding:5px 12px;font-size:13px;font-weight:600;color:#fff;cursor:pointer;" +
          "background:rgba(255,255,255,0.14);border:1px solid rgba(255,255,255,0.5);border-radius:6px;";
        users.onclick = function () {
          window.location.href = "../../users-admin/webapp/index.html";
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
      bar.appendChild(health);
      if (manage) { bar.appendChild(manage); }
      if (users) { bar.appendChild(users); }
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
