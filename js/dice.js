/* ============================================================
   CHOW.DEV OS — the die.

   Replaces the flat dice cut-out on the front page with the real thing, and
   keeps every rule the cut-out obeyed.

   POLARITY — the one thing that decides how this is lit.
   `.el` cut-outs are dark artwork on an opaque WHITE rectangle. The page then
   applies invert(--el-inv) and screens the result onto the paper, which is
   what turns them light on a black page and leaves them dark on a white one.
   So this canvas has to hand the page the same thing the PNG did: a DARK die
   on WHITE. Everything below is therefore lit "in negative" — white world,
   dark chrome — and the page flips it into the bright glass you actually see.
   Author it the other way round and it vanishes the moment invert is pressed.

   The material is replaced outright: the model ships as metallic sapphire, and
   this site has no colour to spend on it. Its textures were stripped at build
   time (see _build/strip-textures.cjs) because nothing samples them.

   The tracker gets a live silhouette rather than the frozen one in
   contours.js — it publishes the die's projected hull every frame, so the
   overlay traces the shape that is actually on screen as it turns.
   ============================================================ */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const canvas = document.getElementById('diceCanvas');
if (canvas) init();

function init() {
  const CD = window.CD || {};
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (e) { return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  /* Tuned against the reference, not by eye: sampled tones off the original
     die run 85-217 with a mean near 166, and the first pass measured a mean of
     105 with the shadows down at 45. Exposure carries most of the lift. */
  renderer.toneMappingExposure = 2.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  /* Black ground: the die is lit and rendered the way it really looks, and the
     single CSS invert on this canvas turns the whole frame into the dark-on-
     white rectangle the paper system expects. See the note in style.css. */
  renderer.setClearColor(0x000000, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 0, 9);

  /* ---- environment ------------------------------------------------------
     A softbox studio built out of bands rather than an HDR download. Glass on
     a black ground is only visible by what it reflects and refracts, so the
     bright strips ARE the lighting — they are what draws the edges, the facets
     and the rims of the pips in the original photograph. Hard-edged, because
     a soft gradient reads as plastic. */
  const env = (() => {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#0b0b0b'; x.fillRect(0, 0, 512, 256);
    x.fillStyle = '#ffffff';
    x.fillRect(0, 18, 512, 30);        // key strip, high
    x.fillRect(0, 96, 512, 14);        // secondary
    x.fillStyle = '#cfcfcf';
    x.fillRect(0, 150, 512, 10);       // fill, low and softer
    x.fillStyle = '#ffffff';
    x.fillRect(40, 0, 46, 256);        // a vertical source, for edge streaks
    x.fillRect(330, 0, 26, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const rt = pmrem.fromEquirectangular(tex);
    pmrem.dispose(); tex.dispose();
    return rt.texture;
  })();
  scene.environment = env;

  /* two hard sources so the silhouette keeps a defined terminator on top of
     the environment's reflections */
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(-6, 8, 7);
  const rim = new THREE.DirectionalLight(0xffffff, 1.4);
  rim.position.set(7, -3, -6);
  /* a flat fill purely to raise the shadow floor — the reference never goes
     below ~85, and the first pass was bottoming out at 11 */
  const fill = new THREE.AmbientLight(0xffffff, 0.95);
  scene.add(key, rim, fill);

  /* The body: clear glass. Transmission plus a high IOR is what bends the
     background through it and lights the internal facets, which is the whole
     reason the original reads as a glass die and not a white cube. */
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    /* Clear, not frosted. Three values do the work here:
       · roughness near zero keeps reflections as hard edges instead of smears,
         which is what was rounding the corners off;
       · thickness is what makes glass milky — it is the distance light is
         scattered through the body, so a thick setting hazes the whole die.
         Kept thin, the facets stay legible;
       · transmission high enough to actually see through, now that the haze
         is gone and the reflections no longer have to carry the shape alone. */
    roughness: 0.008,
    transmission: 0.88,
    thickness: 0.55,
    ior: 1.52,
    specularIntensity: 1,
    attenuationDistance: Infinity,      // no tint pick-up through the body
    envMapIntensity: 1.7,
    clearcoat: 1,
    clearcoatRoughness: 0,
    transparent: true
  });

  /* The pips: recessed and dark, so they stay holes rather than turning into
     more glass. Slightly rough, so they catch a rim and nothing else. */
  const pips = new THREE.MeshPhysicalMaterial({
    /* not near-black: the darkest tone sampled off the original is 0x555554,
       so the pips read as deep grey holes, not punched-out voids */
    color: 0x2e2e2e,
    metalness: 0.35,
    roughness: 0.42,
    envMapIntensity: 0.7,
    clearcoat: 0.6
  });

  const pivot = new THREE.Group();
  scene.add(pivot);

  let die = null;
  let corners = [];          // local-space cube corners, for the live hull

  new GLTFLoader().load(
    'assets/models/dice.glb',
    (gltf) => {
      const root = gltf.scene;

      /* The model ships two materials and their names ("Material_002",
         "Grape") say nothing useful, so the body is identified by size: it is
         the mesh with the largest bounding volume, and everything else is the
         pips. Robust to the model being re-exported with different names. */
      const meshes = [];
      root.traverse((o) => { if (o.isMesh) meshes.push(o); });
      let body = null, bodyVol = -1;
      meshes.forEach((m) => {
        m.geometry.computeBoundingBox();
        const s = m.geometry.boundingBox.getSize(new THREE.Vector3());
        const vol = s.x * s.y * s.z;
        if (vol > bodyVol) { bodyVol = vol; body = m; }
      });
      meshes.forEach((m) => { m.material = (m === body) ? glass : pips; });
      /* glass must draw after the pips it refracts */
      if (body) body.renderOrder = 1;

      dishFaces(root, meshes, 0.016);

      /* normalise: centre it and scale so it always frames the same, whatever
         units the model happened to be exported in */
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      const centre = box.getCenter(new THREE.Vector3());
      const s = 3.1 / Math.max(size.x, size.y, size.z);
      root.position.sub(centre);
      root.scale.setScalar(s);

      const holder = new THREE.Group();
      holder.add(root);
      pivot.add(holder);
      die = holder;

      /* the eight corners of the normalised bounding cube — projected each
         frame and hulled to give the tracker something true to lock onto */
      const h = 0.5 * 3.1;
      for (let i = 0; i < 8; i++) {
        corners.push(new THREE.Vector3(
          (i & 1 ? h : -h), (i & 2 ? h : -h), (i & 4 ? h : -h)
        ));
      }
      canvas.classList.add('is-ready');
    },
    undefined,
    () => { /* model missing: the section still reads without it */ }
  );

  /* ---- concave faces -----------------------------------------------------
     Real pressed-glass dice dish very slightly inward on each face; a
     mathematically flat cube is the thing that reads as CG. Every face is
     dished rather than just whichever one is up, because the die turns — "the
     top" is not a fixed face.

     The dish is a paraboloid: deepest at the face centre, zero at its rim, so
     it never disturbs the rounded edges that give the silhouette its
     highlights. Only vertices whose normal is strongly axis-aligned move,
     which leaves the corner radii alone.

     Body and pips are displaced by the SAME function in the SAME space, or
     the pips would be left standing proud of a surface that sank underneath
     them. Meshes are lifted into the model's shared space and written back
     through the inverse, so nothing depends on how the exporter nested them.
     `depth` is a fraction of the die's half-extent. */
  function dishFaces(root, meshes, depth) {
    root.updateWorldMatrix(true, true);
    const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();

    /* the die's extent in shared space */
    const bounds = new THREE.Box3().setFromObject(root);
    const size = bounds.getSize(new THREE.Vector3());
    const centre = bounds.getCenter(new THREE.Vector3());
    const half = Math.max(size.x, size.y, size.z) * 0.5;
    const drop = half * depth;

    const toRoot = new THREE.Matrix4();
    const back = new THREE.Matrix4();
    const nrm = new THREE.Matrix3();
    const nrmBack = new THREE.Matrix3();
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();

    meshes.forEach((mesh) => {
      const g = mesh.geometry;
      const pos = g.attributes.position;
      const nor = g.attributes.normal;
      if (!pos || !nor) return;

      toRoot.multiplyMatrices(rootInv, mesh.matrixWorld);
      back.copy(toRoot).invert();
      nrm.getNormalMatrix(toRoot);
      nrmBack.getNormalMatrix(back);

      for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i).applyMatrix4(toRoot).sub(centre);
        n.fromBufferAttribute(nor, i).applyMatrix3(nrm).normalize();

        /* which face is this vertex on? only near-perfect axis alignment
           counts, so edges and corners are untouched */
        const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
        const m = Math.max(ax, ay, az);
        if (m < 0.94) continue;

        /* distance from the face centre, across the face */
        let u, v;
        if (m === ax) { u = p.y; v = p.z; }
        else if (m === ay) { u = p.x; v = p.z; }
        else { u = p.x; v = p.y; }
        const r = Math.min(1, Math.sqrt(u * u + v * v) / half);

        const dip = drop * (1 - r * r);          // paraboloid, 0 at the rim
        if (dip <= 0) continue;

        p.addScaledVector(n, -dip).add(centre).applyMatrix4(back);
        pos.setXYZ(i, p.x, p.y, p.z);
      }
      pos.needsUpdate = true;
      /* recompute so the new curvature actually catches the light */
      g.computeVertexNormals();
      g.computeBoundingBox();
      g.computeBoundingSphere();
    });
  }

  /* ---- size ------------------------------------------------------------- */
  let lastW = 0, lastH = 0;
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h || (w === lastW && h === lastH)) return;
    lastW = w; lastH = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize, { passive: true });

  /* ---- the roll ---------------------------------------------------------
     Idle is a slow tumble at the same tempo the stars turn — minutes per
     revolution, so it reads as drift. A throw adds angular velocity that
     bleeds off against a fixed drag, then eases onto the nearest face so it
     always settles square rather than stopping at some arbitrary angle. */
  const IDLE = { x: 0.019, y: 0.027 };
  let vx = 0, vy = 0, vz = 0;
  let settling = false;
  const target = new THREE.Quaternion();

  function throwDie(strength) {
    settling = false;
    const s = strength === undefined ? 1 : strength;
    /* signs vary with the current attitude so repeat throws do not feel like
       a loop — no Math.random in the drift, but a throw is an input, not a
       render, so a little chance here is honest */
    vx = (2.6 + Math.random() * 3.4) * s * (Math.random() < 0.5 ? -1 : 1);
    vy = (2.6 + Math.random() * 3.4) * s * (Math.random() < 0.5 ? -1 : 1);
    vz = (1.1 + Math.random() * 1.6) * s * (Math.random() < 0.5 ? -1 : 1);
  }

  /* snap to whichever face is closest to camera-facing */
  function faceUp() {
    const q = pivot.quaternion.clone();
    let best = null, bestDot = -Infinity;
    const axes = [
      [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]
    ];
    const view = new THREE.Vector3(0, 0, 1);
    axes.forEach((a) => {
      const v = new THREE.Vector3(a[0], a[1], a[2]).applyQuaternion(q);
      const d = v.dot(view);
      if (d > bestDot) { bestDot = d; best = a; }
    });
    const from = new THREE.Vector3(best[0], best[1], best[2]).applyQuaternion(q).normalize();
    const rot = new THREE.Quaternion().setFromUnitVectors(from, view);
    target.copy(rot.multiply(q));
    settling = true;
  }

  canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); throwDie(1); });
  canvas.style.touchAction = 'manipulation';

  /* ---- the live silhouette for the tracker ------------------------------ */
  const hullPts = [];
  function publishHull() {
    if (!die || !corners.length) return;
    const w = lastW, h = lastH;
    if (!w || !h) return;
    hullPts.length = 0;
    const v = new THREE.Vector3();
    for (let i = 0; i < corners.length; i++) {
      v.copy(corners[i]).applyQuaternion(pivot.quaternion).project(camera);
      hullPts.push([(v.x * 0.5 + 0.5), (-v.y * 0.5 + 0.5)]);
    }
    /* convex hull (gift wrap — eight points, so the cost is irrelevant) */
    const pts = hullPts.slice();
    let start = 0;
    for (let i = 1; i < pts.length; i++) if (pts[i][0] < pts[start][0]) start = i;
    const hull = [];
    let cur = start;
    do {
      hull.push(pts[cur]);
      let next = (cur + 1) % pts.length;
      for (let i = 0; i < pts.length; i++) {
        const cross = (pts[next][0] - pts[cur][0]) * (pts[i][1] - pts[cur][1])
                    - (pts[next][1] - pts[cur][1]) * (pts[i][0] - pts[cur][0]);
        if (cross < 0) next = i;
      }
      cur = next;
    } while (cur !== start && hull.length < 9);

    let minx = 1, miny = 1, maxx = 0, maxy = 0;
    hull.forEach((p) => {
      if (p[0] < minx) minx = p[0]; if (p[0] > maxx) maxx = p[0];
      if (p[1] < miny) miny = p[1]; if (p[1] > maxy) maxy = p[1];
    });
    CD.trkLive = CD.trkLive || {};
    CD.trkLive.dice = { p: hull, b: [minx, miny, maxx - minx, maxy - miny] };
  }

  /* ---- loop -------------------------------------------------------------
     Only while the front page is on screen. */
  let visible = true;
  const hero = document.getElementById('hero');
  if (hero && 'IntersectionObserver' in window) {
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; }, { rootMargin: '15% 0px' })
      .observe(hero);
  }

  const clock = new THREE.Clock();
  (function loop() {
    requestAnimationFrame(loop);
    if (!visible) return;
    resize();
    if (!lastW) return;
    const dt = Math.min(clock.getDelta(), 0.05);

    if (!reduce) {
      if (settling) {
        pivot.quaternion.slerp(target, Math.min(1, dt * 3.4));
        if (pivot.quaternion.angleTo(target) < 0.002) settling = false;
      } else if (Math.abs(vx) + Math.abs(vy) + Math.abs(vz) > 0.05) {
        /* spin down against a fixed drag */
        const drag = Math.pow(0.16, dt);
        vx *= drag; vy *= drag; vz *= drag;
        pivot.rotateX(vx * dt); pivot.rotateY(vy * dt); pivot.rotateZ(vz * dt);
        if (Math.abs(vx) + Math.abs(vy) + Math.abs(vz) <= 0.05) faceUp();
      } else {
        pivot.rotateX(IDLE.x * dt); pivot.rotateY(IDLE.y * dt);
      }
    }

    publishHull();
    renderer.render(scene, camera);
  })();

  /* let the rest of the page throw it too */
  CD.rollDice = throwDie;
  window.CD = CD;
}
