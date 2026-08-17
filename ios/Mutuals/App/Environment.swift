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
            let raw = Backend.configuredLocalHost ?? "localhost"
            let host = raw.contains(":") ? raw : "\(raw):3009"
            return URL(string: "http://\(host)") ?? URL(string: "http://localhost:3009")!
        }
    }

    /// Baked in at build time for a build that is going onto a phone, so the
    /// first launch already knows where the Mac is instead of asking somebody
    /// to type an IP address into Settings on a device. Empty in every other
    /// build, which is why this is nil rather than "".
    static var bakedLocalHost: String? {
        guard
            let raw = Bundle.main.object(forInfoDictionaryKey: "MutualsLocalHost") as? String,
            !raw.trimmingCharacters(in: .whitespaces).isEmpty
        else { return nil }
        return raw
    }

    /// Where Local dev actually points, or nil if nobody has said.
    ///
    /// The three sources in the order they win, with empty treated as unset:
    /// the scheme's `MUTUALS_LOCAL_HOST`, the address typed into Settings, and
    /// the one baked in at build time. Nil is the honest answer for a build
    /// that was never told, and it is what lets the app refuse to sit on Local
    /// dev on a device where `localhost` is the phone itself.
    static var configuredLocalHost: String? {
        for candidate in [
            ProcessInfo.processInfo.environment["MUTUALS_LOCAL_HOST"],
            UserDefaults.standard.string(forKey: "localHost"),
            bakedLocalHost,
        ] {
            if let value = candidate?.trimmingCharacters(in: .whitespaces), !value.isEmpty {
                return value
            }
        }
        return nil
    }

    /// Whether this backend can be reached from the machine the app is on.
    ///
    /// Local dev with nothing configured resolves to `localhost:3009`, which on
    /// the simulator is the Mac and on a phone is the phone. There is no server
    /// there, there never will be, and a build stuck on it shows "cannot reach
    /// localhost:3009" on every launch with the only way out buried in
    /// Settings. Production is always reachable in the sense that matters here:
    /// it is a real host on the internet.
    var isUsableHere: Bool {
        switch self {
        case .production:
            return true
        case .local:
            #if targetEnvironment(simulator)
            return true
            #else
            return Backend.configuredLocalHost != nil
            #endif
        }
    }

    var host: String { origin.host ?? "" }

    /// Host and port, the way somebody would type it into a browser. What the
    /// connection errors should name: the host alone is missing the half that
    /// is usually wrong.
    var authority: String {
        guard let port = origin.port else { return host }
        return "\(host):\(port)"
    }
}

extension URL {
    /// A path on a backend. Resolved rather than appended, because half of
    /// these carry a query string and `appendingPathComponent` would escape the
    /// `?` into the path.
    static func on(_ backend: Backend, _ path: String) -> URL {
        URL(string: path, relativeTo: backend.origin)?.absoluteURL ?? backend.origin
    }
}
