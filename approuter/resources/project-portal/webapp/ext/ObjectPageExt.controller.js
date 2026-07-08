sap.ui.define([
  "sap/ui/core/mvc/ControllerExtension"
], function (ControllerExtension) {
  "use strict";

  // Auto-discard abandoned drafts.
  //
  // Projects are draft-enabled (@odata.draft.enabled). By default SAP Fiori
  // keeps an unsaved draft when you click Edit and then leave without Save or
  // Cancel — so reopening the project drops you back into edit mode, which
  // feels "frozen". We don't want that here: when the user leaves an unsaved
  // draft, we discard it, so the project always reopens in a clean read-only
  // view.
  //
  // Trigger: we watch the URL hash (reliable across every navigation — Back,
  // opening another project, Portfolio Health, sign out) plus browser tab
  // close. While the hash shows an editable DRAFT (IsActiveEntity=false) we keep
  // a handle on that draft's binding context; the instant the hash moves away
  // from it we delete the draft document, reverting the project to its last
  // saved state everywhere.
  return ControllerExtension.extend("projectportal.ext.ObjectPageExt", {

    override: {

      onInit: function () {
        // The draft binding context currently shown on this page (or null).
        this._draftContext = null;

        this._onHashChange = this._handleHashChange.bind(this);
        window.addEventListener("hashchange", this._onHashChange);

        // Tab close / hard refresh while editing → discard too.
        this._onUnload = this._discardNow.bind(this);
        window.addEventListener("beforeunload", this._onUnload);
      },

      onExit: function () {
        window.removeEventListener("hashchange", this._onHashChange);
        window.removeEventListener("beforeunload", this._onUnload);
        if (this._captureTimer) { clearInterval(this._captureTimer); }
      },

      // FE calls this after the page is (re)bound. If we've landed on a draft,
      // grab its context now (and keep retrying briefly, since the binding may
      // resolve a moment after the route settles).
      onAfterBinding: function () {
        this._startCapturing();
      }
    },

    // Repeatedly try to capture the draft context for a short window after the
    // page binds, so we always hold a valid handle before the user leaves.
    _startCapturing: function () {
      var that = this;
      if (this._captureTimer) { clearInterval(this._captureTimer); }
      var tries = 0;
      var grab = function () {
        tries++;
        that._captureDraftContext();
        // Stop once we've captured a draft, or after ~3s of trying.
        if (that._draftContext || tries > 12) {
          clearInterval(that._captureTimer);
          that._captureTimer = null;
        }
      };
      grab();
      this._captureTimer = setInterval(grab, 250);
    },

    // Set _draftContext iff the current binding context is an editable draft.
    _captureDraftContext: function () {
      try {
        var oContext = this.base.getView().getBindingContext();
        var oData = oContext && oContext.getObject();
        if (oData && oData.IsActiveEntity === false) {
          this._draftContext = oContext;
        }
      } catch (e) {
        /* ignore — nothing to capture yet */
      }
    },

    // Hash changed. If we're no longer on the draft we were holding, discard it.
    _handleHashChange: function () {
      var onDraftHash = /IsActiveEntity=false/.test(window.location.hash);
      if (this._draftContext && !onDraftHash) {
        this._deleteContext(this._draftContext);
        this._draftContext = null;
      }
      if (!onDraftHash && this._captureTimer) {
        clearInterval(this._captureTimer);
        this._captureTimer = null;
      }
      // A new draft page may have just loaded — start capturing it.
      if (onDraftHash) {
        this._startCapturing();
      }
    },

    _discardNow: function () {
      this._captureDraftContext();
      if (this._draftContext) {
        this._deleteContext(this._draftContext);
      }
    },

    _deleteContext: function (oContext) {
      try {
        oContext.delete("$auto").catch(function () {
          // Already saved or discarded → deletion is a no-op. Ignore.
        });
      } catch (e) {
        // Never let cleanup break navigation.
      }
    }
  });
});
