/* ============================================================
   CHOW.DEV OS — dot-scatter heading.

   The "builds" heading is set in a dot matrix that scatters away from the
   pointer and springs back. It sits over the funnel, which is already
   ordered-dithered, so the two read as one idea rather than two effects.

   Glyph data and the scatter behaviour are adapted from the Originkit "Dot
   Scatter" component. That original is React + Framer Motion; this is a
   rewrite in plain JS against one shared <svg>, because the site has no
   bundler and no framework, and a paragraph-scale dependency is not worth
   ~150 KB on a page that is opened from an NFC card.

   Three things keep it native:
     · fill is currentColor, so it inherits the paper system and inverts with
       everything else — no colour of its own;
     · one rAF loop for every dot, and it only runs while the section is on
       screen and something is actually moving;
     · prefers-reduced-motion leaves the word set solid and still.
   ============================================================ */
(function () {
  'use strict';

  const CELL = 13, DOT = 9, GLYPH_H = 132;

  /* only the letters this heading needs */
  const m = (x, y, w, h) => ({ x: x, y: y, w: w === undefined ? DOT : w, h: h === undefined ? DOT : h });
  const GLYPHS = {
    b: [m(0,0),m(0,13,9,10),m(0,27,9,10),m(19,27,28,9),m(0,41,19,9),m(47,41,10,9),
        m(0,54,9,10),m(47,54,10,10),m(0,68),m(47,68,10,9),m(0,81,19,10),m(47,81,10,10),
        m(0,95),m(19,95,28,9)],
    u: [m(0,27,10,10),m(48,27,9,9),m(0,40,10,10),m(48,41,9,9),m(0,54,10,9),m(48,54,9,9),
        m(48,67,9,10),m(0,68,10,9),m(0,81,10,10),m(38,81,19,10),m(10,95,28,9),m(48,95,9,9)],
    i: [m(0,0,19,9),m(0,27,19,9),m(10,41),m(10,54),m(10,67,9,10),m(10,81,9,10),m(10,95)],
    l: [m(0,0,10,9),m(1,13,9,10),m(0,27,10,10),m(1,41,9,9),m(0,54,10,9),m(0,67,10,10),
        m(0,81,10,10),m(10,95,10,9)],
    d: [m(48,0),m(48,13,9,10),m(48,27,9,10),m(10,27,28,9),m(38,41,19,9),m(0,41,10,9),
        m(48,54,9,10),m(0,54,10,10),m(48,68),m(0,68,10,9),m(38,81,19,10),m(0,81,10,10),
        m(48,95),m(10,95,28,9)],
    s: [m(10,27,28,10),m(0,40,10,10),m(38,40,10,10),m(10,54,19,10),m(29,67,19,10),
        m(0,81,10,10),m(38,81,10,10),m(10,95,28,9)],
    ' ': []
  };

  /* Influence radius in GLYPH units, not screen pixels. In pixels it was a
     fixed 78px against a heading only ~110px wide, so a pointer anywhere near
     the word threw all 63 dots at once — the whole thing exploded instead of
     opening around the cursor. In glyph units it is ~0.75 of the cap height,
     roughly two letters wide, and it stays that way at any heading size. */
  const RADIUS = 78;
  const K = 0.16, DAMP = 0.78;

  document.querySelectorAll('[data-scatter]').forEach(build);

  function build(host) {
    const text = (host.getAttribute('data-scatter') || host.textContent || '').toLowerCase();
    const chars = [...text];
    if (!chars.every((c) => GLYPHS[c])) return;         // unknown letter: leave the text alone

    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* lay the word out in glyph units, then let the SVG viewBox do the scaling
       so the heading keeps whatever size the CSS already gives it */
    const dots = [];
    let cursor = 0, maxX = 0;
    const GAP = 0.9;
    chars.forEach((ch) => {
      const marks = GLYPHS[ch];
      const w = marks.length ? Math.max(...marks.map((k) => k.x + k.w)) : CELL * 2;
      marks.forEach((k) => {
        dots.push({
          hx: cursor * CELL + k.x, hy: k.y, w: k.w, h: k.h,
          x: cursor * CELL + k.x, y: k.y, vx: 0, vy: 0, ox: 0, oy: 0, out: false
        });
      });
      cursor += w / CELL + GAP;
      maxX = Math.max(maxX, cursor * CELL);
    });
    if (!dots.length) return;

    const vbW = maxX, vbH = GLYPH_H;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + vbW + ' ' + vbH);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');

    dots.forEach((d) => {
      const r = document.createElementNS(ns, 'rect');
      r.setAttribute('width', d.w); r.setAttribute('height', d.h);
      r.setAttribute('rx', d.h / 2); r.setAttribute('ry', d.h / 2);
      r.setAttribute('fill', 'currentColor');
      r.setAttribute('x', d.hx); r.setAttribute('y', d.hy);
      svg.appendChild(r);
      d.el = r;
    });

    /* the word stays readable to a screen reader and to search */
    host.textContent = '';
    host.setAttribute('aria-label', text);
    host.setAttribute('role', 'heading');
    host.appendChild(svg);

    if (reduce) return;                                  // set solid, never moves

    /* pointer position in viewBox units */
    let px = -1e6, py = -1e6, dirty = false, running = false;

    function toLocal(clientX, clientY) {
      const r = svg.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      return { x: (clientX - r.left) / r.width * vbW, y: (clientY - r.top) / r.height * vbH };
    }

    /* Listen on the window, not the heading: the dots are a few px of ink with
       gaps everywhere, so a listener bound to them would fire only on direct
       hits and the effect would feel broken. */
    addEventListener('pointermove', (e) => {
      const p = toLocal(e.clientX, e.clientY);
      if (!p) return;
      px = p.x; py = p.y;
      dirty = true; kick();
    }, { passive: true });

    addEventListener('pointerleave', () => { px = py = -1e6; dirty = true; kick(); }, { passive: true });

    function kick() { if (!running) { running = true; requestAnimationFrame(step); } }

    function step() {
      const rad = RADIUS, rad2 = rad * rad;
      let moving = false;

      for (let i = 0; i < dots.length; i++) {
        const d = dots[i];
        const cx = d.hx + d.w / 2, cy = d.hy + d.h / 2;
        const dx = cx - px, dy = cy - py;
        const inside = dx * dx + dy * dy <= rad2;

        if (inside && !d.out) {
          /* pick a throw once per entry, biased away from the pointer so the
             word opens around the cursor rather than jittering in place */
          const dist = Math.max(1, Math.hypot(dx, dy));
          const push = (1 - dist / rad) * (26 + Math.random() * 26);
          d.ox = (dx / dist) * push + (Math.random() - 0.5) * 12;
          d.oy = (dy / dist) * push * 0.7 + (Math.random() - 0.5) * 14;
          d.out = true;
        } else if (!inside && d.out) {
          d.ox = 0; d.oy = 0; d.out = false;
        }

        const tx = d.hx + d.ox, ty = d.hy + d.oy;
        d.vx = (d.vx + (tx - d.x) * K) * DAMP;
        d.vy = (d.vy + (ty - d.y) * K) * DAMP;
        d.x += d.vx; d.y += d.vy;

        if (Math.abs(d.vx) > 0.01 || Math.abs(d.vy) > 0.01 ||
            Math.abs(tx - d.x) > 0.01 || Math.abs(ty - d.y) > 0.01) {
          moving = true;
          d.el.setAttribute('x', d.x.toFixed(2));
          d.el.setAttribute('y', d.y.toFixed(2));
        }
      }

      dirty = false;
      /* stop the loop when the word has settled — an idle heading should cost
         nothing at all */
      if (moving || dirty) requestAnimationFrame(step);
      else running = false;
    }
  }
})();
