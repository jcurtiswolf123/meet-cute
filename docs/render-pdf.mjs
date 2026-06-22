import { chromium } from '/Users/joshua.wolf/.local/node/lib/node_modules/@playwright/test/index.mjs';
import { fileURLToPath } from 'url';
import path from 'path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const input = 'file://' + path.join(dir, 'quickstart-print.html');
const output = path.join(dir, 'Meet-Cute-Quick-Start.pdf');

const browser = await chromium.launch({
  executablePath: '/Users/joshua.wolf/Library/Caches/ms-playwright/chromium-1148/chrome-mac/Chromium.app/Contents/MacOS/Chromium',
});
const page = await browser.newPage();
await page.goto(input, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);

const footer = `
  <div style="width:100%; font-family:'Inter',sans-serif; font-size:7.5pt; color:#6b6258;
              padding:0 20mm; display:flex; justify-content:space-between; align-items:center;
              -webkit-print-color-adjust:exact;">
    <span style="letter-spacing:0.12em; text-transform:uppercase; color:#9b2d3b; font-weight:600;">Meet Cute</span>
    <span style="letter-spacing:0.04em;">Quick Start &nbsp;&middot;&nbsp; <span class="pageNumber"></span> / <span class="totalPages"></span></span>
  </div>`;

await page.pdf({
  path: output,
  format: 'Letter',
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate: footer,
  margin: { top: '22mm', bottom: '20mm', left: '20mm', right: '20mm' },
});

await browser.close();
console.log(output);
