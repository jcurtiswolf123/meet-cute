// One-way calendar invite. 90% of the value of calendar sync, a day of work.
function fmt(dt: Date): string {
  return dt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function buildIcs(opts: {
  start: Date;
  durationMin?: number;
  title: string;
  location: string;
  description?: string;
  uid: string;
}): string {
  const end = new Date(opts.start.getTime() + (opts.durationMin ?? 90) * 60000);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Meet Cute//Concierge//EN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${opts.uid}@meetcute`,
    `DTSTAMP:${fmt(new Date(opts.start.getTime()))}`,
    `DTSTART:${fmt(opts.start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${escape(opts.title)}`,
    `LOCATION:${escape(opts.location)}`,
    `DESCRIPTION:${escape(opts.description ?? "")}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function escape(s: string): string {
  return s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
}
