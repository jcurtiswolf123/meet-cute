#!/usr/bin/env python3
"""Inbox placement monitor.

"Delivered" in the Resend log only means a receiving server accepted the
message. It says nothing about whether a member ever saw it. This sends one copy
of each live template to a seed Gmail we control, waits, then asks Gmail itself
where each one landed (Primary, Promotions, Updates, Spam) and what its
Authentication-Results header says about SPF, DKIM and DMARC.

    python3 scripts/placement-check.py            # send, wait, report
    python3 scripts/placement-check.py --report-only <tag>

Credentials come from the same files the rest of the operator tooling uses:
  ~/.gstack/credentials/resend-paid-api-key.txt
  ~/.gstack/credentials/joshcurtiswolf-gmail-app-password.txt

Send one template at a time with real gaps between them. A burst of near
identical messages from one sender inside a few seconds is itself the signal
Gmail files under Promotions, and it will contaminate the reading.
"""
import argparse, email, imaplib, json, os, re, sys, time, urllib.request

RESEND_KEY_FILE = "~/.gstack/credentials/resend-paid-api-key.txt"
SEED_PW_FILE = "~/.gstack/credentials/joshcurtiswolf-gmail-app-password.txt"
SEED = "joshcurtiswolf@gmail.com"
FROM = "Mutuals <hello@hellomutuals.com>"
GAP_SECONDS = 240
SETTLE_SECONDS = 90


def read(path):
    return open(os.path.expanduser(path)).read().strip()


def send(subject, html, text):
    payload = {"from": FROM, "to": [SEED], "subject": subject, "html": html, "text": text}
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": "Bearer " + read(RESEND_KEY_FILE),
            "Content-Type": "application/json",
            # api.resend.com is Cloudflare-fronted and answers 403/1010 to a bare
            # Python user agent.
            "User-Agent": "curl/8.7.1",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.load(r).get("id")


def report(tag):
    M = imaplib.IMAP4_SSL("imap.gmail.com")
    M.login(SEED, read(SEED_PW_FILE))
    M.select('"[Gmail]/All Mail"', readonly=True)

    def ids(q):
        typ, data = M.search(None, "X-GM-RAW", '"%s"' % q)
        return data[0].split() if typ == "OK" and data and data[0] else []

    rows = []
    for i in ids(tag):
        typ, data = M.fetch(i, "(BODY.PEEK[HEADER])")
        raw = b"".join(p[1] for p in data if isinstance(p, tuple))
        msg = email.message_from_bytes(raw)
        subject = re.sub(r"\s+", " ", msg.get("Subject", ""))
        ar = msg.get("Authentication-Results", "")
        auth = {k: (re.search(k + r"=(\w+)", ar).group(1) if re.search(k + r"=(\w+)", ar) else "?")
                for k in ("spf", "dkim", "dmarc")}
        where = "unknown"
        for cat in ("primary", "promotions", "updates", "social", "forums"):
            if any(x == i for x in ids("%s category:%s" % (tag, cat))):
                where = cat
                break
        if any(x == i for x in ids(tag + " in:spam")):
            where = "SPAM"
        rows.append((where, subject, auth))
    M.logout()

    if not rows:
        print("no messages found for tag %s (give Gmail a minute)" % tag)
        return 1
    bad = 0
    for where, subject, auth in sorted(rows):
        flag = "" if where == "primary" else "   <-- not Primary"
        if where != "primary":
            bad += 1
        print("%-11s spf=%s dkim=%s dmarc=%s  %s%s"
              % (where, auth["spf"], auth["dkim"], auth["dmarc"], subject[:70], flag))
    print("\n%d of %d in Primary" % (len(rows) - bad, len(rows)))
    return 0


TEMPLATES = [
    ("sign-in", "Your Mutuals sign-in link",
     '<p style="font-family:Helvetica,Arial,sans-serif">Tap to sign in. This link expires in 15 minutes.</p>'
     '<p><a href="https://hellomutuals.com/auth/callback?token=placement-check">Sign in to Mutuals</a></p>',
     "Sign in to Mutuals:\nhttps://hellomutuals.com/auth/callback?token=placement-check"),
    ("vouch-request", "Placement Check asked you to vouch for them",
     '<p style="font-family:Helvetica,Arial,sans-serif">Placement Check applied to Mutuals and named you. '
     'A few sentences is all it takes.</p><p><a href="https://hellomutuals.com/vouch/placement-check">Write it here</a></p>',
     "Placement Check applied to Mutuals and named you.\nhttps://hellomutuals.com/vouch/placement-check"),
    ("match-invite", "An introduction to Placement",
     '<p style="font-family:Helvetica,Arial,sans-serif">Hi, I want to introduce you to Placement. '
     'Reply Y for yes or N to pass.</p>',
     "Hi, I want to introduce you to Placement. Reply Y for yes or N to pass."),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--report-only", metavar="TAG")
    args = ap.parse_args()
    if args.report_only:
        return report(args.report_only)

    tag = "placement-%d" % int(time.time())
    for i, (name, subject, html, text) in enumerate(TEMPLATES):
        mid = send("%s [%s:%s]" % (subject, tag, name), html, text)
        print("sent %-14s %s" % (name, mid), flush=True)
        if i < len(TEMPLATES) - 1:
            time.sleep(GAP_SECONDS)
    print("\nwaiting %ds for Gmail to file them..." % SETTLE_SECONDS, flush=True)
    time.sleep(SETTLE_SECONDS)
    print()
    return report(tag)


if __name__ == "__main__":
    sys.exit(main())
