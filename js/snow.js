/* ============================================================
   CHOW.DEV OS — dead-channel static for the 404.

   The console's own snow, taken out of the CRT shader and laid over the whole
   page. Plain 2D canvas rather than WebGL: this page must render even when the
   thing that went wrong is the reason the visitor is here, so it carries no
   Three.js, no model, no import map — it is the lightest page on the site.

   Drawn at the same 240x136 grid the screen quantises to, then scaled up with
   smoothing off, so the pixels match the ones on the console exactly.
   ============================================================ */
(function () {
  'use strict';

  var canvas = document.getElementById('snowCanvas');
  if (!canvas || !canvas.getContext) return;

  var ctx = canvas.getContext('2d');
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  var GW = 240, GH = 136;                      // the CRT grid
  var buf = document.createElement('canvas');
  buf.width = GW; buf.height = GH;
  var bctx = buf.getContext('2d');
  var img = bctx.createImageData(GW, GH);

  function resize() {
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width === w && canvas.height === h) return;
    canvas.width = w; canvas.height = h;
    ctx.imageSmoothingEnabled = false;         // keep the pixels square
  }
  addEventListener('resize', resize, { passive: true });

  function grain() {
    var d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      /* mostly dark with occasional hot pixels — snow is sparse, not a
         uniform grey field, and a flat 50% average just reads as fog */
      var v = Math.random();
      v = v > 0.86 ? 130 + Math.random() * 125 : Math.random() * 34;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    bctx.putImageData(img, 0, 0);
  }

  /* A rolling tear that sweeps down the frame every few seconds — the same
     horizontal displacement the console does on a channel change, so the two
     pages are speaking the same language. */
  var tear = -0.2, tearWait = 0;

  var last = 0;
  function frame(t) {
    requestAnimationFrame(frame);
    resize();
    if (!canvas.width) return;

    /* ~14fps: real static does not run at 60, and this page should cost
       almost nothing while somebody reads two lines and leaves */
    if (t - last < 70) return;
    var dt = (t - last) / 1000;
    last = t;

    grain();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(buf, 0, 0, canvas.width, canvas.height);

    if (reduce) return;

    if (tearWait > 0) { tearWait -= dt; }
    else {
      tear += dt * 0.55;
      if (tear > 1.2) { tear = -0.2; tearWait = 2 + Math.random() * 3; }
      var y = tear * canvas.height;
      var band = Math.max(6, canvas.height * 0.045);
      var shift = canvas.width * 0.035;
      /* lift the band and put it back displaced, exactly like uv.x += … */
      var slice = ctx.getImageData(0, Math.max(0, y), canvas.width, band);
      ctx.putImageData(slice, shift, Math.max(0, y));
    }
  }
  requestAnimationFrame(frame);
})();
