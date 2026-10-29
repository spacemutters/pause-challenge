// Pause Challenge: every frame of the video is a pure function of its frame number.
// The preview, the MP4 export and the tests all call drawFrame, so what you see is what you download.

export const W = 1080, H = 1920, FPS = 30;

export const DEFAULTS = {
  hook: 'Only 1% can pause at the right time',
  code: 'PAUSE15',
  reward: '15% off',
  claim: 'Screenshot it and DM us',
  brand: '#ffd60a',
  seconds: 10,
  flashes: 10,   // photo changes per second
  hold: 2,       // frames the code is on screen: 1 very hard, 2 hard, 4 fair
};

export function plan(s) {
  const total = Math.round(s.seconds * FPS);
  const every = Math.max(2, Math.round(FPS / s.flashes));
  const endFrames = Math.round(1.6 * FPS);
  // the code lands about 60% of the way in, on a photo change, never in the first or last second
  let secret = Math.round(total * 0.6 / every) * every;
  secret = Math.min(Math.max(secret, FPS), total - endFrames - s.hold - FPS);
  return { total, every, secret, hold: s.hold, endStart: total - endFrames };
}

export const isSecret = (i, p) => i >= p.secret && i < p.secret + p.hold;

function cover(g, img, scale) {
  const iw = img.width, ih = img.height;
  const k = Math.max(W / iw, H / ih) * scale;
  const w = iw * k, h = ih * k;
  g.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}

function lines(g, text, maxW) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const out = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? cur + ' ' + w : w;
    if (g.measureText(next).width > maxW && cur) { out.push(cur); cur = w; } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

// big white words with a black outline, the way these videos caption themselves
function caption(g, text, y, size, maxW = 900) {
  g.font = `900 ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'top';
  g.lineJoin = 'round';
  const ls = lines(g, text, maxW);
  ls.forEach((l, k) => {
    const yy = y + k * size * 1.12;
    g.lineWidth = size * 0.16;
    g.strokeStyle = '#000';
    g.strokeText(l, W / 2, yy);
    g.fillStyle = '#fff';
    g.fillText(l, W / 2, yy);
  });
  return y + ls.length * size * 1.12;
}

function ink(hex) {
  // black or white text, whichever reads better on the brand colour
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, gr = (n >> 8) & 255, b = n & 255;
  const L = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lum = 0.2126 * L(r) + 0.7152 * L(gr) + 0.0722 * L(b);
  return (lum + 0.05) / 0.05 > 1.05 / (lum + 0.05) ? '#111111' : '#ffffff';
}

export function drawFrame(g, i, s, photos) {
  const p = plan(s);
  g.save();
  g.fillStyle = '#111';
  g.fillRect(0, 0, W, H);

  if (isSecret(i, p)) {
    // the frame people are trying to catch
    const fg = ink(s.brand);
    g.fillStyle = s.brand;
    g.fillRect(0, 0, W, H);
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '800 64px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    g.fillText('YOU FOUND IT', W / 2, 560);
    let size = 210;
    g.font = `900 ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    while (g.measureText(s.code).width > 920 && size > 60) { size -= 6; g.font = `900 ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`; }
    g.fillText(s.code, W / 2, 800);
    g.font = '800 110px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    g.fillText(String(s.reward).toUpperCase(), W / 2, 1000);
    g.font = '600 52px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    lines(g, s.claim, 860).forEach((l, k) => g.fillText(l, W / 2, 1140 + k * 64));
    g.restore();
    return;
  }

  if (i >= p.endStart) {
    // the end card asks, it never shows the code
    const u = Math.min(1, (i - p.endStart) / 8);
    const last = photos[(Math.floor((p.endStart - 1) / p.every)) % photos.length];
    if (last) { g.globalAlpha = 0.35; cover(g, last, 1.06); g.globalAlpha = 1; }
    g.fillStyle = `rgba(0,0,0,${0.55 * u})`;
    g.fillRect(0, 0, W, H);
    g.globalAlpha = u;
    const y = caption(g, 'Did you catch the code?', 640, 112);
    caption(g, s.claim + ' for ' + s.reward + '.', y + 50, 64, 860);
    g.globalAlpha = 1;
    g.restore();
    return;
  }

  // flashing photos, each one pushing in slightly while it's on screen
  const slot = Math.floor(i / p.every);
  const img = photos[slot % photos.length];
  if (img) cover(g, img, 1.02 + 0.04 * ((i % p.every) / p.every));
  const shade = g.createLinearGradient(0, 0, 0, 760);
  shade.addColorStop(0, 'rgba(0,0,0,0.45)');
  shade.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = shade;
  g.fillRect(0, 0, W, 760);
  const below = caption(g, s.hook, 300, 96);

  // a small pause sign that pulses, so people know what to do
  const pulse = 0.75 + 0.25 * Math.sin((i / FPS) * Math.PI * 2);
  g.globalAlpha = pulse;
  g.fillStyle = '#fff';
  g.strokeStyle = '#000';
  g.lineWidth = 8;
  for (const x of [W / 2 - 34, W / 2 + 10]) {
    g.beginPath(); g.roundRect(x, below + 34, 24, 90, 8); g.fill(); g.stroke();
  }
  g.globalAlpha = 1;
  g.restore();
}

// example photos for people who just want to try it: plain tees in six colours, drawn here
export function examplePhotos() {
  const colours = [['#f4efe6', '#d9cfbd'], ['#1f2a44', '#0f1628'], ['#c8553d', '#8f3626'], ['#5b7f5a', '#3c573c'], ['#e9c46a', '#b8943f'], ['#2b2b2b', '#111111']];
  return colours.map(([fill, edge], k) => {
    const c = document.createElement('canvas');
    c.width = 1080; c.height = 1920;
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, 1920);
    bg.addColorStop(0, ['#d8d2c8', '#c9d3dc', '#e3d3c8', '#d2dbcf', '#efe6d2', '#d9d9d9'][k]);
    bg.addColorStop(1, ['#a8a093', '#8f9aa6', '#b39d8e', '#9ba897', '#c9b994', '#9c9c9c'][k]);
    g.fillStyle = bg; g.fillRect(0, 0, 1080, 1920);
    g.save();
    g.translate(540, 1000);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.beginPath(); g.ellipse(0, 520, 360, 40, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = fill; g.strokeStyle = edge; g.lineWidth = 6;
    g.beginPath();
    g.moveTo(-120, -420); g.quadraticCurveTo(0, -350, 120, -420);
    g.lineTo(330, -330); g.lineTo(420, -90); g.lineTo(270, -40); g.lineTo(260, 480);
    g.lineTo(-260, 480); g.lineTo(-270, -40); g.lineTo(-420, -90); g.lineTo(-330, -330); g.closePath();
    g.fill(); g.stroke();
    g.beginPath(); g.moveTo(-120, -420); g.quadraticCurveTo(0, -330, 120, -420); g.stroke();
    g.restore();
    return c;
  });
}
