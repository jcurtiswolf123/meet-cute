import SwiftUI
import WebKit
import Observation

/// What `/api/mobile/session` answered.
struct SessionInfo: Codable, Equatable {
    var signedIn: Bool
    var personId: String?
    var name: String?
    var email: String?
    var status: String?
    var isOperator: Bool?
    var isSuperAdmin: Bool?
    var hasApplied: Bool?
    var startedApplication: Bool?
    var avatarUrl: String?

    static let signedOut = SessionInfo(signedIn: false)

    var operatorAccess: Bool { isOperator == true }
    var displayName: String { name?.isEmpty == false ? name! : (email ?? "Member") }
}

enum LoadPhase: Equatable {
    case loading
    case ready
    case offline(String)
}

/// The one piece of state the native shell owns.
///
/// Everything a member or an operator actually does happens inside the web
/// views, which hold the real session cookie. This object exists to answer the
/// three questions the native chrome has to answer before it can draw: is
/// anybody signed in, may they see the studio, and which backend are we
/// pointed at. It reads them from the same cookie jar the web views use, so
/// there is one session and not two.
@Observable
@MainActor
final class AppState {
    private(set) var session: SessionInfo = .signedOut
    private(set) var phase: LoadPhase = .loading

    var backend: Backend = .production {
        didSet {
            guard oldValue != backend else { return }
            UserDefaults.standard.set(backend.rawValue, forKey: Keys.backend)
            // A cookie is scoped to a host, so switching backends does not leak
            // a session across them. The web views do have to be thrown away
            // and rebuilt against the new origin.
            web.reset()
            Task { await refresh() }
        }
    }

    /// Every web view in the app, and the cookie jar they share.
    let web = WebViewStore()

    private enum Keys {
        static let backend = "mutuals.backend"
    }

    init() {
        if let raw = UserDefaults.standard.string(forKey: Keys.backend), let b = Backend(rawValue: raw) {
            // Unless it cannot work from here. A phone left on Local dev with
            // no address configured resolves to localhost:3009, which is the
            // phone itself: every launch fails to reach a server that does not
            // exist, and the only way out is a Settings screen behind a shell
            // that state never draws. The stored choice is corrected rather
            // than merely overridden, so it does not come back next launch.
            if b.isUsableHere {
                backend = b
            } else {
                backend = .production
                UserDefaults.standard.set(Backend.production.rawValue, forKey: Keys.backend)
            }
        } else if Backend.bakedLocalHost != nil {
            // A build that was told at compile time where the Mac is, is a
            // build made to talk to that Mac. Starting it on production would
            // show the missing-endpoints screen and make somebody go looking
            // through Settings on a phone to fix something we already knew.
            backend = .local
        }
        web.backend = backend
    }

    // MARK: - Session

    /// Ask the server who this cookie belongs to.
    ///
    /// Deliberately goes through the web view's cookie store rather than a
    /// bare URLSession: the session cookie is httpOnly and lives in
    /// `WKWebsiteDataStore.default()`, so a URLSession of its own would always
    /// see a signed-out app.
    func refresh() async {
        web.backend = backend
        let cookies = await web.cookies(for: backend.host)

        var request = URLRequest(url: .on(backend, "/api/mobile/session"))
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = 15
        if !cookies.isEmpty {
            for (header, value) in HTTPCookie.requestHeaderFields(with: cookies) {
                request.setValue(value, forHTTPHeaderField: header)
            }
        }

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse else {
                phase = .offline("Mutuals answered unexpectedly. Try again.")
                return
            }
            guard (200..<300).contains(http.statusCode) else {
                // 404 is the specific, likely case and worth naming: the app is
                // pointed at a deployment that predates /api/mobile/session, so
                // no amount of retrying will help until that ships.
                phase = .offline(
                    http.statusCode == 404
                        ? "\(backend.host) is running a build without the app endpoints. Deploy the branch that adds /api/mobile, or switch to Local dev in Settings."
                        : "Mutuals answered \(http.statusCode). Try again."
                )
                return
            }
            session = try JSONDecoder().decode(SessionInfo.self, from: data)
            phase = .ready
        } catch {
            phase = .offline(friendlyMessage(for: error))
        }
    }

    func signOut() async {
        // Clear the cookie server-side where possible, then locally regardless,
        // so a failed request cannot leave a signed-in app that looks signed
        // out or the other way round.
        var request = URLRequest(url: .on(backend, "/api/mobile/logout"))
        request.httpMethod = "POST"
        request.setValue("ios", forHTTPHeaderField: "X-Mutuals-Client")
        for (header, value) in HTTPCookie.requestHeaderFields(with: await web.cookies(for: backend.host)) {
            request.setValue(value, forHTTPHeaderField: header)
        }
        _ = try? await URLSession.shared.data(for: request)
        await web.clearCookies()
        web.reset()
        session = .signedOut
        phase = .ready
    }

    private func friendlyMessage(for error: Error) -> String {
        let ns = error as NSError
        switch ns.code {
        case NSURLErrorNotConnectedToInternet:
            return "No connection."
        case NSURLErrorTimedOut:
            return "Mutuals took too long to answer."
        case NSURLErrorCannotFindHost, NSURLErrorCannotConnectToHost:
            // The port comes off the origin. This used to append :3009 to
            // whatever host was set, so a phone pointed at a session worktree
            // on :3060 was told nothing was listening on :3009, which is true
            // and useless.
            // Three things fail this way and only one of them is the server.
            // The quiet one is iOS local network permission: a phone talking to
            // a Mac on the same wifi needs it, a denial looks exactly like a
            // dead server, and there is no second prompt once it is refused.
            return backend == .local
                ? "Cannot reach \(backend.authority). Check that `npm run dev` is running on the Mac, that this phone is on the same wifi, and that Mutuals is allowed Local Network access in Settings, Privacy and Security."
                : "Cannot reach hellomutuals.com."
        default:
            return "Something went wrong reaching Mutuals."
        }
    }
}
