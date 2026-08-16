// Injected into every page at document start, before anything renders.
//
// Two jobs. It tells the stylesheet it is inside the app, which is what hides
// the web sidebar and the web mobile header so the native tab bar is not
// sitting under a second set of the same controls. And it hands the page a
// small, explicit surface for the few things only the native side can do.
//
// Deliberately small. Everything a member or an operator does is still ordinary
// web navigation; this is not a place to move product logic.
(function () {
  "use strict";

  var root = document.documentElement;
  root.setAttribute("data-native", "ios");

  function post(name, payload) {
    try {
      window.webkit.messageHandlers.mutuals.postMessage({
        name: name,
        payload: payload || {},
      });
    } catch {
      /* Running in a normal browser. Every caller below degrades to nothing. */
    }
  }

  window.mutuals = {
    isNative: true,
    platform: "ios",

    /** A tap that committed to something: an introduction sent, a vouch. */
    haptic: function (kind) {
      post("haptic", { kind: kind || "light" });
    },

    /** The system share sheet, for a link worth passing to a friend. */
    share: function (url, title) {
      post("share", { url: url || window.location.href, title: title || document.title });
    },

    /** Open a URL outside the app (a booking link, a venue's own site). */
    openExternal: function (url) {
      post("external", { url: url });
    },

    /** The shell re-reads /api/mobile/session. Call after a sign-in or a role
     *  change, so the tab bar is rebuilt without waiting for a cold start. */
    sessionChanged: function () {
      post("session", {});
    },

    /** Title for the native navigation bar, when the page knows better than
     *  <title> does. */
    setTitle: function (title) {
      post("title", { title: title });
    },
  };

  // The sign-in page and the studio sign-in page both end at a session cookie
  // that the shell has to notice. Watching for the URL leaving /login is more
  // reliable than asking every one of those pages to call sessionChanged.
  var lastPath = location.pathname;
  function watchPath() {
    if (location.pathname === lastPath) return;
    var wasAuth = /^\/(login|studio\/login|auth\/verify)/.test(lastPath);
    lastPath = location.pathname;
    if (wasAuth) post("session", {});
  }
  ["pushState", "replaceState"].forEach(function (method) {
    var original = history[method];
    history[method] = function () {
      var result = original.apply(this, arguments);
      watchPath();
      return result;
    };
  });
  window.addEventListener("popstate", watchPath);
  window.addEventListener("pageshow", watchPath);
})();
