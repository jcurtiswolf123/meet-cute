import SwiftUI
import WebKit

/// One route, drawn as a native screen.
///
/// The web view itself is owned by `WebViewStore` and outlives this view, so a
/// tab switch is a tab switch and not a reload. What is here is the chrome
/// around it: the thin progress line, pull to refresh, and the error state,
/// because a blank white web view with a WebKit error string in it is the
/// difference between "no signal" and "the app is broken".
struct WebScreen: UIViewRepresentable {
    let key: String
    let url: URL
    @Binding var isLoading: Bool
    @Binding var failure: String?

    @Environment(AppState.self) private var app

    func makeUIView(context: Context) -> WKWebView {
        let view = app.web.view(for: key, url: url)
        context.coordinator.attach(to: view, key: key, store: app.web)
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {
        context.coordinator.onState = { loading, error in
            // Written on the next runloop turn: SwiftUI refuses a state write
            // made while it is in the middle of updating this view.
            DispatchQueue.main.async {
                isLoading = loading
                failure = error
            }
        }
    }

    func makeCoordinator() -> Refresher { Refresher() }

    /// Pull to refresh, and the bridge between the navigator's callbacks and
    /// SwiftUI state.
    @MainActor
    final class Refresher: NSObject {
        var onState: ((Bool, String?) -> Void)?
        private weak var store: WebViewStore?
        private var key: String = ""
        private let control = UIRefreshControl()

        func attach(to view: WKWebView, key: String, store: WebViewStore) {
            self.key = key
            self.store = store
            guard view.scrollView.refreshControl == nil else { return }
            control.tintColor = UIColor(hex: 0x67635D)
            control.addTarget(self, action: #selector(pulled), for: .valueChanged)
            view.scrollView.refreshControl = control

            store.observe(key: key) { [weak self] loading, error in
                if !loading { self?.control.endRefreshing() }
                self?.onState?(loading, error)
            }
        }

        @objc private func pulled() {
            store?.reload(key: key)
        }
    }
}

/// The full-bleed container: web view, a hairline progress bar while it loads,
/// and the failure state over the top when there is nothing to show.
struct WebTab: View {
    let key: String
    let url: URL
    var background: Color = Theme.cream

    @Environment(AppState.self) private var app
    @State private var isLoading = true
    @State private var failure: String?

    var body: some View {
        ZStack(alignment: .top) {
            background.ignoresSafeArea()

            // The web view stops at the safe area rather than running under the
            // tab bar. Letting the page slide beneath it is the prettier idea
            // and it does not survive contact: the floating bar on iOS 26 is
            // glass, and sampling a WKWebView layer through it smeared a pink
            // ghost of the selected tab out past the left edge of the bar,
            // plus a refracted scrap of whatever the page had down there. The
            // band of `background` under the bar costs nothing and reads clean.
            WebScreen(key: key, url: url, isLoading: $isLoading, failure: $failure)
                .opacity(failure == nil ? 1 : 0)

            if isLoading {
                ProgressView()
                    .progressViewStyle(.linear)
                    .tint(Theme.oxblood)
                    .frame(height: 2)
                    .transition(.opacity)
            }

            if let failure {
                FailureView(message: failure) {
                    self.failure = nil
                    app.web.reload(key: key)
                }
            }
        }
        .animation(Theme.ease, value: isLoading)
        .onAppear { app.web.navigate(key: key, to: url) }
    }
}

struct FailureView: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: Theme.Space.md) {
            Text("This did not load")
                .displayType(28)
                .foregroundStyle(Theme.ink)
            Text(message)
                .font(Theme.body(15))
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 320)
            Button(action: retry) {
                Text("Try again")
                    .font(Theme.body(15, weight: .medium))
                    .foregroundStyle(Theme.cream)
                    .padding(.horizontal, Theme.Space.lg)
                    .padding(.vertical, 12)
                    .background(Theme.ink, in: Capsule())
            }
            .pressable()
            .padding(.top, Theme.Space.sm)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(Theme.Space.lg)
        .background(Theme.cream)
    }
}
