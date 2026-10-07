// Interactive pixel-art footer ("tapuj!"). Every tap raises hype, hype decays on its own, and the
// whole scene is a function of that one number. The art comes from DALL-E, cut into layers by
// Scena/przygotuj.py (strona/scena/*.png + scena.json); this file moves the layers and adds light and
// particles. The scene follows data-motyw on <html> (set by the day tabs); a day without a scene hides
// the footer. Preview only: ?hype=0.5 freezes hype, ?t=4 pre-runs 4 s of animation.
(function () {
  var box = document.getElementById('scena');
  if (!box) return;
  var cv = box.querySelector('canvas'), ctx = cv.getContext('2d');
  var SCENES = { noc: ['piatek', bitwa], pustkowie: ['sobota', konwoj] };   // motyw -> [scena.json key, scene]
  var V = (/[?&]v=(\d+)/.exec(document.currentScript ? document.currentScript.src : '') || [])[1] || Date.now();

  var query = new URLSearchParams(location.search);
  var frozen = parseFloat(query.get('hype')), preroll = parseFloat(query.get('t')) || 0;
  var hype = isNaN(frozen) ? 0 : frozen;
  var meta = null, img = {}, loading = false, scene = null, W = 0, H = 0, width = 0, visible = false, looping = false, last = 0;

  // scena.json lists each scene's layers; only the shown day's PNGs are loaded, all before its first frame
  function load(key) {
    loading = true;
    var ready = meta ? Promise.resolve(meta) : fetch('scena/scena.json?v=' + V).then(function (r) { return r.json(); });
    ready.then(function (m) {
      meta = m;
      return Promise.all(meta[key].files.filter(function (n) { return !img[n]; }).map(function (n) {
        return new Promise(function (ok, fail) {
          var i = new Image();
          i.onload = function () { img[n] = i; ok(); };
          i.onerror = fail;
          i.src = 'scena/' + n + '.png?v=' + V;
        });
      }));
    }).then(function () { loading = false; setup(); }, function () { loading = false; box.hidden = true; });
  }

  function setup() {
    var pick = SCENES[document.documentElement.dataset.motyw];
    scene = null;
    var ready = pick && meta && meta[pick[0]].files.every(function (n) { return img[n]; });
    if (box.hidden !== !ready) {                       // re-observe: unhiding alone may not report an intersection
      box.hidden = !ready;
      io.unobserve(box); io.observe(box);
    }
    if (!pick) return;
    if (!ready) { if (!loading) load(pick[0]); return; }
    var s = pick[1]({ meta: meta, img: img });
    W = s.w; H = s.h; cv.width = W; cv.height = H;
    var cs = getComputedStyle(box);
    var room = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    // as wide as the screen, but never taller than ~30% of it (phone in landscape, desktop)
    var inner = Math.floor(Math.min(room, 480, window.innerHeight * 0.3 * W / H)) - 4;
    cv.style.width = inner + 'px'; cv.style.height = Math.round(inner * H / W) + 'px';
    width = box.clientWidth;
    scene = s;
    for (var i = 0; i < preroll * 60; i++) { scene.update(1 / 60, hype); scene.draw(ctx, hype); }
    scene.update(0, hype); scene.draw(ctx, hype);
    loop();
  }

  function loop() {
    if (looping || !visible || !scene || document.hidden) return;
    looping = true; last = performance.now();
    requestAnimationFrame(frame);
  }
  function frame(now) {
    if (!visible || !scene || document.hidden) { looping = false; return; }
    requestAnimationFrame(frame);
    if (hype < 0.05 && now - last < 30) return;     // nobody tapping: ~30 fps is plenty, the scene is always on screen
    var dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;   // rAF time can trail performance.now()
    if (isNaN(frozen)) hype *= Math.exp(-dt / 2);   // half-life ~1.4 s: you have to keep the fire going
    scene.update(dt, hype); scene.draw(ctx, hype);
  }

  box.addEventListener('pointerdown', function (e) {
    if (!scene) return;
    if (isNaN(frozen)) hype = Math.min(1, hype + 0.12);
    var r = cv.getBoundingClientRect();
    scene.tap((e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H);
    if (navigator.vibrate) navigator.vibrate(8);
  });
  var io = new IntersectionObserver(function (e) { visible = e[e.length - 1].isIntersecting; loop(); });
  io.observe(box);
  document.addEventListener('visibilitychange', loop);
  new MutationObserver(setup).observe(document.documentElement, { attributes: true, attributeFilter: ['data-motyw'] });
  window.addEventListener('resize', function () { if (box.clientWidth !== width) setup(); });

  // ---------- pixel helpers ----------

  function rng(seed) {   // mulberry32: the same crowd on every load
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function layer(w, h) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d', { willReadFrequently: true });
    return c;
  }
  function rgb(c, a) { return a == null ? 'rgb(' + c + ')' : 'rgba(' + c + ',' + a + ')'; }
  function disc(g, cx, cy, r, col) {
    g.fillStyle = col;
    for (var dy = -r; dy <= r; dy++) { var w = Math.floor(Math.sqrt(r * r - dy * dy)); g.fillRect(cx - w, cy + dy, w * 2 + 1, 1); }
  }
  // Soft pixel glow: three stacked discs; draw with 'lighter' compositing.
  function glow(g, x, y, r, a, col) {
    [1, 0.66, 0.33].forEach(function (k) { disc(g, Math.round(x), Math.round(y), Math.max(1, Math.round(r * k)), rgb(col, (a / 2).toFixed(3))); });
  }
  // Thick Bresenham line with a square brush of size s.
  function line(g, x0, y0, x1, y1, s) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, e = dx + dy, o = s >> 1;
    for (;;) {
      g.fillRect(x0 - o, y0 - o, s, s);
      if (x0 === x1 && y0 === y1) return;
      var e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
  }
  // Backlit silhouettes: a one-colour layer gets its outline relit — bright on top, dimmer on the sides.
  function rim(c, top, side) {
    var g = c.getContext('2d'), w = c.width, h = c.height;
    var img = g.getImageData(0, 0, w, h), d = img.data, a = new Uint8Array(w * h);
    for (var i = 0; i < w * h; i++) a[i] = d[i * 4 + 3];
    function on(x, y) { return y < 0 ? 0 : x < 0 || x >= w || y >= h ? 1 : a[y * w + x]; }
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      if (!a[y * w + x]) continue;
      var col = !on(x, y - 1) ? top : side && (!on(x - 1, y) || !on(x + 1, y)) ? side : null;
      if (col) { var k = (y * w + x) * 4; d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; }
    }
    g.putImageData(img, 0, 0);
  }

  // 5-row pixel font, variable width (M, N, W need more than 3 columns to read); only what the scenes use.
  var GLYPH = {
    A: '010|101|111|101|101', B: '110|101|110|101|110', C: '011|100|100|100|011', D: '110|101|101|101|110',
    E: '111|100|110|100|111', G: '011|100|101|101|011', H: '101|101|111|101|101', I: '111|010|010|010|111',
    J: '001|001|001|101|010', K: '101|101|110|101|101', L: '100|100|100|100|111',
    M: '10001|11011|10101|10001|10001', N: '1001|1101|1011|1001|1001', O: '010|101|101|101|010',
    P: '110|101|110|100|100', R: '110|101|110|101|101', S: '011|100|010|001|110', T: '111|010|010|010|010',
    U: '101|101|101|101|111', W: '10001|10001|10101|11011|10001', Y: '101|101|010|010|010',
    Z: '111|001|010|100|111', '!': '1|1|1|0|1', ' ': '00|00|00|00|00', '♪': '011|010|010|110|110'
  };
  function glyph(ch) { return (GLYPH[ch === 'Ń' ? 'N' : ch] || GLYPH[' ']).split('|'); }
  function textW(s, k) {
    var w = -1;
    for (var i = 0; i < s.length; i++) w += glyph(s[i])[0].length + 1;
    return w * (k || 1);
  }
  function text(g, s, x, y, col, k) {
    k = k || 1; g.fillStyle = rgb(col);
    for (var i = 0; i < s.length; i++) {
      var rows = glyph(s[i]);
      for (var ry = 0; ry < 5; ry++) for (var rx = 0; rx < rows[ry].length; rx++) {
        if (rows[ry][rx] === '1') g.fillRect(x + rx * k, y + ry * k, k, k);
      }
      if (s[i] === 'Ń') g.fillRect(x + 2 * k, y - 2 * k, k, k);   // the accent
      x += (rows[0].length + 1) * k;
    }
  }
  // Text that reads over a busy picture: a 1px drop shadow, or a full outline for the big titles.
  function say(g, s, x, y, col, k) {
    var ring = k > 2 ? [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]] : [[1, 1]];
    ring.forEach(function (o) { text(g, s, x + o[0], y + o[1], [20, 10, 8], k); });
    text(g, s, x, y, col, k);
  }

  // ---------- Friday: rap battle at night ----------
  // Two MCs under a spotlight that follows whoever has the mic; turns switch every 8 beats.
  // Hype drives the tempo (88 -> 168 BPM) and three tiers: luz (< .33) · nawijka (< .7) · ogień.

  function bitwa(art) {
    var M = art.meta.piatek, I = art.img, W = M.w, H = M.h, FX = M.fx;
    var R = rng(9);
    var CREAM = [239, 228, 207], RIM = [243, 154, 30], WARM = [255, 150, 60], SPOT = [255, 214, 160];
    var PHONE = [255, 236, 190], BLACK = [7, 10, 18];
    var WORDS = ['YO', 'EJ', 'SKRR', 'HA!', 'TAK!', 'JAZDA'];

    var mcs = ['l', 'p'].map(function (k) {
      var m = M.mcs[k];
      return { img: I['piatek-mc-' + k], x: m.x, y: m.y, w: m.w, h: m.h, cx: m.x + m.ax, frames: m.frames, face: m.face,
        mouths: m.mouths, dx: 0, dy: 0, frame: 0 };
    });
    // the front row moves in slices, one per head, so people bounce on their own
    var heads = M.heads.map(function (hd, i, all) {
      return { x: hd[0], y: hd[1], x0: i ? (all[i - 1][0] + hd[0]) >> 1 : 0, x1: i < all.length - 1 ? (hd[0] + all[i + 1][0]) >> 1 : W,
        thr: 0.1 + R() * 0.55, off: R() * 0.25, arm: R() < 0.5 ? -1 : 1, phone: R() < 0.25, both: R() < 0.45 };
    });
    heads.forEach(function (c) { c.stage = c.x > mcs[0].cx + 12 && c.x < mcs[1].cx - 12; });
    var phones = [];                                  // spots in the crowd that light up as hype grows
    for (var i = 0; i < 26; i++) {
      phones.push({ x: FX.crowd[0] + R() * (FX.crowd[2] - FX.crowd[0]) | 0, y: FX.crowd[1] + R() * (FX.crowd[3] - FX.crowd[1]) | 0,
        thr: 0.12 + R() * 0.8, ph: R() * 6 });
    }
    var arms = layer(W, H);
    var parts = [], t = 0, b = 0, active = 0, speak = 0.5, note = 0, kick = 0, pyro = 0, flash = null;

    function update(dt, h) {
      t += dt; b += dt * (88 + 80 * h) / 60;
      kick *= Math.exp(-dt / 0.12);
      active = Math.floor(b / 8) % 2;
      var m = mcs[active];
      speak -= dt;
      if (h > 0.12 && speak <= 0) {
        speak = 1.6 - 0.9 * h;
        var mouth = m.mouths[m.frame] || m.mouths[0];
        parts.push({ s: WORDS[Math.random() * WORDS.length | 0], x: m.x + mouth[0] + m.face * 10, y: m.y + mouth[1] - 12,
          vx: m.face * (8 + 14 * h), vy: -14, life: 1.1, col: CREAM, k: 2 });
      }
      note -= dt;
      if (h > 0.33 && note <= 0) {
        note = 1.1 - 0.75 * h;
        parts.push({ s: '♪', x: FX.boombox[0] + Math.random() * 12 - 6, y: FX.boombox[1] - 4, vx: Math.random() * 10 - 5, vy: -14,
          life: 1.2, col: RIM, k: 2 });
      }
      pyro = h > 0.9 ? pyro + dt * 90 : 0;           // ogień: pyro jets on both sides of the stage
      for (; pyro >= 1; pyro--) {
        FX.pyro.forEach(function (x) {
          parts.push({ fire: true, x: x + Math.random() * 6 - 3, y: FX.floor, vx: Math.random() * 8 - 4, vy: -90 - Math.random() * 50,
            life: 0.45 + Math.random() * 0.35 });
        });
      }
      if (h > 0.8 && Math.random() < dt * 3) {      // somebody in the crowd takes a photo
        var p = phones[Math.random() * phones.length | 0];
        flash = { x: p.x, y: p.y, life: 0.08 };
      }
      if (flash && (flash.life -= dt) <= 0) flash = null;
      parts = parts.filter(function (q) {
        q.x += q.vx * dt; q.y += q.vy * dt; q.vy += (q.g || 0) * dt; q.life -= dt;
        return q.life > 0;
      });
    }

    // Pose sheet frames: 0 idle · 1 mic at the mouth · 2 open hand · 3 pointing · 4 jump · 5 reaction.
    function pose(m, i, h, on, beat, bf) {
      var posed = m.frames >= 6, jump = h >= 0.7 && bf < 0.5 && beat % 2 === 1;
      m.dx = 0; m.dy = 0; m.frame = 0;
      if (i === active) {
        m.dy = on ? 1 : 0;
        if (h >= 0.33 && on) m.dx = m.face;                    // leans in on the beat
        if (jump) m.dy = -Math.round(Math.sin(bf * 2 * Math.PI) * (posed ? 1 + 3 * (h - 0.7) / 0.3 : 2 + 4 * (h - 0.7) / 0.3));
        if (posed) m.frame = jump ? 4 : h < 0.33 ? [1, 1, 2, 1][beat % 4] : h < 0.7 ? [1, 2, 1, 3][beat % 4] : [3, 2][beat % 2];
      } else {
        m.dy = on && beat % 2 === 0 ? 1 : 0;                    // the other one only nods, every other beat
        if (posed) m.frame = h >= 0.7 ? 5 : 0;
      }
    }

    function draw(g, h) {
      var bf = b % 1, on = bf < 0.5, beat = Math.floor(b), pulse = on ? 1 - bf * 2 : 0;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#0b0f1a'; g.fillRect(0, 0, W, H);
      if (h > 0.9) g.setTransform(1, 0, 0, 1, (Math.random() * 3 | 0) - 1, (Math.random() * 3 | 0) - 1);
      g.drawImage(I['piatek-tlo'], 0, 0);

      // light: the haze breathes with the beat, the lamps flare, phones come out, spotlight on the mic
      g.globalCompositeOperation = 'lighter';
      var haze = (0.02 + 0.1 * h) * pulse;
      for (var y = 26; y < FX.floor; y += 2) {
        var k = Math.sin(Math.PI * (y - 26) / (FX.floor - 26));
        g.fillStyle = rgb(WARM, (haze * k).toFixed(3)); g.fillRect(0, y, W, 2);
      }
      FX.lamps.forEach(function (l) { glow(g, l[0], l[1], 5 + Math.round(4 * pulse * h), 0.1 + 0.25 * h * pulse, WARM); });
      phones.forEach(function (p) {
        if (h <= p.thr) return;
        var a = 0.65 + 0.35 * Math.sin(t * 3 + p.ph);
        g.fillStyle = rgb(RIM, (0.25 * a).toFixed(2)); g.fillRect(p.x - 1, p.y - 1, 4, 5);
        g.fillStyle = rgb(PHONE, a.toFixed(2)); g.fillRect(p.x, p.y, 2, 3);
      });
      if (flash) { g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(flash.x - 1, flash.y - 3, 3, 7); g.fillRect(flash.x - 3, flash.y - 1, 7, 3); }
      var m = mcs[active], cx = m.cx + m.dx, feet = m.y + m.h;
      for (y = 0; y < feet; y++) {
        var hw = 3 + Math.round((m.w / 2 + 4) * y / feet), step = Math.ceil(4 * y / feet) / 4;
        g.fillStyle = rgb(SPOT, ((0.03 + 0.06 * h) * step).toFixed(3));
        g.fillRect(Math.round(cx - hw), y, hw * 2 + 1, 1);
      }
      g.fillStyle = rgb(SPOT, (0.1 + 0.15 * h).toFixed(3));
      g.fillRect(Math.round(cx - m.w / 2 - 6), feet - 2, m.w + 12, 2); g.fillRect(Math.round(cx - m.w / 2 - 2), feet, m.w + 4, 1);
      var bump = (on && h > 0.12) || kick > 0.3;
      FX.speakers.forEach(function (s) { if (bump) glow(g, s[0], s[1], 4, 0.5, RIM); });
      g.globalCompositeOperation = 'source-over';

      // Layers back to front: the crowd (plate) · raised hands with phones · the MCs · front-row heads.
      // The heads always go last, so the MCs' feet disappear behind the audience instead of standing on it.
      heads.forEach(function (c) {
        c.on = (b + c.off) % 1 < 0.5;
        c.lvl = h > c.thr + 0.3 ? 2 : h > c.thr ? 1 : 0;
        c.dy = Math.round(kick * 3) + (c.lvl === 2 && c.on ? 2 : c.lvl === 1 && c.on ? 1 : 0);   // a tap: everyone jumps
      });
      var ag = arms.getContext('2d'), props = [];
      ag.clearRect(0, 0, W, H); ag.fillStyle = rgb(BLACK);
      heads.forEach(function (c) {
        if (c.stage) return;                            // right in front of the MCs: hands stay down, the stage stays clear
        var top = c.y - c.dy, sides = c.lvl === 2 && c.both ? [c.arm, -c.arm] : c.lvl ? [c.arm] : [];
        sides.forEach(function (sd, j) {
          var pump = (j ? !c.on : c.on) ? 0 : 4;
          var ex = c.x + sd * 14, ey = top + 1 + (pump >> 1), fx = c.x + sd * 11, fy = top - 12 + pump;
          line(ag, c.x + sd * 7, top + 14, ex, ey, 5);   // upper arm…
          line(ag, ex, ey, fx, fy, 4);                   // …forearm, bent at the elbow
          ag.fillRect(fx - 3, fy - 4, 6, 5); ag.fillRect(fx - 2, fy - 5, 4, 1);
          if (!j && c.phone) props.push([fx, fy - 7]);
        });
      });
      rim(arms, [150, 82, 30], [70, 40, 22]);
      g.drawImage(arms, 0, 0);
      props.forEach(function (p) {
        g.globalCompositeOperation = 'lighter'; glow(g, p[0], p[1], 4, 0.3, RIM);
        g.globalCompositeOperation = 'source-over'; g.fillStyle = rgb(PHONE); g.fillRect(p[0] - 2, p[1] - 3, 4, 6);
      });

      mcs.forEach(function (mc, i) {
        pose(mc, i, h, on, beat, bf);
        g.drawImage(mc.img, mc.frame * mc.w, 0, mc.w, mc.h, mc.x + mc.dx, mc.y + mc.dy, mc.w, mc.h);
      });

      parts.forEach(function (q) {                      // pyro sits behind the front row
        if (!q.fire) return;
        g.fillStyle = q.life > 0.55 ? '#fff0b0' : q.life > 0.38 ? '#ffd27a' : q.life > 0.2 ? '#f39a1e' : '#c4501e';
        var sz = q.life > 0.55 ? 5 : q.life > 0.3 ? 4 : 3;
        g.fillRect(Math.round(q.x - sz / 2), Math.round(q.y), sz, sz + 1);
      });

      heads.forEach(function (c) {                      // each head is its own slice, so people bounce on their own
        g.drawImage(I['piatek-przod'], c.x0, 0, c.x1 - c.x0, H, c.x0, -c.dy, c.x1 - c.x0, H);
      });

      parts.forEach(function (q) {
        if (q.fire || (q.life < 0.3 && (q.life * 20 | 0) % 2)) return;   // blink out
        if (q.s && h > 0.9 && q.y < 24) return;                            // keep the title clean
        if (q.s) say(g, q.s, Math.round(q.x - textW(q.s, q.k) / 2), Math.round(q.y), q.col, q.k);
        else { g.fillStyle = rgb(q.col); g.fillRect(Math.round(q.x), Math.round(q.y), 2, 2); }
      });
      if (h > 0.7 && bf < 0.1) { g.fillStyle = rgb(RIM, 0.12); g.fillRect(-2, -2, W + 4, H + 4); }   // flash on the beat

      // hype bar + prompts (not shaken)
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(3, 2, W - 6, 3);
      g.fillStyle = rgb(h > 0.9 && (t * 8 | 0) % 2 ? CREAM : RIM); g.fillRect(3, 2, Math.round((W - 6) * h), 3);
      if (h < 0.03 && t % 1.2 < 0.8) say(g, 'TAPUJ!', (W - textW('TAPUJ!', 2)) >> 1, 9, CREAM, 2);
      if (h > 0.9) say(g, 'OGIEŃ!', (W - textW('OGIEŃ!', 3)) >> 1, 12, (t * 8 | 0) % 2 ? RIM : CREAM, 3);
    }

    function tap(x, y) {
      kick = 1;
      for (var i = 0; i < 8; i++) {
        parts.push({ x: x, y: y, vx: (Math.random() - 0.5) * 90, vy: -20 - Math.random() * 50, g: 160,
          life: 0.35 + Math.random() * 0.25, col: Math.random() < 0.5 ? RIM : CREAM });
      }
    }

    return { w: W, h: H, update: update, draw: draw, tap: tap };
  }

  // ---------- Saturday: convoy through the wasteland ----------
  // The world scrolls in parallax (sky still · desert with flags · road · rocks in front); hype is speed.
  // A tap fires nitro on the car nearest the finger: flame frame, it surges ahead, then drops back.
  // Tiers: luz (cruising) · gaz (< .7, dust and speed lines) · nitro (> .9, everyone on nitro, shake).

  function konwoj(art) {
    var M = art.meta.sobota, I = art.img, W = M.w, H = M.h;
    var CREAM = [239, 228, 207], RIM = [243, 154, 30], SAND = [232, 196, 138], FLAME = [255, 210, 120];
    var desert = mirror(I['sobota-pustynia']), road = mirror(I['sobota-droga']), rocks = mirror(I['sobota-skaly']);
    // the middle car rides a lane further back, so overtakes read as passing, not crashing
    var cars = M.cars.map(function (c, i) {
      return { img: I['sobota-auto-' + i], x: c.x, y: c.y - (i === 1 ? 5 : 0), w: c.w, h: c.h, surge: 0, nitro: 0, bump: 0, ph: i * 1.7 };
    });
    var order = [1, 0, 2];
    var parts = [], t = 0, dist = 0, speed = 0, auto = 0;

    // a strip and its mirror image side by side tile seamlessly, whatever the picture
    function mirror(img) {
      var c = document.createElement('canvas'), g = c.getContext('2d');
      c.width = img.width * 2; c.height = img.height;
      g.drawImage(img, 0, 0);
      g.setTransform(-1, 0, 0, 1, c.width, 0); g.drawImage(img, 0, 0);
      return c;
    }
    function scroll(g, tile, y, offset) {
      var x = -Math.round(offset % tile.width);
      for (; x < W; x += tile.width) g.drawImage(tile, x, y);
    }

    function update(dt, h) {
      t += dt;
      var boost = cars.reduce(function (s, c) { return s + (c.nitro > 0 ? 1 : 0); }, 0);
      speed = 35 + 175 * h + 25 * boost;
      dist += speed * dt;
      if (h > 0.9 && (auto -= dt) <= 0) {          // full hype: the whole convoy keeps firing nitro
        auto = 0.35;
        cars[Math.random() * 3 | 0].nitro = 0.5;
      }
      cars.forEach(function (c) {
        c.nitro = Math.max(0, c.nitro - dt);
        c.bump = Math.max(0, c.bump - dt);
        var target = c.nitro > 0 ? 18 : 0;
        c.surge += (target - c.surge) * Math.min(1, dt * (c.nitro > 0 ? 6 : 1.5));
        if (!c.bump && Math.random() < dt * speed / 260) c.bump = 0.22;   // rocks on the road
        var rate = speed / 40;                                            // dust off the rear wheels
        if (Math.random() < dt * rate * 3) {
          parts.push({ x: c.x + c.surge + 6, y: c.y + c.h - 3 - Math.random() * 4, vx: -speed * (0.4 + Math.random() * 0.3),
            vy: -6 - Math.random() * 10, life: 0.4 + Math.random() * 0.4, col: SAND, sz: 2 + (Math.random() * 2 | 0) });
        }
      });
      if (h > 0.4 && Math.random() < dt * 30 * (h - 0.4)) {              // speed lines
        parts.push({ line: true, x: W + 5, y: 14 + Math.random() * 90 | 0, vx: -speed * 2.2, vy: 0, life: 0.6,
          len: 10 + Math.random() * 25 | 0 });
      }
      parts = parts.filter(function (q) {
        q.x += q.vx * dt; q.y += q.vy * dt; q.vy += (q.g || 0) * dt; q.life -= dt;
        return q.life > 0 && q.x > -40;
      });
    }

    function draw(g, h) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-over';
      if (h > 0.9) g.setTransform(1, 0, 0, 1, (Math.random() * 3 | 0) - 1, (Math.random() * 3 | 0) - 1);
      g.drawImage(I['sobota-niebo'], 0, 0);
      scroll(g, desert, 0, dist * 0.2);
      scroll(g, road, M.road, dist);

      parts.forEach(function (q) {                    // dust behind the cars
        if (q.line || q.spark) return;
        g.fillStyle = rgb(q.col, Math.min(0.85, q.life * 1.6).toFixed(2));
        g.fillRect(Math.round(q.x), Math.round(q.y), q.sz, q.sz);
      });
      order.forEach(function (i) {
        var c = cars[i];
        var frame = c.nitro > 0 ? 1 : c.bump > 0.08 ? 2 : 0;
        var rumble = (t * (8 + speed / 15) + c.ph | 0) % 2;                 // engine shake, 1 px
        var x = Math.round(c.x + c.surge), y = c.y - rumble - (c.bump > 0.08 ? 1 : 0);
        g.drawImage(c.img, frame * c.w, 0, c.w, c.h, x, y, c.w, c.h);
        if (c.nitro > 0) {                                                   // extra flicker on the flame
          g.globalCompositeOperation = 'lighter';
          glow(g, x + 8, y + c.h - 9, 4 + (t * 20 | 0) % 3, 0.5, FLAME);
          g.globalCompositeOperation = 'source-over';
        }
      });
      scroll(g, rocks, M.road + M.rocks_dy, dist * 1.5);

      parts.forEach(function (q) {
        if (q.line) { g.fillStyle = 'rgba(255,236,200,.55)'; g.fillRect(Math.round(q.x), q.y, q.len, 1); }
        else if (q.spark) {
          if (q.life < 0.15 && (q.life * 40 | 0) % 2) return;
          g.fillStyle = rgb(q.col); g.fillRect(Math.round(q.x), Math.round(q.y), 2, 2);
        }
      });

      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(3, 2, W - 6, 3);
      g.fillStyle = rgb(h > 0.9 && (t * 8 | 0) % 2 ? CREAM : RIM); g.fillRect(3, 2, Math.round((W - 6) * h), 3);
      if (h < 0.03 && t % 1.2 < 0.8) say(g, 'TAPUJ!', (W - textW('TAPUJ!', 2)) >> 1, 9, CREAM, 2);
      if (h > 0.9) say(g, 'NITRO!', (W - textW('NITRO!', 3)) >> 1, 12, (t * 8 | 0) % 2 ? RIM : CREAM, 3);
    }

    function tap(x, y) {
      var near = cars.reduce(function (best, c) {
        var d = Math.abs(c.x + c.surge + c.w / 2 - x);
        return d < best.d ? { c: c, d: d } : best;
      }, { c: null, d: 1e9 }).c;
      near.nitro = 0.6;
      for (var i = 0; i < 8; i++) {
        parts.push({ spark: true, x: x, y: y, vx: (Math.random() - 0.5) * 90, vy: -20 - Math.random() * 50, g: 160,
          life: 0.35 + Math.random() * 0.25, col: Math.random() < 0.5 ? RIM : CREAM });
      }
    }

    return { w: W, h: H, update: update, draw: draw, tap: tap };
  }

  setup();   // last: everything above must be defined before the first draw
})();
