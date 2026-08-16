import SwiftUI

/// What an operator sees.
///
/// Five tabs against the studio's twelve routes, chosen by what a matchmaker
/// does on a phone rather than by mirroring the sidebar: make an introduction,
/// read what came back, clear the applicants, look somebody up. The other seven
/// live behind More, which is a native list and not a web page, so an operator
/// can reach Delivery or the Co-pilot without hunting for a hidden hamburger
/// that the app has already hidden.
struct StudioShell: View {
    @Environment(AppState.self) private var app
    @State private var selection: StudioTab = .matchmaking
    @State private var showSettings = false

    enum StudioTab: String, CaseIterable, Hashable {
        case matchmaking, conversations, applicants, directory, more

        var title: String {
            switch self {
            case .matchmaking: "Matchmaking"
            case .conversations: "Conversations"
            case .applicants: "Applicants"
            case .directory: "Directory"
            case .more: "More"
            }
        }

        /// What the tab bar says, which is not what the screen is called.
        /// Five full titles across an iPhone overlap; the navigation bar still
        /// carries the long form once you are on the screen.
        var label: String {
            switch self {
            case .matchmaking: "Matches"
            case .conversations: "Replies"
            case .applicants: "Applicants"
            case .directory: "People"
            case .more: "More"
            }
        }

        var icon: String {
            switch self {
            case .matchmaking: "sparkles"
            case .conversations: "bubble.left.and.bubble.right"
            case .applicants: "person.badge.clock"
            case .directory: "person.2"
            case .more: "ellipsis"
            }
        }

        var path: String? {
            switch self {
            case .matchmaking: "/studio/matchmaking"
            case .conversations: "/studio/conversations"
            case .applicants: "/studio/applicants"
            case .directory: "/studio"
            case .more: nil
            }
        }
    }

    var body: some View {
        TabView(selection: tabBinding) {
            ForEach(StudioTab.allCases, id: \.self) { tab in
                NavigationStack {
                    Group {
                        if let path = tab.path {
                            WebTab(
                                key: "studio.\(tab.rawValue)",
                                url: .on(app.backend, path),
                                background: Theme.studioCanvas
                            )
                        } else {
                            StudioMore(showSettings: $showSettings)
                        }
                    }
                    .navigationTitle(tab.title)
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbarBackground(Theme.studioSubtle, for: .navigationBar)
                    .toolbarBackground(.visible, for: .navigationBar)
                    .toolbar {
                        ToolbarItem(placement: .topBarTrailing) {
                            Button { showSettings = true } label: {
                                Image(systemName: "ellipsis.circle").foregroundStyle(Theme.ink)
                            }
                            .accessibilityLabel("Settings")
                        }
                    }
                }
                .tabItem { Label(tab.label, systemImage: tab.icon) }
                .tag(tab)
            }
        }
        .tint(Theme.ink)
        .sheet(isPresented: $showSettings) { SettingsSheet() }
    }

    private var tabBinding: Binding<StudioTab> {
        Binding(
            get: { selection },
            set: { next in
                if next == selection, next.path != nil {
                    app.web.scrollToTop(key: "studio.\(next.rawValue)")
                } else if next != selection {
                    selection = next
                    Haptics.play("selection")
                }
            }
        )
    }
}

/// The rest of the studio, as a native list rather than a web page.
struct StudioMore: View {
    @Binding var showSettings: Bool
    @Environment(AppState.self) private var app

    private struct Route: Identifiable {
        let id: String
        let title: String
        let subtitle: String
        let icon: String
        var path: String { id }
    }

    private let workspace: [Route] = [
        .init(id: "/studio/matches", title: "Matches", subtitle: "Every introduction and where it stands", icon: "heart"),
        .init(id: "/studio/pipeline", title: "Status", subtitle: "The roster by stage", icon: "square.grid.3x1.below.line.grid.1x2"),
    ]

    private let manage: [Route] = [
        .init(id: "/studio/delivery", title: "Delivery", subtitle: "The outbox, retries, and failures", icon: "envelope"),
        .init(id: "/studio/events", title: "Events", subtitle: "Dinners and who is coming", icon: "calendar"),
        .init(id: "/studio/venues", title: "Venues", subtitle: "What the date-ideas block may suggest", icon: "fork.knife"),
        .init(id: "/studio/copilot", title: "Co-pilot", subtitle: "Ask for something in words", icon: "wand.and.stars"),
        .init(id: "/studio/team", title: "Team", subtitle: "Operator accounts", icon: "person.badge.key"),
    ]

    var body: some View {
        List {
            Section("Workspace") {
                ForEach(workspace) { route in row(route) }
            }
            Section("Manage") {
                ForEach(manage) { route in row(route) }
            }
            Section {
                Button { showSettings = true } label: {
                    Label("Settings", systemImage: "gearshape").foregroundStyle(Theme.ink)
                }
            } footer: {
                Text("Signed in as \(app.session.displayName).")
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Theme.studioCanvas)
    }

    private func row(_ route: Route) -> some View {
        NavigationLink {
            WebTab(
                key: "studio.route.\(route.id)",
                url: .on(app.backend, route.path),
                background: Theme.studioCanvas
            )
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
