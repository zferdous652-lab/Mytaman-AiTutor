# Landing page — outstanding art assets

The landing page is built and animated. Two things are still placeholders, both marked in
code. This is what they need and where each can come from.

## 1. `MascotSlot` — the Lv99 study companion

**Where:** `frontend/src/components/LandingSections.jsx` → `MascotSlot`
**Currently:** a dashed band with a floating icon, parallax glow and the copy
"Your AI study companion, arriving soon". The layout, lighting and motion are already
wired — dropping the asset in is a swap, not a rebuild.

**What it needs:** a character that reads at ~400px tall on a near-black background, in the
cyan → violet → magenta palette. Either form works:

| Option | Format | What changes in code |
|---|---|---|
| **2D** (simplest) | PNG/WebP with transparency, ~1200px tall | Replace the icon block with `<img>`; the existing float + parallax already animate it |
| **3D** (richest) | `.glb` / `.gltf`, low-poly, under ~3 MB | Load with `useGLTF` from `@react-three/drei` inside a small `<Canvas>` — same pattern as `HeroCanvas.jsx` |

## 2. Hero — optional character in the 3D scene

**Where:** `frontend/src/components/HeroCanvas.jsx`
The knowledge core, orbiting subject nodes and point dome are all procedural, so the hero
works as-is. A `.glb` character could be added floating beside the core if you want one.

---

## Can Canva produce these?

**For the 2D route — yes.** Canva's Magic Media generates images from a prompt, and that is
a genuinely good fit for a mascot illustration, a hero character, or background art. Export
as PNG with a transparent background and it drops straight into the slot.

**For the 3D route — no.** Canva does not output `.glb`/`.gltf` models; it is a 2D design
tool. No amount of prompting produces a real 3D mesh from it. For an actual 3D asset you'd
need either:

- **Text/image-to-3D generators** — Meshy.ai, Luma Genie, Tripo, Sloyd. These export `.glb`
  directly and are the closest equivalent to "Canva but 3D". Quality is decent for a
  stylised mascot, weaker for anything anatomically precise.
- **Spline** (spline.design) — design 3D in-browser and export `.glb`, or embed directly.
  Good if you want to art-direct rather than prompt.
- **A 3D artist** — best consistency, and the only route that reliably gets you a *rigged*
  character (one that can be animated with real skeletal motion rather than just floated
  and rotated).

**My recommendation:** start 2D with Canva. It costs one afternoon, the slot is already
built for it, and it will tell you whether a companion character earns its place on the page
at all — before you spend on 3D. If it lands well, commission the 3D version then.

One caveat whichever route you pick: check the licence covers commercial use. Canva's
licensing depends on your plan and on whether the output includes stock elements, and the
3D generators differ from each other on this.

---

## What is already done, for reference

- WebGL hero — wireframe knowledge core, five orbiting subject nodes (one per content type),
  three orbit rings, a point dome and a starfield, all drifting toward the pointer
- Pointer-tilt with tracking specular glare on every card
- Scroll reveals, count-up statistics, animated XP bar
- Floating/parallax motion throughout
- Lazy-loaded WebGL with a CSS fallback, a WebGL-support check, and an error boundary
- Full `prefers-reduced-motion` support — every animation above is disabled under it
- All new copy is bilingual (EN + BM) via `LangContext`

## Brand logo (delivered)

Two masters at the repo root, for two surfaces:

- **`Lv99-logo-on-dark.png`** — 1024x1024, light neon strokes with their own glow. This is
  what the app uses. (Committed as `Lv99 Image Aug 7, 2026, 11_56_33 AM.png`; renamed for
  sanity.)
- **`Lv99-logo.png`** — 2000x2000, dark navy strokes. Built for a **white** surface: print,
  light-mode email, anything on paper. Not used in the app.

Derived from the dark-surface master, colours untouched, no backing plate:

| File | Size | Used by |
|------|------|---------|
| `frontend/src/assets/brand/lv99-lockup.png` | 640x321, 132 KB | footer, 300-360px wide |
| `frontend/src/assets/brand/lv99-mark.png` | 420x189, 62 KB | landing nav 42-60px, portal sidebars, auth pages |
| `frontend/src/assets/brand/lv99-glyph.png` | 256x256, 42 KB | collapsed sidebar rails (72px wide) |
| `frontend/public/favicon-32.png` | 32px, 1.4 KB | browser tab |
| `frontend/public/apple-touch-icon.png` | 180px, 17 KB | iOS home screen |
| `frontend/public/icon-512.png` | 512px, 83 KB | PWA + og:image |

Measured on `#0a0514`, the darkest real stroke now sits at **3.75:1** against the page.
The previous artwork measured 1.02:1 — effectively invisible, which is why it needed a
light plate behind it. That plate is gone.

### One component

`frontend/src/components/BrandLogo.jsx` renders both variants; the landing nav is the
only surface that still imports an asset directly, because it animates the logo's height
on scroll. Everything else — both sidebars and the four auth pages — goes through it, so
the next brand change is one file.

### Regenerating

Crop on `alpha > 4`, not `alpha > 0`: a faint halo trails ~250px below the artwork and
would add dead space to every render.

The nav mark cuts above the tagline rule, located by finding the widest bright row in the
lower quarter rather than by a fixed percentage — the glow makes a percentage cut clip
descenders.

The icons keep only the sparkle, arc and the two `9`s (connected components at
`alpha > 150`), because the full wordmark is unreadable at 32px. They are selected by
component and then dilated + blurred into a soft gate over the original alpha, so each
glyph brings its own glow: a rectangular crop cannot separate them, since the arc's left
tail and the `v` overlap in x.

Icon plates are **dark** (`#0a0514`), not white. These strokes are light, and a
light-mode browser tab is white — cyan on white would barely show.

## Character illustration

`assets/char_about.png` (1254x1254, 1.4 MB, opaque white background) is the master.
`frontend/src/assets/landing/char-about.png` is what the About section imports: **820x801,
108 KB**, transparent.

Getting there took two steps worth repeating if the artwork is ever updated:

**Cutting the background.** A plain "make white transparent" pass would have punched holes
through the robot — its body, the speech bubble and the eye highlights are all white too.
Instead the near-white mask is labelled and only the components *touching the border* are
treated as background, so enclosed white stays filled. Alpha ramps from opaque to clear
between lightness 205 and 255 rather than switching at a threshold, because a hard cut
leaves a white fringe on every anti-aliased edge, which reads as a halo on a dark page.

**The bottom edge.** The illustration dissolves the figure into white at the base, which
survives the cut as a pale haze. A vertical alpha fade over the last 12% turns that into a
deliberate vignette instead of a torn edge.

Compression is a 256-colour palette via `FASTOCTREE` — the only Pillow quantiser that
handles RGBA. On flat-shaded artwork the error is imperceptible (mean 2.43/255) and it
takes 957 KB down to 108 KB.

It renders unframed: a bordered box with `object-cover` would crop the character's head
and reintroduce the rectangle a cut-out exists to avoid. A radial glow behind it does the
grounding a frame used to.

## Landing photos

Two role-card photos are still hotlinked from Unsplash (the About photo they used to
accompany is now the illustration above, and the admin card was removed). The build
environment has no route to that CDN, so they could not be fetched and committed. Run
`scripts/localise-landing-images.sh` from a machine that can reach them (the VM) to pull
them into `frontend/src/assets/landing/` and rewrite the imports. The Unsplash licence
permits commercial use without attribution.

Until then they carry `loading="lazy"`, `decoding="async"` and intrinsic `width`/`height`,
so they no longer cause layout shift or compete with the hero for bandwidth.
