import Foundation

/// Which Mutuals the app is talking to.
///
/// Two, on purpose. Production is the live roster and is the default. Local is
/// `npm run dev` on the Mac, which is a throwaway database with every outbound
/// provider key blanked, and is the only place it is safe to tap through a
/// flow that emails somebody. The switch is in Settings and the current one is
/// named on that screen, because a build that silently pointed at production
/// would be indistinguishable from one that did not.
enum Backend: String, CaseIterable, Identifiable {
    case production
    case local

    var id: String { rawValue }

    var title: String {
        switch self {
        case .production: "Production"
        case .local: "Local dev"
        }
    }

    var subtitle: String {
        switch self {
        case .production: "hellomutuals.com, the live roster"
        case .local: "npm run dev on your Mac, throwaway data"
        }
    }

    var origin: URL {
        switch self {
        case .production:
            return URL(string: "https://hellomutuals.com")!
        case .local:
            // The simulator shares the Mac's localhost; a real phone does not,
            // so it needs the Mac's address on the network. Set in Settings, or
            // MUTUALS_LOCAL_HOST in the scheme. A port may be included;
            // `npm run dev` listens on 3009 and a session worktree gets its own.
            let raw = ProcessInfo.processInfo.environment["MUTUALS_LOCAL_HOST"]
                ?? UserDefaults.standard.string(forKey: "localHost")
                ?? "localhost"
            let host = raw.contains(":") ? raw : "\(raw):3009"
            return URL(string: "http://\(host)") ?? URL(string: "http://localhost:3009")!
        }
    }

    var host: String { origin.host ?? "" }
}

extension URL {
    /// A path on a backend. Resolved rather than appended, because half of
    /// these carry a query string and `appendingPathComponent` would escape the
    /// `?` into the path.
    static func on(_ backend: Backend, _ path: String) -> URL {
        URL(string: path, relativeTo: backend.origin)?.absoluteURL ?? backend.origin
    }
}
