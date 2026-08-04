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
