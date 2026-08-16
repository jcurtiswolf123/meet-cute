import SwiftUI

@main
struct MutualsApp: App {
    @State private var app = AppState()

    init() {
        Appearance.apply()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(app)
                .tint(Theme.oxblood)
                .preferredColorScheme(.light)
        }
    }
}

/// The UIKit surfaces SwiftUI does not reach: the tab bar, the navigation bar,
/// and the scroll edge appearance behind them.
///
/// Set once at launch rather than per screen, because a tab bar that changes
/// material between the member app and the studio reads as two different apps
/// rather than two modes of one.
enum Appearance {
    static func apply() {
        let cream = UIColor(hex: 0xF4F1EA)
        let ink = UIColor(hex: 0x171714)
        let muted = UIColor(hex: 0x67635D)
        let line = UIColor(hex: 0xD2CDC3)

        let nav = UINavigationBarAppearance()
        nav.configureWithOpaqueBackground()
        nav.backgroundColor = cream
        nav.shadowColor = line
        nav.titleTextAttributes = [
            .foregroundColor: ink,
            .font: UIFont.systemFont(ofSize: 17, weight: .semibold),
        ]
        UINavigationBar.appearance().standardAppearance = nav
        UINavigationBar.appearance().scrollEdgeAppearance = nav
        UINavigationBar.appearance().compactAppearance = nav
        UINavigationBar.appearance().tintColor = ink

        let tab = UITabBarAppearance()
        tab.configureWithOpaqueBackground()
        tab.backgroundColor = cream
        tab.shadowColor = line
        UITabBar.appearance().standardAppearance = tab
        UITabBar.appearance().scrollEdgeAppearance = tab
        UITabBar.appearance().unselectedItemTintColor = muted

        UITableView.appearance().backgroundColor = cream
    }
}
