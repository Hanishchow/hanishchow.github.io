/* ============================================================
   CHOW.DEV OS — the funnel.

   A whirlpool sitting behind the last page. It is drawn as one full-section
   shader quad, and it obeys the same three rules as everything else here:

   1. No colour. It renders a single luminance and composites with `difference`
      like the tracking overlay, so it reads over black paper, over white paper
      and over the cut-outs without being themed per section.
   2. Quantised. The output is snapped to the same pixel grid the CRT screen
      uses and then ordered-dithered, so it shares the halftone the cut-outs
      were printed with instead of looking like a smooth 2026 gradient.
   3. Scroll-driven, not clock-driven. Rotation and travel come from where the
      page is, not from a timer — falling in is something the visitor does. A
      slow idle drift underneath keeps it alive when the page is still, at the
      same tempo as the stars (a revolution in minutes, not seconds).
   ============================================================ */
import * as THREE from 'three';

(function () {
  const canvas = document.getElementById('warpCanvas');
  const section = document.getElementById('builds');
  if (!canvas || !section) return;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let gl;
  try {
    gl = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
  } catch (e) {
    return;                                   // no WebGL: the section still reads as type
  }
  gl.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uRes:    { value: new THREE.Vector2(1, 1) },
      uTime:   { value: 0 },
      uFall:   { value: 0 },      // 0 at the top of the section, 1 at the bottom
      uGrid:   { value: new THREE.Vector2(240, 136) }   // matches the CRT screen
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform vec2  uRes, uGrid;
      uniform float uTime, uFall;
      varying vec2  vUv;

      float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }

      float noise(vec2 p){
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
                   mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
      }

      float fbm(vec2 p){
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 4; i++){ v += a * noise(p); p *= 2.03; a *= 0.5; }
        return v;
      }

      /* 4x4 ordered dither. The cut-outs are halftone prints; a smooth ramp
         next to them would read as a different medium. */
      float bayer(vec2 p){
        int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0));
        int i = x + y * 4;
        float t[16];
        t[0]=0.0;t[1]=8.0;t[2]=2.0;t[3]=10.0;
        t[4]=12.0;t[5]=4.0;t[6]=14.0;t[7]=6.0;
        t[8]=3.0;t[9]=11.0;t[10]=1.0;t[11]=9.0;
        t[12]=15.0;t[13]=7.0;t[14]=13.0;t[15]=5.0;
        for (int k = 0; k < 16; k++) if (k == i) return t[k] / 16.0;
        return 0.0;
      }

      void main(){
        /* snap to the console's pixel grid before anything is computed, so the
           whole funnel is built out of the same pixels the screen is */
        vec2 g   = uGrid * vec2(1.0, uRes.y / uRes.x * (uGrid.x / uGrid.y));
        vec2 quv = (floor(vUv * g) + 0.5) / g;

        vec2  c = (quv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
        float r = length(c);
        float a = atan(c.y, c.x);

        /* 1/r is the whole trick: the throat is infinitely far away, so the
           arms crowd together toward the centre and the eye reads depth */
        float depth = 1.0 / (r + 0.055);

        /* differential rotation — the inside turns faster than the rim, which
           is what makes a whirlpool a whirlpool rather than a spinning disc */
        float spin  = uTime * 0.045 + uFall * 6.5;
        float ang   = a + depth * 0.42 + spin;

        /* travel down the funnel as the page scrolls */
        float z = depth * 0.85 + uFall * 5.0 + uTime * 0.03;

        /* spiral arms */
        float arms = 0.5 + 0.5 * sin(ang * 2.0 + z * 1.6);
        arms = pow(arms, 2.2);

        /* dust caught in the arms */
        float dust = fbm(vec2(ang * 1.6, z * 0.9)) * 0.85
                   + fbm(vec2(ang * 5.0, z * 2.4)) * 0.35;

        float v = arms * dust;

        /* the accretion glow: bright at the throat, gone at the rim */
        v *= smoothstep(1.15, 0.06, r);
        v += smoothstep(0.30, 0.0, r) * 0.5;          // the eye of it

        /* stars falling in, sparser than the dust and not on the arms */
        float st = hash(floor(vec2(ang * 60.0, z * 8.0)));
        v += smoothstep(0.988, 1.0, st) * smoothstep(1.1, 0.15, r) * 0.7;

        v = clamp(v, 0.0, 1.0);
        v *= 0.42;                                    // it sits under the type

        /* quantise through the dither so it prints rather than fades */
        float d = bayer(gl_FragCoord.xy);
        v = floor(v * 9.0 + d) / 9.0;

        gl_FragColor = vec4(vec3(v), v);
      }`
  });

  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));

  /* Measured every frame rather than only on `resize`: the first measure can
     land before a scrollbar has taken its 15px, and a canvas sized to the
     wrong width renders the funnel as an ellipse. Comparing first makes the
     check free in the normal case. */
  let lastW = 0, lastH = 0;
  function resize() {
    const w = section.clientWidth, h = section.clientHeight;
    if (!w || !h || (w === lastW && h === lastH)) return;
    lastW = w; lastH = h;
    gl.setSize(w, h, false);
    mat.uniforms.uRes.value.set(w, h);
  }
  addEventListener('resize', resize, { passive: true });
  resize();

  /* how far into the section we are: 0 as its top reaches the bottom of the
     viewport, 1 once it has left the top. Same measure main.js drifts on. */
  let fall = 0, fallTarget = 0;
  function measure() {
    const r = section.getBoundingClientRect();
    const vh = innerHeight || 1;
    fallTarget = Math.max(0, Math.min(1, (vh - r.top) / (vh + r.height)));
  }
  addEventListener('scroll', measure, { passive: true });
  measure();

  /* Only render while the section is actually on screen — this is the last
     page, so for most of a visit the funnel costs nothing at all. */
  let visible = false;
  new IntersectionObserver(
    (es) => { visible = es[0].isIntersecting; },
    { rootMargin: '10% 0px' }
  ).observe(section);

  const clock = new THREE.Clock();
  (function loop() {
    requestAnimationFrame(loop);
    if (!visible) return;
    resize();
    const dt = Math.min(clock.getDelta(), 0.05);
    fall += (fallTarget - fall) * Math.min(1, dt * 3.2);
    mat.uniforms.uFall.value = fall;
    if (!reduce) mat.uniforms.uTime.value += dt;
    gl.render(scene, cam);
  })();
})();
