/* ============================================================
   WORKS — the archive loaded into the machine.

   Order is editorial, not chronological.

   `vid`      a 6s muted loop shown on the PSP screen. The window is chosen by
              measuring per-second luminance across the source, never by eye —
              a dark stretch reads as a dead screen behind the CRT shader.
              Fetched only when its slot is selected, so first paint never
              waits on video.
   `img`      the poster, pulled from the clip itself so the still and the
              motion match. A slot with no `vid` shows this alone.
   `link`     optional. A slot without one withdraws the open control rather
              than aiming it at nothing.
   `vertical` read off the actual file, never guessed.
   ============================================================ */
window.CD_WORKS = [
  {
    id: 'artemis',
    title: 'ARTEMIS',
    sub: 'Main stage, second set',
    kind: 'LIVE',
    year: '2025',
    meta: 'LIVE · 2025',
    img: 'assets/works/artemis.jpg',
    vid: 'assets/reels/artemis.mp4',
    vertical: false,
    featured: true
  },
  {
    id: 'frontrow',
    title: 'Front Row',
    sub: 'Lights down, hands up',
    kind: 'LIVE',
    year: '2025',
    meta: 'LIVE · 2025',
    img: 'assets/works/frontrow.jpg',
    vid: 'assets/reels/frontrow.mp4',
    vertical: false
  },
  {
    id: 'c-wide',
    title: 'Full Stage',
    sub: 'Blue hour, front of house',
    kind: 'LIVE',
    year: '2026',
    meta: 'LIVE · 2026',
    img: 'assets/works/c-wide.jpg',
    vid: 'assets/reels/c-wide.mp4',
    vertical: false
  },
  {
    id: 'c-encore',
    title: 'Six Strings',
    sub: 'Lead break',
    kind: 'LIVE',
    year: '2026',
    meta: 'LIVE · 2026',
    img: 'assets/works/c-encore.jpg',
    vid: 'assets/reels/c-encore.mp4',
    vertical: true
  },
  {
    id: 'c-crowd',
    title: 'Red Wash',
    sub: 'Everything on at once',
    kind: 'LIVE',
    year: '2026',
    meta: 'LIVE · 2026',
    img: 'assets/works/c-crowd.jpg',
    vid: 'assets/reels/c-crowd.mp4',
    vertical: true
  },
  {
    id: 'c-lights',
    title: 'Between Sets',
    sub: 'Somebody found the camera',
    kind: 'LIVE',
    year: '2026',
    meta: 'LIVE · 2026',
    img: 'assets/works/c-lights.jpg',
    vid: 'assets/reels/c-lights.mp4',
    vertical: true
  },
  {
    id: 'stands',
    title: 'The Stands',
    sub: 'Somewhere in the crowd',
    kind: 'STILL',
    year: '2025',
    meta: 'STILL · 2025',
    img: 'assets/works/stands.jpg',
    vertical: true
  },
  {
    id: 'circle',
    title: 'The Circle',
    sub: 'Campus, mid-afternoon',
    kind: 'STILL',
    year: '2024',
    meta: 'STILL · 2024',
    img: 'assets/works/circle.jpg',
    vertical: false
  },
  {
    id: 'coast',
    title: 'Coastline',
    sub: 'Karnataka, going gold',
    kind: 'STILL',
    year: '2025',
    meta: 'STILL · 2025',
    img: 'assets/works/coast.jpg',
    vertical: false
  }
];
