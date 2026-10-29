// Pause Challenge UI: form, live preview, frame-exact MP4 export with WebCodecs + mp4-muxer.
import { W, H, FPS, DEFAULTS, plan, drawFrame, examplePhotos } from './film.js';

const $ = (id) => document.getElementById(id);
const form = $('form');
let photos = examplePhotos();
let usingExamples = true;

// ---------- settings ----------
for (const [k, v] of Object.entries(DEFAULTS)) {
  const els = form.elements[k];
  if (!els) continue;
  if (els instanceof RadioNodeList) [...els].forEach((r) => { r.checked = String(r.value) === String(v); });
  else els.value = v;
}
function settings() {
  const f = form.elements;
  return {
    hook: f.hook.value.trim() || DEFAULTS.hook,
    code: f.code.value.trim().toUpperCase() || DEFAULTS.code,
    reward: f.reward.value.trim() || DEFAULTS.reward,
    claim: f.claim.value.trim() || DEFAULTS.claim,
    brand: f.brand.value || DEFAULTS.brand,
    seconds: Number(f.seconds.value),
    flashes: DEFAULTS.flashes,
    hold: Number(f.hold.value),
  };
}
function showWhere() {
  const p = plan(settings());
  $('at').textContent = (p.secret / FPS).toFixed(1) + ' s';
}
form.addEventListener('input', showWhere);
form.addEventListener('submit', (e) => e.preventDefault());
showWhere();

// ---------- photos ----------
function drawThumbs() {
  $('thumbs').innerHTML = '';
  photos.forEach((p) => {
    const c = document.createElement('canvas');
    c.width = 90; c.height = 160;
    const g = c.getContext('2d');
    const k = Math.max(90 / p.width, 160 / p.height);
    g.drawImage(p, (90 - p.width * k) / 2, (160 - p.height * k) / 2, p.width * k, p.height * k);
    $('thumbs').append(c);
  });
  $('photoCount').textContent = usingExamples
    ? 'Using 6 example tees until you add your own.'
    : `${photos.length} photo${photos.length === 1 ? '' : 's'} added.`;
}
drawThumbs();

$('photos').addEventListener('change', async (e) => {
  const files = [...e.target.files].slice(0, 12);
  if (!files.length) return;
  const loaded = [];
  for (const f of files) {
    try { loaded.push(await createImageBitmap(f)); } catch { /* skip files the browser can't read */ }
  }
  if (!loaded.length) { $('photoCount').textContent = "Those files couldn't be read. Use JPG or PNG photos."; return; }
  photos = loaded;
  usingExamples = false;
  drawThumbs();
  if (loaded.length < 3) $('photoCount').textContent += ' Three or more works best.';
});

// ---------- preview ----------
const pg = $('preview').getContext('2d');
let playing = true, startAt = performance.now(), pausedFrame = 0;
function frameNow() {
  const total = plan(settings()).total;
  return playing ? Math.floor(((performance.now() - startAt) / 1000) * FPS) % total : pausedFrame;
}
function tick() {
  drawFrame(pg, frameNow(), settings(), photos);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
$('pp').addEventListener('click', () => {
  if (playing) { pausedFrame = frameNow(); playing = false; }
  else { startAt = performance.now() - (pausedFrame / FPS) * 1000; playing = true; }
  $('pp').classList.toggle('paused', !playing);
  $('pp').setAttribute('aria-label', playing ? 'Pause preview' : 'Play preview');
});

// ---------- export ----------
const CODECS = ['avc1.640028', 'avc1.4d0028', 'avc1.42e028'];
async function pickConfig() {
  if (!('VideoEncoder' in window)) return null;
  for (const codec of CODECS) {
    const cfg = { codec, width: W, height: H, bitrate: 12_000_000, framerate: FPS, avc: { format: 'avc' } };
    try { if ((await VideoEncoder.isConfigSupported(cfg)).supported) return cfg; } catch { /* try the next */ }
  }
  return null;
}

export async function makeVideo(s, pics, onProgress = () => {}) {
  const cfg = await pickConfig();
  if (!cfg) throw new Error('unsupported');
  const p = plan(s);
  const muxer = new Mp4Muxer.Muxer({
    target: new Mp4Muxer.ArrayBufferTarget(),
    video: { codec: 'avc', width: W, height: H, frameRate: FPS },
    fastStart: 'in-memory',
  });
  let failed = null;
  const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { failed = e; } });
  enc.configure(cfg);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  for (let i = 0; i < p.total; i++) {
    if (failed) throw failed;
    drawFrame(g, i, s, pics);
    const f = new VideoFrame(c, { timestamp: Math.round((i * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
    // keyframes every second, and on the code itself so a scrubbing viewer lands on it cleanly
    enc.encode(f, { keyFrame: i % FPS === 0 || i === p.secret });
    f.close();
    if (enc.encodeQueueSize > 8) await new Promise((r) => enc.addEventListener('dequeue', r, { once: true }));
    if (i % 10 === 0) { onProgress(i / p.total); await new Promise((r) => setTimeout(r)); }
  }
  await enc.flush();
  if (failed) throw failed;
  muxer.finalize();
  enc.close();
  return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}

$('make').addEventListener('click', async () => {
  const s = settings();
  $('make').disabled = true;
  try {
    const blob = await makeVideo(s, photos, (u) => { $('status').textContent = `Making your video, ${Math.round(u * 100)}%`; });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pause-challenge-${s.code.toLowerCase().replace(/[^a-z0-9]+/g, '')}.mp4`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    $('status').textContent = `Done. Your code shows at ${(plan(s).secret / FPS).toFixed(1)} s.`;
  } catch (e) {
    $('status').textContent = e.message === 'unsupported'
      ? "This browser can't make videos. Open this page in Chrome, Edge or Safari."
      : 'Something went wrong making the video. Try again, or use fewer photos.';
  } finally {
    $('make').disabled = false;
  }
});

// For tests and the launch film
window.__makeVideo = makeVideo;
window.__settings = settings;
window.__photos = () => photos;
