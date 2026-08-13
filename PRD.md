# PRD — Personal Film & Visual Work Portfolio

**Status:** draft · awaiting identity inputs
**Owner:** _TBD (see §11)_
**Last updated:** 2026-08-13

---

## 1. Product summary

A single-page, zero-dependency portfolio site for a filmmaker and visual
storyteller. The site's centrepiece is a 3D handheld console rendered in WebGL:
the visitor scrolls, the console's screen loads a work, and the reel plays
directly on the device screen as a video texture. Scrolling and arrow keys move
through the archive; a single control opens the original post. Around it sit
four full-bleed sections — a boot loader, a split-word hero, an about panel, and
a contact panel — styled as a lo-fi late-90s console interface with CRT
distortion, a tracking-overlay HUD, and an optional background track.

The site is a **showreel with a memorable object at its centre**, not a
conventional grid portfolio. The interaction is the differentiator; the work is
the payload.

---

## 2. Goals

| # | Goal |
|---|---|
| G1 | A visitor watches at least three works without a single page navigation |
| G2 | Every work is one click from its original Instagram/YouTube post |
| G3 | The site loads and reaches interactive state on a mid-range phone on 4G |
| G4 | Contact (email, Instagram) is reachable from any scroll position in two actions |
| G5 | Adding or replacing a work is a single-file edit plus two asset drops |

### Non-goals (v1)

- No CMS, no admin panel. `js/data.js` **is** the CMS.
- No build step, no bundler, no framework, no `package.json`.
- No analytics, no tracking pixels, no cookie banner.
- No contact form, no backend, no email service.
- No blog, no case-study sub-pages, no multi-page routing.
- No i18n. English only.

---

## 3. Audience & job-to-be-done

**Primary:** a director, producer, brand manager, or agency creative who has been
sent the link and is deciding in under a minute whether to make contact.

**JTBD:** _"Show me, fast, whether this person can shoot the thing I need — then
let me reach them without hunting."_

**Secondary:** peers and fellow creators arriving from an Instagram bio link,
usually on mobile, usually with sound off.

Design consequences: the first work must be playing before any deliberate
action; nothing may depend on audio; and the contact section must be reachable
without reading the about copy.

---

## 4. Content model

`js/data.js` defines one global array. This is the site's data contract — every
other file reads from it and nothing writes to it.

```js
window.<BRAND>_WORKS = [ { … } ]
```

| Field | Type | Required | Meaning |
|---|---|---|---|
| `id` | string | yes | Unique slug. Also the asset basename. Must not encode a third-party post ID. |
| `title` | string | yes | Work title, displayed uppercase |
| `sub` | string | yes | One-line subtitle or credit block |
| `kind` | `'REEL' \| 'SHORT FILM'` | yes | Category label |
| `year` | string | yes | Four-digit year |
| `meta` | string | yes | HUD strapline, `KIND · METRIC · PLATFORM` |
| `img` | path | yes | Poster JPG, `assets/works/<id>.jpg` |
| `vid` | path | no | Looping MP4, `assets/reels/<id>.mp4`. Omit for link-only entries. |
| `link` | URL | yes | The original post, opened by the `↗` control |
| `vertical` | boolean | yes | True for portrait source. **Read off the file, never guessed** — a wrong value breaks the screen aspect. |
| `featured` | boolean | no | Marks the entry the machine boots into |

**Ordering is editorial, not by metric.** The long-form film sits last;
everything before it is a reel.

**Entries without `vid`** render their poster only and still open via `link` —
this is how a YouTube-hosted long-form work is represented without re-hosting it.

---

## 5. Section spec

| # | Section | Copy slots | Interaction |
|---|---|---|---|
| 00 | **Boot** `#boot` | percentage counter `000`→`100` | Blocks the page (`body.is-booting`) until assets resolve; the progress bar tracks real load |
| 01 | **Hero** `#hero` | brand word part A (`<h1>`), brand word part B (decorative) | Cut-out props parallax on scroll; scroll cue anchors to `#work` |
| 02 | **Work** `#work` | rail counter `01/09`, key hints `← → ✕` | The WebGL console. Scroll and arrow keys change slot; `↗` opens `link`; `✕` exits focus |
| 03 | **About** `#about` | heading + two paragraphs | Cut-out props; text is the only content |
| 04 | **Contact** `#contact` | heading part A/B, email + social icons | `mailto:` and social profile links |

Global controls (fixed, always visible): `invert` (tone inversion) and
`music on/off`. Both persist to `localStorage` under a brand-scoped key prefix.
Audio is `preload="auto"` and starts muted so it can be unmuted instantly on
first click without a buffering gap.

---

## 6. Asset spec

| Asset | Target | Current |
|---|---|---|
| Reel MP4 | H.264, ~1080px long edge, **no audio track**, ≤6s loop trimmed from 0.5s, **≤1.5 MB** | 62 KB – 851 KB ✅ |
| Poster JPG | Single frame **extracted from its own clip** so still and motion match, ≤60 KB | 4 KB – 39 KB ✅ |
| OG image | `assets/works/work0.jpg`, ≤200 KB | 182 KB ✅ |
| 3D model | `assets/models/psp.glb` | **12.3 MB ⚠️ dominates page weight — Draco/meshopt compression is the single highest-value optimisation** |
| Audio | `assets/audio/theme.mp3`, loop | 3.5 MB |
| Fonts | 4 faces × woff | **Helvetica must be replaced — see §7** |
| **Total page weight ceiling** | **≤20 MB** first load, **≤6 MB** before the console appears | Currently ~21 MB |

Reels are fetched lazily — only when their slot is selected — so first paint
never waits on video.

---

## 7. Attribution & licensing

This site's interaction design, layout, and code architecture originate from a
portfolio by a previous author. This project deliberately and completely
replaces:

- All display copy — title, meta description, OG tags, hero wordmark, about
  prose, contact headings, favicon glyph.
- All identifiers — name, email, social handles, location.
- All works — every title, subtitle, metric, year, link, and media file.
- All third-party credits belonging to the previous author's collaborators.
- The `localStorage` key prefix and the global data namespace.
- Source-file header comments naming the previous author.

**Verification gate:** a case-insensitive grep for the previous author's name,
handle, location, and named collaborators must return **zero** hits across the
repository before any deploy.

**Fonts.** The upstream repo ships licensed Helvetica `.ttf`/`.woff` binaries.
These are removed and replaced with a free metric-compatible face
(Helvetica Now alternatives: Inter, or Nimbus Sans / TeX Gyre Heros for true
metric compatibility). The VCR pixel face is freely licensed and is retained.

**Licence.** The upstream repo carries no LICENSE file. This repository adds one
explicitly so its own terms are unambiguous.

---

## 8. Success criteria

| Metric | Target |
|---|---|
| LCP (mobile, 4G) | < 2.5 s to hero text |
| Time to first playing reel | < 6 s from load |
| Total transferred weight | ≤ 20 MB, with the pre-console path ≤ 6 MB |
| Keyboard | Full archive navigable with `←` `→` `✕` alone |
| Mobile 375px | Hero, about, contact fully readable; console degrades without breaking layout |
| No-WebGL fallback | Poster image shown, `↗` still functional |
| Console errors | Zero on load and on full scroll-through |
| Identity grep | Zero hits (§7) |

---

## 9. Deploy targets

Both targets serve the identical static directory.

1. **GitHub Pages** — repo `<username>.github.io`, Pages from `main`, plus
   `CNAME` for the custom domain and a `.nojekyll` marker.
2. **VPS** — served behind the existing reverse proxy on the Cellur VPS,
   matching the pattern already used for the print-kiosk web app.

No environment differences, no config files, no secrets. A deploy is a push.

---

## 10. Out-of-scope backlog

Ordered by value, none in v1:

1. **Visual identity pass** — new palette, type, cut-out props, and headline
   treatment. Makes the site visually distinct from its origin as well as
   textually. _Recommended as the immediate v1.1._
2. Draco/meshopt compression of the 3D model (≈12 MB → ≈2 MB).
3. Analytics.
4. Case-study pages for long-form work.
5. Contact form.

---

## 11. Identity

| Item | Value |
|---|---|
| Display name | Hanish Chowdary |
| Brand | **chow.dev** — splits `chow` / `.dev` across the hero wordmark |
| Namespace | `window.CD_WORKS`, `localStorage` prefix `cd_` |
| Email | hanishchowdary4@gmail.com |
| Instagram | https://www.instagram.com/hanishchow/ |
| LinkedIn | https://www.linkedin.com/in/hanish-chowdary/ |
| GitHub | https://github.com/Hanishchow |
| Location | Bangalore, India |
| Custom domain | none yet — see §12 |

**Amendment to §4:** works carry a `year` but **no play-count metric**. The
`meta` strapline becomes `KIND · YEAR` rather than `KIND · PLAYS · PLATFORM`.

**Amendment to §5:** the contact section gains LinkedIn and GitHub alongside
email and Instagram. Only mail and Instagram icons exist in `assets/el/`; two
matching cut-out icons must be produced in the same treatment.

### Still open

| # | Input | Feeds |
|---|---|---|
| 1 | Résumé | About prose — three to five facts crunched into two paragraphs |
| 2 | Reel / video links | `js/data.js` + all media |
| 3 | Startup links | An additional work entry or contact link |
| 4 | Domain choice | `CNAME` + DNS |

---

## 12. Domain recommendation

The exact-match `chow.dev` is a Google `.dev` registration — **not** covered by
the GitHub Student Developer Pack and typically ~$12–15/yr, and short
four-letter `.dev` names are frequently taken or premium-priced. Availability
needs checking before committing the brand to it.

Free-with-the-Student-Pack alternatives, best first:

| Domain | Registrar (via pack) | Term | Note |
|---|---|---|---|
| `hanishchow.me` | Namecheap | 1 yr free | Matches the Instagram handle exactly |
| `hanishchowdary.me` | Namecheap | 1 yr free | Full name, unambiguous |
| `chowdev.tech` / `hanish.tech` | .TECH | 1 yr free | Keeps the brand shape, `.tech` reads developer |

Recommendation: register a free `.me` now so the site has a real address, and
buy `chow.dev` separately if it is available — the brand wordmark works
regardless of which domain resolves to it.
