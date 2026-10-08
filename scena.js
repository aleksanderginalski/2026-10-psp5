// Interactive pixel-art footer ("tapuj!"). Every tap raises hype, hype decays on its own, and the
// whole scene is a function of it. Hype is three tiers stacked on one bar (see "tiers" below); the top one,
// held long enough, plays the day's finale. The art comes from DALL-E, cut into layers by
// Scena/przygotuj.py (strona/scena/*.png + scena.json); this file moves the layers and adds light and
// particles. The scene follows data-motyw on <html> (set by the day tabs); a day without a scene hides
// the footer. The shouts come from the shown day in plan.json (index.html hands it over as box.dzien).
// Preview only: ?hype=0.5 freezes hype (1.5 = the red tier half full, 2.5 = the top one), ?t=4 pre-runs 4 s
// of animation, ?teraz=20:00 sets the clock, ?final=1 starts with the finale.
(function () {
  var box = document.getElementById('scena');
  if (!box) return;
  var cv = box.querySelector('canvas'), ctx = cv.getContext('2d');
  var SCENES = { noc: ['piatek', bitwa], pustkowie: ['sobota', konwoj] };   // motyw -> [scena.json key, scene]
  var V = (/[?&]v=(\d+)/.exec(document.currentScript ? document.currentScript.src : '') || [])[1] || Date.now();

  var query = new URLSearchParams(location.search);
  var frozen = parseFloat(query.get('hype')), preroll = parseFloat(query.get('t')) || 0, fakeClock = query.get('teraz');
  var live = isNaN(frozen);
  var meta = null, img = {}, loading = false, scene = null, W = 0, H = 0, width = 0, visible = false, looping = false, last = 0;
  var CREAM = [239, 228, 207];

  // ---------- tiers ----------
  // [0] ogien / nitro · [1] red · [2] void / toxic green, each filling over the full one below it. A tier opens
  // once the one below has been held at >= MAX for GATE s and starts at ENTRY; the top one held for FINAL s plays
  // the finale, then everything drops back to zero. Holding takes ~4 taps/s on the first two tiers and 5 on the
  // top one; the finale takes ~6 taps/s for ~22 s, or ~8 (two thumbs, a friend — every finger counts) for ~13 s.
  // Without taps the bar drains and the scene steps back down a tier at a time.
  var TIERS = [{ gain: 0.12, tau: 2 }, { gain: 0.15, drain: 0.65 }, { gain: 0.15, drain: 0.75 }];
  var MAX = 0.9, GATE = 2, FINAL = 5, ENTRY = 0.3;
  var st = { lvl: 0, fill: 0, hold: 0, fin: -1, since: 9, stop: 0 };   // fin: seconds into the finale, -1 = none
  if (!live) { st.lvl = Math.max(0, Math.min(2, Math.ceil(frozen) - 1)); st.fill = Math.min(1, frozen - st.lvl); }
  if (query.get('final')) st.fin = 0;
  function base() { return st.lvl ? 1 : st.fill; }   // from the red tier on, the first tier's scene runs flat out

  function tick(dt) {
    if (st.stop > 0) { st.stop -= dt; return 0; }      // hit-stop: the world holds still for a moment
    st.since += dt;
    if (st.fin >= 0) {
      st.fin += dt;
      if (scene && st.fin >= scene.finale) { st.fin = -1; st.lvl = 0; st.fill = 0; st.hold = 0; st.since = 9; }
      return dt;
    }
    if (!live) return dt;
    var T = TIERS[st.lvl];
    st.fill = T.tau ? st.fill * Math.exp(-dt / T.tau) : st.fill - T.drain * dt;
    if (st.fill < 0) { st.lvl--; st.fill = 0.85; st.hold = 0; st.since = 9; }   // a tier down, just under its top
    st.hold = st.fill >= MAX ? st.hold + dt : Math.max(0, st.hold - dt);
    if (st.lvl < 2 && st.hold >= GATE) { st.lvl++; st.fill = ENTRY; st.hold = 0; st.since = 0; st.stop = 0.1; }
    else if (st.lvl === 2 && st.hold >= FINAL) { st.fin = 0; st.hold = 0; st.since = 0; st.stop = 0.12; }
    return dt;
  }

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
    var fr = meta[pick[0]].ramka, wrap = cv.parentNode, pic = wrap.querySelector('img');
    box.classList.toggle('framed', !!fr);              // before measuring: the padding changes
    document.documentElement.style.setProperty('--lip', '0px');
    var cs = getComputedStyle(box);
    var room = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if (fr) {
      // the frame as wide as the screen, its body (below what sticks out on top) under ~1/3 of its height;
      // the canvas fills the frame's window
      var k = Math.min(Math.min(room, 600) / fr.w, window.innerHeight * 0.34 / (fr.h - fr.lip));
      wrap.style.cssText = 'width:' + fr.w * k + 'px;height:' + fr.h * k + 'px;margin-top:' + -fr.lip * k + 'px';
      document.documentElement.style.setProperty('--lip', fr.lip * k + 'px');   // the plan scrolls clear of it
      cv.style.cssText = 'left:' + fr.win[0] * k + 'px;top:' + fr.win[1] * k + 'px;width:' + fr.win[2] * k + 'px;height:' + fr.win[3] * k + 'px';
      var src = 'scena/' + fr.src + '?v=' + V;
      if (pic.getAttribute('src') !== src) pic.src = src;
      pic.hidden = false;
    } else {
      // as wide as the screen, but never taller than ~30% of it (phone in landscape, desktop)
      var inner = Math.floor(Math.min(room, 480, window.innerHeight * 0.3 * W / H)) - 4;
      wrap.style.cssText = '';
      cv.style.cssText = 'width:' + inner + 'px;height:' + Math.round(inner * H / W) + 'px';
      pic.hidden = true;
    }
    width = box.clientWidth;
    scene = s;
    for (var i = 0; i < preroll * 60; i++) { var d = tick(1 / 60); scene.update(d, base(), st); scene.draw(ctx, base(), st); }
    scene.update(0, base(), st); scene.draw(ctx, base(), st);
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
    if (!st.lvl && st.fill < 0.05 && st.fin < 0 && now - last < 30) return;   // nobody tapping: ~30 fps is plenty
    var dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;   // rAF time can trail performance.now()
    var d = tick(dt);
    scene.update(d, base(), st); scene.draw(ctx, base(), st);
  }

  box.addEventListener('pointerdown', function (e) {
    if (!scene) return;
    if (live && st.fin < 0) st.fill = Math.min(1, st.fill + TIERS[st.lvl].gain);
    var r = cv.getBoundingClientRect(), k = Math.min(r.width / W, r.height / H);   // the scene may be letterboxed
    scene.tap((e.clientX - r.left - (r.width - W * k) / 2) / k, (e.clientY - r.top - (r.height - H * k) / 2) / k);
    if (navigator.vibrate) navigator.vibrate(8);
  });
  var io = new IntersectionObserver(function (e) { visible = e[e.length - 1].isIntersecting; loop(); });
  io.observe(box);
  document.addEventListener('visibilitychange', loop);
  new MutationObserver(setup).observe(document.documentElement, { attributes: true, attributeFilter: ['data-motyw'] });
  window.addEventListener('resize', function () { if (box.clientWidth !== width) setup(); });

  // ---------- shouts ----------
  // The day's own pool ("okrzyki"), and 1 in 4 from the pool of the item on right now. The night belongs
  // to the day before: at 00:30 it is still Friday, "24:30", so the 24:00 item gets its turn.
  var said = null;
  function okrzyk() {
    var d = box.dzien || {}, pool = d.okrzyki || [], now = teraz(d), on = null;
    var punkty = now.day === d.data ? d.punkty || [] : [];
    punkty.forEach(function (p) { if (p.godzina <= now.clock && (!on || p.godzina > on.godzina)) on = p; });
    if (on && on.okrzyki && on.okrzyki.length && (!pool.length || Math.random() < 0.25)) pool = on.okrzyki;
    if (!pool.length) return null;
    var s = pool[Math.random() * pool.length | 0];
    if (s === said && pool.length > 1) s = pool[(pool.indexOf(s) + 1) % pool.length];   // never twice in a row
    return (said = s).toUpperCase();
  }
  function teraz(d) {
    if (/^\d\d:\d\d$/.test(fakeClock || '')) return { day: d.data, clock: fakeClock };
    var n = new Date(), late = n.getHours() < 6;
    if (late) n.setDate(n.getDate() - 1);
    return { day: n.getFullYear() + '-' + pad(n.getMonth() + 1) + '-' + pad(n.getDate()),
      clock: pad(n.getHours() + (late ? 24 : 0)) + ':' + pad(n.getMinutes()) };
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function readTime(s) { return Math.max(1.1, 0.5 + s.length * 0.07); }   // long shouts stay up longer

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
  function clamp(x) { return Math.max(0, Math.min(1, x)); }
  function ease(x) { x = clamp(x); return x * (2 - x); }
  function toward(v, to, up, down) { return v + Math.max(-down, Math.min(up, to - v)); }
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
  // Relight a layer for a tier (16-bit palette-swap style): brightness mapped onto a ramp of colours, so
  // the same picture becomes hell, the void or toxic sky and stays aligned with every other layer.
  function recolor(src, stops) {
    var c = layer(src.width, src.height), g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    var im = g.getImageData(0, 0, c.width, c.height), p = im.data;
    for (var i = 0; i < p.length; i += 4) {
      if (!p[i + 3]) continue;
      var L = (p[i] * 3 + p[i + 1] * 6 + p[i + 2]) / 2550, j = 1;
      while (j < stops.length - 1 && stops[j][0] < L) j++;
      var a = stops[j - 1], b = stops[j], k = clamp((L - a[0]) / (b[0] - a[0]));
      for (var ch = 0; ch < 3; ch++) p[i + ch] = Math.round(a[1][ch] + (b[1][ch] - a[1][ch]) * k);
    }
    g.putImageData(im, 0, 0);
    return c;
  }
  // Versions of one layer per tier, crossfaded while the tier colours change (v = 0..n-1, fractional).
  function blend(g, vers, v, sx, sy, sw, sh, dx, dy) {
    var i = Math.min(vers.length - 1, Math.floor(v)), k = v - i;
    if (sw == null) { sx = 0; sy = 0; sw = vers[0].width; sh = vers[0].height; dx = 0; dy = 0; }
    g.drawImage(vers[i], sx, sy, sw, sh, dx, dy, sw, sh);
    if (k > 0.01 && vers[i + 1]) { g.globalAlpha = k; g.drawImage(vers[i + 1], sx, sy, sw, sh, dx, dy, sw, sh); g.globalAlpha = 1; }
  }

  // 5-row pixel font, variable width (M, N, W need more than 3 columns to read): capitals, digits and the
  // punctuation the shouts use. Polish letters are a base glyph plus an accent above or an ogonek below;
  // they are \u escapes because they must match the characters in plan.json whatever the file is read as.
  var MARK = { '\u0104': 'A_', '\u0106': 'C^', '\u0118': 'E_', '\u0143': 'N^', '\u00d3': 'O^', '\u015a': 'S^', '\u0179': 'Z^', '\u017b': 'Z^' };
  var GLYPH = {
    A: '010|101|111|101|101', B: '110|101|110|101|110', C: '011|100|100|100|011', D: '110|101|101|101|110',
    E: '111|100|110|100|111', G: '011|100|101|101|011', H: '101|101|111|101|101', I: '111|010|010|010|111',
    J: '001|001|001|101|010', K: '101|101|110|101|101', L: '100|100|100|100|111',
    M: '10001|11011|10101|10001|10001', N: '1001|1101|1011|1001|1001', O: '010|101|101|101|010',
    P: '110|101|110|100|100', R: '110|101|110|101|101', S: '011|100|010|001|110', T: '111|010|010|010|010',
    U: '101|101|101|101|111', W: '10001|10001|10101|11011|10001', Y: '101|101|010|010|010',
    Z: '111|001|010|100|111', '!': '1|1|1|0|1', ' ': '00|00|00|00|00', '♪': '011|010|010|110|110',
    F: '111|100|110|100|100', Q: '010|101|101|110|011', V: '101|101|101|101|010', X: '101|101|010|101|101',
    '\u0141': '0100|0110|1100|0100|0111',
    0: '111|101|101|101|111', 1: '010|110|010|010|111', 2: '110|001|010|100|111', 3: '110|001|010|001|110',
    4: '101|101|111|001|001', 5: '111|100|110|001|110', 6: '011|100|110|101|010', 7: '111|001|010|010|010',
    8: '010|101|010|101|010', 9: '010|101|011|001|110',
    '?': '110|001|010|000|010', ',': '0|0|0|1|1', '.': '0|0|0|0|1', "'": '1|1|0|0|0', '-': '000|000|111|000|000'
  };
  function glyph(ch) { return (GLYPH[MARK[ch] ? MARK[ch][0] : ch] || GLYPH[' ']).split('|'); }
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
      var mark = MARK[s[i]] && MARK[s[i]][1], w = rows[0].length;
      if (mark === '^') g.fillRect(x + (w >> 1) * k, y - 2 * k, k, k);   // the accent
      if (mark === '_') g.fillRect(x + (w - 1) * k, y + 5 * k, k, k);    // the ogonek
      x += (w + 1) * k;
    }
  }
  // Text that reads over a busy picture: a 1px drop shadow, or a full outline for big titles and bright skies.
  function say(g, s, x, y, col, k, outline) {
    var ring = k > 2 || outline ? [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]] : [[1, 1]];
    ring.forEach(function (o) { text(g, s, x + o[0], y + o[1], [20, 10, 8], k); });
    text(g, s, x, y, col, k);
  }
  function centred(g, s, y, col, k, W) { say(g, s, (W - textW(s, k)) >> 1, y, col, k); }
  // Left edge for text centred on cx that stays clear of the scene's edges (long shouts near the sides,
  // and a frame around the scene covers a few pixels of it).
  function fit(cx, w, W) { return Math.max(9, Math.min(W - 9 - w, Math.round(cx - w / 2))); }

  // ---------- bar, titles, cut-ins (both scenes) ----------
  // The bar: each tier fills over the full one below it, like a fighting game's stacked health bars; a thin
  // white line under it charges while the top is held. The tier's name is big for 1.5 s, then small by the
  // bar; on the top tier a 5-4-3-2-1 countdown runs to the finale. The scenes keep their shouts out of the way.
  function bigTitle() {
    return st.fin < 0 && ((!st.lvl && st.fill > MAX) || (st.lvl && st.since < 1.5) || (st.lvl === 2 && st.hold > 0.3));
  }
  function hud(g, W, H, t, bar, ink, names, track) {
    var bw = W - 6, blink = (t * 8 | 0) % 2, fill = st.fin >= 0 ? 1 : st.fill, col = bar[st.lvl];
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    if (st.lvl && st.since < 0.25 && st.fin < 0) { g.fillStyle = 'rgba(255,255,255,' + (0.7 - st.since * 2.8).toFixed(2) + ')'; g.fillRect(0, 0, W, H); }
    g.fillStyle = track; g.fillRect(3, 2, bw, 3);
    if (st.lvl) { g.fillStyle = rgb(bar[st.lvl - 1]); g.fillRect(3, 2, bw, 3); }
    var fw = Math.round(bw * fill);
    g.fillStyle = rgb(fill > MAX && blink && col !== bar.dark ? CREAM : col); g.fillRect(3, 2, fw, 3);
    if (col === bar.dark) {                              // the void bar: black, with stars drifting in it
      g.fillStyle = rgb(ink[2]);
      for (var x = 4; x < 3 + fw; x += 3) if ((x * 7 + (t * 12 | 0)) % 13 < 2) g.fillRect(x, 2 + (x % 3), 1, 1);
      g.fillRect(3 + fw - 1, 2, 1, 3);
    }
    if (st.hold > 0 && st.fin < 0) {
      g.fillStyle = 'rgba(255,255,255,.85)';
      g.fillRect(3, 5, Math.round(bw * Math.min(1, st.hold / (st.lvl < 2 ? GATE : FINAL))), 1);
    }
    if (st.fin >= 0) return;
    if (!st.lvl && st.fill < 0.03 && t % 1.2 < 0.8) centred(g, 'TAPUJ!', 9, CREAM, 2, W);
    var name = names[st.lvl];
    if (!st.lvl ? st.fill > MAX : st.since < 1.5) centred(g, name, 12, blink ? ink[st.lvl] : CREAM, 3, W);
    else if (st.lvl) say(g, name, 14, 8, ink[st.lvl], 1);
    if (st.lvl === 2 && st.hold > 0.3) centred(g, String(Math.ceil(FINAL - st.hold)), 10, blink ? CREAM : ink[2], 4, W);
  }
  // A finale cut-in: the picture as a band across the scene — slides in, holds, slides out (f: 0..1.8 s).
  function cutin(g, pic, f, W, H) {
    if (f >= 1.8) return;
    var k = f < 0.2 ? f / 0.2 : f > 1.6 ? (1.8 - f) / 0.2 : 1, y = (H - pic.height) >> 1;
    var x = f < 0.2 ? Math.round(W * (1 - k)) : f > 1.6 ? -Math.round(W * (1 - k)) : (Math.random() * 2 | 0);
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.fillStyle = 'rgba(0,0,0,' + (0.65 * k).toFixed(2) + ')'; g.fillRect(0, 0, W, H);
    g.drawImage(pic, x, y);
    g.fillStyle = rgb(CREAM); g.fillRect(x, y - 2, W, 1); g.fillRect(x, y + pic.height + 1, W, 1);
  }

  // ---------- Friday: rap battle at night ----------
  // Two MCs under a spotlight that follows whoever has the mic; turns switch every 8 beats. Hype drives the
  // tempo (88 -> 168 BPM). Tiers: ogien (pyro) · PIEKLO (the estate turns to hell, a devil rises behind the
  // crowd and takes every third turn) · OTCHLAN (a black hole pulls the estate in piece by piece, DJs on flying
  // turntables circle over the crowd, the MCs float) · finale MIC DROP (cut-in, the mic falls in slow motion,
  // the shock wave puts the night back).

  function bitwa(art) {
    var M = art.meta.piatek, I = art.img, W = M.w, H = M.h, FX = M.fx, D = M.devil, S = M.saucer, HOLE = M.void.hole;
    var R = rng(9);
    var RIM = [243, 154, 30], WARM = [255, 150, 60], PHONE = [255, 236, 190], BLACK = [7, 10, 18];
    var RED = [232, 44, 30], VIOLET = [170, 110, 255];
    var BAR = [RIM, RED, [14, 8, 28]];
    BAR.dark = BAR[2];                                // the void tier's bar is black with stars
    var LOOK = [   // per tier: haze, lamps and the beat flash · spotlight · rim of the raised arms · pyro
      { light: WARM, spot: [255, 214, 160], rim: [[150, 82, 30], [70, 40, 22]], pyro: ['#fff0b0', '#ffd27a', '#f39a1e', '#c4501e'] },
      { light: [255, 60, 36], spot: [255, 150, 120], rim: [[190, 40, 24], [90, 18, 14]], pyro: ['#ffe2b0', '#ff8a4a', '#e8321e', '#8a1010'] },
      { light: [140, 80, 255], spot: [210, 180, 255], rim: [[140, 96, 230], [60, 36, 110]], pyro: ['#ffffff', '#dcc0ff', '#9a5aff', '#4a1a9a'] }
    ];
    var HELL = [[0, [10, 2, 4]], [0.1, [44, 6, 10]], [0.35, [120, 16, 16]], [0.65, [236, 70, 30]], [1, [255, 226, 160]]];
    var VOID = [[0, [4, 2, 10]], [0.1, [20, 10, 42]], [0.35, [66, 36, 124]], [0.65, [170, 120, 255]], [1, [255, 255, 255]]];
    var plate = [I['piatek-tlo'], recolor(I['piatek-tlo'], HELL)];
    var crowd = [I['piatek-tlum'], recolor(I['piatek-tlum'], HELL), recolor(I['piatek-tlum'], VOID)];
    var front = [I['piatek-przod'], recolor(I['piatek-przod'], HELL), recolor(I['piatek-przod'], VOID)];
    // what stands behind the crowd (blocks, sky, lamps), night and hell, cut in pieces for the void to take
    var behind = plate.map(function (src) {
      var c = layer(W, H), bg = c.getContext('2d');
      bg.drawImage(src, 0, 0); bg.globalCompositeOperation = 'destination-out'; bg.drawImage(I['piatek-tlum'], 0, 0);
      return c;
    });
    var pieces = [];
    for (var px = 0; px < W;) {
      var pw = Math.min(14 + (R() * 12 | 0), W - px);
      for (var py = 0; py < 78; py += 26) {
        pieces.push({ x: px, y: py, w: pw, h: 26, ph: R() * 6,
          d: 0.3 * R() + 0.2 * py / 78 + 0.15 * Math.abs(px + pw / 2 - HOLE[0]) / W });   // high and near the hole go first
      }
      px += pw;
    }

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
    var parts = [], t = 0, b = 0, active = 0, speak = 0.5, note = 0, kick = 0, pyro = 0, flash = null, beatWas = 0;
    // vis: tier colours (eased, 0..2) · pull: how far the void has taken the estate · rise: the devil
    var vis = st.fin >= 0 ? 2 : st.lvl, pull = vis === 2 ? 1 : 0, rise = st.lvl >= 1 && st.fin < 0 ? 1 : 0;
    var DROP = 3, devilFrame = 0;

    function update(dt, h, st) {
      var f = st.fin, boom = f >= DROP;
      if (f >= 0 && !boom) dt *= 0.35;               // slow motion until the mic hits the floor
      t += dt; b += dt * (88 + 80 * h) / 60;
      kick *= Math.exp(-dt / 0.12);
      vis = boom ? 0 : toward(vis, f >= 0 ? 2 : st.lvl, dt * 3, dt * 3);   // the drop's flash puts the night straight back
      pull = toward(pull, (f >= 0 ? !boom : st.lvl === 2) ? 1 : 0, dt * 0.7, dt * (boom ? 2.5 : 0.9));
      rise = toward(rise, st.lvl >= 1 && f < 0 ? 1 : 0, dt * 0.8, dt * 1.2);
      active = f >= 0 ? 0 : Math.floor(b / 8) % (rise > 0.9 && pull < 0.05 ? 3 : 2);   // the devil takes every third turn
      var beat = Math.floor(b);
      if (boom && f < 5.5 && beat !== beatWas) kick = 1;   // after the drop the whole crowd jumps on every beat
      beatWas = beat;
      speak -= dt;
      if (h > 0.12 && speak <= 0 && f < 0) {
        speak = 1.6 - 0.9 * h;
        var s = okrzyk();
        if (s && active === 2) parts.push({ s: s, x: D.x + D.w / 2 + 24, y: D.y + 16, vx: 8, vy: -10, life: readTime(s), col: [255, 120, 90], k: 2 });
        else if (s) {
          var m = mcs[active], mouth = m.mouths[m.frame] || m.mouths[0];
          parts.push({ s: s, x: m.x + mouth[0] + m.face * 10, y: m.y + mouth[1] - 12,
            vx: m.face * (8 + 14 * h), vy: -14, life: readTime(s), col: CREAM, k: 2 });
        }
      }
      note -= dt;
      if (h > 0.33 && note <= 0) {
        note = 1.1 - 0.75 * h;
        parts.push({ s: '♪', x: FX.boombox[0] + Math.random() * 12 - 6, y: FX.boombox[1] - 4, vx: Math.random() * 10 - 5, vy: -14,
          life: 1.2, col: LOOK[Math.round(vis)].light, k: 2 });
      }
      pyro = h > 0.9 && (f < 0 || boom) ? pyro + dt * 90 : 0;   // pyro jets on both sides of the stage
      for (; pyro >= 1; pyro--) {
        FX.pyro.forEach(function (x) {
          parts.push({ fire: true, x: x + Math.random() * 6 - 3, y: FX.floor, vx: Math.random() * 8 - 4, vy: -90 - Math.random() * 50,
            life: 0.45 + Math.random() * 0.35 });
        });
      }
      if (h > 0.8 && Math.random() < dt * (boom ? 12 : 3)) {   // somebody in the crowd takes a photo
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

    // The black hole's backdrop: the void picture, a few sparks orbiting the ring, and the estate's pieces
    // flying in — each one starts when the pull passes its delay and shrinks into the hole.
    function theVoid(g) {
      g.drawImage(I['piatek-otchlan'], 0, 0);
      for (var i = 0; i < 14; i++) {
        var a = t * (0.9 + (i % 4) * 0.25) + i * 2.3, rx = 22 + (i % 3) * 9;
        g.fillStyle = i % 3 ? 'rgba(255,190,110,.8)' : 'rgba(220,200,255,.9)';
        g.fillRect(Math.round(HOLE[0] + Math.cos(a) * rx), Math.round(HOLE[1] + Math.sin(a) * rx * 0.18), 1, 1);
      }
      pieces.forEach(function (p) {
        var k = clamp((pull - p.d) / 0.35);
        if (k >= 1) return;
        var e = k * k, sc = 1 - e * 0.85, cx = p.x + p.w / 2, cy = p.y + p.h / 2;
        var x = cx + (HOLE[0] - cx) * e + Math.sin(k * 5 + p.ph) * 10 * k * (1 - k);
        var y = cy + (HOLE[1] - cy) * e - Math.sin(k * Math.PI) * 8;
        var dw = Math.max(1, Math.round(p.w * sc)), dh = Math.max(1, Math.round(p.h * sc));
        g.drawImage(behind[vis < 0.5 ? 0 : 1], p.x, p.y, p.w, p.h, Math.round(x - dw / 2), Math.round(y - dh / 2), dw, dh);
      });
    }

    // The devil rises behind the crowd; the void takes him first (into the hole) and gives him back.
    function devil(g, on, beat, h) {
      var q = clamp(pull / 0.4);
      if (rise < 0.01 || q >= 1) return;
      devilFrame = active === 2 ? [1, 1, 2, 1][beat % 4] : h >= 0.7 && beat % 8 === 7 ? 2 : 0;
      var e = q * q, sc = 1 - e * 0.9;
      var cx = D.x + D.w / 2 + Math.round(Math.sin(t * 1.3) * 2), cy = D.y + D.h / 2 + Math.round((1 - ease(rise)) * (D.h + 6)) + (on ? 1 : 0);
      cx += (HOLE[0] - cx) * e; cy += (HOLE[1] - cy) * e;
      if (active === 2) { g.globalCompositeOperation = 'lighter'; glow(g, cx, cy - 6, 34, 0.35, RED); g.globalCompositeOperation = 'source-over'; }
      var dw = Math.round(D.w * sc), dh = Math.round(D.h * sc);
      g.drawImage(I['piatek-diabel'], devilFrame * D.w, 0, D.w, D.h, Math.round(cx - dw / 2), Math.round(cy - dh / 2), dw, dh);
    }

    // DJs on flying turntables: out of the black hole, then circling over the crowd, scratching on the beat.
    function saucers(g, beat) {
      for (var i = 0; i < 3; i++) {
        var a = clamp((pull - 0.45 - i * 0.12) / 0.3);
        if (a <= 0) continue;
        var e = ease(a), sc = 0.15 + 0.85 * e;
        var x = W / 2 + Math.sin(t * 0.45 + i * 2.1) * 108, y = 52 + Math.sin(t * 0.9 + i * 3.6) * 5;   // bottom middle
        x = HOLE[0] + (x - HOLE[0]) * e; y = HOLE[1] + (y - HOLE[1]) * e;
        var fr = beat % 4 === 3 ? 2 + (i + (beat >> 2)) % 2 : (Math.floor(b * 2) + i) % 2;
        var dw = Math.round(S.w * sc), dh = Math.round(S.h * sc);
        g.drawImage(I['piatek-talerz'], fr * S.w, 0, S.w, S.h, Math.round(x - S.ax * sc), Math.round(y - dh), dw, dh);
      }
    }

    function mic(g, x, y, tilt, trail) {             // a cream grille on a dark handle, lit orange on one side
      x = Math.round(x); y = Math.round(y);
      if (trail) { g.fillStyle = rgb(CREAM, 0.35); g.fillRect(x + 1, y - 9, 2, 6); g.fillStyle = rgb(CREAM, 0.15); g.fillRect(x + 1, y - 15, 2, 6); }
      g.fillStyle = '#1c1c24';
      if (tilt) { g.fillRect(x + 3, y + 3, 3, 3); g.fillRect(x + 5, y + 5, 3, 3); g.fillRect(x + 7, y + 7, 2, 2); }
      else g.fillRect(x + 1, y + 4, 3, 7);
      g.fillStyle = rgb(RIM); if (tilt) g.fillRect(x + 4, y + 3, 1, 3); else g.fillRect(x + 1, y + 4, 1, 7);
      g.fillStyle = rgb(CREAM); g.fillRect(x, y, 5, 4);
      g.fillStyle = '#8a8478'; g.fillRect(x + 1, y + 1, 1, 1); g.fillRect(x + 3, y + 2, 1, 1);
    }

    function draw(g, h, st) {
      var bf = b % 1, on = bf < 0.5, beat = Math.floor(b), pulse = on ? 1 - bf * 2 : 0, f = st.fin;
      var lv = Math.round(vis), look = LOOK[lv];
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.imageSmoothingEnabled = false;
      g.fillStyle = '#05040a'; g.fillRect(0, 0, W, H);
      var shake = f >= DROP && f < DROP + 0.6 ? 3 : h > 0.9 ? 1 + (st.lvl === 2 ? 1 : 0) : 0;
      if (shake) g.setTransform(1, 0, 0, 1, Math.round((Math.random() * 2 - 1) * shake), Math.round((Math.random() * 2 - 1) * shake));

      // Layers back to front: the estate (or the void taking it) · the devil, the flying turntables · the crowd ·
      // light · raised hands with phones · the MCs · pyro · front-row heads. Nothing covers the MCs but the
      // heads in front of their feet; the devil and the saucers stay behind the people.
      if (pull > 0.001) theVoid(g); else blend(g, plate, Math.min(vis, 1));
      devil(g, on, beat, h);
      saucers(g, beat);
      blend(g, crowd, vis);

      // light: the haze breathes with the beat, the lamps flare, phones come out, spotlight on the mic
      g.globalCompositeOperation = 'lighter';
      var haze = (0.02 + 0.1 * h) * pulse;
      for (var y = 26; y < FX.floor; y += 2) {
        var k = Math.sin(Math.PI * (y - 26) / (FX.floor - 26));
        g.fillStyle = rgb(look.light, (haze * k).toFixed(3)); g.fillRect(0, y, W, 2);
      }
      if (pull < 0.3) FX.lamps.forEach(function (l) { glow(g, l[0], l[1], 5 + Math.round(4 * pulse * h), 0.1 + 0.25 * h * pulse, look.light); });
      phones.forEach(function (p) {
        if (h <= p.thr) return;
        var a = 0.65 + 0.35 * Math.sin(t * 3 + p.ph);
        g.fillStyle = rgb(RIM, (0.25 * a).toFixed(2)); g.fillRect(p.x - 1, p.y - 1, 4, 5);
        g.fillStyle = rgb(PHONE, a.toFixed(2)); g.fillRect(p.x, p.y, 2, 3);
      });
      if (flash) { g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(flash.x - 1, flash.y - 3, 3, 7); g.fillRect(flash.x - 3, flash.y - 1, 7, 3); }
      if (active < 2) {
        var m = mcs[active], cx = m.cx + m.dx, feet = m.y + m.h;
        for (y = 0; y < feet; y++) {
          var hw = 3 + Math.round((m.w / 2 + 4) * y / feet), step = Math.ceil(4 * y / feet) / 4;
          g.fillStyle = rgb(look.spot, ((0.03 + 0.06 * h) * step).toFixed(3));
          g.fillRect(Math.round(cx - hw), y, hw * 2 + 1, 1);
        }
        g.fillStyle = rgb(look.spot, (0.1 + 0.15 * h).toFixed(3));
        g.fillRect(Math.round(cx - m.w / 2 - 6), feet - 2, m.w + 12, 2); g.fillRect(Math.round(cx - m.w / 2 - 2), feet, m.w + 4, 1);
      }
      var bump = (on && h > 0.12) || kick > 0.3;
      FX.speakers.forEach(function (s) { if (bump) glow(g, s[0], s[1], 4, 0.5, lv ? look.light : RIM); });
      g.globalCompositeOperation = 'source-over';

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
      rim(arms, look.rim[0], look.rim[1]);
      g.drawImage(arms, 0, 0);
      props.forEach(function (p) {
        g.globalCompositeOperation = 'lighter'; glow(g, p[0], p[1], 4, 0.3, RIM);
        g.globalCompositeOperation = 'source-over'; g.fillStyle = rgb(PHONE); g.fillRect(p[0] - 2, p[1] - 3, 4, 6);
      });

      mcs.forEach(function (mc, i) {
        pose(mc, i, h, on, beat, bf);
        if (f >= 1.8 && !i) { mc.frame = 5; mc.dx = 0; mc.dy = 0; }   // mic dropped: arms crossed
        mc.dy -= Math.round(pull * (2 + 2 * Math.sin(t * 2 + i * 2)));   // the void: they float
        g.drawImage(mc.img, mc.frame * mc.w, 0, mc.w, mc.h, mc.x + mc.dx, mc.y + mc.dy, mc.w, mc.h);
      });

      parts.forEach(function (q) {                      // pyro sits behind the front row
        if (!q.fire) return;
        g.fillStyle = q.life > 0.55 ? look.pyro[0] : q.life > 0.38 ? look.pyro[1] : q.life > 0.2 ? look.pyro[2] : look.pyro[3];
        var sz = q.life > 0.55 ? 5 : q.life > 0.3 ? 4 : 3;
        g.fillRect(Math.round(q.x - sz / 2), Math.round(q.y), sz, sz + 1);
      });

      var fi = Math.min(2, Math.floor(vis)), fk = vis - fi;
      heads.forEach(function (c) {                      // each head is its own slice, so people bounce on their own
        g.drawImage(front[fi], c.x0, 0, c.x1 - c.x0, H, c.x0, -c.dy, c.x1 - c.x0, H);
        if (fk > 0.01) { g.globalAlpha = fk; g.drawImage(front[fi + 1], c.x0, 0, c.x1 - c.x0, H, c.x0, -c.dy, c.x1 - c.x0, H); g.globalAlpha = 1; }
      });

      // the mic drop: from the left MC's outstretched hand to the open floor, then the shock wave along the floor
      var m0 = mcs[0], mx = m0.cx + 16, my = m0.y + 26;
      if (f >= 1.8 && f < DROP) { var p = (f - 1.8) / (DROP - 1.8); mic(g, mx, my + (FX.floor - 11 - my) * p * p, (f * 6 | 0) % 2, p > 0.15); }
      if (f >= DROP && f < DROP + 0.9) {
        var r = (f - DROP) * 280, a = 1 - (f - DROP) / 0.9;
        g.fillStyle = rgb(CREAM, a.toFixed(2));
        for (i = 0; i < 90; i++) { var an = i / 90 * 2 * Math.PI; g.fillRect(Math.round(mx + Math.cos(an) * r), Math.round(FX.floor - 2 + Math.sin(an) * r * 0.3), 2, 2); }
      }
      if (f >= DROP && f < 5.6) mic(g, mx, FX.floor - 9, 1);

      parts.forEach(function (q) {
        if (q.fire || (q.life < 0.3 && (q.life * 20 | 0) % 2)) return;   // blink out
        if (q.s && ((bigTitle() && q.y < 30) || f >= 0)) return;            // keep the titles clean
        if (q.s) say(g, q.s, fit(q.x, textW(q.s, q.k), W), Math.round(q.y), q.col, q.k);
        else { g.fillStyle = rgb(q.col); g.fillRect(Math.round(q.x), Math.round(q.y), 2, 2); }
      });
      if (h > 0.7 && bf < 0.1) { g.fillStyle = rgb(look.light, 0.12); g.fillRect(-3, -3, W + 6, H + 6); }   // flash on the beat

      if (f >= 0) {
        cutin(g, I['piatek-final'], f, W, H);
        if (f >= DROP && f < DROP + 0.35) { g.fillStyle = 'rgba(255,255,255,' + (0.9 - (f - DROP) * 2.5).toFixed(2) + ')'; g.fillRect(0, 0, W, H); }
        if (f >= DROP + 0.1) centred(g, 'MIC DROP!', 12, (t * 8 | 0) % 2 ? RIM : CREAM, 3, W);
      }
      hud(g, W, H, t, BAR, [RIM, RED, VIOLET],
        ['OGIE\u0143!', 'PIEK\u0141O!', 'OTCH\u0141A\u0143!'], 'rgba(0,0,0,.5)');
    }

    function tap(x, y) {
      kick = 1;
      var col = LOOK[Math.round(vis)];
      for (var i = 0; i < 8; i++) {
        parts.push({ x: x, y: y, vx: (Math.random() - 0.5) * 90, vy: -20 - Math.random() * 50, g: 160,
          life: 0.35 + Math.random() * 0.25, col: Math.random() < 0.5 ? (vis > 0.5 ? col.light : RIM) : CREAM });
      }
    }

    return { w: W, h: H, update: update, draw: draw, tap: tap, finale: 6.5 };
  }

  // ---------- Saturday: convoy through the wasteland ----------
  // The world scrolls in parallax (sky still · desert with flags · road · rocks in front); hype is speed.
  // A tap fires nitro on the car nearest the finger: flame frame, it surges ahead, then drops back.
  // Drivers shout: the tapped car, and from gaz on, now and then on their own. Tiers: nitro (everyone on
  // nitro, shake) · HORDA (blood-red sky, a zombie horde sprints after the convoy along the near shoulder; its
  // front is the red bar) · WALKIRIE (toxic green sky, lightning, valkyries on pterodactyls shredding guitars
  // over the cars) · finale WITNESS ME! (cut-in; the cars, chrome now, launch into the sky one by one).

  function konwoj(art) {
    var M = art.meta.sobota, I = art.img, W = M.w, H = M.h, Z = M.zombie, V = M.valk;
    var RIM = [243, 154, 30], SAND = [232, 196, 138], FLAME = [255, 210, 120], RED = [232, 44, 30], TOX = [125, 255, 58];
    var BLOOD = [[0, [16, 2, 4]], [0.3, [96, 10, 12]], [0.6, [200, 34, 22]], [0.85, [255, 120, 70]], [1, [255, 226, 180]]];
    var TOXIC = [[0, [4, 12, 4]], [0.3, [22, 70, 14]], [0.6, [70, 190, 30]], [0.85, [160, 255, 80]], [1, [236, 255, 200]]];
    var CHROME = [[0, [16, 18, 24]], [0.3, [80, 88, 104]], [0.6, [180, 192, 210]], [0.85, [236, 242, 255]], [1, [255, 255, 255]]];
    var sky = [I['sobota-niebo'], recolor(I['sobota-niebo'], BLOOD), recolor(I['sobota-niebo'], TOXIC)];
    var desert = [I['sobota-pustynia'], recolor(I['sobota-pustynia'], BLOOD), recolor(I['sobota-pustynia'], TOXIC)].map(mirror);
    var road = mirror(I['sobota-droga']), rocks = mirror(I['sobota-skaly']);
    // the middle car rides a lane further back, so overtakes read as passing, not crashing
    var cars = M.cars.map(function (c, i) {
      return { img: I['sobota-auto-' + i], chrome: recolor(I['sobota-auto-' + i], CHROME), x: c.x, y: c.y - (i === 1 ? 5 : 0),
        w: c.w, h: c.h, surge: 0, nitro: 0, bump: 0, ph: i * 1.7 };
    });
    var order = [1, 0, 2];
    var shoutY = Math.min.apply(null, cars.map(function (c) { return c.y; })) - 12;   // one start line, so shouts stack
    var parts = [], t = 0, dist = 0, speed = 0, auto = 0, spoke = -9, fin = -1;
    // The horde: kinds 0-4 run, 5 is a dog; each keeps its place behind the front, on the near shoulder in front
    // of the rocks. Drawn clipped below the wheel line (nothing covers the cars), outlined dark and lit red from
    // above so they read against the rocks.
    var R = rng(5), zs = [];
    for (var i = 0; i < 11; i++) zs.push({ kind: (i * 5) % Z.kinds, off: i * 19 + R() * 6, foot: 124 + (R() * 4 | 0), ph: R() * 6, fps: 9 + R() * 4, sway: 3 + R() * 4 });
    zs.sort(function (a, b) { return a.foot - b.foot; });
    var horde_ = layer(I['sobota-zombie'].width, I['sobota-zombie'].height), hg = horde_.getContext('2d');
    var sil = layer(horde_.width, horde_.height), sg = sil.getContext('2d');
    sg.drawImage(I['sobota-zombie'], 0, 0); sg.globalCompositeOperation = 'source-in'; sg.fillStyle = '#140806'; sg.fillRect(0, 0, sil.width, sil.height);
    [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (o) { hg.drawImage(sil, o[0], o[1]); });
    hg.drawImage(I['sobota-zombie'], 0, 0);
    rim(horde_, [235, 80, 50], null);
    var wheels = Math.max.apply(null, cars.map(function (c) { return c.y + c.h; })) + 1;
    // valkyries: the beak is the anchor; the lowest wing tip stays above the car roofs
    var vy = Math.min.apply(null, cars.map(function (c) { return c.y; })) - 3 - (V.h - V.ay);
    var valks = [{ x: 96, y: vy - 6 }, { x: 188, y: vy }, { x: 282, y: vy - 11 }];
    var vis = st.fin >= 0 ? 2 : st.lvl, horde = st.lvl >= 1 ? 1 : 0, valk = st.lvl === 2 || st.fin >= 0 ? 1 : 0;
    var bolt = null, boltIn = 0.5;

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
    function scrollBlend(g, tiles, v, y, offset) {
      var i = Math.min(tiles.length - 1, Math.floor(v)), k = v - i;
      scroll(g, tiles[i], y, offset);
      if (k > 0.01) { g.globalAlpha = k; scroll(g, tiles[i + 1], y, offset); g.globalAlpha = 1; }
    }

    function update(dt, h, st) {
      var f = fin = st.fin;
      t += dt;
      var boost = cars.reduce(function (s, c) { return s + (c.nitro > 0 ? 1 : 0); }, 0);
      speed = 35 + 175 * h + 25 * boost;
      dist += speed * dt;
      vis = toward(vis, f >= 0 ? (f < 4.4 ? 2 : 0) : st.lvl, dt * 3, dt * 3);
      horde = toward(horde, f >= 0 ? (f < 2 ? 1 : 0) : st.lvl === 1 ? 0.3 + 0.7 * st.fill : st.lvl ? 1 : 0, dt * 0.8, dt * 0.6);
      valk = f >= 4.6 ? 0 : toward(valk, st.lvl === 2 || f >= 0 ? 1 : 0, dt * 0.6, dt * 0.8);
      if (vis > 1.5 && (boltIn -= dt) <= 0) {           // toxic sky: lightning
        boltIn = 0.5 + Math.random() * 1.1;
        var x = 20 + Math.random() * (W - 40), pts = [[x, 0]];
        for (var y = 0; y < 52;) { y += 4 + Math.random() * 6; x += Math.random() * 12 - 6; pts.push([x, y]); }
        bolt = { pts: pts, life: 0.18 };
      }
      if (bolt && (bolt.life -= dt) <= 0) bolt = null;
      if (f < 0 && h > 0.9 && (auto -= dt) <= 0) {   // full hype: the whole convoy keeps firing nitro
        auto = 0.35;
        cars[Math.random() * 3 | 0].nitro = 0.5;
      }
      if (f < 0 && h > 0.33 && t - spoke > 1.8 - h) yell(cars[Math.random() * 3 | 0]);
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
      if (valk > 0.5 && Math.random() < dt * 30) {       // sparks off the guitars, blown back
        var v = valks[Math.random() * 3 | 0], at = valkAt(v, valks.indexOf(v));
        parts.push({ spark: true, x: at[0] - 17, y: at[1] - 19, vx: -40 - Math.random() * 50, vy: Math.random() * 30 - 20, g: 40,
          life: 0.25 + Math.random() * 0.2, col: Math.random() < 0.5 ? TOX : CREAM });
      }
      if (h > 0.4 && Math.random() < dt * 30 * (h - 0.4)) {              // speed lines
        parts.push({ line: true, x: W + 5, y: 14 + Math.random() * 90 | 0, vx: -speed * 2.2, vy: 0, life: 0.6,
          len: 10 + Math.random() * 25 | 0 });
      }
      parts = parts.filter(function (q) {
        q.x += q.vx * dt; q.y += q.vy * dt; q.vy += (q.g || 0) * dt; q.life -= dt;
        return q.life > 0 && q.x > -40;
      });
    }

    function yell(c) {                              // above the car, drifting back with the wind
      var s = okrzyk();
      spoke = t;
      if (s) parts.push({ s: s, x: c.x + c.surge + c.w / 2, y: shoutY, vx: -12, vy: -18, life: readTime(s) });
    }

    // where valkyrie i's beak is now: flying in from the left, bobbing; in the finale they follow the cars up
    function valkAt(v, i) {
      var x = v.x - (1 - ease(valk)) * 300 + Math.round(Math.sin(t * 0.7 + i) * 8), y = v.y + Math.round(Math.sin(t * 2.2 + i * 2) * 2);
      if (fin > 2.2) { x += (fin - 2.2) * 30; y -= (fin - 2.2) * 45; }
      return [Math.round(x), Math.round(y)];
    }

    // the finale moves the cars: chrome from the cut-in on, launched into the sky lead car first, then back
    function finaleCar(c, i) {
      if (fin < 1.8) return null;
      if (fin < 4.8) {
        var lt = fin - 2 - [2, 1, 0][i] * 0.45;
        return lt <= 0 ? { x: 0, y: 0, chrome: true } : { x: lt * 80, y: -(150 * lt - 15 * lt * lt), chrome: true, fly: true };
      }
      return { x: -(1 - ease((fin - 5) / 1.3)) * 320, y: 0 };
    }

    function draw(g, h, st) {
      var f = st.fin;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.imageSmoothingEnabled = false;
      var shake = h > 0.9 ? 1 + (st.lvl === 2 ? 1 : 0) : 0;
      if (shake) g.setTransform(1, 0, 0, 1, Math.round((Math.random() * 2 - 1) * shake), Math.round((Math.random() * 2 - 1) * shake));
      // Layers back to front: sky · lightning · desert 0.2x · valkyries (above the car roofs) · road · dust ·
      // cars · rocks 1.5x · the horde (near shoulder, heads below the wheels) · shouts. Nothing covers the cars.
      blend(g, sky, vis);
      if (bolt) {
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = rgb(TOX, 0.12); g.fillRect(0, 0, W, M.road);
        g.fillStyle = rgb([200, 255, 160]);
        for (var i = 1; i < bolt.pts.length; i++) line(g, bolt.pts[i - 1][0], bolt.pts[i - 1][1], bolt.pts[i][0], bolt.pts[i][1], 1);
        glow(g, bolt.pts[bolt.pts.length - 1][0], bolt.pts[bolt.pts.length - 1][1], 6, 0.5, TOX);
        g.globalCompositeOperation = 'source-over';
      }
      scrollBlend(g, desert, vis, 0, dist * 0.2);
      if (valk > 0.01) valks.forEach(function (v, i) {
        var at = valkAt(v, i), fr = Math.floor(t * 7 + i * 1.3) % 4;
        g.drawImage(I['sobota-walkiria'], fr * V.w, 0, V.w, V.h, at[0] - V.ax, at[1] - V.ay, V.w, V.h);
      });
      scroll(g, road, M.road, dist);

      parts.forEach(function (q) {                    // dust behind the cars
        if (q.line || q.spark || q.s) return;
        g.fillStyle = rgb(q.col, Math.min(0.85, q.life * 1.6).toFixed(2));
        g.fillRect(Math.round(q.x), Math.round(q.y), q.sz, q.sz);
      });
      order.forEach(function (i) {
        var c = cars[i], fc = finaleCar(c, i);
        var frame = fc && fc.fly || c.nitro > 0 ? 1 : c.bump > 0.08 ? 2 : 0;
        var rumble = (t * (8 + speed / 15) + c.ph | 0) % 2;                 // engine shake, 1 px
        var x = Math.round(c.x + c.surge + (fc ? fc.x : 0)), y = Math.round(c.y - rumble - (c.bump > 0.08 ? 1 : 0) + (fc ? fc.y : 0));
        g.drawImage(fc && fc.chrome ? c.chrome : c.img, frame * c.w, 0, c.w, c.h, x, y, c.w, c.h);
        if (frame === 1) {                                                   // extra flicker on the flame
          g.globalCompositeOperation = 'lighter';
          glow(g, x + 8, y + c.h - 9, 4 + (t * 20 | 0) % 3, 0.5, FLAME);
          g.globalCompositeOperation = 'source-over';
        }
      });
      scroll(g, rocks, M.road + M.rocks_dy, dist * 1.5);
      var front = -30 + ease(horde) * 230;
      if (horde > 0.01) {
        g.save(); g.beginPath(); g.rect(-4, wheels, W + 8, H); g.clip();
        zs.forEach(function (z) {
          var x = Math.round(front - z.off + Math.sin(t * 1.3 + z.ph) * z.sway);
          if (x < -Z.w) return;
          var fr = Math.floor(t * z.fps + z.ph) % 4;
          g.drawImage(horde_, fr * Z.w, z.kind * Z.h, Z.w, Z.h, x - Z.ax, z.foot - Z.ay, Z.w, Z.h);
        });
        g.restore();
      }

      parts.forEach(function (q) {
        if (q.line) { g.fillStyle = 'rgba(255,236,200,.55)'; g.fillRect(Math.round(q.x), q.y, q.len, 1); }
        else if (q.spark) {
          if (q.life < 0.15 && (q.life * 40 | 0) % 2) return;
          g.fillStyle = rgb(q.col); g.fillRect(Math.round(q.x), Math.round(q.y), 2, 2);
        }
        else if (q.s && !(q.life < 0.3 && (q.life * 20 | 0) % 2) && !(bigTitle() && q.y < 30) && f < 0) {   // blinks out, keeps the titles clean
          say(g, q.s, fit(q.x, textW(q.s, 2), W), Math.round(q.y), CREAM, 2, true);
        }
      });

      if (f >= 0) {
        cutin(g, I['sobota-final'], f, W, H);
        var blink = (t * 8 | 0) % 2;
        if (f >= 2 && f < 4.6) centred(g, 'WITNESS ME!', 12, blink ? TOX : CREAM, 3, W);
        if (f >= 4.6 && f < 6.4) centred(g, 'SHINY AND CHROME', 14, blink ? [200, 210, 230] : CREAM, 2, W);
      }
      hud(g, W, H, t, [RIM, RED, TOX], [RIM, RED, TOX], ['NITRO!', 'HORDA!', 'WALKIRIE!'], 'rgba(0,0,0,.45)');
    }

    function tap(x, y) {
      if (fin < 0) {
        var near = cars.reduce(function (best, c) {
          var d = Math.abs(c.x + c.surge + c.w / 2 - x);
          return d < best.d ? { c: c, d: d } : best;
        }, { c: null, d: 1e9 }).c;
        near.nitro = 0.6;
        if (t - spoke > 0.7) yell(near);
      }
      for (var i = 0; i < 8; i++) {
        parts.push({ spark: true, x: x, y: y, vx: (Math.random() - 0.5) * 90, vy: -20 - Math.random() * 50, g: 160,
          life: 0.35 + Math.random() * 0.25, col: Math.random() < 0.5 ? RIM : CREAM });
      }
    }

    return { w: W, h: H, update: update, draw: draw, tap: tap, finale: 6.8 };
  }

  setup();   // last: everything above must be defined before the first draw
})();
