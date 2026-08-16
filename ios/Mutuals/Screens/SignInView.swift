import SwiftUI
import UIKit

/// Signing in, natively.
///
/// Mutuals has no passwords: an address gets a one-time link, and clicking it
/// is what creates the session. That is a good flow in a browser and an awkward
/// one in an app, because the link opens wherever the system sends it. Two ways
/// in, so it never dead-ends:
///
///  - Universal links. `/auth/verify` is in the app's associated domains, so
///    the link tapped in Mail opens here and the cookie lands in the app's own
///    jar. Needs a paid Apple Developer membership to provision.
///  - The pasted link. Copy it from the email, tap Paste sign-in link. Works on
///    any build, including a free personal team.
struct SignInView: View {
    @Environment(AppState.self) private var app

    @State private var email = ""
    @State private var stage: Stage = .asking
    @State private var problem: String?
    @FocusState private var emailFocused: Bool

    enum Stage: Equatable {
        case asking
        case sending
        case sent
        case opening
    }

    var body: some View {
        ZStack {
            Theme.cream.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Mutuals")
                        .displayType(40)
                        .foregroundStyle(Theme.ink)
                        .padding(.top, Theme.Space.xxl)

                    Text("Meet your friend's friends.")
                        .font(Theme.body(17))
                        .foregroundStyle(Theme.muted)
                        .padding(.top, Theme.Space.sm)

                    Rectangle()
                        .fill(Theme.line)
                        .frame(height: 1)
                        .padding(.vertical, Theme.Space.xl)

                    // Asking and confirming are the same panel showing two
                    // faces, so they cross-fade in place. A push would imply
                    // the person had gone somewhere, and they have not: the
                    // link is in their mail, and they are still here.
                    switch stage {
                    case .asking, .sending:
                        askForm
                            .transition(.asymmetric(
                                insertion: .opacity.combined(with: .offset(y: -8)),
                                removal: .opacity.combined(with: .offset(y: -8))
                            ))
                    case .sent:
                        sentCard
                            .transition(.asymmetric(
                                insertion: .opacity.combined(with: .offset(y: 12)),
                                removal: .opacity
                            ))
                    case .opening:
                        openingCard
                            .transition(.opacity)
                    }

                    Spacer(minLength: Theme.Space.xxl)

                    Button {
                        app.web.onExternalURL?(.on(app.backend, "/apply"))
                    } label: {
                        Text("New here? Apply to join.")
                            .font(Theme.body(14))
                            .foregroundStyle(Theme.muted)
                            .underline()
                    }
                    .padding(.bottom, Theme.Space.lg)
                }
                .padding(.horizontal, Theme.Space.lg)
                .frame(maxWidth: 480, alignment: .leading)
                .frame(maxWidth: .infinity)
                .animation(Theme.enter, value: stage)
            }
        }
        .onOpenURL { url in Task { await handle(url) } }
    }

    // MARK: - Pieces

    @ViewBuilder
    private var askForm: some View {
        Text("Sign in")
            .displayType(28)
            .foregroundStyle(Theme.ink)

        Text("Enter your email and we will send a one-time sign-in link.")
            .font(Theme.body(15))
            .foregroundStyle(Theme.muted)
            .padding(.top, Theme.Space.sm)

        // The placeholder is drawn rather than passed to TextField: SwiftUI
        // paints a system-styled one that ignores the surrounding palette, and
        // it came out in the default blue against cream and oxblood.
        //
        // `verbatim` is load-bearing. Text(_:) runs a string literal through
        // Markdown, which autolinks anything shaped like an address, and a link
        // is painted in the app tint no matter what foregroundStyle says. The
        // placeholder came out oxblood and read as a validation error.
        ZStack(alignment: .leading) {
            if email.isEmpty {
                Text(verbatim: "you@email.com")
                    .font(Theme.body(17))
                    .foregroundStyle(Theme.muted)
                    .allowsHitTesting(false)
            }

            TextField("", text: $email)
                .font(Theme.body(17))
                .foregroundStyle(Theme.ink)
                .tint(Theme.oxblood)
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.go)
                .focused($emailFocused)
                .onSubmit { Task { await send() } }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 13)
        .background(Theme.panel, in: RoundedRectangle(cornerRadius: Theme.Radius.field))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.field)
                .stroke(emailFocused ? Theme.oxblood : Theme.line, lineWidth: emailFocused ? 2 : 1)
        )
        .padding(.top, Theme.Space.lg)

        if let problem {
            Text(problem)
                .font(Theme.body(14))
                .foregroundStyle(Theme.oxblood)
                .padding(.top, Theme.Space.sm)
        }

        Button {
            Task { await send() }
        } label: {
            HStack(spacing: Theme.Space.sm) {
                if stage == .sending { ProgressView().tint(Theme.cream) }
                Text(stage == .sending ? "Sending" : "Send the link")
                    .font(Theme.body(16, weight: .medium))
            }
            .foregroundStyle(looksLikeEmail ? Theme.cream : Theme.muted)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 15)
            // Disabled is an outline, not a greyed fill: a half-opacity ink
            // capsule on cream reads as mud rather than as "not yet".
            .background(looksLikeEmail ? AnyShapeStyle(Theme.ink) : AnyShapeStyle(Color.clear), in: Capsule())
            .overlay(Capsule().stroke(looksLikeEmail ? .clear : Theme.line, lineWidth: 1))
        }
        .disabled(stage == .sending || !looksLikeEmail)
        .pressable()
        .animation(Theme.ease, value: looksLikeEmail)
        .padding(.top, Theme.Space.md)

        pasteButton
            .padding(.top, Theme.Space.md)
    }

    /// Burning the link.
    ///
    /// This used to share the sent card, which reads as nonsense on the paste
    /// route: nothing was sent, and `email` is empty because the address was
    /// never typed, so the screen said "on its way to ." with a full stop where
    /// the address should be.
    @ViewBuilder
    private var openingCard: some View {
        Text("Signing you in")
            .displayType(28)
            .foregroundStyle(Theme.ink)

        HStack(spacing: Theme.Space.sm) {
            ProgressView().tint(Theme.muted)
            Text("One moment.")
                .font(Theme.body(15))
                .foregroundStyle(Theme.muted)
        }
        .padding(.top, Theme.Space.sm)
    }

    @ViewBuilder
    private var sentCard: some View {
        Text("Check your email")
            .displayType(28)
            .foregroundStyle(Theme.ink)

        // Verbatim for the same reason as the placeholder: Markdown would
        // autolink the address and paint it in the tint.
        Text(verbatim: "A sign-in link is on its way to \(email). It expires in 15 minutes and works once.")
            .font(Theme.body(15))
            .foregroundStyle(Theme.muted)
            .padding(.top, Theme.Space.sm)

        VStack(alignment: .leading, spacing: Theme.Space.sm) {
            Text("If tapping the link opens Safari instead of Mutuals, copy it and come back here.")
                .font(Theme.body(13))
                .foregroundStyle(Theme.muted)
            pasteButton
        }
        .padding(Theme.Space.md)
        .background(Theme.panel, in: RoundedRectangle(cornerRadius: Theme.Radius.card))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.card).stroke(Theme.line, lineWidth: 1)
        )
        .padding(.top, Theme.Space.lg)

        Button {
            stage = .asking
            problem = nil
        } label: {
            Text("Use a different address")
                .font(Theme.body(14))
                .foregroundStyle(Theme.muted)
                .underline()
        }
        .padding(.top, Theme.Space.md)
    }

    private var pasteButton: some View {
        Button {
            Task { await pasteLink() }
        } label: {
            HStack(spacing: Theme.Space.sm) {
                if stage == .opening { ProgressView().tint(Theme.ink) }
                Image(systemName: "doc.on.clipboard")
                Text("Paste sign-in link").font(Theme.body(15, weight: .medium))
            }
            .foregroundStyle(Theme.ink)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 13)
            .overlay(Capsule().stroke(Theme.line, lineWidth: 1))
        }
        .disabled(stage == .opening)
        .pressable()
    }

    private var looksLikeEmail: Bool {
        let trimmed = email.trimmingCharacters(in: .whitespaces)
        guard let at = trimmed.firstIndex(of: "@") else { return false }
        return at > trimmed.startIndex && trimmed[trimmed.index(after: at)...].contains(".")
    }

    // MARK: - Actions

    private func send() async {
        guard looksLikeEmail else { return }
        emailFocused = false
        stage = .sending
        problem = nil

        var request = URLRequest(url: .on(app.backend, "/api/mobile/login"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("ios", forHTTPHeaderField: "X-Mutuals-Client")
        request.httpBody = try? JSONEncoder().encode(["email": email.trimmingCharacters(in: .whitespaces)])
        request.timeoutInterval = 20

        do {
            let (data, _) = try await URLSession.shared.data(for: request)
            let reply = try JSONDecoder().decode(LoginReply.self, from: data)
            if reply.ok {
                stage = .sent
                Haptics.play("success")
            } else {
                stage = .asking
                problem = message(for: reply.outcome)
                Haptics.play("error")
            }
        } catch {
            stage = .asking
            problem = "Could not reach Mutuals. Check your connection."
            Haptics.play("error")
        }
    }

    /// Take the sign-in link off the clipboard, when it is one.
    ///
    /// Reads the pasteboard only on a deliberate tap, so iOS shows the paste
    /// banner against an action the person just asked for, and refuses anything
    /// that is not a `/auth/verify` URL on the backend currently selected: a
    /// production link pasted into a build pointed at localhost would silently
    /// burn a single-use token against the wrong host.
    private func pasteLink() async {
        problem = nil
        guard
            let raw = UIPasteboard.general.string?.trimmingCharacters(in: .whitespacesAndNewlines),
            let url = firstURL(in: raw)
        else {
            problem = "There is no link on the clipboard. Copy it from the email first."
            return
        }
        await handle(url)
    }

    private func handle(_ url: URL) async {
        guard url.host == app.backend.host, url.path.hasPrefix("/auth/verify") else {
            problem = "That is not a Mutuals sign-in link for \(app.backend.host)."
            Haptics.play("error")
            return
        }
        stage = .opening
        // Loading it in a web view, not URLSession: /auth/verify sets the
        // session cookie on the response, and the cookie has to land in the jar
        // the rest of the app reads.
        app.web.consumeSignInLink(url) {
            Task {
                await app.refresh()
                stage = app.session.signedIn ? .opening : .asking
                if !app.session.signedIn {
                    problem = "That link has expired or was already used. Send a new one."
                    Haptics.play("error")
                } else {
                    Haptics.play("success")
                }
            }
        }
    }

    private func firstURL(in text: String) -> URL? {
        if let direct = URL(string: text), direct.scheme != nil { return direct }
        let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)
        let range = NSRange(text.startIndex..., in: text)
        return detector?.firstMatch(in: text, range: range)?.url
    }

    private func message(for outcome: String) -> String {
        switch outcome {
        case "email": "That does not look like an email address."
        case "throttled": "Too many links requested. Wait a few minutes."
        default: "The link could not be sent. Try again shortly."
        }
    }

    private struct LoginReply: Decodable {
        let ok: Bool
        let outcome: String
    }
}
