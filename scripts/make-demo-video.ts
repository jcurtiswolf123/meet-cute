/**
 * Records a product demo of Meet Cute with AI voiceover (edge-tts) and Playwright video.
 * Output: public/demo/meet-cute-demo.mp4
 */
import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "public", "demo");
const WORK = path.join(OUT_DIR, ".work");
const BASE = process.env.DEMO_BASE_URL ?? "http://localhost:3009";
const VOICE = "en-US-JennyNeural";
const VIEWPORT = { width: 1440, height: 900 };

type Segment = {
  id: string;
  narration: string;
  run: (page: Page) => Promise<void>;
  tailPadSec?: number;
};

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function ffprobeDuration(file: string): number {
  const out = execSync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${file}"`,
    { encoding: "utf8" },
  ).trim();
  return parseFloat(out);
}

function synthesize(id: string, text: string): string {
  const mp3 = path.join(WORK, `${id}.mp3`);
  const r = spawnSync(
    "edge-tts",
    ["--voice", VOICE, "--rate=-4%", "--text", text, "--write-media", mp3],
    { encoding: "utf8" },
  );
  if (r.status !== 0) throw new Error(`edge-tts failed for ${id}: ${r.stderr || r.stdout}`);
  return mp3;
}

async function demoLogin(page: Page, label: string) {
  await page.goto(`${BASE}/studio/login`, { waitUntil: "domcontentloaded" });
  await page.getByText("Dev only · demo login").waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: new RegExp(label, "i") }).first().click();
  await page.waitForLoadState("networkidle");
}

async function smoothScroll(page: Page, amount = 700) {
  await page.evaluate((y) => window.scrollBy({ top: y, behavior: "smooth" }), amount);
  await page.waitForTimeout(900);
}

const segments: Segment[] = [
  {
    id: "01-intro",
    narration:
      "Meet Cute is premium matchmaking built as one app. Meet someone great, go on a real date, and build something that lasts. No swipe feed. No endless browsing. Just thoughtful introductions, one at a time.",
    run: async (page) => {
      await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    },
  },
  {
    id: "02-how",
    narration:
      "The journey is simple. A matchmaker gets to know you and hand-picks introductions. The concierge books the table so the first date actually happens. Coaching helps things go well, and monthly dinners create a warm community without pressure.",
    run: async (page) => {
      await smoothScroll(page, 900);
    },
    tailPadSec: 0.5,
  },
  {
    id: "03-vouch",
    narration:
      "What makes Meet Cute different is trust. Friends vouch for people they know. When two members match, either can ask a mutual friend for the inside scoop. It feels safe, warm, and human.",
    run: async (page) => {
      await smoothScroll(page, 900);
    },
  },
  {
    id: "04-apply",
    narration:
      "New members apply through a short application. We learn what you are looking for, how you date, and whether Meet Cute is the right fit. Quality over volume.",
    run: async (page) => {
      await page.goto(`${BASE}/apply`, { waitUntil: "networkidle" });
    },
  },
  {
    id: "05-dinners",
    narration:
      "Monthly dinners are part of the brand. Easy tables in New York and San Francisco where members meet good people in real life, with no awkward networking energy.",
    run: async (page) => {
      await page.goto(`${BASE}/dinners`, { waitUntil: "networkidle" });
    },
  },
  {
    id: "06-coaching",
    narration:
      "Coaching sits on the bench when you want it. Dating and relationship coaches help members show up well, and support couples who met through the community.",
    run: async (page) => {
      await page.goto(`${BASE}/coaching`, { waitUntil: "networkidle" });
    },
  },
  {
    id: "07-member",
    narration:
      "Inside the member app, you never see a stack of profiles. Your matchmaker sends one curated introduction at a time. You see photos, prompts, mutual friends, and vouches from people who know them.",
    run: async (page) => {
      await demoLogin(page, "Alex Chen");
      await page.goto(`${BASE}/app`, { waitUntil: "networkidle" });
    },
  },
  {
    id: "08-decide",
    narration:
      "You decide yes or not yet. If you both say yes, the match moves forward and the concierge takes over. No games, no pen pals, just a clear path to meeting in person.",
    run: async (page) => {
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(600);
    },
  },
  {
    id: "09-concierge",
    narration:
      "On the matches screen, the concierge proposes a venue and specific time slots. Both people tap their availability, the overlap confirms the date, and a calendar invite lands in your inbox. Morning-of nudge, post-date check-in, all handled.",
    run: async (page) => {
      await demoLogin(page, "Maya Rosen");
      await page.goto(`${BASE}/app/matches`, { waitUntil: "networkidle" });
    },
  },
  {
    id: "10-studio",
    narration:
      "Behind the scenes, operators run the matchmaker studio. A searchable roster, pipeline stages from suggested to together, notes, vouches, dinner history, and the social graph in one place.",
    run: async (page) => {
      await demoLogin(page, "Jessica Wolflord");
      await page.goto(`${BASE}/studio`, { waitUntil: "networkidle" });
    },
  },
  {
    id: "11-pipeline",
    narration:
      "The pipeline view tracks every introduction through its stage, so nothing falls through the cracks and the team always knows who needs attention next.",
    run: async (page) => {
      await page.goto(`${BASE}/studio/pipeline`, { waitUntil: "networkidle" });
    },
  },
  {
    id: "12-copilot",
    narration:
      "The co-pilot is an internal assistant for the team. Find candidates, recall notes, summarize a person, spot stale singles, and draft intros. It runs on Claude when configured, or a local intent engine over the live roster so the product always works.",
    run: async (page) => {
      await page.goto(`${BASE}/studio/copilot`, { waitUntil: "networkidle" });
      await page.waitForTimeout(800);
    },
  },
  {
    id: "13-outro",
    narration:
      "Meet Cute. Premium matchmaking, one app, end to end. Apply at hello meet cute dot com.",
    run: async (page) => {
      await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    },
    tailPadSec: 1,
  },
];

async function main() {
  ensureDir(OUT_DIR);
  ensureDir(WORK);

  console.log("Synthesizing voiceover segments...");
  const audioFiles: { id: string; file: string; duration: number; tail: number }[] = [];
  for (const seg of segments) {
    const file = synthesize(seg.id, seg.narration);
    const duration = ffprobeDuration(file);
    audioFiles.push({ id: seg.id, file, duration, tail: seg.tailPadSec ?? 0.4 });
    console.log(`  ${seg.id}: ${duration.toFixed(1)}s`);
  }

  const concatList = path.join(WORK, "audio.txt");
  fs.writeFileSync(
    concatList,
    audioFiles.map((a) => `file '${a.file}'`).join("\n"),
  );
  const voiceover = path.join(WORK, "voiceover.mp3");
  execSync(`ffmpeg -y -f concat -safe 0 -i "${concatList}" -c copy "${voiceover}"`, {
    stdio: "inherit",
  });

  const videoDir = path.join(WORK, "capture");
  ensureDir(videoDir);

  console.log(`Recording screen tour at ${BASE} ...`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir: videoDir, size: VIEWPORT },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const audio = audioFiles[i];
    console.log(`  scene ${seg.id}`);
    await seg.run(page);
    const waitMs = Math.ceil((audio.duration + audio.tail) * 1000);
    await page.waitForTimeout(waitMs);
  }

  await context.close();
  await browser.close();

  const webm = (await fs.promises.readdir(videoDir)).find((f) => f.endsWith(".webm"));
  if (!webm) throw new Error("No Playwright video file found");
  const rawVideo = path.join(videoDir, webm);

  const final = path.join(OUT_DIR, "meet-cute-demo.mp4");
  execSync(
    `ffmpeg -y -i "${rawVideo}" -i "${voiceover}" -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest -movflags +faststart "${final}"`,
    { stdio: "inherit" },
  );

  const meta = {
    createdAt: new Date().toISOString(),
    baseUrl: BASE,
    voice: VOICE,
    output: "public/demo/meet-cute-demo.mp4",
    segments: segments.map((s, i) => ({
      id: s.id,
      narration: s.narration,
      audioSec: audioFiles[i].duration,
    })),
  };
  fs.writeFileSync(path.join(OUT_DIR, "demo-meta.json"), JSON.stringify(meta, null, 2));

  console.log(`\nDone: ${final}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
