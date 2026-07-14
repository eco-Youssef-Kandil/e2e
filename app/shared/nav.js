/**
 * Shared navigation shell for all NADEC E2E pages, styled after the SAP
 * Fiori launchpad: dark navy top bar (hamburger · title · avatar · power)
 * and a docked white left sidebar with grouped, icon-led menu items.
 *
 * Include with:  <script src="/shared/nav.js"></script>
 * Does nothing when the user is not signed in.
 */
(function () {
  "use strict";

  if (!sessionStorage.getItem("e2e-auth")) { return; }
  if (document.getElementById("e2eSideNav")) { return; }

  var role = sessionStorage.getItem("e2e-user-role") || "";
  var name = sessionStorage.getItem("e2e-user-name") || "";
  // e2e role hierarchy: Admin ⊇ Manager ⊇ Employee. An Admin passes every
  // Manager-gated rule (mirrors srv/role-guard.js); only an Admin sees the
  // Users & Roles screen.
  var isManager = role === "Manager" || role === "Admin";
  var isAdmin = role === "Admin";
  var BAR_H = 64;          // taller shell bar (pages were built for 48px)
  var CONTENT_DELTA = BAR_H - 48;
  var NAV_W = 232;
  var NAVY = "#0c2340";
  var BLUE = "#0a6ed1";

  // ---- Icons (inline SVG, stroke = currentColor) -----------------------------
  function svg(paths) {
    return '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
      paths + "</svg>";
  }
  var ICONS = {
    home: svg('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>'),
    chart: svg('<path d="M3 21h18"/><rect x="5" y="12" width="3.4" height="6"/><rect x="10.3" y="7" width="3.4" height="11"/><rect x="15.6" y="10" width="3.4" height="8"/>'),
    route: svg('<circle cx="6" cy="19" r="2.4"/><circle cx="18" cy="5" r="2.4"/><path d="M8.4 19H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.6"/>'),
    pulse: svg('<path d="M3 12h4l2.5-6 4 12 2.5-6h5"/>'),
    handoff: svg('<path d="M4 7h11"/><path d="M11 3l4 4-4 4"/><path d="M20 17H9"/><path d="M13 21l-4-4 4-4"/>'),
    gear: svg('<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.98 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.98a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9A1.7 1.7 0 0 0 10.03 3.09V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.02a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51.94Z"/>'),
    book: svg('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>'),
    users: svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
    alert: svg('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
    sheet: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/>'),
    history: svg('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3.5 2"/>'),
    power: svg('<path d="M12 3v9"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/>')
  };

  // ---- Menu model ---------------------------------------------------------------
  var GROUPS = [
    { header: null, items: [
      { label: "Home", icon: "home", href: "/project-portal/webapp/index.html", match: "/project-portal/" }
    ]},
    { header: "Analytics", items: [
      { label: "Executive Dashboard", icon: "chart", href: "/executive-dashboard/webapp/index.html", match: "/executive-dashboard/" },
      { label: "Project Journey", icon: "route", href: "/project-journey/webapp/index.html", match: "/project-journey/" },
      { label: "Portfolio Health", icon: "pulse", href: "/portfolio-health/webapp/index.html", match: "/portfolio-health/" }
    ]},
    { header: "Delivery", items: [
      { label: "Handover", icon: "handoff", href: "/handover/webapp/index.html", match: "/handover/" },
      { label: "Handover Journey", icon: "route", href: "/handover-journey/webapp/index.html", match: "/handover-journey/" },
      { label: "Project Fields", icon: "book", href: "/project-fields/webapp/index.html", match: "/project-fields/" },
      { label: "Field Gaps", icon: "alert", href: "/field-gaps/webapp/index.html", match: "/field-gaps/" },
      { label: "Excel Import / Export", icon: "sheet", href: "/excel/webapp/index.html", match: "/excel/" }
    ]},
    { header: "Admin", managerOnly: true, items: [
      { label: "Manage Lists", icon: "gear", href: "/admin-lists/webapp/index.html", match: "/admin-lists/", managerOnly: true },
      { label: "Audit Trail", icon: "history", href: "/audit-trail/webapp/index.html", match: "/audit-trail/", managerOnly: true },
      { label: "Users & Roles", icon: "users", href: "/users-admin/webapp/index.html", match: "/users-admin/", adminOnly: true }
    ]},
    { header: "Help", items: [
      { label: "User Guide", icon: "book", href: "/guide/webapp/index.html", match: "/guide/" }
    ]}
  ];

  // ---- Styles ---------------------------------------------------------------------
  var css =
    // Top bars: restyle every known bar to the dark navy shell look.
    "#topBar, #e2eTopBar, #phTopBar, #adminTopBar {" +
    "  background: " + NAVY + " !important;" +
    "  background-image: none !important;" +
    "  height: " + BAR_H + "px !important;" +
    "  padding-left: 14px !important; padding-right: 16px !important;" +
    "  box-shadow: 0 1px 0 rgba(255,255,255,0.08), 0 2px 6px rgba(0,0,0,0.3) !important; }" +
    // Bigger titles to match the taller bar.
    "#topBar .title, #phTopBar .title, #adminTopBar .title { font-size: 18px !important; }" +
    // Content offsets: every page was laid out for a 48px bar, push down by the delta.
    "html body#content { padding-top: " + BAR_H + "px !important; }" +      // UI5 portal
    "#content { padding-top: " + (66 + CONTENT_DELTA) + "px !important; }" + // dashboard + journey
    "#uiArea { padding-top: " + BAR_H + "px !important; }" +                 // portfolio health + admin

    // Old per-page nav buttons are replaced by the sidebar.
    "#e2eExecDashboard, #e2eProjectJourney, #e2ePortfolioHealth, #e2eManageLists { display: none !important; }" +
    // Avatar + power block
    "#e2eShellUser { display: inline-flex; align-items: center; gap: 12px; margin-left: 8px; }" +
    "#e2eShellUser .avatar { width: 38px; height: 38px; border-radius: 50%; background: #dbeafe;" +
    "  color: " + NAVY + "; font-size: 14px; font-weight: 700; display: inline-flex; align-items: center;" +
    "  justify-content: center; letter-spacing: 0.5px; cursor: default;" +
    "  font-family: '72','72full',Arial,Helvetica,sans-serif; }" +
    "#e2eShellPower { width: 40px; height: 40px; border: none; border-radius: 50%; background: transparent;" +
    "  color: #fff; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }" +
    "#e2eShellPower:hover { background: rgba(255,255,255,0.14); }" +
    // Hamburger
    "#e2eNavToggle { width: 42px; height: 42px; flex: 0 0 auto; border: none; border-radius: 8px;" +
    "  background: transparent; color: #fff; cursor: pointer; font-size: 22px; line-height: 1;" +
    "  display: inline-flex; align-items: center; justify-content: center; margin-right: 4px; }" +
    "#e2eNavToggle:hover { background: rgba(255,255,255,0.14); }" +
    "#e2eNavToggle.floating { position: fixed; top: 11px; left: 10px; z-index: 1500; background: " + NAVY + "; }" +
    // Sidebar (docked, below the top bar)
    "#e2eSideNav { position: fixed; top: " + BAR_H + "px; left: 0; bottom: 0; width: " + NAV_W + "px;" +
    "  z-index: 1400; background: #fff; border-right: 1px solid #e2e6ea;" +
    "  box-shadow: 1px 0 4px rgba(20,30,50,0.06); display: flex; flex-direction: column;" +
    "  transform: translateX(-100%); transition: transform 0.2s ease;" +
    "  font-family: '72','72full',Arial,Helvetica,sans-serif; }" +
    "body.e2eNavOpen #e2eSideNav { transform: translateX(0); }" +
    "#e2eSideNav nav { flex: 1 1 auto; overflow-y: auto; padding: 10px 0 6px; }" +
    "#e2eSideNav .snGroup { margin: 2px 0 4px; }" +
    "#e2eSideNav .snHeader { padding: 12px 18px 6px; font-size: 11px; font-weight: 700;" +
    "  letter-spacing: 0.8px; text-transform: uppercase; color: #8a97a5; }" +
    "#e2eSideNav a.snItem, #e2eSideNav button.snItem { display: flex; align-items: center; gap: 12px;" +
    "  width: 100%; padding: 10px 18px; border: none; background: none; text-align: left;" +
    "  color: #1d2d3e; text-decoration: none; font-size: 13.5px; font-weight: 600; cursor: pointer;" +
    "  font-family: inherit; border-left: 3px solid transparent; }" +
    "#e2eSideNav a.snItem:hover, #e2eSideNav button.snItem:hover { background: #f2f6fa; }" +
    "#e2eSideNav a.snItem.active { background: #eaf2fd; color: " + BLUE + "; border-left-color: " + BLUE + "; }" +
    "#e2eSideNav .snIcon { width: 20px; display: inline-flex; justify-content: center; color: inherit; flex: 0 0 auto; }" +
    "#e2eSideNav .snFoot { border-top: 1px solid #e9edf1; padding: 4px 0 8px; }" +
    // Content push (desktop) — transition matches the drawer.
    "body { transition: padding-left 0.2s ease; }" +
    "body.e2eNavOpen { padding-left: " + NAV_W + "px !important; }" +
    // Backdrop only used in narrow (overlay) mode
    "#e2eNavBackdrop { position: fixed; top: " + BAR_H + "px; left: 0; right: 0; bottom: 0; z-index: 1399;" +
    "  background: rgba(10,20,40,0.4); opacity: 0; pointer-events: none; transition: opacity 0.2s ease; }" +
    "@media (max-width: 900px) {" +
    "  body.e2eNavOpen { padding-left: 0 !important; }" +
    "  body.e2eNavOpen #e2eNavBackdrop { opacity: 1; pointer-events: auto; }" +
    "  #e2eSideNav { box-shadow: 4px 0 18px rgba(0,0,0,0.25); }" +
    "}";
  var st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  // ---- Helpers -------------------------------------------------------------------
  function escHtml(s) {
    return String(s === null || s === undefined ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function initials(n) {
    var parts = String(n || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) { return "?"; }
    var s = parts[0].charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : "");
    return s.toUpperCase();
  }
  function signOut() {
    sessionStorage.removeItem("e2e-auth");
    sessionStorage.removeItem("e2e-user-name");
    sessionStorage.removeItem("e2e-user-role");
    sessionStorage.removeItem("e2e-user-email");
    sessionStorage.removeItem("e2e-mode");
    window.location.replace("/project-portal/webapp/login.html");
  }

  // ---- Sidebar --------------------------------------------------------------------
  var path = window.location.pathname;
  var drawer = document.createElement("div");
  drawer.id = "e2eSideNav";
  drawer.setAttribute("role", "navigation");
  drawer.setAttribute("aria-label", "Main navigation");

  var navHtml = GROUPS.filter(function (g) {
    return !g.managerOnly || isManager;
  }).map(function (g) {
    var items = g.items.filter(function (it) {
      return (!it.managerOnly || isManager) && (!it.adminOnly || isAdmin);
    }).map(function (it) {
      var active = path.indexOf(it.match) === 0;
      return '<a class="snItem' + (active ? " active" : "") + '" href="' + escHtml(it.href) + '">' +
        '<span class="snIcon">' + ICONS[it.icon] + "</span>" + escHtml(it.label) + "</a>";
    }).join("");
    var header = g.header ? '<div class="snHeader">' + escHtml(g.header) + "</div>" : "";
    return '<div class="snGroup">' + header + items + "</div>";
  }).join("");

  drawer.innerHTML =
    "<nav>" + navHtml + "</nav>" +
    '<div class="snFoot">' +
      '<button class="snItem" id="e2eNavLogout"><span class="snIcon">' + ICONS.power + "</span>Logout</button>" +
    "</div>";

  var backdrop = document.createElement("div");
  backdrop.id = "e2eNavBackdrop";
  document.body.appendChild(backdrop);
  document.body.appendChild(drawer);
  document.getElementById("e2eNavLogout").onclick = signOut;

  function isOpen() { return document.body.classList.contains("e2eNavOpen"); }
  function setOpen(open) {
    document.body.classList.toggle("e2eNavOpen", open);
    sessionStorage.setItem("e2e-nav-open", open ? "1" : "0");
    var t = document.getElementById("e2eNavToggle");
    if (t) { t.setAttribute("aria-expanded", open ? "true" : "false"); }
  }
  backdrop.onclick = function () { setOpen(false); };
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && window.innerWidth <= 900) { setOpen(false); }
  });
  drawer.addEventListener("click", function (ev) {
    var link = ev.target && ev.target.closest ? ev.target.closest("a.snItem") : null;
    if (link && window.innerWidth <= 900) { setOpen(false); }
  });

  // Initial state: restore last choice; default open on wide screens.
  var saved = sessionStorage.getItem("e2e-nav-open");
  setOpen(saved === null ? window.innerWidth > 900 : saved === "1");

  // ---- Top bar: hamburger + avatar + power -------------------------------------------
  var toggle = document.createElement("button");
  toggle.id = "e2eNavToggle";
  toggle.setAttribute("aria-label", "Toggle menu");
  toggle.setAttribute("aria-expanded", isOpen() ? "true" : "false");
  toggle.innerHTML = "\u2630";
  toggle.onclick = function () { setOpen(!isOpen()); };

  var userBlock = document.createElement("span");
  userBlock.id = "e2eShellUser";
  userBlock.innerHTML =
    '<span class="avatar" title="' + escHtml(name + (role ? " · " + role : "")) + '">' +
      escHtml(initials(name)) + "</span>" +
    '<button id="e2eShellPower" title="Sign out" aria-label="Sign out">' + ICONS.power + "</button>";

  function decorateBar(bar) {
    // Hamburger first.
    bar.insertBefore(toggle, bar.firstChild);
    // Hide legacy "who am I" text, sign-out and back-to-portal buttons: the
    // shell (avatar + power) and the sidebar now own those functions.
    Array.prototype.slice.call(bar.querySelectorAll("button, span")).forEach(function (el) {
      var t = (el.textContent || "").trim();
      if (el.tagName === "BUTTON" && (t === "Sign out" || t === "\u2190 Portal")) {
        el.style.display = "none";
      } else if (el.tagName === "SPAN" && name && t.indexOf(name) === 0) {
        el.style.display = "none";
      } else if (el.tagName === "SPAN" && el.style.fontWeight === "600") {
        // Page title (the portal styles it inline) — scale with the taller bar.
        el.style.fontSize = "18px";
      }
    });
    bar.appendChild(userBlock);
    document.getElementById("e2eShellPower").onclick = signOut;
  }

  var BAR_IDS = ["topBar", "e2eTopBar", "phTopBar", "adminTopBar"];
  function tryMount() {
    for (var i = 0; i < BAR_IDS.length; i++) {
      var bar = document.getElementById(BAR_IDS[i]);
      if (bar) { decorateBar(bar); return true; }
    }
    return false;
  }
  function mount() {
    if (tryMount()) { return; }
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (tryMount()) { clearInterval(iv); }
      else if (tries > 40) { // ~10s — no bar found, float the hamburger
        clearInterval(iv);
        toggle.classList.add("floating");
        document.body.appendChild(toggle);
      }
    }, 250);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
