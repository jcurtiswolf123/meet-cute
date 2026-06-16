// Transactional email via Resend's HTTP API (no SDK dependency).
//
// Degrades gracefully: with no RESEND_API_KEY (local dev), it logs the message
// to the server console and returns ok, so the magic-link flow is testable
// without sending real mail. Set RESEND_API_KEY + RESEND_FROM in production.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

type SendArgs = { to: string; subject: string; html: string; text?: string };

export async function sendEmail({ to, subject, html, text }: SendArgs): Promise<{ ok: boolean }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || "Meet Cute <hello@meet-cute.app>";

  if (!key) {
    // Dev fallback: surface the content so the flow can be exercised locally.
    console.log(`\n[email:dev] to=${to} subject=${subject}\n${text || html}\n`);
    return { ok: true };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html, text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[email] Resend ${res.status}: ${body.slice(0, 300)}`);
      return { ok: false };
    }
    return { ok: true };
  } catch (e) {
    console.error(`[email] send failed: ${(e as Error).message}`);
    return { ok: false };
  }
}

export function magicLinkEmail(link: string): { subject: string; html: string; text: string } {
  const subject = "Your Meet Cute sign-in link";
  const text = `Sign in to Meet Cute:\n${link}\n\nThis link expires in 15 minutes and can be used once. If you did not request it, ignore this email.`;
  const html = `<div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;padding:24px;color:#2a2320">
    <h1 style="font-size:22px;font-weight:500;color:#7a1f2b">Meet Cute</h1>
    <p style="font-size:15px;line-height:1.6">Tap to sign in. This link expires in 15 minutes and can be used once.</p>
    <p style="margin:24px 0">
      <a href="${link}" style="background:#7a1f2b;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-family:Helvetica,Arial,sans-serif;font-size:14px">Sign in to Meet Cute</a>
    </p>
    <p style="font-size:12px;color:#8a817c">If you did not request this, ignore this email.</p>
  </div>`;
  return { subject, html, text };
}
