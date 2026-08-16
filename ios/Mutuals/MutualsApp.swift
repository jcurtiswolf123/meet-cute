import SwiftUI
import WebKit

// A native shell around hellomutuals.com.
//
// This is a WKWebView, not a rewrite. The studio and the member app are server
// rendered and change every week; a second native implementation of them would
// be a second thing to keep correct. What the shell buys over the home-screen
// PWA is a real app icon, a launch image, and a session that survives in the
// app's own cookie jar.
//
// Read ios/README.md before touching this. The signing team is a free personal
// team, so a build installed from here stops launching after seven days and
// cannot be given to anybody else.

@main
struct MutualsApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
                // The web pages paint their own cream; matching it here stops a
                // white flash between launch and first paint.
                .background(Color(red: 0.957, green: 0.945, blue: 0.918))
                .preferredColorScheme(.light)
        }
    }
}

struct RootView: View {
    @StateObject private var model = WebModel()

    var body: some View {
        ZStack {
            Color(red: 0.957, green: 0.945, blue: 0.918).ignoresSafeArea()

            WebView(model: model)
                // The page draws its own safe-area padding via env(safe-area-*),
                // so the web view takes the whole screen and the CSS decides
                // what sits under the notch.
                .ignoresSafeArea(.container, edges: [.top, .bottom])

            if model.failed {
                OfflineView { model.reload() }
            }
        }
    }
}

/// Shown when the web view could not load at all. The site has its own offline
/// page, but that one is served by the service worker and needs a previous
/// successful visit; this covers the very first launch with no network.
struct OfflineView: View {
    let retry: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("No connection")
                .font(.system(size: 30, weight: .regular, design: .serif))
            Text("Mutuals needs the network. Your matches and introductions live on the server, not on this phone.")
                .font(.system(size: 16))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Button(action: retry) {
                Text("Try again")
                    .font(.system(size: 16, weight: .semibold))
                    .padding(.horizontal, 24)
                    .padding(.vertical, 12)
                    .background(Color(red: 0.09, green: 0.09, blue: 0.08))
                    .foregroundStyle(Color(red: 0.957, green: 0.945, blue: 0.918))
                    .clipShape(Capsule())
            }
            .padding(.top, 8)
        }
        .padding(32)
        .frame(maxWidth: 420, alignment: .leading)
        .background(Color(red: 0.957, green: 0.945, blue: 0.918))
    }
}

final class WebModel: ObservableObject {
    @Published var failed = false
    weak var webView: WKWebView?

    static let start = URL(string: "https://hellomutuals.com/app")!
    static let allowedHost = "hellomutuals.com"

    func reload() {
        failed = false
        guard let webView else { return }
        if webView.url == nil {
            webView.load(URLRequest(url: Self.start))
        } else {
            webView.reload()
        }
    }
}

struct WebView: UIViewRepresentable {
    @ObservedObject var model: WebModel

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        // The default data store is already persistent, which is the point:
        // the 30-day session cookie has to survive the app being killed, or
        // every launch is another sign-in.
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.backgroundColor = UIColor(red: 0.957, green: 0.945, blue: 0.918, alpha: 1)
        webView.isOpaque = false

        let refresh = UIRefreshControl()
        refresh.addTarget(context.coordinator, action: #selector(Coordinator.pullToRefresh(_:)), for: .valueChanged)
        webView.scrollView.refreshControl = refresh

        model.webView = webView
        webView.load(URLRequest(url: WebModel.start))
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(model: model) }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        let model: WebModel
        init(model: WebModel) { self.model = model }

        @objc func pullToRefresh(_ sender: UIRefreshControl) {
            model.webView?.reload()
        }

        // Anything that is not Mutuals goes to Safari: a venue's booking page,
        // a member's Instagram, a mailto. Those are somebody else's site and
        // should not be able to render inside the app's session.
        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let url = navigationAction.request.url else {
                decisionHandler(.allow)
                return
            }
            let scheme = url.scheme?.lowercased() ?? ""
            if scheme == "mailto" || scheme == "tel" || scheme == "sms" {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }
            let host = url.host?.lowercased() ?? ""
            let isOurs = host == WebModel.allowedHost || host.hasSuffix("." + WebModel.allowedHost)
            if navigationAction.navigationType == .linkActivated && !isOurs && (scheme == "http" || scheme == "https") {
                UIApplication.shared.open(url)
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
        }

        // target="_blank" has no window to open into inside a shell, so it
        // loads in place rather than silently doing nothing.
        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            if navigationAction.targetFrame == nil, let url = navigationAction.request.url {
                let host = url.host?.lowercased() ?? ""
                if host == WebModel.allowedHost || host.hasSuffix("." + WebModel.allowedHost) {
                    webView.load(navigationAction.request)
                } else {
                    UIApplication.shared.open(url)
                }
            }
            return nil
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            webView.scrollView.refreshControl?.endRefreshing()
            model.failed = false
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            webView.scrollView.refreshControl?.endRefreshing()
            model.failed = true
        }

        func webView(
            _ webView: WKWebView,
            didFailProvisionalNavigation navigation: WKNavigation!,
            withError error: Error
        ) {
            webView.scrollView.refreshControl?.endRefreshing()
            // -999 is "a newer navigation replaced this one", which is normal
            // and is not a failure worth showing anybody.
            if (error as NSError).code != NSURLErrorCancelled {
                model.failed = true
            }
        }
    }
}
