import SwiftUI
import SafariServices
import UIKit

/// Which of the three things the app is: still asking, signed out, or in.
struct RootView: View {
    @Environment(AppState.self) private var app
    @Environment(\.scenePhase) private var scenePhase

    @State private var externalURL: URL?
    @State private var shareItem: ShareItem?
    @State private var showSettings = false

    var body: some View {
        Group {
            switch app.phase {
            case .loading:
                SplashView()
            case .offline(let message):
                // The way out has to be on this screen. Half the reasons the
                // app cannot reach Mutuals are settings problems (pointed at a
                // deployment without the endpoints, or at a Mac that is not
                // running `npm run dev`), and the settings live behind a shell
                // this state never gets to draw.
                ZStack(alignment: .bottom) {
                    FailureView(message: message) {
                        Task { await app.refresh() }
                    }
                    Button("Change backend") { showSettings = true }
                        .font(Theme.body(15))
                        .foregroundStyle(Theme.muted)
                        .padding(.bottom, Theme.Space.xl)
                }
            case .ready:
                if app.session.signedIn {
                    // An operator gets the studio and nothing else. Every
                    // /app route bounces them to /studio (requireMemberPage in
                    // the web app), so a member mode for an operator was three
                    // tabs of the studio directory wearing member titles.
                    if app.session.operatorAccess {
                        StudioShell()
                    } else {
                        MemberShell()
                    }
                } else {
                    SignInView()
                }
            }
        }
        .task { await app.refresh() }
        .onChange(of: scenePhase) { _, phase in
            // Coming back from Mail with a link tapped, or from a long
            // background where the 30-day session may have been revoked.
            if phase == .active { Task { await app.refresh() } }
        }
        .onOpenURL { url in Task { await open(url) } }
        .onAppear { wireStore() }
        .sheet(isPresented: $showSettings) { SettingsSheet() }
        .sheet(item: $shareItem) { item in
            ShareSheet(items: [item.url])
        }
        .fullScreenCover(item: Binding(
            get: { externalURL.map(IdentifiedURL.init) },
            set: { externalURL = $0?.url }
        )) { wrapped in
            SafariView(url: wrapped.url).ignoresSafeArea()
        }
    }

    /// The web layer talks back through closures rather than knowing about
    /// SwiftUI. This is where they land.
    private func wireStore() {
        app.web.onExternalURL = { url in
            if ["http", "https"].contains(url.scheme?.lowercased() ?? "") {
                externalURL = url
            } else {
                UIApplication.shared.open(url)
            }
        }
        app.web.onShare = { url, _ in shareItem = ShareItem(url: url) }
        app.web.onSessionChanged = { Task { await app.refresh() } }
    }

    /// A universal link or a `mutuals://` link.
    private func open(_ raw: URL) async {
        // `mutuals://studio/applicants` means that path on whichever backend is
        // selected. It is the route in when universal links are not provisioned
        // (a free Apple team cannot have the entitlement), and the one that
        // makes `xcrun simctl openurl` a usable way to walk a flow.
        let url: URL
        if raw.scheme?.lowercased() == "mutuals" {
            // `mutuals://studio/applicants` parses as host "studio", path
            // "/applicants", so both halves have to be put back together.
            var parts: [String] = []
            if let host = raw.host, !host.isEmpty { parts.append(host) }
            let rest = raw.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            if !rest.isEmpty { parts.append(rest) }
            let query = raw.query.map { "?\($0)" } ?? ""
            url = .on(app.backend, "/" + parts.joined(separator: "/") + query)
        } else {
            url = raw
        }

        // A sign-in link is the one that has to be consumed rather than just
        // shown, because clicking it is what creates the session.
        if url.path.hasPrefix("/auth/verify") {
            app.web.consumeSignInLink(url) {
                Task { await app.refresh() }
            }
            return
        }

        guard url.host == app.backend.host else { return }
        // Everything else is a route. Land it in the shell that owns it, which
        // is decided by who is signed in rather than by the path: an operator
        // sent a /app link still ends up in the studio, because that is where
        // the web app will put them.
        if app.session.operatorAccess {
            app.web.navigate(key: "studio.matchmaking", to: url)
        } else {
            app.web.navigate(key: "member.home", to: url)
        }
    }
}

struct SplashView: View {
    var body: some View {
        ZStack {
            Theme.cream.ignoresSafeArea()
            VStack(spacing: Theme.Space.md) {
                Text("Mutuals")
                    .font(Theme.display(40))
                    .foregroundStyle(Theme.ink)
                ProgressView().tint(Theme.muted)
            }
        }
    }
}

private struct IdentifiedURL: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
    init(_ url: URL) { self.url = url }
}

struct ShareItem: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}

/// Somebody else's site, in a browser that shows whose it is.
struct SafariView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        let configuration = SFSafariViewController.Configuration()
        configuration.entersReaderIfAvailable = false
        let controller = SFSafariViewController(url: url, configuration: configuration)
        controller.preferredBarTintColor = UIColor(hex: 0xF4F1EA)
        controller.preferredControlTintColor = UIColor(hex: 0x762D38)
        controller.dismissButtonStyle = .close
        return controller
    }

    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}

struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
