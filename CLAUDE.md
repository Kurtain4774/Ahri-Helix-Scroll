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
    ├── particleRoot (Group)   ← 3D petal instances (GLB-based, instanced shader)
    └── galleryRoot (Group)    ← scroll rotation + Y translation applied here
        ├── spineRoot (Group)  ← TorusKnot vertebrae, dual helix rails, halo rings
        └── panelRoot (Group)  ← skin card meshes (PlaneGeometry + CanvasTexture)
```

### Scroll-to-3D Mapping

`scrollProgress` (0–1) drives everything: it maps the page scroll position to `activeCardIndex`, which determines `scrollRotation` (the Y-angle that brings the active card front-and-center) and `targetGalleryY` (the vertical translation to keep the active card in view). Both values ease toward their targets every frame in `animate()`.

### Card Rendering

Each card is a `PlaneGeometry` with a `CanvasTexture` drawn by `makePanelTexture` / `drawPanel`. The Canvas 2D API composites: background gradient → `drawImageCover` (object-fit: cover equivalent) → color tint overlay → vignette → gloss strip → film grain → title text → rounded border stroke → index label. Textures update asynchronously once the skin image loads; the fully composited result is also baked into a `bakedCanvas` for use during the detail-view gas dissolve.

Card focus weight (`focusWeight`) is computed per-frame from `Math.abs(index - activeCardIndex)`, controlling scale (0.84→1.08), opacity (0.72→0.97), and tilt damping.

### Drag Scrolling

Pointer events on the canvas translate drag distance into `window.scrollTo` calls. The axis is locked after 6px movement (x = horizontal scroll, y = vertical scroll). Horizontal drag uses a 1.45× multiplier so left/right swiping navigates cards naturally.

### Music

Music remains paused until the user clicks the music panel Play button or starts scrolling the page. If browser playback policy blocks that explicit Play/scroll interaction, the panel shows the `needs-interaction` state. Music starts at 50% volume, follows the volume slider, pauses when the page is hidden or loses focus, and does not resume from focus alone.

An optional Web Audio graph (`audioGraph`) is built lazily on the first `openDetailView` call. It chains `MediaElementSource → BiquadFilter (lowpass) → GainNode → destination` and is used to apply an underwater muffling effect while a card detail is open (`setUnderwater(true/false)`).

### Theme System

Six themes are defined in `styles.css` as `html[data-theme="..."]` attribute selectors: `helix`, `spirit`, `arcade`, `coven`, `elderwood`, `kda`. Each overrides a set of CSS custom properties (`--paper`, `--rose`, `--gold`, `--violet`, `--theme-glow-*`, `--theme-panel-*`). The active theme is persisted in `localStorage` under the key `helix-theme` and restored before first paint via an inline `<script>` in `<head>`. Applying a new theme currently triggers `window.location.reload()` so Three.js re-reads the CSS variables on startup.

`readThemeColors()` pulls the resolved CSS variable values at boot and stores them in `themeColors`. All Three.js material colors and Canvas 2D drawing use these values, so the scene always matches the active CSS theme.

### Card Detail View

Clicking the active (front-facing) card opens a full-screen detail overlay. The sequence:

1. Camera flies toward the card face over 700ms (`DETAIL_TWEEN_MS`).
2. Starting 100ms in, the card texture dissolves via a radial "gas" gradient drawn onto the baked canvas (`tickGasDissolve`), running 600ms (`DETAIL_GAS_MS`).
3. The HTML overlay (`#card-detail`) fades in as the dissolve progresses.
4. Skin name, release date, and price are typed into the overlay with a character-by-character animation (`typeInto` / `runTypingSequence`).
5. Closing reverses the sequence: camera flies back, dissolve re-fills, overlay fades out, scroll position is restored.

`detailState` tracks the state machine: `"closed" | "opening" | "open" | "closing"`. Closing can be triggered by the "← close" button, Escape key, scroll/wheel, or the `onDetailKey` handler.

### 3D Petal System

Background petals are GPU-instanced meshes built from up to four `.glb` geometry variants in `assets/petals/`. `loadPetalGltfs()` loads them via `GLTFLoader`, normalizes each geometry to a unit bounding box, then `addPetalVariant()` packs per-instance attributes (`aBasePos`, `aColor`, `aPhase`, `aSize`, `aFallSpeed`, `aSwayAmp`, `aTumbleAxis`, `aTumbleSpeed`) into `InstancedBufferGeometry`.

A custom GLSL shader patch (`buildPetalShaderPatch` / `PETAL_INSTANCE_ATTRIBUTES_GLSL`) is injected via `material.onBeforeCompile`. Each petal animates entirely on the GPU: it falls, sways sinusoidally, and tumbles around a random axis. Near-camera petals fade out via `vNearFade = smoothstep(uNearFadeStart, uNearFadeEnd, -viewZ)`. Petal count is 110 on mobile, 200 on desktop.

## Card Content

Cards display Ahri skins from League of Legends. `imageFiles` lists **21** skin images from `./assets/`. Each card texture composites: skin image → color tint → vignette → gloss → film grain → title text. `drawCardTitle` renders "AHRI" in monospace at the top and the skin name (parsed from the filename via `getCardTitle`, with overrides in `cardTitleOverrides`) below. A `getGlowTexture` canvas draws a shared rose-glow border applied on hover via an additive `glowMesh` child.

`skinMetadata` maps each filename to `{ name, released, price }` for use in the card detail overlay.

## Hover / Raycasting

`hoveredCardIndex` is updated every third `pointermove` event via `THREE.Raycaster` against `cardMeshes`. Hovered cards push outward radially (`radialPush = hw * 0.3`), scale up by an extra 0.08, and fade in the `glowMesh`. `hoverGlowLight` (PointLight) also rises to the active card Y and brightens to intensity 24 when any card is hovered.

## Key Constants (script.js)

| Constant | Value | Purpose |
|---|---|---|
| `CARD_ANGLE_STEP` | `Math.PI / 3` | Radians between adjacent cards on the helix |
| `CARD_RADIUS` | `3.2` | Cylinder radius of the card ring (slight per-card sine wobble ±0.18) |
| `CARD_VERTICAL_STEP` | `1.12` | Vertical distance between adjacent cards |
| `HELIX_HEIGHT` | `Math.max(18.4, 1.6 + (CARD_COUNT - 1) * CARD_VERTICAL_STEP)` | Total vertical span — scales with card count (~23.96 at 21 cards) |
| `HELIX_TURNS` | `((CARD_COUNT - 1) * CARD_ANGLE_STEP) / (2π)` | Full rotations the helix makes |
| `CARD_ANGLE_OFFSET` | `0.35` | Starting angle so first card faces slightly right |
| `CARD_COUNT` | `imageFiles.length` (currently **21**) | Number of Ahri skin cards |
| `PARTICLE_HELIX_RADIUS` | `24` | Outer radius of petal spawn field |

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
- CSS: `?v=fox-spirit-26`
- JS: `?v=fox-spirit-27`

Increment the version string when deploying changes.
