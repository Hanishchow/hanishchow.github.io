# chow.dev

Personal portfolio for Hanish Chowdary — machine-learning engineer and
researcher, Bangalore.

A single page with a WebGL handheld console at its centre: scroll, and each
work loads onto the console's screen as a video texture. Static, no build step,
no framework, no backend.

    index.html          the whole page
    404.html            dead-channel page, no 3D, deliberately the lightest route
    css/style.css       the design system — read the comments before editing
    css/404.css         additions for the 404 only
    js/data.js          the archive. This is the CMS.
    js/main.js          boot, audio, invert, the scroll engine
    js/psp.js           the console: GLB + CRT shader
    js/dice.js          the die on the front page
    js/warp.js          the funnel behind the builds page
    js/track.js         the tracking-overlay furniture
    js/contours.js      baked silhouettes for the tracker (generated)
    js/stars.js         live GitHub star counts on the builds list
    js/snow.js          static for the 404
    _build/             asset pipeline. Its output is gitignored, not its scripts.

## Adding a work

Drop the source in `_incoming/`, add a line to the build list at the bottom of
`_build/media.sh`, and run:

```bash
bash _build/media.sh --run
```

That writes a 6-second muted loop to `assets/reels/` and a poster pulled from
the clip itself to `assets/works/`. Then add an entry to `js/data.js`.

Removing a work:

```bash
node _build/drop-works.cjs <id>
```

### Things the pipeline already handles

- **HDR.** iPhone footage is HLG / BT.2020 / 10-bit. Encoding it straight to
  SDR does not fail, it silently produces washed-out video. Tone-mapping is
  applied when the source declares an HDR transfer, and skipped otherwise.
- **Rotation.** Portrait iPhone clips carry ±90° metadata. ffmpeg applies it,
  so `vertical` in `data.js` must be read off the *output* file, never guessed
  — a wrong value breaks the screen aspect.
- **HEIC.** Decoded through an intermediate first; ffmpeg will not hang a
  simple filter off its internal filtergraph.
- **Size budget.** Clips are encoded to a 1.5 MB ceiling, stepping quality down
  only as far as each one needs.

## Rules the design depends on

Read the comments in `css/style.css` — most of them exist because something
broke. The short version:

1. **Nothing has a colour.** Everything derives from `--paper`. A hardcoded
   `#fff` becomes a black box the moment `invert` is pressed.
2. **One 16:9 stage.** Elements are positioned in percent *of the stage* and
   sized in `cqw`, never against the viewport.
3. **The last section carries `--fade-b: 0`.** Keyed off section order, so
   appending a page cannot reintroduce a hard seam.
4. **HUD ink is `mix-blend-mode: difference`** in one neutral grey, so it reads
   over any paper.
5. **Motion is drift, not transition.** Revolutions take minutes.
6. **Two fonts, two jobs.** Helv for display, VCR for anything the machine says.
7. **Mobile is the same system re-authored** in one query at 820px. A new
   section without its own mobile block will break.

## Weight

Roughly 9.5 MB on a cold first load; reels stream on demand, so only the
selected one is fetched. `psp.glb` (4.2 MB) and `dice.glb` (2 MB) dominate.

Pending: `assets/audio/theme.mp3` (3.5 MB) and the Helvetica faces (1.9 MB) are
both slated for removal, which would take a cold load to about 4 MB.

## Deploy

GitHub Pages is the primary target — it is a CDN, and this site is mostly
static binaries. Push to `main`.

The VPS is a staging mirror. It is also running a clinical annotation platform,
so it should not carry public portfolio traffic.

Add a `CNAME` file containing the bare domain when one is registered.

## Licence

See `LICENSE`. Not open source, and deliberately so — the reasoning is in the
file.
