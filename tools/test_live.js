// The deployed site makes a real MP4 under its security policy, and cannot send data out.
const fs = require('fs'), os = require('os'), path = require('path');
const puppeteer = require('puppeteer-core');
const URL_ = process.argv[2] || 'https://pausetowin.vercel.app';
(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, protocolTimeout: 300000, userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'pause-live-')) });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL_, { waitUntil: 'load' });
  const r = await page.evaluate(async () => {
    const title = document.title;
    const blob = await window.__makeVideo({ ...window.__settings(), seconds: 8 }, window.__photos());
    const head = new Uint8Array(await blob.slice(4, 8).arrayBuffer());
    let fetchBlocked = false;
    try { await fetch('https://example.com/?x=1'); } catch { fetchBlocked = true; }
    return { title, bytes: blob.size, box: String.fromCharCode(...head), fetchBlocked };
  });
  console.log(r);
  const ok = r.title === 'Pause Challenge' && r.box === 'ftyp' && r.bytes > 100000 && r.fetchBlocked && !errors.length;
  console.log(ok ? 'LIVE OK' : 'LIVE FAILED', errors);
  await browser.close();
  process.exit(ok ? 0 : 1);
})();
