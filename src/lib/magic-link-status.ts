// Copy for every outcome of requestMagicLink, shared by /login and /apply so the
// two entry points cannot drift. requestMagicLink used to redirect to `sent=1`
// no matter what happened, which told people to check an inbox that was never
// going to receive anything.

export type MagicLinkError = "email" | "throttled" | "send" | "expired";

export function magicLinkErrorMessage(error: string | undefined): string | null {
  switch (error) {
    case "email":
      return "That email address does not look right. Check it and try again.";
    case "throttled":
      return "That is a few too many sign-in links in a short window. Wait about fifteen minutes and try again.";
    case "send":
      return "We could not send the link just now. Try again in a minute, or email hello@hellomutuals.com and we will sort it out.";
    case "expired":
      return "That link expired or was already used. Request a new one below.";
    default:
      return null;
  }
}
