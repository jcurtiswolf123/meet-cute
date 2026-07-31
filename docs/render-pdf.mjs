import { chromium } from '/Users/joshua.wolf/.local/node/lib/node_modules/@playwright/test/index.mjs';
import { existsSync, readdirSync } from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import path from 'path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const PLAYWRIGHT_CACHE = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');

// Each print-ready HTML doc and the PDF it produces. The footer label is the
// document title, so it is per-doc rather than shared.
const DOCS = [
  { input: 'quickstart-print.html', output: 'Mutuals-Quick-Start.pdf', label: 'Quick Start' },
  {
    input: 'operator-guide-print.html',
    output: 'Mutuals-Operator-Walkthrough.pdf',
    label: 'Operator Walkthrough',
  },
];

// Playwright renames its bundled Chromium directory on every upgrade (the build
// number and the .app name both move), so let Playwright resolve the browser
// itself and only fall back to a scan if that install is missing.
let browser;
try {
  browser = await chromium.launch();
} catch (err) {
  const fallback = readdirSync(PLAYWRIGHT_CACHE)
    .filter((name) => /^chromium(_headless_shell)?-\d+$/.test(name))
    .sort((a, b) => Number(b.split('-').pop()) - Number(a.split('-').pop()))
    .flatMap((name) =>
      // Intel builds land in chrome-mac, Apple silicon in chrome-mac-arm64.
      ['chrome-mac', 'chrome-mac-arm64'].flatMap((macDir) =>
        ['Chromium.app', 'Google Chrome for Testing.app'].map((app) =>
          path.join(PLAYWRIGHT_CACHE, name, macDir, app, 'Contents', 'MacOS', app.replace('.app', '')),
        ),
      ),
    )
    .find((candidate) => existsSync(candidate));
  if (!fallback) throw err;
  browser = await chromium.launch({ executablePath: fallback });
}

for (const doc of DOCS) {
  const page = await browser.newPage();
  await page.goto('file://' + path.join(dir, doc.input), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);

  const footer = `
  <div style="width:100%; font-family:'Inter',sans-serif; font-size:7.5pt; color:#6b6258;
              padding:0 20mm; display:flex; justify-content:space-between; align-items:center;
              -webkit-print-color-adjust:exact;">
    <span style="letter-spacing:0.12em; text-transform:uppercase; color:#9b2d3b; font-weight:600;">Mutuals</span>
    <span style="letter-spacing:0.04em;">${doc.label} &nbsp;&middot;&nbsp; <span class="pageNumber"></span> / <span class="totalPages"></span></span>
  </div>`;

  const output = path.join(dir, doc.output);
  await page.pdf({
    path: output,
    format: 'Letter',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: footer,
    margin: { top: '22mm', bottom: '20mm', left: '20mm', right: '20mm' },
  });
  await page.close();
  console.log(output);
}

await browser.close();
