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

Card focus weight (`focusWeight`) is computed per-frame from `Math.abs(index - activeCardIndex)`, controlling scale (0.84→1.08), opacity (0.72→0.97), and tilt damping.

### Drag Scrolling

Pointer events on the canvas translate drag distance into `window.scrollTo` calls. The axis is locked after 6px movement (x = horizontal scroll, y = vertical scroll). Horizontal drag uses a 1.45× multiplier so left/right swiping navigates cards naturally.

### Music

Music remains paused until the user clicks the music panel Play button. If browser playback policy blocks that explicit Play click, the panel shows the `needs-interaction` state. Music pauses when the page is hidden or loses focus, and does not resume automatically.

## Card Content

Cards display Ahri skins from League of Legends. `imageFiles` lists 16 skin images from `./assets/`. Each card texture composites: skin image → color tint → vignette → gloss → film grain → title text. `drawCardTitle` renders "Ahri" in serif at the top and the skin name (parsed from the filename via `getCardTitle`) in monospace below. A `getGlowTexture` canvas draws a shared white-glow border applied on hover via an additive `glowMesh` child.

## Hover / Raycasting

`hoveredCardIndex` is updated every frame via `THREE.Raycaster` against `cardMeshes`. Hovered cards push outward radially (`radialPush = hw * 0.3`), scale up by an extra 0.08, and fade in the `glowMesh`. `hoverGlowLight` (PointLight) also rises to the active card Y and brightens to intensity 24 when any card is hovered.

## Key Constants (script.js)

| Constant | Value | Purpose |
|---|---|---|
| `CARD_ANGLE_STEP` | `Math.PI / 3` | Radians between adjacent cards on the helix |
| `CARD_RADIUS` | `3.2` | Cylinder radius of the card ring (slight per-card sine wobble ±0.18) |
| `HELIX_HEIGHT` | `18.4` | Total vertical span of the gallery |
| `CARD_ANGLE_OFFSET` | `0.35` | Starting angle so first card faces slightly right |
| `CARD_COUNT` | `16` | Number of Ahri skin cards |
| `PARTICLE_HELIX_RADIUS` | `24` | Outer particle helix radius |

## Responsive Breakpoints

Three camera/scale presets in `resize()`:
- `< 560px` — mobile: camera z=15.5, root scale 0.76, galleryRoot scale 0.82
- `< 980px` — tablet: camera z=14.5, root scale 0.88, galleryRoot scale 0.9
- `≥ 980px` — desktop: camera z=13.0, root scale 1.0, galleryRoot scale 1.0

CSS breakpoints mirror these at 560px and 780px.

## Debug

`window.helixDebug` exposes `{ cardCount, activeCardIndex, scrollProgress }` and updates live during scroll. `document.documentElement.dataset.activeCard` is also set for CSS targeting.

## Cache-busting

CSS and JS are versioned via query strings in index.html. Current versions:
- CSS: `?v=cylinder-carousel-1`
- JS: `?v=outer-particle-helix-3`

Increment the version string when deploying changes.
