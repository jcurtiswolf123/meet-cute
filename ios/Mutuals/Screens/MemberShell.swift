import SwiftUI

/// What a member sees.
///
/// Three tabs, matching the member items in the web app's sidebar, because
/// the member surface is deliberately small: matching is operator-led and
/// email-first, so there is no browse feed and no roster of other members to
/// put a fifth tab in front of.
struct MemberShell: View {
    @Environment(AppState.self) private var app
    @State private var selection: MemberTab = .home
    @State private var showSettings = false

    enum MemberTab: String, CaseIterable, Hashable {
        case home, connections, profile

        var title: String {
            switch self {
            case .home: "Mutuals"
            case .connections: "Connections"
            case .profile: "Profile"
            }
        }

        var label: String {
            switch self {
            case .home: "Home"
            case .connections: "Connections"
            case .profile: "Profile"
            }
        }

        var icon: String {
            switch self {
            case .home: "house"
            case .connections: "heart"
            case .profile: "person"
            }
        }

        var path: String {
            switch self {
            case .home: "/app"
            case .connections: "/app/connections"
            case .profile: "/app/profile"
            }
        }
    }

    var body: some View {
        TabView(selection: tabBinding) {
            ForEach(MemberTab.allCases, id: \.self) { tab in
                NavigationStack {
                    WebTab(key: "member.\(tab.rawValue)", url: .on(app.backend, tab.path))
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
                if next == selection {
                    app.web.scrollToTop(key: "member.\(next.rawValue)")
                } else {
                    selection = next
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
