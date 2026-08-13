/* ============================================================
   CHOW.DEV OS — tracking overlay.

   A thin grey layer of motion-tracking furniture over each composed section:
   contour trackers locked to the cut-outs (silhouettes come from
   js/contours.js, extracted from the artwork at build time) plus free-floating
   ambient nodes drifting around the frame.

   Two rules it must never break:
     · nothing may cross the type — every .lay is punched out of the clip, and
       the canvas sits under the type in z-order as a second line of defence;
     · it stays quiet — one hairline, mid grey off --trk, no fills, no colour.

   Plain script, no module. Draws only while its section is on screen.
   ============================================================ */
(function () {
  'use strict';

  var C = window.CD_CONTOURS;
  if (!C || !document.querySelector('.stage')) return;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DPR = Math.min(2, window.devicePixelRatio || 1);
  var TAU = Math.PI * 2;

  /* deterministic per-seed noise — no Math.random, so a reload looks the same */
  function rnd(seed) {
    var s = seed * 9301 + 49297;
    return function () { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  }

  /* ---------------------------------------------------------- */
  /* one overlay per composed stage                              */
  /* ---------------------------------------------------------- */
  function Overlay(stage, idx) {
    this.stage = stage;
    this.cv = document.createElement('canvas');
    this.cv.className = 'trk';
    this.cv.setAttribute('aria-hidden', 'true');
    stage.insertBefore(this.cv, stage.firstChild);
    this.ctx = this.cv.getContext('2d');
    this.on = false;
    this.w = this.h = 0;

    /* cut-outs in this stage that we have a silhouette for */
    this.marks = [];
    var self = this;
    [].slice.call(stage.querySelectorAll('.el')).forEach(function (el) {
      /* A cut-out is matched by filename and carries a silhouette baked at
         build time. An element flagged data-trk is LIVE — it publishes its own
         outline into CD.trkLive every frame, so the tracker follows the shape
         that is actually on screen instead of a frozen one. */
      var live = el.getAttribute('data-trk');
      var name = live, blobs = null;
      if (!live) {
        var m = /([a-z0-9-]+)\.png$/i.exec(el.getAttribute('src') || '');
        blobs = m && C[m[1]];
        if (!blobs || !blobs.length) return;
        name = m[1];
      }
      self.marks.push({
        el: el,
        name: name,
        live: !!live,
        blobs: blobs,
        id: 'TRK_' + String(self.marks.length + 1 + idx * 3).padStart(2, '0'),
        seed: rnd(name.length * 37 + idx * 11 + self.marks.length)
      });
    });

    /* type keep-out boxes */
    this.lays = [].slice.call(stage.querySelectorAll('.lay'));

    /* ambient nodes — parked on a ring so they live around the edge of the
       frame and never wander into the middle, where the subject is */
    var r = rnd(idx * 977 + 13);
    this.nodes = [];
    for (var i = 0; i < 7; i++) {
      this.nodes.push({
        a: r() * TAU,                 // angle on the ring
        av: (r() - 0.5) * 0.016,      // angular drift, ~1 lap in 6-9 min
        rx: 0.40 + r() * 0.13,        // ring radii, in stage units
        ry: 0.36 + r() * 0.14,
        wob: 0.012 + r() * 0.018,     // radial wobble
        wp: r() * TAU,
        wv: 0.10 + r() * 0.18,
        s: 0.6 + r() * 0.5            // size scale
      });
    }
  }

  Overlay.prototype.resize = function () {
    var w = this.stage.offsetWidth, h = this.stage.offsetHeight;
    if (!w || !h) return false;
    if (w === this.w && h === this.h) return true;
    this.w = w; this.h = h;
    this.cv.width = Math.round(w * DPR);
    this.cv.height = Math.round(h * DPR);
    return true;
  };

  /* the element's transform, applied about its own centre, so a tracker stays
     welded to a cut-out that is drifting on scroll AND slowly rotating */
  function boxOf(el) {
    var x = el.offsetLeft, y = el.offsetTop, w = el.offsetWidth, h = el.offsetHeight;
    var t = getComputedStyle(el).transform, M = null;
    if (t && t !== 'none') { try { M = new DOMMatrix(t); } catch (e) { M = null; } }
    return { x: x, y: y, w: w, h: h, cx: x + w / 2, cy: y + h / 2, M: M };
  }
  function mapPt(b, u, v) {
    var px = b.x + u * b.w, py = b.y + v * b.h;
    if (!b.M) return [px, py];
    var dx = px - b.cx, dy = py - b.cy;
    return [b.cx + b.M.a * dx + b.M.c * dy, b.cy + b.M.b * dx + b.M.d * dy];
  }

  Overlay.prototype.draw = function (t) {
    if (!this.resize()) return;
    var ctx = this.ctx, w = this.w, h = this.h;
    var cs = getComputedStyle(this.stage);
    var ink = cs.getPropertyValue('--trk').trim() || 'rgba(255,255,255,.26)';
    var hi = cs.getPropertyValue('--trk-hi').trim() || 'rgba(255,255,255,.46)';
    var unit = Math.min(w, h);

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, w, h);

    /* punch the type out of everything below */
    var keep = new Path2D();
    keep.rect(0, 0, w, h);
    for (var i = 0; i < this.lays.length; i++) {
      var b = boxOf(this.lays[i]);
      var pad = Math.max(10, unit * 0.018);
      keep.rect(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2);
    }
    ctx.save();
    ctx.clip(keep, 'evenodd');

    ctx.lineWidth = 1;
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineJoin = 'round';
    var fs = Math.max(8, Math.round(unit * 0.0105));
    ctx.font = fs + "px 'VCR', ui-monospace, monospace";
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0.10em';
    ctx.textBaseline = 'alphabetic';

    this.drawMarks(ctx, t, ink, hi, unit, fs);
    this.drawNodes(ctx, t, ink, hi, w, h, unit);

    ctx.restore();
  };

  Overlay.prototype.drawMarks = function (ctx, t, ink, hi, unit, fs) {
    var brk = unit * 0.022;                 // corner bracket arm
    var nodeR = Math.max(1.6, unit * 0.0026);

    for (var i = 0; i < this.marks.length; i++) {
      var mk = this.marks[i];
      if (mk.el.classList.contains('rev') && !mk.el.classList.contains('is-shown')) continue;
      var b = boxOf(mk.el);
      if (!b.w) continue;

      /* a live mark swaps its baked silhouette for this frame's outline; if
         nothing has been published yet there is simply nothing to draw */
      if (mk.live) {
        var pub = (window.CD && window.CD.trkLive && window.CD.trkLive[mk.name]) || null;
        if (!pub) continue;
        mk.blobs = [pub];
      }

      /* the sub-pixel unrest of a real solve — never more than a third of a
         pixel, enough to stop it looking like a sticker */
      var jx = Math.sin(t * 0.0011 + i * 2.1) * 0.34;
      var jy = Math.cos(t * 0.0009 + i * 1.3) * 0.34;

      for (var k = 0; k < mk.blobs.length; k++) {
        var blob = mk.blobs[k], p = blob.p, n = p.length;

        /* contour, drawn as a slow dashed scan */
        ctx.save();
        ctx.strokeStyle = ink;
        ctx.setLineDash([unit * 0.008, unit * 0.011]);
        ctx.lineDashOffset = -(t * 0.014) % 1e6;
        ctx.beginPath();
        for (var j = 0; j < n; j++) {
          var q = mapPt(b, p[j][0], p[j][1]);
          if (j) ctx.lineTo(q[0] + jx, q[1] + jy); else ctx.moveTo(q[0] + jx, q[1] + jy);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();

        /* vertex nodes — every other one, so the contour stays airy */
        ctx.save();
        ctx.strokeStyle = hi;
        for (var v = 0; v < n; v += 2) {
          var pt = mapPt(b, p[v][0], p[v][1]);
          ctx.strokeRect(Math.round(pt[0] + jx - nodeR) + 0.5, Math.round(pt[1] + jy - nodeR) + 0.5,
                         nodeR * 2, nodeR * 2);
        }
        ctx.restore();

        /* corner brackets on the blob box */
        var c0 = mapPt(b, blob.b[0], blob.b[1]);
        var c1 = mapPt(b, blob.b[0] + blob.b[2], blob.b[1]);
        var c2 = mapPt(b, blob.b[0] + blob.b[2], blob.b[1] + blob.b[3]);
        var c3 = mapPt(b, blob.b[0], blob.b[1] + blob.b[3]);
        var corners = [c0, c1, c2, c3];
        ctx.save();
        ctx.strokeStyle = ink;
        ctx.beginPath();
        for (var ci = 0; ci < 4; ci++) {
          var cur = corners[ci];
          var prev = corners[(ci + 3) % 4], next = corners[(ci + 1) % 4];
          arm(ctx, cur, prev, brk, jx, jy);
          arm(ctx, cur, next, brk, jx, jy);
        }
        ctx.stroke();
        ctx.restore();

        /* readout, only on the first blob of each mark */
        if (k === 0) {
          var conf = (0.938 + 0.058 * (0.5 + 0.5 * Math.sin(t * 0.00042 + i * 3.7))).toFixed(3);
          var lx = Math.min(c0[0], c3[0]) + jx, ly = Math.min(c0[1], c1[1]) + jy - fs * 0.62;
          ctx.save();
          ctx.fillStyle = hi;
          ctx.fillText(mk.id, lx, ly);
          ctx.fillStyle = ink;
          ctx.fillText(conf, lx + ctx.measureText(mk.id).width + fs * 0.7, ly);
          ctx.restore();
        }
      }
    }
  };

  function arm(ctx, from, to, len, jx, jy) {
    var dx = to[0] - from[0], dy = to[1] - from[1];
    var d = Math.hypot(dx, dy) || 1;
    var l = Math.min(len, d * 0.34);
    ctx.moveTo(from[0] + jx, from[1] + jy);
    ctx.lineTo(from[0] + jx + dx / d * l, from[1] + jy + dy / d * l);
  }

  Overlay.prototype.drawNodes = function (ctx, t, ink, hi, w, h, unit) {
    var pts = [], i;
    for (i = 0; i < this.nodes.length; i++) {
      var nd = this.nodes[i];
      var a = nd.a + nd.av * t * 0.001;
      var wob = 1 + Math.sin(nd.wp + t * 0.001 * nd.wv) * nd.wob;
      pts.push([w * 0.5 + Math.cos(a) * nd.rx * wob * w,
                h * 0.5 + Math.sin(a) * nd.ry * wob * h, nd.s]);
    }

    /* links — only between neighbours that have drifted close */
    var maxD = unit * 0.30;
    ctx.save();
    ctx.lineWidth = 1;
    for (i = 0; i < pts.length; i++) {
      for (var j = i + 1; j < pts.length; j++) {
        var d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
        if (d > maxD) continue;
        ctx.globalAlpha = 0.55 * (1 - d / maxD);
        ctx.strokeStyle = ink;
        ctx.beginPath();
        ctx.moveTo(pts[i][0], pts[i][1]);
        ctx.lineTo(pts[j][0], pts[j][1]);
        ctx.stroke();
      }
    }
    ctx.restore();

    /* the nodes themselves — a hairline crosshair inside a small open box */
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = ink;
    for (i = 0; i < pts.length; i++) {
      var x = Math.round(pts[i][0]) + 0.5, y = Math.round(pts[i][1]) + 0.5;
      var r = Math.max(2.5, unit * 0.0042) * pts[i][2];
      var cr = r * 2.1;
      ctx.beginPath();
      ctx.moveTo(x - cr, y); ctx.lineTo(x - r * 0.6, y);
      ctx.moveTo(x + r * 0.6, y); ctx.lineTo(x + cr, y);
      ctx.moveTo(x, y - cr); ctx.lineTo(x, y - r * 0.6);
      ctx.moveTo(x, y + r * 0.6); ctx.lineTo(x, y + cr);
      ctx.stroke();
      ctx.strokeStyle = hi;
      ctx.strokeRect(x - r, y - r, r * 2, r * 2);
      ctx.strokeStyle = ink;
    }
    ctx.restore();
  };

  /* ---------------------------------------------------------- */
  /* drive                                                       */
  /* ---------------------------------------------------------- */
  var overlays = [].slice.call(document.querySelectorAll('.stage')).map(function (s, i) {
    return new Overlay(s, i);
  });

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        var o = e.target.__trk;
        if (!o) return;
        o.on = e.isIntersecting;
        if (e.isIntersecting) o.cv.classList.add('is-on');
      });
    }, { rootMargin: '10% 0px' });
    overlays.forEach(function (o) { o.stage.__trk = o; io.observe(o.stage); });
  } else {
    overlays.forEach(function (o) { o.on = true; o.cv.classList.add('is-on'); });
  }

  function tick(t) {
    for (var i = 0; i < overlays.length; i++) if (overlays[i].on) overlays[i].draw(t);
    requestAnimationFrame(tick);
  }

  function start() {
    if (reduce) {
      /* keep the furniture, drop the movement — a frozen solve, redrawn only
         when the layout actually changes */
      var paint = function () { overlays.forEach(function (o) { o.on = true; o.cv.classList.add('is-on'); o.draw(0); }); };
      paint();
      window.addEventListener('resize', paint, { passive: true });
      window.addEventListener('scroll', paint, { passive: true });
      return;
    }
    requestAnimationFrame(tick);
  }

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(start, start);
  else start();
})();
