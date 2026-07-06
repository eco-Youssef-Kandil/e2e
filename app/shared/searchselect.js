/**
 * NADEC E2E — shared searchable dropdown enhancer.
 *
 * Automatically upgrades every <select> into a searchable combobox
 * (type-to-filter). The native <select> stays in the DOM as the source of
 * truth: picking an item sets select.value and dispatches a bubbling
 * "change" event, so existing onchange handlers keep working.
 *
 * Opt-out per element:
 *   <select data-nosearch>  never enhanced
 * (Selects are enhanced once they have at least 2 options, so pickers that
 * are populated after a fetch are measured at their real size.)
 *
 * Dynamically created selects (dialogs, rebuilt lists) are picked up via a
 * MutationObserver; programmatic value changes are reflected by a light sync
 * loop.
 */
(function () {
  "use strict";

  var registry = [];
  var openState = null; // { entry, panel, search, list, items, active }

  // ---- Styles ---------------------------------------------------------------
  var css = "" +
    ".ssWrap{display:inline-block;position:relative;vertical-align:middle;max-width:100%}" +
    ".ssDisp{display:inline-flex;align-items:center;justify-content:space-between;gap:8px;" +
      "width:100%;text-align:left;cursor:pointer;background:#fff;color:#1d2d3e;" +
      "font-family:inherit;overflow:hidden}" +
    ".ssDisp .ssTxt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1 1 auto}" +
    ".ssDisp .ssArr{flex:0 0 auto;font-size:10px;color:#5b6b7b}" +
    ".ssDisp:disabled{opacity:.5;cursor:default}" +
    ".ssPanel{position:fixed;z-index:99999;background:#fff;border:1px solid #c6d2dd;" +
      "border-radius:10px;box-shadow:0 10px 30px rgba(13,40,70,.22);display:flex;" +
      "flex-direction:column;overflow:hidden;font-family:\"72\",\"72full\",Arial,Helvetica,sans-serif}" +
    ".ssSearch{margin:8px;padding:7px 10px;font-size:13px;border:2px solid #0033A0;" +
      "border-radius:8px;outline:none;font-family:inherit}" +
    ".ssList{overflow-y:auto;max-height:260px;padding:0 4px 6px}" +
    ".ssItem{padding:7px 10px;font-size:13px;border-radius:7px;cursor:pointer;color:#1d2d3e;" +
      "white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    ".ssItem.ssActive{background:#eaf1fb;color:#0033A0}" +
    ".ssItem.ssSel{font-weight:700;color:#0033A0}" +
    ".ssItem.ssDis{opacity:.45;cursor:default}" +
    ".ssEmpty{padding:10px 12px;font-size:12px;color:#5b6b7b}";
  var styleEl = document.createElement("style");
  styleEl.textContent = css;
  (document.head || document.documentElement).appendChild(styleEl);

  // ---- Helpers ----------------------------------------------------------------
  function shouldEnhance(sel) {
    if (sel.multiple || sel.hasAttribute("data-nosearch") || sel.dataset.ssDone) return false;
    if (sel.hasAttribute("data-search")) return true;
    return sel.options.length >= 2;
  }

  function selectedText(sel) {
    var o = sel.options[sel.selectedIndex];
    return o ? o.textContent : "";
  }

  function copyLook(sel, disp) {
    var cs = window.getComputedStyle(sel);
    ["fontSize", "fontWeight", "paddingTop", "paddingBottom", "paddingLeft", "paddingRight",
     "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
     "borderTopStyle", "borderRightStyle", "borderBottomStyle", "borderLeftStyle",
     "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor",
     "borderTopLeftRadius", "borderTopRightRadius", "borderBottomLeftRadius", "borderBottomRightRadius",
     "color", "backgroundColor", "minWidth", "maxWidth"].forEach(function (p) {
      disp.style[p] = cs[p];
    });
    var wrap = disp.parentNode;
    ["marginTop", "marginRight", "marginBottom", "marginLeft"].forEach(function (p) {
      wrap.style[p] = cs[p];
    });
    if (cs.display === "block" || cs.display === "flex" || cs.display === "grid") {
      wrap.style.display = "block";
    }
    // Preserve responsive widths where possible; fall back to the measured
    // pixel width, or 100% if the select is hidden/zero-width right now.
    var authored = (sel.style.width || "").trim();
    if (authored) {
      wrap.style.width = authored;
    } else if (sel.offsetWidth > 0) {
      var parentW = sel.parentNode === wrap.parentNode ? wrap.parentNode.clientWidth : 0;
      if (parentW > 0 && Math.abs(sel.offsetWidth - parentW) <= 2) {
        wrap.style.width = "100%";
      } else {
        wrap.style.width = sel.offsetWidth + "px";
      }
    } else {
      wrap.style.width = "100%";
    }
  }

  // ---- Enhance one select ------------------------------------------------------
  function enhance(sel) {
    sel.dataset.ssDone = "1";

    var wrap = document.createElement("span");
    wrap.className = "ssWrap";
    var disp = document.createElement("button");
    disp.type = "button";
    disp.className = "ssDisp";
    disp.innerHTML = '<span class="ssTxt"></span><span class="ssArr">▼</span>';
    wrap.appendChild(disp);
    sel.parentNode.insertBefore(wrap, sel);
    copyLook(sel, disp);
    sel.style.display = "none";

    var entry = { sel: sel, wrap: wrap, disp: disp, txt: disp.querySelector(".ssTxt"), lastLabel: null };
    registry.push(entry);
    refreshLabel(entry);

    disp.addEventListener("click", function () {
      if (openState && openState.entry === entry) { closePanel(); } else { openPanel(entry); }
    });
    disp.addEventListener("keydown", function (ev) {
      if (ev.key === "ArrowDown" || ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        openPanel(entry);
      }
    });
  }

  function refreshLabel(entry) {
    var label = selectedText(entry.sel);
    if (label !== entry.lastLabel) {
      entry.lastLabel = label;
      entry.txt.textContent = label || "—";
    }
    entry.disp.disabled = entry.sel.disabled;
  }

  // ---- Panel --------------------------------------------------------------------
  function openPanel(entry) {
    closePanel();
    var sel = entry.sel;

    var panel = document.createElement("div");
    panel.className = "ssPanel";
    var search = document.createElement("input");
    search.type = "text";
    search.className = "ssSearch";
    search.placeholder = "Type to search…";
    search.setAttribute("aria-label", "Search options");
    var list = document.createElement("div");
    list.className = "ssList";
    panel.appendChild(search);
    panel.appendChild(list);
    document.body.appendChild(panel);

    openState = { entry: entry, panel: panel, search: search, list: list, items: [], active: -1 };

    function buildList(filter) {
      list.innerHTML = "";
      openState.items = [];
      openState.active = -1;
      var q = (filter || "").toLowerCase();
      var opts = Array.prototype.slice.call(sel.options);
      opts.forEach(function (o, i) {
        var text = o.textContent;
        if (q && text.toLowerCase().indexOf(q) < 0) return;
        var it = document.createElement("div");
        it.className = "ssItem" + (i === sel.selectedIndex ? " ssSel" : "") + (o.disabled ? " ssDis" : "");
        it.textContent = text || "\u00a0";
        if (!o.disabled) {
          it.addEventListener("mousedown", function (ev) { ev.preventDefault(); });
          it.addEventListener("click", function () { choose(o.value); });
          it.addEventListener("mousemove", function () { setActive(openState.items.indexOf(it)); });
          openState.items.push(it);
        }
        list.appendChild(it);
      });
      if (!list.childNodes.length) {
        var empty = document.createElement("div");
        empty.className = "ssEmpty";
        empty.textContent = "No matches";
        list.appendChild(empty);
      }
      // Pre-highlight the current selection (or first match when filtering)
      var selIdx = openState.items.findIndex(function (n) { return n.classList.contains("ssSel"); });
      setActive(selIdx >= 0 ? selIdx : (q && openState.items.length ? 0 : selIdx));
      if (openState.active >= 0) scrollIntoView(openState.items[openState.active]);
    }

    function setActive(i) {
      if (openState.active >= 0 && openState.items[openState.active]) {
        openState.items[openState.active].classList.remove("ssActive");
      }
      openState.active = i;
      if (i >= 0 && openState.items[i]) openState.items[i].classList.add("ssActive");
    }

    function scrollIntoView(node) {
      if (!node) return;
      var lt = list.scrollTop, lb = lt + list.clientHeight;
      var nt = node.offsetTop, nb = nt + node.offsetHeight;
      if (nt < lt) list.scrollTop = nt;
      else if (nb > lb) list.scrollTop = nb - list.clientHeight;
    }

    function choose(value) {
      sel.value = value;
      refreshLabel(entry);
      closePanel();
      entry.disp.focus();
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }

    search.addEventListener("input", function () { buildList(search.value); });
    search.addEventListener("keydown", function (ev) {
      if (ev.key === "ArrowDown") {
        ev.preventDefault();
        if (openState.items.length) {
          setActive(Math.min(openState.active + 1, openState.items.length - 1));
          scrollIntoView(openState.items[openState.active]);
        }
      } else if (ev.key === "ArrowUp") {
        ev.preventDefault();
        if (openState.items.length) {
          setActive(Math.max(openState.active - 1, 0));
          scrollIntoView(openState.items[openState.active]);
        }
      } else if (ev.key === "Enter") {
        ev.preventDefault();
        var node = openState.items[openState.active];
        if (node) node.click();
      } else if (ev.key === "Escape") {
        ev.preventDefault();
        closePanel();
        entry.disp.focus();
      }
    });

    buildList("");
    position();
    search.focus();

    function position() {
      var r = entry.disp.getBoundingClientRect();
      var width = Math.max(r.width, 230);
      panel.style.width = width + "px";
      panel.style.left = Math.max(6, Math.min(r.left, window.innerWidth - width - 6)) + "px";
      var h = panel.offsetHeight;
      if (r.bottom + 4 + h <= window.innerHeight - 6 || r.top - 4 - h < 6) {
        panel.style.top = (r.bottom + 4) + "px";
      } else {
        panel.style.top = (r.top - 4 - h) + "px";
      }
    }
    openState.position = position;
  }

  function closePanel() {
    if (!openState) return;
    openState.panel.remove();
    openState = null;
  }

  document.addEventListener("mousedown", function (ev) {
    if (!openState) return;
    if (openState.panel.contains(ev.target) || openState.entry.disp.contains(ev.target)) return;
    closePanel();
  });
  window.addEventListener("resize", function () { if (openState) openState.position(); });
  window.addEventListener("scroll", function () { if (openState) openState.position(); }, true);

  // ---- Discovery & sync -----------------------------------------------------------
  function scanAll() {
    Array.prototype.slice.call(document.querySelectorAll("select")).forEach(function (sel) {
      if (shouldEnhance(sel)) enhance(sel);
    });
  }

  setInterval(function () {
    for (var i = registry.length - 1; i >= 0; i--) {
      var e = registry[i];
      if (!document.documentElement.contains(e.sel)) {
        if (openState && openState.entry === e) closePanel();
        e.wrap.remove();
        registry.splice(i, 1);
        continue;
      }
      refreshLabel(e);
    }
  }, 350);

  var scanTimer = null;
  var mo = new MutationObserver(function () {
    if (scanTimer) return;
    scanTimer = setTimeout(function () { scanTimer = null; scanAll(); }, 120);
  });

  function start() {
    scanAll();
    mo.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
