// End-to-end gate: make the MP4 in headless Chrome exactly as a visitor would, then check the file
// itself: 1080x1920, 30 fps, the right frame count, and the code on exactly the planned frames,
// with ordinary photo frames on both sides of it. Also screenshots the page light/dark/phone.
// usage: node tools/test.js [hold] [seconds]
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const hold = Number(process.argv[2] || 2), seconds = Number(process.argv[3] || 10);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

(async () => {
  const server = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    if (!p.startsWith(ROOT) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  }).listen(0);
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, protocolTimeout: 300000,
    userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'pause-test-')),
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'load' });
  const res = await page.evaluate(async (hold, seconds) => {
    const { plan } = await import('/film.js');
    const s = { ...window.__settings(), hold, seconds, brand: '#ffd60a' };
    const blob = await window.__makeVideo(s, window.__photos());
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { b64: btoa(bin), plan: plan(s) };
  }, hold, seconds);
  const mp4 = path.join(OUT, `test-hold${hold}-${seconds}s.mp4`);
  fs.writeFileSync(mp4, Buffer.from(res.b64, 'base64'));
  const P = res.plan;

  let fail = 0;
  const check = (ok, msg) => { if (!ok) fail++; console.log(ok ? 'ok  ' : 'FAIL', msg); };
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries',
    'stream=width,height,r_frame_rate,nb_read_frames,codec_name', '-of', 'json', mp4]).toString()).streams[0];
  check(probe.width === 1080 && probe.height === 1920, `size ${probe.width}x${probe.height}`);
  check(probe.r_frame_rate === '30/1', `frame rate ${probe.r_frame_rate}`);
  check(Number(probe.nb_read_frames) === P.total, `frames ${probe.nb_read_frames} of ${P.total}`);
  check(probe.codec_name === 'h264', `codec ${probe.codec_name}`);

  // mean colour of every frame, then: brand yellow on exactly [secret, secret+hold), nowhere else
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', mp4, '-vf', 'scale=27:48', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 28 });
  const per = 27 * 48 * 3, yellow = [];
  for (let f = 0; f * per < raw.length; f++) {
    let r = 0, g = 0, b = 0;
    for (let k = f * per; k < (f + 1) * per; k += 3) { r += raw[k]; g += raw[k + 1]; b += raw[k + 2]; }
    const n = per / 3; r /= n; g /= n; b /= n;
    yellow.push(r > 200 && g > 170 && b < 90);
  }
  const hits = yellow.map((y, i) => (y ? i : -1)).filter((i) => i >= 0);
  const want = Array.from({ length: P.hold }, (_, k) => P.secret + k);
  check(JSON.stringify(hits) === JSON.stringify(want), `code frames ${JSON.stringify(hits)}, planned ${JSON.stringify(want)}`);
  for (const f of [P.secret - 1, P.secret, P.secret + P.hold]) {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', mp4, '-vf', `select=eq(n\\,${f})`, '-frames:v', '1', path.join(OUT, `frame-${f}.png`)]);
  }

  for (const [scheme, w, h, mobile] of [['light', 1280, 900, false], ['dark', 1280, 900, false], ['light', 390, 844, true]]) {
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
    await page.setViewport({ width: w, height: h, isMobile: mobile, hasTouch: mobile });
    await page.reload({ waitUntil: 'load' });
    await new Promise((r) => setTimeout(r, 400));
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check(over <= 0, `no sideways scroll at ${w}px ${scheme} (${over})`);
    await page.screenshot({ path: path.join(OUT, `page-${scheme}-${w}.png`), fullPage: true });
  }
  check(!errors.length, 'no page errors ' + errors.join(' | '));
  console.log(fail ? `${fail} FAILED` : 'ALL PASSED');
  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
})();
