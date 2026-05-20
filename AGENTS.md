# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project Snapshot

Helix Scroll is a vanilla HTML/CSS/JavaScript single-page interactive gallery.
There is no package manager, bundler, framework, or build step.

The app renders an immersive Three.js helix of Ahri skin cards over a styled
page shell, with scroll and pointer input driving the 3D scene.

## How To Run

Open `index.html` directly in a browser, or serve the folder with any static
file server:

```bash
npx serve .
```

```bash
python -m http.server 8080
```

Three.js is loaded from the import map in `index.html`:
`https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js`.

## Important Files

- `index.html`: document shell, import map, canvas, fixed UI panels, audio tag.
- `script.js`: all Three.js scene setup, scroll mapping, animation, drag input,
  card texture drawing, and music controls.
- `styles.css`: layout, fixed panels, responsive behavior, visual treatment.
- `assets/`: local images, background art, and `Legends Never Die.mp3`.
- `CLAUDE.md`: additional project notes that may overlap with this file.

## Runtime Architecture

The 3D scene is built entirely in `script.js`.

Scene hierarchy:

```text
scene
root
  particleRoot
  galleryRoot
    spineRoot
    panelRoot
```

`scrollProgress` ranges from `0` to `1` and determines:

- `activeCardIndex`
- `scrollRotation`
- `targetGalleryY`
- caption opacity
- `document.documentElement.dataset.activeCard`

The animation loop eases gallery rotation, gallery Y offset, camera position,
card opacity, card scale, and pointer tilt every frame.

## Cards And Assets

Card images are listed in the `imageFiles` array in `script.js`.

To add, remove, or reorder cards:

1. Put the image in `assets/`.
2. Update `imageFiles`.
3. Check card titles from `getCardTitle()` and `splitTitleLines()`.
4. Verify scroll spacing, focus behavior, and mobile framing.

Card textures are not static image files. They are generated with Canvas 2D in
`makePanelTexture()` and `drawPanel()`, then used as `THREE.CanvasTexture`
materials.

## Interaction Notes

- Page scroll controls card focus.
- Pointer movement adds subtle camera and root tilt.
- Dragging on the canvas scrolls the page.
- The drag axis locks after a small movement threshold.
- Horizontal drag is amplified to make left/right swipes navigate cards.
- `prefers-reduced-motion: reduce` pauses most continuous motion.

## Music Notes

The audio element is defined in `index.html` and controlled from `script.js`.
Music must remain paused until the user clicks the music panel Play button.
Do not add autoplay or first-gesture retry behavior outside that control.
If playback is blocked after the Play button is clicked, the panel is marked
with `needs-interaction`.

## Styling Guidelines

- Keep the first screen as the actual immersive experience, not a landing page.
- Preserve the fixed canvas backdrop and fixed UI panels unless the requested
  change specifically calls for a layout shift.
- Keep responsive behavior aligned between `resize()` in `script.js` and CSS
  breakpoints in `styles.css`.
- Avoid introducing a build tool or dependency unless the user explicitly asks.
- Keep text legible over the animated scene at desktop and mobile sizes.

## Debugging

`window.helixDebug` exposes live values:

```js
window.helixDebug
```

Expected fields:

- `cardCount`
- `activeCardIndex`
- `scrollProgress`

Use this in the browser console while checking scroll behavior.

## Verification Checklist

For visual or interaction changes, verify:

- `index.html` loads without console errors.
- The canvas renders a nonblank Three.js scene.
- Scrolling advances through all cards.
- Dragging on the canvas scrolls the page.
- Music play/pause button updates text and `aria-pressed`.
- Mobile widths around `560px` still frame the gallery and panels cleanly.
- Reduced motion mode does not break scene rendering.

## Change Discipline

- Keep edits focused to the requested behavior.
- Do not rename assets unless all references are updated.
- When changing CSS/JS loaded by `index.html`, update the cache-busting query
  string if the change needs to be visible after deploy.
- Be careful with existing uncommitted changes. Treat them as user work unless
  told otherwise.
