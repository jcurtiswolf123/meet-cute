import Foundation
import WebKit
import UIKit

/// Navigation policy and the bridge, for one web view.
///
/// The rule it enforces: a Mutuals URL stays in the app, and everything else
/// leaves. A member tapping a venue's booking link should get Safari, with the
/// address bar showing them whose site they are on; a member tapping their own
/// Connections link should not.
@MainActor
final class WebNavigator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    private weak var store: WebViewStore?

    /// Read by the SwiftUI wrapper to draw the progress bar and the error state.
    var onStateChange: ((Bool, String?) -> Void)?

    init(store: WebViewStore) {
        self.store = store
    }

    private func isOurs(_ url: URL) -> Bool {
        guard let host = url.host, let store else { return false }
        return host == store.backend.host
    }

    // MARK: - Navigation

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }

        switch url.scheme?.lowercased() {
        case "http", "https":
            if isOurs(url) {
                decisionHandler(.allow)
            } else {
                // Somebody else's site. It opens outside, where the address bar
                // says whose it is.
                decisionHandler(.cancel)
                store?.onExternalURL?(url)
            }
        case "mailto", "tel", "sms", "facetime":
            decisionHandler(.cancel)
            UIApplication.shared.open(url)
        case "mutuals":
            decisionHandler(.cancel)
        default:
            // blob: and data: are how a download starts (the data export on
            // /app/settings). Let WebKit have them.
            decisionHandler(.allow)
        }
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        onStateChange?(true, nil)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        onStateChange?(false, nil)
    }

    func webView(
        _ webView: WKWebView,
        didFail navigation: WKNavigation!,
        withError error: Error
    ) {
        report(error)
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        report(error)
    }

    private func report(_ error: Error) {
        let ns = error as NSError
        // -999 is a navigation the app itself cancelled, which happens on every
        // external link above and is not a failure to show anybody.
        if ns.domain == NSURLErrorDomain && ns.code == NSURLErrorCancelled {
            onStateChange?(false, nil)
            return
        }
        onStateChange?(false, ns.localizedDescription)
    }

    // MARK: - UI delegate

    /// `target="_blank"`. There are no windows here, so load it in place when it
    /// is ours and hand it outside when it is not.
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = navigationAction.request.url {
            if isOurs(url) {
                webView.load(URLRequest(url: url))
            } else {
                store?.onExternalURL?(url)
            }
        }
        return nil
    }

    // MARK: - Bridge

    /// WebKit calls this on the main thread, always. `assumeIsolated` states
    /// that rather than hopping through a Task, which would let a `haptic()` on
    /// a tap land a frame or two after the tap it belongs to.
    nonisolated func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        MainActor.assumeIsolated {
            guard let body = message.body as? [String: Any],
                  let name = body["name"] as? String
            else { return }
            let payload = body["payload"] as? [String: Any] ?? [:]

            switch name {
            case "haptic":
                Haptics.play(payload["kind"] as? String ?? "light")
            case "share":
                if let raw = payload["url"] as? String, let url = URL(string: raw) {
                    store?.onShare?(url, payload["title"] as? String)
                }
            case "external":
                if let raw = payload["url"] as? String, let url = URL(string: raw) {
                    store?.onExternalURL?(url)
                }
            case "session":
                store?.onSessionChanged?()
            default:
                break
            }
        }
    }
}

enum Haptics {
    @MainActor
    static func play(_ kind: String) {
        switch kind {
        case "success":
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        case "warning":
            UINotificationFeedbackGenerator().notificationOccurred(.warning)
        case "error":
            UINotificationFeedbackGenerator().notificationOccurred(.error)
        case "heavy":
            UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
        case "selection":
            UISelectionFeedbackGenerator().selectionChanged()
        default:
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }
    }
}
