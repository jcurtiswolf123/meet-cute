import Foundation
import WebKit
import Observation

/// Every web view in the app, kept alive across tab switches, plus the one
/// cookie jar they all share.
///
/// Two reasons this is a store rather than a view that makes its own web view.
/// A `WKWebView` rebuilt on every tab switch reloads the page, which on a
/// studio route is half a second of cross-region queries to show something the
/// operator was already looking at. And the session lives in a cookie: the
/// member tabs, the studio tabs, and the session probe in `AppState` all have
/// to be the same jar, or signing in on one tab leaves the others signed out.
@MainActor
final class WebViewStore {
    /// Shared by construction: every web view is made with this configuration,
    /// so `WKWebsiteDataStore.default()` is the single persistent cookie jar.
    private var views: [String: WKWebView] = [:]
    private var coordinators: [String: WebNavigator] = [:]

    var backend: Backend = .production

    /// Anything the shell wants to do in response to the page: open an outside
    /// link, share, or report that the session changed under it.
    var onExternalURL: ((URL) -> Void)?
    var onShare: ((URL, String?) -> Void)?
    var onSessionChanged: (() -> Void)?

    func view(for key: String, url: URL) -> WKWebView {
        if let existing = views[key] { return existing }

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true

        let controller = WKUserContentController()
        controller.addUserScript(
            WKUserScript(source: Self.bridgeSource, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        )
        let navigator = WebNavigator(store: self)
        controller.add(navigator, name: "mutuals")
        configuration.userContentController = controller

        let view = WKWebView(frame: .zero, configuration: configuration)
        // The web app reads this to hide its own sidebar and mobile header, so
        // the native tab bar is not sitting under a second one. See the
        // [data-native="ios"] block in globals.css.
        view.customUserAgent = Self.userAgent
        view.allowsBackForwardNavigationGestures = true
        view.scrollView.contentInsetAdjustmentBehavior = .always
        view.isOpaque = false
        view.backgroundColor = UIColor(hex: 0xF4F1EA)
        view.scrollView.backgroundColor = UIColor(hex: 0xF4F1EA)
        view.navigationDelegate = navigator
        view.uiDelegate = navigator

        views[key] = view
        coordinators[key] = navigator
        view.load(URLRequest(url: url))
        return view
    }

    /// Loading and failure state for one tab, forwarded to whatever is drawing
    /// the chrome around it.
    func observe(key: String, _ handler: @escaping (Bool, String?) -> Void) {
        coordinators[key]?.onStateChange = handler
    }

    /// Send an already-live tab somewhere, without rebuilding it.
    func navigate(key: String, to url: URL) {
        guard let view = views[key] else { return }
        if view.url == url { return }
        view.load(URLRequest(url: url))
    }

    func reload(key: String) {
        guard let view = views[key] else { return }
        if view.url == nil {
            view.reload()
        } else {
            view.reloadFromOrigin()
        }
    }

    func scrollToTop(key: String) {
        guard let view = views[key] else { return }
        view.scrollView.setContentOffset(
            CGPoint(x: 0, y: -view.scrollView.adjustedContentInset.top),
            animated: true
        )
    }

    /// Throw every web view away. Used when the backend changes or on sign-out,
    /// where keeping a rendered page from the previous session on screen is the
    /// one thing that must not happen.
    func reset() {
        for view in views.values {
            view.stopLoading()
            view.navigationDelegate = nil
            view.uiDelegate = nil
            view.configuration.userContentController.removeAllUserScripts()
            view.configuration.userContentController.removeScriptMessageHandler(forName: "mutuals")
        }
        views.removeAll()
        coordinators.removeAll()
    }

    /// Burn a one-time sign-in link and keep the session it creates.
    ///
    /// Loaded in a web view rather than a URLSession on purpose: `/auth/verify`
    /// answers with a `Set-Cookie` and a redirect, and the cookie has to land in
    /// `WKWebsiteDataStore.default()`, which is the jar every tab and the
    /// session probe read. A URLSession would take the cookie into a store
    /// nothing else can see, and the link is single-use, so the second attempt
    /// would fail.
    func consumeSignInLink(_ url: URL, completion: @escaping () -> Void) {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.customUserAgent = Self.userAgent

        let navigator = WebNavigator(store: self)
        var finished = false
        navigator.onStateChange = { [weak self] loading, _ in
            guard !loading, !finished else { return }
            finished = true
            self?.authView = nil
            self?.authNavigator = nil
            completion()
        }
        view.navigationDelegate = navigator

        authView = view
        authNavigator = navigator
        view.load(URLRequest(url: url))
    }

    private var authView: WKWebView?
    private var authNavigator: WebNavigator?

    func cookies(for host: String) async -> [HTTPCookie] {
        await warmCookieStore()
        let matches = matching(host, in: await WKWebsiteDataStore.default().httpCookieStore.allCookies())
        if !matches.isEmpty || warmedOnce { return matches }

        // First read of the process and the jar came back empty. That is the
        // answer for somebody who is genuinely signed out, and a lie for
        // somebody who is not: WebKit answers `allCookies()` from an empty
        // in-memory store until its network process has finished reading the
        // jar off disk, which lands a few hundred milliseconds into launch.
        // Believing the early answer signed a member out on every cold start.
        warmedOnce = true
        for _ in 0..<10 {
            try? await Task.sleep(for: .milliseconds(100))
            let retry = matching(host, in: await WKWebsiteDataStore.default().httpCookieStore.allCookies())
            if !retry.isEmpty { return retry }
        }
        return []
    }

    private func matching(_ host: String, in cookies: [HTTPCookie]) -> [HTTPCookie] {
        cookies.filter { cookie in
            let domain = cookie.domain.hasPrefix(".") ? String(cookie.domain.dropFirst()) : cookie.domain
            return host == domain || host.hasSuffix(".\(domain)")
        }
    }

    /// Asking for data records makes WebKit stand up the network process and
    /// load the jar, which is what the cookie store itself will not wait for.
    private func warmCookieStore() async {
        guard !warmed else { return }
        warmed = true
        _ = await WKWebsiteDataStore.default().dataRecords(ofTypes: [WKWebsiteDataTypeCookies])
    }

    private var warmed = false
    private var warmedOnce = false

    func clearCookies() async {
        let store = WKWebsiteDataStore.default()
        let types = WKWebsiteDataStore.allWebsiteDataTypes()
        let records = await store.dataRecords(ofTypes: types)
        await store.removeData(ofTypes: types, for: records)
    }

    // MARK: - Injected pieces

    static let userAgent: String = {
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        // Appended, not replaced: dropping the WebKit token would change how
        // the site's own feature detection and Next's bundling see the browser.
        return "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
            + "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 MutualsiOS/\(version)"
    }()

    /// Loaded from the bundle so the bridge is a real .js file that can be read
    /// and edited, rather than a Swift string literal nobody wants to touch.
    static let bridgeSource: String = {
        guard
            let url = Bundle.main.url(forResource: "bridge", withExtension: "js"),
            let source = try? String(contentsOf: url, encoding: .utf8)
        else {
            // The one line that actually matters, so a missing resource costs
            // the niceties and not the layout.
            return "document.documentElement.setAttribute('data-native','ios');"
        }
        return source
    }()
}
