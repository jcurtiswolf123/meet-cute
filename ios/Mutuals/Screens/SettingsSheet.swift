import SwiftUI

/// Account and the backend, in one sheet reachable from both shells.
///
/// The backend row is not a debug affordance to hide: a build pointed at a
/// throwaway database and a build pointed at the live roster look identical
/// once a page has rendered, and the difference is whether tapping "Introduce"
/// emails two real people. So it says which one it is, in words, on the screen.
struct SettingsSheet: View {
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss

    @State private var localHost = UserDefaults.standard.string(forKey: "localHost") ?? "localhost"
    @State private var confirmSignOut = false

    var body: some View {
        NavigationStack {
            List {
                if app.session.signedIn {
                    Section {
                        HStack(spacing: Theme.Space.md) {
                        Circle()
                            .fill(Theme.paper)
                            .frame(width: 44, height: 44)
                            .overlay(
                                Text(initials)
                                    .font(Theme.body(16, weight: .semibold))
                                    .foregroundStyle(Theme.muted)
                            )
                        VStack(alignment: .leading, spacing: 2) {
                            Text(app.session.displayName)
                                .font(Theme.body(16, weight: .medium))
                                .foregroundStyle(Theme.ink)
                            if let email = app.session.email {
                                Text(email).font(Theme.body(13)).foregroundStyle(Theme.muted)
                            }
                        }
                        }
                        .padding(.vertical, 4)
                    }
                }

                if app.session.signedIn {
                    Section("Account") {
                        // Members only: /app/settings redirects an operator to
                        // the studio, so the row would open the directory.
                        if !app.session.operatorAccess {
                            NavigationLink("Settings and privacy") {
                                WebTab(key: "member.settings", url: .on(app.backend, "/app/settings"))
                                    .navigationTitle("Settings")
                                    .navigationBarTitleDisplayMode(.inline)
                            }
                        }
                        Button("Sign out", role: .destructive) { confirmSignOut = true }
                    }
                }

                Section {
                    Picker("Talking to", selection: backendBinding) {
                        ForEach(Backend.allCases) { option in
                            Text(option.title).tag(option)
                        }
                    }
                    if app.backend == .local {
                        HStack {
                            Text("Mac address").font(Theme.body(15))
                            Spacer()
                            TextField("localhost", text: $localHost)
                                .multilineTextAlignment(.trailing)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .keyboardType(.URL)
                                .onSubmit(saveLocalHost)
                                .onChange(of: localHost) { _, _ in saveLocalHost() }
                        }
                    }
                } header: {
                    Text("Backend")
                } footer: {
                    // The subtitle is a fragment with no full stop, so the local
                    // hint needs one in front of it or the two run together.
                    Text(app.backend == .local
                         ? "\(app.backend.subtitle). A phone cannot see the Mac's localhost, so put the Mac's address on the network here."
                         : app.backend.subtitle)
                }

                Section {
                    LabeledContent("Version", value: version)
                    LabeledContent("Host", value: app.backend.host)
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }.foregroundStyle(Theme.ink)
                }
            }
            .confirmationDialog(
                "Sign out of Mutuals?",
                isPresented: $confirmSignOut,
                titleVisibility: .visible
            ) {
                Button("Sign out", role: .destructive) {
                    Task {
                        await app.signOut()
                        dismiss()
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("You will need a new sign-in link to get back in.")
            }
        }
        .tint(Theme.oxblood)
    }

    private var backendBinding: Binding<Backend> {
        Binding(get: { app.backend }, set: { app.backend = $0 })
    }

    private func saveLocalHost() {
        let cleaned = localHost.trimmingCharacters(in: .whitespaces)
        UserDefaults.standard.set(cleaned.isEmpty ? "localhost" : cleaned, forKey: "localHost")
        if app.backend == .local {
            app.web.reset()
            Task { await app.refresh() }
        }
    }

    private var initials: String {
        let parts = app.session.displayName.split(separator: " ").prefix(2)
        return parts.compactMap { $0.first }.map(String.init).joined().uppercased()
    }

    private var version: String {
        let short = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
        return "\(short) (\(build))"
    }
}
