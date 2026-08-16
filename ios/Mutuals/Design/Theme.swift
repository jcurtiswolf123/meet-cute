import SwiftUI

/// The palette and type from DESIGN.md, in the one place the native chrome
/// reads it.
///
/// The web app owns everything inside the web view. What is native is the tab
/// bar, the navigation bar, the sign-in screen, and the error states, and those
/// have to sit against the same cream without anybody eyeballing a hex code.
/// The studio deliberately runs cooler: an operator staring at the same console
/// all day gets greyscale with one accent, which is the same call the web
/// `.studio-shell` makes.
enum Theme {
    // Public and member surfaces.
    static let cream = Color(hex: 0xF4F1EA)
    static let paper = Color(hex: 0xE9E4DA)
    static let panel = Color(hex: 0xF8F6F1)
    static let ink = Color(hex: 0x171714)
    static let muted = Color(hex: 0x67635D)
    static let line = Color(hex: 0xD2CDC3)
    static let oxblood = Color(hex: 0x762D38)

    // Operator studio.
    static let studioCanvas = Color(hex: 0xF6F6F5)
    static let studioSubtle = Color(hex: 0xFBFBFA)
    static let studioLine = Color(hex: 0xE3E2DF)

    /// Bricolage Grotesque SemiBold, bundled, matching --font-display on the
    /// web so a native title and the page under it are the same voice. The
    /// fallback is deliberate rather than a build failure: a missing font file
    /// should cost the display face, not the app.
    static func display(_ size: CGFloat) -> Font {
        if UIFont(name: displayFace, size: size) != nil {
            return .custom(displayFace, size: size)
        }
        return .system(size: size, weight: .semibold, design: .default)
    }

    static let displayFace = "BricolageGrotesque-SemiBold"

    /// Display type is set tight. At 28pt and up the default tracking reads
    /// loose and generic, and the web app's headlines are cut the same way.
    static func displayTracking(_ size: CGFloat) -> CGFloat {
        size >= 32 ? -size * 0.028 : -size * 0.02
    }

    static func body(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .default)
    }

    /// The spacing scale. Anything off it is a mistake, not a nudge.
    enum Space {
        static let xs: CGFloat = 4
        static let sm: CGFloat = 8
        static let md: CGFloat = 16
        static let lg: CGFloat = 24
        static let xl: CGFloat = 32
        static let xxl: CGFloat = 48
    }

    enum Radius {
        static let field: CGFloat = 6
        static let card: CGFloat = 8
        static let panel: CGFloat = 12
    }

    /// The entrance easing every reveal on the public site uses.
    static let ease = Animation.timingCurve(0.22, 1, 0.36, 1, duration: 0.22)

    /// The same curve, given room to travel. For things that move across the
    /// screen rather than fade in place: a shell arriving, a card replacing
    /// another. Anything quicker reads as a cut.
    static let enter = Animation.timingCurve(0.22, 1, 0.36, 1, duration: 0.45)
}

extension View {
    /// Display type, always with its tracking. The two were separable and so
    /// they drifted: half the headlines in the app were set at the default
    /// spacing, which is what made a grotesk read loose.
    func displayType(_ size: CGFloat) -> some View {
        font(Theme.display(size)).tracking(Theme.displayTracking(size))
    }

    /// A press that answers. 60ms down, the standard curve back up, and no
    /// opacity change: dimming a cream button on a cream ground reads as a
    /// glitch rather than as a tap.
    func pressable(_ scale: CGFloat = 0.97) -> some View {
        buttonStyle(PressableButtonStyle(scale: scale))
    }
}

struct PressableButtonStyle: ButtonStyle {
    var scale: CGFloat = 0.97

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? scale : 1)
            .animation(
                configuration.isPressed
                    ? .easeOut(duration: 0.06)
                    : Theme.ease,
                value: configuration.isPressed
            )
    }
}

extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: 1
        )
    }
}

extension UIColor {
    convenience init(hex: UInt32) {
        self.init(
            red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: 1
        )
    }
}
