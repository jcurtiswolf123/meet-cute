import SwiftUI

/// What a member sees.
///
/// Five tabs. Three of them (home, connections, profile) are the member items
/// in the web app's sidebar. Refer earns one because putting a friend forward
/// is the only thing a member does that grows the roster, and it was reachable
/// from the app only by typing a URL. The rest live behind More, which is a
/// native list rather than a web page, so dinners, coaching, and settings are
/// one tap from anywhere instead of buried in a sheet.
struct MemberShell: View {
    @Environment(AppState.self) private var app
    @State private var selection: MemberTab = .home
    @State private var showSettings = false

    enum MemberTab: String, CaseIterable, Hashable {
        case home, connections, refer, profile, more

        var title: String {
            switch self {
            case .home: "Mutuals"
            case .connections: "Connections"
            case .refer: "Refer"
            case .profile: "Profile"
            case .more: "More"
            }
        }

        var label: String {
            switch self {
            case .home: "Home"
            case .connections: "Connections"
            case .refer: "Refer"
            case .profile: "Profile"
            case .more: "More"
            }
        }

        var icon: String {
            switch self {
            case .home: "house"
            case .connections: "heart"
            case .refer: "person.badge.plus"
            case .profile: "person"
            case .more: "ellipsis"
            }
        }

        /// More is native, so it has no route of its own.
        var path: String? {
            switch self {
            case .home: "/app"
            case .connections: "/app/connections"
            case .refer: "/refer"
            case .profile: "/app/profile"
            case .more: nil
            }
        }
    }

    var body: some View {
        TabView(selection: tabBinding) {
            ForEach(MemberTab.allCases, id: \.self) { tab in
                NavigationStack {
                    Group {
                        if let path = tab.path {
                            WebTab(key: "member.\(tab.rawValue)", url: .on(app.backend, path))
                        } else {
                            MemberMore(showSettings: $showSettings)
                        }
                    }
                    .navigationTitle(tab.title)
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar { toolbar }
                    .toolbarBackground(Theme.cream, for: .navigationBar)
                    .toolbarBackground(.visible, for: .navigationBar)
                }
                .tabItem { Label(tab.label, systemImage: tab.icon) }
                .tag(tab)
            }
        }
        .tint(Theme.oxblood)
        .sheet(isPresented: $showSettings) { SettingsSheet() }
    }

    /// Tapping the tab you are already on scrolls that tab to the top, which is
    /// the one iOS convention a web view inside a tab bar breaks by default.
    private var tabBinding: Binding<MemberTab> {
        Binding(
            get: { selection },
            set: { next in
                if next == selection, next.path != nil {
                    app.web.scrollToTop(key: "member.\(next.rawValue)")
                } else if next != selection {
                    selection = next
                    Haptics.play("selection")
                }
            }
        )
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Button {
                showSettings = true
            } label: {
                Image(systemName: "ellipsis.circle")
                    .foregroundStyle(Theme.ink)
            }
            .accessibilityLabel("Settings")
        }
    }
}

/// The rest of the member app, as a native list.
///
/// Same call as the studio's More: a route that is visited occasionally does
/// not earn a tab, but it does have to be findable without knowing the URL.
struct MemberMore: View {
    @Binding var showSettings: Bool
    @Environment(AppState.self) private var app

    private struct Route: Identifiable {
        let id: String
        let title: String
        let subtitle: String
        let icon: String
        var path: String { id }
    }

    private let evenings: [Route] = [
        .init(id: "/dinners", title: "Dinners", subtitle: "Tables you can put your name down for", icon: "fork.knife"),
        .init(id: "/coaching", title: "Coaching", subtitle: "A session before the introduction, if you want one", icon: "sparkles"),
    ]

    var body: some View {
        List {
            Section("Evenings") {
                ForEach(evenings) { route in row(route) }
            }

            Section {
                NavigationLink {
                    WebTab(key: "member.settings", url: .on(app.backend, "/app/settings"))
                        .navigationTitle("Settings and privacy")
                        .navigationBarTitleDisplayMode(.inline)
                } label: {
                    Label {
                        Text("Settings and privacy").foregroundStyle(Theme.ink)
                    } icon: {
                        Image(systemName: "lock").foregroundStyle(Theme.muted)
                    }
                }
                Button { showSettings = true } label: {
                    Label("Account", systemImage: "person.crop.circle").foregroundStyle(Theme.ink)
                }
            } footer: {
                Text(verbatim: "Signed in as \(app.session.displayName).")
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.cream)
    }

    private func row(_ route: Route) -> some View {
        NavigationLink {
            WebTab(key: "member.route.\(route.id)", url: .on(app.backend, route.path))
                .navigationTitle(route.title)
                .navigationBarTitleDisplayMode(.inline)
        } label: {
            Label {
                VStack(alignment: .leading, spacing: 2) {
                    Text(route.title).font(Theme.body(16, weight: .medium)).foregroundStyle(Theme.ink)
                    Text(route.subtitle).font(Theme.body(12)).foregroundStyle(Theme.muted)
                }
            } icon: {
                Image(systemName: route.icon).foregroundStyle(Theme.muted)
            }
        }
    }
}
