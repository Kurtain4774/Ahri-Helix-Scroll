# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Helix Scroll is a vanilla HTML/CSS/JS single-page experience — no build step, no bundler, no package manager. Open `index.html` directly in a browser or serve it with any static file server.

```
npx serve .
# or
python -m http.server 8080
```

Three.js is loaded via CDN import map (`https://cdn.jsdelivr.net/npm/three@0.165.0`), so no install is needed.

## Architecture

The entire interactive experience lives in three files:

- [index.html](index.html) — shell, import map, and static UI panels
- [script.js](script.js) — all Three.js scene logic (ES module)
- [styles.css](styles.css) — layout, glassmorphism UI components, responsive breakpoints

### Three.js Scene Hierarchy

```
scene
└── root (Group)               ← pointer tilt applied here
    ├── particleRoot (Group)   ← floating particle sets
    └── galleryRoot (Group)    ← scroll rotation + Y translation applied here
        ├── spineRoot (Group)  ← TorusKnot vertebrae, dual helix rails, chain links
        └── panelRoot (Group)  ← skin card meshes (PlaneGeometry + CanvasTexture)
```

### Scroll-to-3D Mapping

`scrollProgress` (0–1) drives everything: it maps the page scroll position to `activeCardIndex`, which determines `scrollRotation` (the Y-angle that brings the active card front-and-center) and `targetGalleryY` (the vertical translation to keep the active card in view). Both values ease toward their targets every frame in `animate()`.

### Card Rendering

Each card is a `PlaneGeometry` with a `CanvasTexture` drawn by `makePanelTexture` / `drawPanel`. The Canvas 2D API composites: background gradient → `drawImageCover` (object-fit: cover equivalent) → color tint overlay → vignette → rounded border stroke → index label. Textures update asynchronously once the skin image loads.

Card focus weight (`focusWeight`) is computed per-frame from `Math.abs(index - activeCardIndex)`, controlling scale (0.84→1.08), opacity (0.26→0.82), and tilt damping.

### Drag Scrolling

Pointer events on the canvas translate drag distance into `window.scrollTo` calls. The axis is locked after 6px movement (x = horizontal scroll, y = vertical scroll). Horizontal drag uses a 1.45× multiplier so left/right swiping navigates cards naturally.

### Music

Autoplay is attempted on `window load`. Browser autoplay policies often block it, so the panel shows `needs-interaction` state and retries on the first user gesture (any `pointerdown` outside the music panel, or any `keydown`).

## Key Constants (script.js)

| Constant | Value | Purpose |
|---|---|---|
| `CARD_ANGLE_STEP` | `Math.PI / 3` | Radians between adjacent cards on the helix |
| `CARD_RADIUS` | `2.38` | Cylinder radius of the card ring |
| `HELIX_HEIGHT` | `18.4` | Total vertical span of the gallery |
| `CARD_ANGLE_OFFSET` | `0.35` | Starting angle so first card faces slightly right |

## Responsive Breakpoints

Three camera/scale presets in `resize()`:
- `< 560px` — mobile: camera pulled back to z=12.9, root scaled to 0.76
- `< 980px` — tablet: z=12, scale 0.88
- `≥ 980px` — desktop: z=10.5, scale 1.0

CSS breakpoints mirror these at 560px and 780px.

## Debug

`window.helixDebug` exposes `{ cardCount, activeCardIndex, scrollProgress }` and updates live during scroll. `document.documentElement.dataset.activeCard` is also set for CSS targeting.

## Cache-busting

CSS and JS are versioned via query strings in index.html (`?v=drag-scroll-1`). Increment the version string when deploying changes.
