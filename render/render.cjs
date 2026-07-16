const { chromium } = require('playwright');
const path = require('path');

const HTML = 'file://' + path.resolve(__dirname, 'ad.html');
const FRAMES_DIR = path.resolve(__dirname, 'frames');
const N_FRAMES = 600;
const DURATION_MS = 20000;
const WIDTH = 1080;
const HEIGHT = 1920;

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--force-color-profile=srgb', '--disable-lcd-text'],
  });
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  page.on('console', (msg) => {
    const t = msg.text();
    if (/error|fail|warn/i.test(t)) console.log('[page]', t);
  });

  await page.goto(HTML, { waitUntil: 'load', timeout: 60000 });

  // Wait for the bundler to unpack, swap the document, and expose window.seek.
  await page.waitForFunction(() => typeof window.seek === 'function', null, {
    timeout: 120000,
    polling: 100,
  });
  console.log('window.seek ready');

  // Fonts + images settled.
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const imgs = Array.from(document.images || []);
    await Promise.all(
      imgs.map((img) =>
        img.complete && img.naturalWidth > 0
          ? Promise.resolve()
          : new Promise((res) => {
              img.addEventListener('load', res, { once: true });
              img.addEventListener('error', res, { once: true });
            })
      )
    );
  });

  // Render frame 0 once and give the layout a beat to settle before capturing.
  await page.evaluate((t) => window.seek(t), 0);
  await page.waitForTimeout(300);

  const clip = { x: 0, y: 0, width: WIDTH, height: HEIGHT };
  const t0 = Date.now();
  for (let i = 0; i < N_FRAMES; i++) {
    const tMs = (i * DURATION_MS) / N_FRAMES;
    await page.evaluate((t) => window.seek(t), tMs);
    // Two rAFs to let React commit + browser paint the seeked frame.
    await page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r))
        )
    );
    const file = path.join(
      FRAMES_DIR,
      'frame_' + String(i).padStart(4, '0') + '.png'
    );
    await page.screenshot({ path: file, clip });
    if (i % 50 === 0 || i === N_FRAMES - 1) {
      const el = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`frame ${i + 1}/${N_FRAMES}  t=${tMs.toFixed(1)}ms  (${el}s)`);
    }
  }

  await browser.close();
  console.log('done capturing', N_FRAMES, 'frames');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
