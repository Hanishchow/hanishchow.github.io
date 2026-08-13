/* ============================================================
   CHOW.DEV OS — boot sequence, HUD, audio, navigation.
   Plain script; psp.js is the module and talks to us via
   window.CD (a tiny shared bus).
   ============================================================ */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* shared bus ------------------------------------------------ */
  var CD = window.CD = {
    ready: false,
    _onReady: [],
    onReady: function (fn) { this.ready ? fn() : this._onReady.push(fn); },
    fireReady: function () {
      this.ready = true;
      this._onReady.splice(0).forEach(function (f) { f(); });
    }
  };

  /* ---------------------------------------------------------- */
  /* BOOT SEQUENCE                                              */
  /* ---------------------------------------------------------- */
  var boot = document.getElementById('boot');
  var fillEl = document.getElementById('bootFill');
  var pctEl = document.getElementById('bootPct');

  var pct = 0, targetPct = 0;
  var bootDone = false;

  /* ---- the ident -------------------------------------------------------
     Drawn rather than shipped as artwork: the word is rasterised into a tiny
     canvas and then blown up with smoothing off, so it arrives chunky and
     aliased on purpose. That is the same quantisation the console screen and
     the funnel use, which is why a heavy display word does not read as a
     sticker here. Being text, it also costs nothing and stays sharp-edged at
     any size — and it inverts with the page like every other mark. */
  (function ident() {
    var cv = document.getElementById('bootMark');
    if (!cv || !cv.getContext) return;
    var W = 96, H = 34;                       // deliberately tiny
    cv.width = W; cv.height = H;
    var x = cv.getContext('2d');
    x.clearRect(0, 0, W, H);
    x.fillStyle = '#000';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    /* condensed by squeezing the transform rather than asking for a condensed
       cut we do not ship */
    x.setTransform(0.82, 0, 0, 1, W / 2, H / 2);
    x.font = '700 30px Helv, "Helvetica Neue", Helvetica, Arial, sans-serif';
    x.fillText('chow', 0, 1);
  })();

  function setPct(v) {
    pct = v;
    if (fillEl) fillEl.style.right = (100 - v) + '%';
    if (pctEl) pctEl.textContent = String(Math.round(v)).padStart(3, '0');
  }

  /* creep toward 96 while the model streams in; finishBoot waits on the scene */
  function crawl() {
    targetPct = Math.min(96, targetPct + 6);
    if (targetPct < 96) setTimeout(crawl, reduce ? 30 : 90);
    else finishBoot();
  }

  function tickPct() {
    if (bootDone) return;
    setPct(pct + (targetPct - pct) * 0.14);
    requestAnimationFrame(tickPct);
  }

  function finishBoot() {
    // wait for the 3D scene (or bail after 9s so a slow CDN never traps anyone)
    var released = false;
    function release() {
      if (released) return; released = true;
      targetPct = 100; setPct(100);
      setTimeout(function () {
        bootDone = true;
        if (boot) boot.classList.add('is-done');
        document.body.classList.remove('is-booting');
        document.body.classList.add('is-lit');
      }, reduce ? 60 : 420);
    }
    CD.onReady(release);
    setTimeout(release, 9000);
  }

  requestAnimationFrame(tickPct);
  setTimeout(crawl, reduce ? 0 : 200);

  /* ---------------------------------------------------------- */
  /* AUDIO — on by default, remembered per session                */
  /*                                                              */
  /* Browsers will not let a page make noise before the visitor    */
  /* has interacted with it. Two things follow, and the old code   */
  /* got both wrong:                                              */
  /*                                                              */
  /*  1. `wheel` and `scroll` are NOT user-activation gestures.    */
  /*     This is a scroll-driven site, so the first thing almost   */
  /*     every visitor does is scroll — the old arming used        */
  /*     {once:true} and tore down the pointer/key listeners on    */
  /*     the first wheel event, then called play(), which was      */
  /*     refused and swallowed. One scroll killed the music for    */
  /*     the whole visit, and no later click could revive it.      */
  /*     So: never disarm except on confirmed success.             */
  /*                                                              */
  /*  2. MUTED playback is always allowed. So the track is set     */
  /*     rolling silently from the very first frame and is fully   */
  /*     buffered by the time a gesture arrives — the gesture      */
  /*     only has to unmute, which cannot fail on a load or a      */
  /*     network stall the way a cold play() can.                  */
  /* ---------------------------------------------------------- */
  var audio = document.getElementById('bgAudio');
  var btn = document.getElementById('soundToggle');
  var wanted = false, fadeTimer = null, audible = false;
  var VOL = 0.42;

  function fadeTo(target, done) {
    if (!audio) return;
    clearInterval(fadeTimer);
    var step = (target - audio.volume) / 22;
    fadeTimer = setInterval(function () {
      var v = audio.volume + step;
      if ((step > 0 && v >= target) || (step < 0 && v <= target) || step === 0) {
        audio.volume = Math.max(0, Math.min(1, target));
        clearInterval(fadeTimer);
        done && done();
      } else {
        audio.volume = Math.max(0, Math.min(1, v));
      }
    }, 40);
  }

  function reflect() { btn && btn.setAttribute('aria-pressed', wanted ? 'true' : 'false'); }

  /* start it rolling with no sound — always permitted, and it warms the buffer */
  function rollSilently() {
    if (!audio) return;
    audio.muted = true;
    audio.volume = 0;
    var p = audio.play();
    if (p && p.catch) p.catch(function () {});
  }

  /* Try to actually make sound. Resolves true only if it worked.

     Single-flight, and that matters: a wheel and a scroll arrive back to back,
     so two attempts overlap. The second would read `wasMuted` off an element
     the first had already unmuted, then "restore" it to unmuted on failure —
     leaving the track silent AND paused, with nothing left rolling. */
  var inFlight = null;
  function goAudible() {
    if (!audio) return Promise.resolve(false);
    if (audible) return Promise.resolve(true);
    if (inFlight) return inFlight;

    var wasMuted = audio.muted;
    audio.muted = false;
    /* if it has been rolling silently the visitor has heard none of it, so
       give them the top of the track rather than dropping them mid-phrase */
    if (wasMuted) { try { audio.currentTime = 0; } catch (e) {} }
    audio.volume = 0;

    var p;
    try { p = audio.play(); } catch (e) { p = null; }
    var settle = function (ok) { inFlight = null; return ok; };
    var win = function () { audible = true; fadeTo(VOL); return settle(true); };
    var lose = function () {
      /* unmuting without activation makes Chrome pause it — put it back */
      audio.muted = wasMuted;
      if (wasMuted && audio.paused) rollSilently();
      return settle(false);
    };
    if (!p || !p.then) return Promise.resolve(audio.paused ? lose() : win());
    inFlight = p.then(win, lose);
    return inFlight;
  }

  var ARM = ['pointerdown', 'pointerup', 'click', 'keydown', 'touchstart', 'touchend', 'wheel', 'scroll'];
  var armed = false;
  function kick() {
    if (!wanted || audible) { disarm(); return; }
    goAudible().then(function (ok) { if (ok) disarm(); });
  }
  function arm() {
    if (armed || !audio) return;
    armed = true;
    /* capture, passive, and NOT `once` — a wheel event that cannot grant
       activation must be free to fail without costing us the next real click */
    ARM.forEach(function (t) { window.addEventListener(t, kick, { capture: true, passive: true }); });
  }
  function disarm() {
    if (!armed) return;
    armed = false;
    ARM.forEach(function (t) { window.removeEventListener(t, kick, true); });
  }

  function setSound(on) {
    if (!audio) return;
    wanted = on;
    reflect();
    try { sessionStorage.setItem('cd_sound', on ? '1' : '0'); } catch (e) {}
    if (on) {
      goAudible().then(function (ok) { if (!ok) { rollSilently(); arm(); } });
    } else {
      audible = false;
      disarm();
      fadeTo(0, function () { audio.pause(); });
    }
  }

  if (btn) btn.addEventListener('click', function () { setSound(!wanted); });

  // pause when the tab is hidden, resume if it was wanted
  document.addEventListener('visibilitychange', function () {
    if (!audio) return;
    if (document.hidden) { audio.pause(); }
    else if (wanted) { var p = audio.play(); if (p && p.catch) p.catch(function () {}); }
  });

  var soundOnByDefault = true;
  try { if (sessionStorage.getItem('cd_sound') === '0') soundOnByDefault = false; } catch (e) {}

  /* A phone on a venue's network should not spend 3.4 MB on a track nobody
     asked for. On a narrow screen, or when the visitor has asked for reduced
     data, the audio stays unfetched until the music control is pressed — at
     which point it loads and plays like any other on-demand media. Desktop
     keeps the original behaviour: roll it muted from the first frame so the
     unmute is instant. */
  var lightAudio = innerWidth < 820 ||
    (navigator.connection && navigator.connection.saveData === true);

  if (audio && soundOnByDefault && !lightAudio) {
    wanted = true;
    reflect();
    goAudible().then(function (ok) {
      if (ok) return;          // high media engagement — it just plays
      rollSilently();          // otherwise roll it muted and wait for a gesture
      arm();
    });
  } else if (audio && lightAudio) {
    /* the control still reads "off" and still works; it just costs nothing
       until it is used */
    wanted = false;
    reflect();
  }

  /* ---------------------------------------------------------- */
  /* INVERT — swaps the ink and the paper, keeps pink/cyan        */
  /* ---------------------------------------------------------- */
  var invBtn = document.getElementById('invertToggle');
  function setInvert(on) {
    document.body.classList.toggle('is-invert', on);
    /* the control is a checkbox now, so state lives in `checked` — which also
       means the browser restores it on a back-navigation and would otherwise
       disagree with the class we set from storage below */
    if (invBtn) invBtn.checked = on;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', on ? '#000000' : '#ffffff');
    if (CD.setShellInvert) CD.setShellInvert(on);   // the PSP casing goes white
    if (typeof onScroll === 'function') onScroll();  // repaint the backdrop tone
    try { localStorage.setItem('cd_invert', on ? '1' : '0'); } catch (e) {}
  }
  if (invBtn) {
    invBtn.addEventListener('change', function () { setInvert(invBtn.checked); });
  }
  try { if (localStorage.getItem('cd_invert') === '1') setInvert(true); } catch (e) {}

  /* ---------------------------------------------------------- */
  /* SCROLL ENGINE                                               */
  /* Three jobs: bleed the backdrop tone across section seams,   */
  /* drift each element at its own rate, and reveal type as it   */
  /* enters. Everything runs off one rAF loop.                   */
  /* ---------------------------------------------------------- */
  var backdrop = document.querySelector('.backdrop');
  var secs = [].slice.call(document.querySelectorAll('.sec'));
  var movers = [].slice.call(document.querySelectorAll('.el, .lay'));

  /* how far each piece drifts, as a fraction of the viewport */
  var DEPTH = {
    'el--star-a': 0.16, 'el--star-b': -0.13, 'el--dice': 0.07,
    'el--cd-a': 0.15, 'el--cd-b': -0.12, 'el--cards': 0.08,
    'lay--shutter': -0.05, 'lay--kif': 0.05,
    'lay--abouth': -0.04, 'lay--bio': 0.035,
    'lay--contact': -0.05, 'lay--me': 0.05, 'lay--icons': 0.03,
    'lay--buildsh': -0.04, 'lay--builds': 0.03
  };
  movers.forEach(function (m) {
    var d = 0;
    for (var k in DEPTH) if (m.classList.contains(k)) d = DEPTH[k];
    m.__d = d;
  });

  function toneOf(sec) { return sec.classList.contains('sec--dark') ? 1 : 0; }

  var ticking = false;
  function onScroll() {
    if (!ticking) { ticking = true; requestAnimationFrame(frame); }
  }

  function frame() {
    ticking = false;
    /* never 0: a frame that lands while the viewport measures zero — during
       load, or in a backgrounded tab — divides through below and turns every
       drift into Infinity, and Infinity * 0 is NaN. */
    var vh = window.innerHeight || 1;
    var mid = window.scrollY + vh * 0.5;

    /* --- backdrop tone, blended across a band at each seam --- */
    if (backdrop && secs.length) {
      var band = vh * 0.6;
      var tone = toneOf(secs[secs.length - 1]);
      for (var i = 0; i < secs.length; i++) {
        var top = secs[i].offsetTop, bot = top + secs[i].offsetHeight;
        if (mid >= top && mid < bot) {
          tone = toneOf(secs[i]);
          if (i < secs.length - 1 && mid > bot - band) {
            tone += (toneOf(secs[i + 1]) - tone) * ((mid - (bot - band)) / band);
          } else if (i > 0 && mid < top + band) {
            tone += (toneOf(secs[i - 1]) - tone) * (1 - (mid - top) / band);
          }
          break;
        }
      }
      var inv = document.body.classList.contains('is-invert');
      var v = Math.round((inv ? tone : 1 - tone) * 255);
      backdrop.style.backgroundColor = 'rgb(' + v + ',' + v + ',' + v + ')';
    }

    /* --- per-element drift --- */
    for (var j = 0; j < movers.length; j++) {
      var m = movers[j];
      if (!m.__d) continue;
      var r = m.parentNode.getBoundingClientRect();
      if (r.bottom < -vh || r.top > vh * 2) continue;      // far off-screen, skip
      var p = (r.top + r.height / 2 - vh / 2) / vh;        // -1 .. 1 through the viewport
      /* A non-finite drift would be written out as `NaNpx`, which invalidates
         the whole `transform` on the element — including the translate(-50%)
         that centres the about heading and the contact row, so they would jump
         half a stage sideways. Worse, the guard above skips anything far
         off-screen, so a single bad frame is never corrected. Clamp instead. */
      var ty = p * m.__d * vh;
      if (!isFinite(ty)) ty = 0;
      m.style.setProperty('--ty', ty.toFixed(1) + 'px');
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  frame();

  /* reveal the type and the cut-outs as each section arrives */
  if ('IntersectionObserver' in window && !reduce) {
    var lays = [].slice.call(document.querySelectorAll('.lay, .el'));
    lays.forEach(function (n) { n.classList.add('rev'); });
    var ro = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-shown'); ro.unobserve(e.target); }
      });
    }, { threshold: 0, rootMargin: '0px 0px -6% 0px' });
    lays.forEach(function (n) { ro.observe(n); });

    /* Failsafe — nothing may be left hidden because an observer misfired.
       PER ELEMENT, not blanket: it only shows what is actually on screen, so a
       section further down still gets its animation when you reach it. An
       earlier build force-showed everything 2.5s after load and killed every
       reveal past the fold; the one before that left all body text invisible.
       Do not remove this, and do not turn it back into a blanket timeout. */
    var showIfNear = function () {
      var vh = window.innerHeight, live = 0;
      for (var z = 0; z < lays.length; z++) {
        var el = lays[z];
        if (el.classList.contains('is-shown')) continue;
        live++;
        var r = el.getBoundingClientRect();
        if (r.top < vh && r.bottom > 0) { el.classList.add('is-shown'); ro.unobserve(el); }
      }
      if (!live && guard) { clearInterval(guard); guard = null; }
    };
    var guard = setInterval(showIfNear, 900);
    showIfNear();
    window.addEventListener('scroll', showIfNear, { passive: true });
    window.addEventListener('resize', showIfNear, { passive: true });
  }

  /* ---------------------------------------------------------- */
  /* SMOOTH IN-PAGE NAV                                          */
  /* ---------------------------------------------------------- */
  document.querySelectorAll('[data-nav]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href');
      if (!id || id.charAt(0) !== '#') return;
      var t = document.querySelector(id);
      if (!t) return;
      e.preventDefault();
      t.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    });
  });

  /* ---------------------------------------------------------- */
  /* SECTION REVEALS                                             */
  /* ---------------------------------------------------------- */
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.18 });
    document.querySelectorAll('.about, .contact').forEach(function (el) { io.observe(el); });
  }
})();
