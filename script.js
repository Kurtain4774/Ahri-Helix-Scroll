import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const PETAL_INSTANCE_ATTRIBUTES_GLSL = /* glsl */`
attribute vec3 aBasePos;
attribute vec3 aColor;
attribute float aPhase;
attribute float aSize;
attribute float aFallSpeed;
attribute float aSwayAmp;
attribute vec3 aTumbleAxis;
attribute float aTumbleSpeed;
uniform float uTime;
uniform float uFieldHeight;
uniform float uFieldBottom;
uniform float uNearFadeStart;
uniform float uNearFadeEnd;
varying vec3 vTintColor;
varying float vNearFade;

mat3 rotMatAxisAngle(vec3 axis, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  float t = 1.0 - c;
  float x = axis.x;
  float y = axis.y;
  float z = axis.z;
  return mat3(
    t*x*x + c,    t*x*y + s*z,  t*x*z - s*y,
    t*x*y - s*z,  t*y*y + c,    t*y*z + s*x,
    t*x*z + s*y,  t*y*z - s*x,  t*z*z + c
  );
}
`;

const canvas = document.querySelector("#helix-canvas");
const caption = document.querySelector(".scene-caption");
const musicPanel = document.querySelector(".music-panel");
const musicAudio = document.querySelector("#legends-player");
const musicToggle = document.querySelector(".music-toggle");
const musicKicker = document.querySelector(".music-kicker");
const musicVolume = document.querySelector(".music-volume");
const cardDotsContainer = document.querySelector("#card-dots");
const scrollHint = document.querySelector("#scroll-hint");
const skinListEl = document.querySelector("#skin-list");
const themeForm = document.querySelector("#theme-panel");
const themeSelect = document.querySelector("#theme-select");
const cardDetailEl = document.querySelector("#card-detail");
const THEME_STORAGE_KEY = "helix-theme";
const VALID_THEMES = new Set(["helix", "spirit", "arcade", "coven", "elderwood", "kda"]);

function getActiveTheme() {
  const theme = document.documentElement.dataset.theme || "helix";
  return VALID_THEMES.has(theme) ? theme : "helix";
}

function initThemeControl() {
  if (!themeSelect) return;

  themeSelect.value = getActiveTheme();
}

function applyThemeSelection(event) {
  event.preventDefault();
  if (!themeSelect) return;

  const nextTheme = VALID_THEMES.has(themeSelect.value) ? themeSelect.value : "spirit";
  try {
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  } catch {
    // Theme persistence is optional.
  }
  document.documentElement.dataset.theme = nextTheme;
  window.location.reload();
}

function readThemeColors() {
  const styles = getComputedStyle(document.documentElement);
  const readColor = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
  return {
    paper: readColor("--paper", "#0d0614"),
    rose: readColor("--rose", "#ff6f98"),
    gold: readColor("--gold", "#ffdc63"),
    violet: readColor("--violet", "#d58bff"),
  };
}

const themeColors = readThemeColors();

function withAlpha(cssHex, alpha) {
  const c = new THREE.Color(cssHex);
  return `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${alpha})`;
}

function paperMix(otherHex, t) {
  const c = new THREE.Color(themeColors.paper).lerp(new THREE.Color(otherHex), t);
  return `rgb(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)})`;
}

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(themeColors.paper, 0.034);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
  powerPreference: "high-performance",
});

renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 80);
camera.position.set(0.35, 0.15, 10.5);

{
  const envCanvas = document.createElement("canvas");
  envCanvas.width = 256;
  envCanvas.height = 128;
  const envCtx = envCanvas.getContext("2d");
  const envGrad = envCtx.createLinearGradient(0, 0, 0, 128);
  envGrad.addColorStop(0, themeColors.paper);
  envGrad.addColorStop(0.28, themeColors.violet);
  envGrad.addColorStop(0.56, themeColors.rose);
  envGrad.addColorStop(0.8, themeColors.gold);
  envGrad.addColorStop(1, themeColors.paper);
  envCtx.fillStyle = envGrad;
  envCtx.fillRect(0, 0, 256, 128);
  const envTexture = new THREE.CanvasTexture(envCanvas);
  envTexture.mapping = THREE.EquirectangularReflectionMapping;
  envTexture.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  scene.environment = pmrem.fromEquirectangular(envTexture).texture;
  envTexture.dispose();
  pmrem.dispose();
}

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(Math.floor(window.innerWidth / 2), Math.floor(window.innerHeight / 2)),
  0.72,
  0.42,
  0.58,
);
bloomPass.nMips = 3;
composer.addPass(bloomPass);

const root = new THREE.Group();
const galleryRoot = new THREE.Group();
const particleRoot = new THREE.Group();
const panelRoot = new THREE.Group();
const spineRoot = new THREE.Group();
scene.add(root);
root.add(particleRoot, galleryRoot);
galleryRoot.add(spineRoot, panelRoot);

const clock = new THREE.Clock();
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let animationPaused = reduceMotion.matches;
let scrollProgress = 0;
let pointerX = 0;
let pointerY = 0;
let dragStartX = 0;
let dragStartY = 0;
let dragStartScrollTop = 0;
let dragAxis = null;
let scrollRotation = 0;
let activeCardIndex = 0;
let targetGalleryY = 0;
let currentGalleryY = 0;
let responsiveYOffset = 0;
let isDragging = false;
let lastScrollTop = -1;
let musicRequested = false;
let firstRenderDone = false;
let scrollHintHidden = false;
let pointerMoveCount = 0;
let skinListExpanded = false;
let renderedSkinListKey = "";
const FRAME_BUDGET_MS = 1000 / 60;
const CLICK_MOVE_TOLERANCE = 8;
let lastFrameTime = 0;
const DEFAULT_MUSIC_VOLUME = 0.5;
let musicVolumeLevel = DEFAULT_MUSIC_VOLUME;

const scrollStartKeys = new Set([
  " ",
  "ArrowDown",
  "ArrowUp",
  "End",
  "Home",
  "PageDown",
  "PageUp",
  "Spacebar",
]);

const imageFiles = [
  "ahri-classic-762x.jpg",
  "ahri-dynasty-762x.jpg",
  "ahri-midnight-762x.jpg",
  "ahri-foxfire-762x.jpg",
  "ahri-popstar-762x.jpg",
  "ahri-challenger-762x.jpg",
  "ahri-academy-762x.jpg",
  "ahri-arcade-762x.jpg",
  "ahri-star-guardian-762x.jpg",
  "ahri-kda-762x.jpg",
  "ahri-kda-prestige-762x.jpg",
  "ahri-elderwood-762x.jpg",
  "ahri-spirit-blossom-762x.jpg",
  "ahri-kda-all-out-762x.jpg",
  "ahri-coven-762x.jpg",
  "ahri-arcana-762x.jpg",
  "ahri-snow-moon-762x.jpg",
  "ahri-risen-legend-762x.jpg",
  "ahri-immortalized-legend-762x.jpg",
  "ahri-spirit-blossom-springs-762x.jpg",
  "ahri-after-hours-spirit-blossom-springs-762x.jpg",
];

const cardTitleOverrides = {
  "ahri-classic-762x.jpg": "BASE",
  "ahri-kda-prestige-762x.jpg": "PRESTIGE K/DA",
};

const skinMetadata = {
  "ahri-classic-762x.jpg":                          { name: "Classic Ahri",                       released: "Dec 14, 2011", price: "Base skin" },
  "ahri-dynasty-762x.jpg":                          { name: "Dynasty Ahri",                       released: "Dec 14, 2011", price: "975 RP" },
  "ahri-midnight-762x.jpg":                         { name: "Midnight Ahri",                      released: "Dec 14, 2011", price: "750 RP" },
  "ahri-foxfire-762x.jpg":                          { name: "Foxfire Ahri",                       released: "Feb 22, 2012", price: "975 RP" },
  "ahri-popstar-762x.jpg":                          { name: "Popstar Ahri",                       released: "Oct 29, 2014", price: "975 RP" },
  "ahri-challenger-762x.jpg":                       { name: "Challenger Ahri",                    released: "Dec 15, 2015", price: "975 RP" },
  "ahri-academy-762x.jpg":                          { name: "Academy Ahri",                       released: "Aug 26, 2016", price: "750 RP" },
  "ahri-arcade-762x.jpg":                           { name: "Arcade Ahri",                        released: "Aug  3, 2016", price: "1350 RP" },
  "ahri-star-guardian-762x.jpg":                    { name: "Star Guardian Ahri",                 released: "Sep  7, 2017", price: "1350 RP" },
  "ahri-kda-762x.jpg":                              { name: "K/DA Ahri",                          released: "Nov  3, 2018", price: "1350 RP" },
  "ahri-kda-prestige-762x.jpg":                     { name: "K/DA Ahri Prestige Edition",         released: "Nov  7, 2018", price: "Prestige Edition" },
  "ahri-elderwood-762x.jpg":                        { name: "Elderwood Ahri",                     released: "Oct 28, 2019", price: "1350 RP" },
  "ahri-spirit-blossom-762x.jpg":                   { name: "Spirit Blossom Ahri",                released: "Jul 22, 2020", price: "1350 RP" },
  "ahri-kda-all-out-762x.jpg":                      { name: "K/DA ALL OUT Ahri",                  released: "Oct 28, 2020", price: "1350 RP" },
  "ahri-coven-762x.jpg":                            { name: "Coven Ahri",                         released: "Oct 28, 2021", price: "1350 RP" },
  "ahri-arcana-762x.jpg":                           { name: "Arcana Ahri",                        released: "May 26, 2022", price: "1350 RP" },
  "ahri-snow-moon-762x.jpg":                        { name: "Snow Moon Ahri",                     released: "Jul 14, 2022", price: "1350 RP" },
  "ahri-risen-legend-762x.jpg":                     { name: "Risen Legend Ahri",                  released: "May  2, 2024", price: "525 RP" },
  "ahri-immortalized-legend-762x.jpg":              { name: "Immortalized Legend Ahri",           released: "May  2, 2024", price: "3400 RP" },
  "ahri-spirit-blossom-springs-762x.jpg":           { name: "Spirit Blossom Springs Ahri",        released: "Apr  2, 2025", price: "1350 RP" },
  "ahri-after-hours-spirit-blossom-springs-762x.jpg": { name: "After Hours Spirit Blossom Ahri", released: "Apr  2, 2025", price: "1350 RP" },
};

function getSkinMeta(index) {
  return skinMetadata[imageFiles[index]] ?? { name: getCardTitle(imageFiles[index], index), released: "—", price: "—" };
}

const CARD_COUNT = imageFiles.length;
const CARD_ANGLE_STEP = Math.PI / 3;
const CARD_ANGLE_OFFSET = 0.35;
const CARD_ASPECT_RATIO = 762 / 449;
const CARD_HEIGHT = 1.84;
const CARD_WIDTH = CARD_HEIGHT * CARD_ASPECT_RATIO;
const CARD_RADIUS = 3.2;
const CARD_VERTICAL_STEP = 1.12;
const HELIX_HEIGHT = Math.max(18.4, 1.6 + (CARD_COUNT - 1) * CARD_VERTICAL_STEP);
const HELIX_TURNS = ((CARD_COUNT - 1) * CARD_ANGLE_STEP) / (Math.PI * 2);
const PARTICLE_HELIX_RADIUS = 24;
const PARTICLE_HELIX_HEIGHT = HELIX_HEIGHT;
const PARTICLE_HELIX_TURNS = HELIX_TURNS * 1.34;

window.helixDebug = {
  cardCount: CARD_COUNT,
  activeCardIndex,
  scrollProgress,
};

document.documentElement.style.setProperty(
  "--gallery-scroll-height",
  `${Math.max(320, CARD_COUNT * 20)}vh`,
);

const palette = [
  new THREE.Color(themeColors.rose),
  new THREE.Color(themeColors.gold),
  new THREE.Color(themeColors.violet),
];

const petalColors = [
  new THREE.Color(themeColors.rose).lerp(new THREE.Color("#ffffff"), 0.2),
  new THREE.Color(themeColors.rose),
  new THREE.Color(themeColors.violet).lerp(new THREE.Color(themeColors.rose), 0.35),
  new THREE.Color(themeColors.rose).lerp(new THREE.Color("#ffffff"), 0.45),
  new THREE.Color(themeColors.violet),
  new THREE.Color(themeColors.gold).lerp(new THREE.Color("#ffffff"), 0.32),
];

const cardMeshes = [];
const floaters = [];
const particleMaterials = [];
let hoveredCardIndex = -1;
let hoverGlowLight = null;
const raycaster = new THREE.Raycaster();
const pointerVec = new THREE.Vector2();

// --- Detail view state ---
let detailState = "closed"; // "closed" | "opening" | "open" | "closing"
let detailCardIndex = -1;
let detailAnimStart = 0;
const DETAIL_TWEEN_MS = 700;
const DETAIL_GAS_MS = 600;
const _savedCamPos = new THREE.Vector3();
const _savedCamLookAt = new THREE.Vector3();
const _targetCamPos = new THREE.Vector3();
const _targetCamLookAt = new THREE.Vector3();
let savedScrollTop = 0;
let detailFadeAmount = 0;
let gasProgress = 0;
let activeTypingToken = 0;

const keyLight = new THREE.DirectionalLight(0xfff0f6, 2.0);
keyLight.position.set(5, 6, 4);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(new THREE.Color(themeColors.violet), 0.52);
fillLight.position.set(-4, -2, 3);
scene.add(fillLight);

const innerGlow = new THREE.PointLight(new THREE.Color(themeColors.rose), 0.5, 8);
innerGlow.position.set(0, 0, 0);
scene.add(innerGlow);

scene.add(new THREE.AmbientLight(new THREE.Color(themeColors.violet), 0.14));

function makePanelTexture(fileName, index, options = {}) {
  const width = options.width ?? 1024;
  const height = options.height ?? 640;
  const drawing = document.createElement("canvas");
  drawing.width = width;
  drawing.height = height;
  const ctx = drawing.getContext("2d");
  const texture = new THREE.CanvasTexture(drawing);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

  drawPanel(ctx, width, height, null, index, options);

  let bakedCanvas = null;
  const image = new Image();
  image.onload = () => {
    drawPanel(ctx, width, height, image, index, { ...options, fileName });
    texture.needsUpdate = true;
    const baked = document.createElement("canvas");
    baked.width = width;
    baked.height = height;
    baked.getContext("2d").drawImage(drawing, 0, 0);
    bakedCanvas = baked;
  };
  image.src = `./assets/${encodeURIComponent(fileName)}`;

  return { texture, drawing, ctx, getBakedCanvas: () => bakedCanvas };
}

function drawPanel(ctx, width, height, image, index, options) {
  const radius = options.radius ?? 58;
  const inset = 34;
  const panelWidth = width - inset * 2;
  const panelHeight = height - inset * 2;
  ctx.clearRect(0, 0, width, height);

  ctx.save();
  roundedPath(ctx, inset, inset, panelWidth, panelHeight, radius);
  ctx.fillStyle = withAlpha(themeColors.paper, 0.92);
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundedPath(ctx, inset, inset, panelWidth, panelHeight, radius);
  ctx.clip();

  if (image) {
    ctx.save();
    ctx.globalAlpha = 0.96;
    ctx.filter = "saturate(0.98) contrast(1.06) brightness(0.96)";
    drawImageCover(ctx, image, inset, inset, panelWidth, panelHeight);
    ctx.restore();
  } else {
    ctx.save();
    const wash = ctx.createLinearGradient(0, 0, width, height);
    wash.addColorStop(0, paperMix(themeColors.violet, 0.18));
    wash.addColorStop(0.44, paperMix(themeColors.violet, 0.12));
    wash.addColorStop(1, paperMix(themeColors.rose, 0.08));
    ctx.fillStyle = wash;
    ctx.fillRect(inset, inset, panelWidth, panelHeight);
    ctx.restore();
  }

  ctx.globalCompositeOperation = "source-atop";
  const tint = ctx.createLinearGradient(inset, inset, width - inset, height - inset);
  tint.addColorStop(0, withAlpha(themeColors.violet, 0.22));
  tint.addColorStop(0.42, withAlpha(themeColors.violet, 0.24));
  tint.addColorStop(0.72, withAlpha(themeColors.rose, 0.22));
  tint.addColorStop(1, withAlpha(themeColors.rose, 0.18));
  ctx.fillStyle = tint;
  ctx.fillRect(inset, inset, panelWidth, panelHeight);

  const vignette = ctx.createRadialGradient(
    width * 0.5, height * 0.5, 20,
    width * 0.5, height * 0.5, width * 0.72,
  );
  vignette.addColorStop(0, withAlpha(themeColors.violet, 0.12));
  vignette.addColorStop(0.5, withAlpha(themeColors.paper, 0.04));
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.5)");
  ctx.fillStyle = vignette;
  ctx.fillRect(inset, inset, panelWidth, panelHeight);

  const glossC = new THREE.Color(themeColors.violet).lerp(new THREE.Color("#ffffff"), 0.5);
  const gloss = ctx.createLinearGradient(width * 0.1, height * 0.08, width * 0.92, height * 0.82);
  gloss.addColorStop(0, withAlpha(themeColors.violet, 0.08));
  gloss.addColorStop(0.34, `rgba(${Math.round(glossC.r * 255)}, ${Math.round(glossC.g * 255)}, ${Math.round(glossC.b * 255)}, 0.16)`);
  gloss.addColorStop(0.5, "rgba(255, 255, 255, 0.04)");
  gloss.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = gloss;
  ctx.fillRect(inset, inset, panelWidth, panelHeight);

  const stripH = panelHeight * 0.32;
  const strip = ctx.createLinearGradient(0, inset + panelHeight - stripH, 0, inset + panelHeight);
  strip.addColorStop(0, withAlpha(themeColors.paper, 0));
  strip.addColorStop(0.48, withAlpha(themeColors.paper, 0.82));
  strip.addColorStop(1, withAlpha(themeColors.paper, 0.96));
  ctx.fillStyle = strip;
  ctx.fillRect(inset, inset + panelHeight - stripH, panelWidth, stripH);

  ctx.globalCompositeOperation = "source-over";
  drawCardGrain(ctx, inset, inset, panelWidth, panelHeight, index);
  drawCardTitle(ctx, width, height, index, options.fileName);
  ctx.restore();

  ctx.save();
  const isEven = index % 2 === 0;
  roundedPath(ctx, inset, inset, panelWidth, panelHeight, radius);
  ctx.strokeStyle = isEven
    ? withAlpha(themeColors.rose, 0.68)
    : withAlpha(themeColors.violet, 0.62);
  ctx.lineWidth = 6;
  ctx.stroke();

  roundedPath(ctx, inset - 4, inset - 4, panelWidth + 8, panelHeight + 8, radius + 4);
  ctx.strokeStyle = withAlpha(themeColors.paper, 0.72);
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.restore();
}

function drawCardTitle(ctx, width, height, index, fileName = "") {
  const title = getCardTitle(fileName, index);
  const lines = splitTitleLines(title);
  const inset = 34;
  const maxTitleWidth = width - inset * 2 - 36;
  const longestLine = lines.reduce((longest, line) => (line.length > longest.length ? line : longest), "");
  const mainSize = lines.length > 1
    ? Math.min(54, getSingleLineTitleSize(ctx, longestLine, maxTitleWidth))
    : getSingleLineTitleSize(ctx, title, maxTitleWidth);
  const lineHeight = mainSize * 1.02;

  const panelHeight = height - inset * 2;
  const stripBottom = inset + panelHeight - 22;
  const textBlock = lines.length * lineHeight;
  const blockTop = stripBottom - textBlock - 10;
  const startY = blockTop + lineHeight * 0.5;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.font = `500 ${mainSize}px Consolas, 'Liberation Mono', monospace`;
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.strokeStyle = withAlpha(themeColors.paper, 0.98);
  ctx.lineWidth = 6;
  ctx.fillStyle = "rgba(255, 255, 255, 1)";

  lines.forEach((line, lineIndex) => {
    const y = startY + lineIndex * lineHeight;
    ctx.strokeText(line, width / 2, y);
    ctx.fillText(line, width / 2, y);
  });

  ctx.font = "500 24px Consolas, 'Liberation Mono', monospace";
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(255, 255, 255, 1)";
  ctx.fillText("AHRI", width / 2, blockTop - 18);

  const indexLabel =
    String(index + 1).padStart(2, "0") + " / " + String(CARD_COUNT).padStart(2, "0");
  ctx.font = "400 19px Consolas, 'Liberation Mono', monospace";
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.fillStyle = themeColors.gold;
  ctx.textAlign = "right";
  ctx.fillText(indexLabel, width - inset - 18, inset + 26);

  ctx.restore();
}

function getSingleLineTitleSize(ctx, title, maxWidth) {
  const maxSize = 66;
  const minSize = 39;
  let size = maxSize;

  while (size > minSize) {
    ctx.font = `500 ${size}px Consolas, 'Liberation Mono', monospace`;
    if (ctx.measureText(title).width <= maxWidth) return size;
    size -= 1;
  }

  return minSize;
}

function splitTitleLines(title) {
  const words = title.split(" ");
  if (title.length <= 22 || words.length === 1) return [title];

  const targetLength = Math.ceil(title.length / 2);
  const lines = [];
  let current = "";

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > targetLength && current && lines.length === 0) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });

  if (current) lines.push(current);
  return lines.slice(0, 2);
}

function getCardTitle(fileName, index) {
  const fallback = `Skin ${String(index + 1).padStart(2, "0")}`;
  if (cardTitleOverrides[fileName]) return cardTitleOverrides[fileName];

  const oldNameMatch = fileName.match(/Ahri_(.+?)Skin/i);
  const slugMatch = fileName.match(/^ahri-(.+?)-762x\.(?:jpg|jpeg|png|webp)$/i);
  const rawName = oldNameMatch?.[1] ?? slugMatch?.[1]?.replace(/-/g, " ");
  if (!rawName) return fallback.toUpperCase();

  return rawName
    .replace(/KDAALLOUT/gi, "K/DA ALL OUT")
    .replace(/\bkda\b/gi, "K/DA")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .toUpperCase();
}

function drawCardGrain(ctx, x, y, width, height, seed) {
  const roseR = 232, roseG = 84, roseB = 122;
  const violetR = 168, violetG = 85, violetB = 200;
  let value = (seed + 1) * 9301 + 49297;
  ctx.save();
  ctx.globalAlpha = 0.14;
  for (let i = 0; i < 950; i += 1) {
    value = (value * 233 + 17) % 9973;
    const px = x + (value / 9973) * width;
    value = (value * 233 + 17) % 9973;
    const py = y + (value / 9973) * height;
    value = (value * 233 + 17) % 9973;
    const t = value / 9973;
    const shade = 140 + Math.floor(t * 115);
    const r = Math.round(shade * 0.72 + roseR * 0.28);
    const g = Math.round(shade * 0.72 + roseG * 0.28);
    const b = Math.round(shade * 0.72 + (i % 3 === 0 ? violetB : roseB) * 0.28);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(px, py, 1, 1);
  }
  ctx.restore();
}

function drawImageCover(ctx, image, x, y, width, height) {
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const targetRatio = width / height;
  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;
  let sourceX = 0;
  let sourceY = 0;

  if (imageRatio > targetRatio) {
    sourceWidth = image.naturalHeight * targetRatio;
    sourceX = (image.naturalWidth - sourceWidth) / 2;
  } else {
    sourceHeight = image.naturalWidth / targetRatio;
    sourceY = (image.naturalHeight - sourceHeight) / 2;
  }

  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

function roundedPath(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

let sharedGlowTexture = null;
function getGlowTexture() {
  if (sharedGlowTexture) return sharedGlowTexture;
  const w = 400, h = 238;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = withAlpha(themeColors.rose, 0.9);
  ctx.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    ctx.shadowColor = themeColors.rose;
    ctx.shadowBlur = 3 + i * 4;
    roundedPath(ctx, 13, 13, w - 26, h - 26, 30);
    ctx.stroke();
  }
  sharedGlowTexture = new THREE.CanvasTexture(c);
  sharedGlowTexture.colorSpace = THREE.SRGBColorSpace;
  return sharedGlowTexture;
}

const PETAL_VARIANT_FILES = [
  "./assets/petals/petal_1.glb",
  "./assets/petals/petal_2.glb",
  "./assets/petals/petal_3.glb",
  "./assets/petals/petal_4.glb",
];

function extractFirstMeshGeometry(gltf) {
  let geometry = null;
  let material = null;
  gltf.scene.traverse((node) => {
    if (geometry === null && node.isMesh) {
      geometry = node.geometry;
      material = node.material;
    }
  });
  return geometry ? { geometry, material } : null;
}

function normalizePetalGeometry(geometry) {
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox;
  const sizeVec = new THREE.Vector3();
  bb.getSize(sizeVec);
  const longestAxis = Math.max(sizeVec.x, sizeVec.y, sizeVec.z) || 1;
  const center = new THREE.Vector3();
  bb.getCenter(center);
  const normalized = geometry.clone();
  normalized.translate(-center.x, -center.y, -center.z);
  normalized.scale(1 / longestAxis, 1 / longestAxis, 1 / longestAxis);
  if (!normalized.attributes.normal) normalized.computeVertexNormals();
  return normalized;
}

async function loadPetalGltfs() {
  const loader = new GLTFLoader();
  const results = await Promise.all(
    PETAL_VARIANT_FILES.map((path) =>
      loader.loadAsync(path).catch((err) => {
        console.warn(`Petal load failed: ${path}`, err);
        return null;
      }),
    ),
  );
  const variants = [];
  results.forEach((gltf) => {
    if (!gltf) return;
    const extracted = extractFirstMeshGeometry(gltf);
    if (!extracted) return;
    variants.push({
      geometry: normalizePetalGeometry(extracted.geometry),
      sourceMaterial: extracted.material,
    });
  });
  return variants;
}

function makeGlassPanel(fileName, index, config) {
  const { texture, drawing, ctx, getBakedCanvas } = makePanelTexture(fileName, index, {
    featured: config.featured,
    width: config.featured ? 1000 : 760,
    height: config.featured ? 590 : 450,
    radius: config.featured ? 58 : 48,
  });
  const geometry = new THREE.PlaneGeometry(config.width, config.height, 1, 1);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: config.opacity ?? 0.72,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(config.x, config.y, config.z);
  mesh.rotation.set(config.rx ?? 0, config.ry ?? 0, config.rz ?? 0);
  mesh.userData = {
    base: mesh.position.clone(),
    rotation: mesh.rotation.clone(),
    float: config.float ?? 0.08,
    phase: index * 0.83,
    parallax: config.parallax ?? 0.35,
    angle: config.angle ?? 0,
    index,
    featured: Boolean(config.featured),
    hoverWeight: 0,
    drawingCanvas: drawing,
    drawingCtx: ctx,
    getBakedCanvas,
  };

  const glowMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(config.width, config.height),
    new THREE.MeshBasicMaterial({
      map: getGlowTexture(),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  glowMesh.position.z = 0.005;
  mesh.userData.glowMesh = glowMesh;
  mesh.add(glowMesh);

  mesh.renderOrder = 20 + index;
  cardMeshes.push(mesh);
  panelRoot.add(mesh);
}

function buildPanels() {
  imageFiles.forEach((fileName, index) => {
    const progress = index / Math.max(1, CARD_COUNT - 1);
    const y = THREE.MathUtils.lerp(
      HELIX_HEIGHT / 2 - 0.8,
      -HELIX_HEIGHT / 2 + 0.8,
      progress,
    );
    const angle = CARD_ANGLE_OFFSET - index * CARD_ANGLE_STEP;
    const radius = CARD_RADIUS + Math.sin(index * 1.37) * 0.18;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    makeGlassPanel(fileName, index, {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      x, y, z,
      angle,
      rz: Math.sin(index * 0.72) * 0.035,
      opacity: 0.72,
      float: 0.035,
      parallax: 0.12,
    });
  });
}

function buildSpine() {
  const coreMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xfff0f8,
    metalness: 0.3,
    roughness: 0.05,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    iridescence: 0.9,
    iridescenceIOR: 1.5,
    envMapIntensity: 1.8,
  });

  const rimMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(themeColors.violet),
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });

  const vertebraGeometry = new THREE.TorusKnotGeometry(0.38, 0.16, 48, 6, 2, 3);
  const haloSourceGeometry = new THREE.TorusGeometry(0.62, 0.014, 8, 80);

  const vertebraCount = 23;
  const haloGeos = [];
  const haloDummy = new THREE.Object3D();

  for (let i = 0; i < vertebraCount; i += 1) {
    const progress = i / Math.max(1, vertebraCount - 1);
    const y = THREE.MathUtils.lerp(HELIX_HEIGHT / 2, -HELIX_HEIGHT / 2, progress);
    const vertebra = new THREE.Mesh(vertebraGeometry, coreMaterial);
    vertebra.position.set(0.08 * Math.sin(i * 0.9), y, -0.18);
    vertebra.rotation.set(i * 0.22, i * 0.56, Math.PI * 0.48 + i * 0.18);
    vertebra.scale.set(0.82 + Math.sin(i) * 0.1, 0.46, 0.92);
    vertebra.userData.phase = i * 0.4;
    spineRoot.add(vertebra);
    floaters.push(vertebra);

    if (i % 2 === 0) {
      const geo = haloSourceGeometry.clone();
      haloDummy.position.set(0, y + 0.05, -0.14);
      haloDummy.rotation.set(Math.PI / 2, i * 0.22, 0);
      haloDummy.scale.set(1.08, 0.74, 1);
      haloDummy.updateMatrix();
      geo.applyMatrix4(haloDummy.matrix);
      haloGeos.push(geo);
    }
  }

  spineRoot.add(new THREE.Mesh(mergeGeometries(haloGeos), rimMaterial));
  haloGeos.forEach((g) => g.dispose());
  haloSourceGeometry.dispose();

  const railA = [];
  const railB = [];
  const railRadius = 0.74;
  for (let i = 0; i <= 640; i += 1) {
    const progress = i / 640;
    const angle = progress * Math.PI * 2 * HELIX_TURNS;
    const y = THREE.MathUtils.lerp(HELIX_HEIGHT / 2, -HELIX_HEIGHT / 2, progress);
    railA.push(new THREE.Vector3(Math.cos(angle) * railRadius, y, Math.sin(angle) * railRadius));
    railB.push(new THREE.Vector3(Math.cos(angle + Math.PI) * railRadius, y, Math.sin(angle + Math.PI) * railRadius));
  }

  const curveA = new THREE.CatmullRomCurve3(railA);
  const curveB = new THREE.CatmullRomCurve3(railB);
  const tubeGeomA = new THREE.TubeGeometry(curveA, 200, 0.022, 6, false);
  const tubeGeomB = new THREE.TubeGeometry(curveB, 200, 0.022, 6, false);

  spineRoot.add(
    new THREE.Mesh(
      tubeGeomA,
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(themeColors.rose),
        transparent: true,
        opacity: 0.54,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    ),
  );
  spineRoot.add(
    new THREE.Mesh(
      tubeGeomB,
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(themeColors.violet),
        transparent: true,
        opacity: 0.44,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    ),
  );

  const colGeom = new THREE.CylinderGeometry(0.035, 0.035, HELIX_HEIGHT, 8, 1, true);
  spineRoot.add(
    new THREE.Mesh(
      colGeom,
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(themeColors.rose),
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    ),
  );

  const outerColGeom = new THREE.CylinderGeometry(0.14, 0.14, HELIX_HEIGHT, 8, 1, true);
  spineRoot.add(
    new THREE.Mesh(
      outerColGeom,
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(themeColors.violet),
        transparent: true,
        opacity: 0.07,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    ),
  );

  hoverGlowLight = new THREE.PointLight(new THREE.Color(themeColors.rose), 0, 5);
  hoverGlowLight.position.set(0, 0, -0.8);
  galleryRoot.add(hoverGlowLight);
}

const PETAL_FIELD_BOTTOM = -10;
const PETAL_FIELD_TOP = 14;
const PETAL_FIELD_HEIGHT = PETAL_FIELD_TOP - PETAL_FIELD_BOTTOM;

function spawnPetalInstance(innerR, outerR) {
  const angle = Math.random() * Math.PI * 2;
  const rNorm = Math.sqrt(Math.random());
  const radius = THREE.MathUtils.lerp(innerR, outerR, rNorm);
  return {
    x: Math.cos(angle) * radius,
    y: THREE.MathUtils.lerp(PETAL_FIELD_BOTTOM, PETAL_FIELD_TOP, Math.random()),
    z: Math.sin(angle) * radius,
    color: petalColors[Math.floor(Math.random() * petalColors.length)],
  };
}

let petalProgramCounter = 0;

function buildPetalShaderPatch(material, opacity) {
  const uniforms = {
    uTime: { value: 0 },
    uFieldHeight: { value: PETAL_FIELD_HEIGHT },
    uFieldBottom: { value: PETAL_FIELD_BOTTOM },
    uOpacity: { value: opacity },
    uNearFadeStart: { value: 2.5 },
    uNearFadeEnd: { value: 5.5 },
  };
  material.userData.uniforms = uniforms;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uFieldHeight = uniforms.uFieldHeight;
    shader.uniforms.uFieldBottom = uniforms.uFieldBottom;
    shader.uniforms.uOpacity = uniforms.uOpacity;
    shader.uniforms.uNearFadeStart = uniforms.uNearFadeStart;
    shader.uniforms.uNearFadeEnd = uniforms.uNearFadeEnd;

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\n" + PETAL_INSTANCE_ATTRIBUTES_GLSL,
      )
      .replace(
        "#include <beginnormal_vertex>",
        `
        vec3 objectNormal = normal;
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3( tangent.xyz );
        #endif
        float petalAngleN = uTime * aTumbleSpeed + aPhase;
        mat3 petalRotN = rotMatAxisAngle(normalize(aTumbleAxis), petalAngleN);
        objectNormal = petalRotN * objectNormal;
        #ifdef USE_TANGENT
          objectTangent = petalRotN * objectTangent;
        #endif
        vTintColor = aColor;
        `,
      )
      .replace(
        "#include <begin_vertex>",
        `
        float petalAngleV = uTime * aTumbleSpeed + aPhase;
        mat3 petalRotV = rotMatAxisAngle(normalize(aTumbleAxis), petalAngleV);
        vec3 transformed = petalRotV * (position * aSize);
        vec3 petalAnchor = aBasePos;
        petalAnchor.y -= uTime * aFallSpeed;
        petalAnchor.y = mod(petalAnchor.y - uFieldBottom, uFieldHeight) + uFieldBottom;
        petalAnchor.x += sin(uTime * 0.4 + aPhase) * aSwayAmp;
        petalAnchor.z += cos(uTime * 0.32 + aPhase * 1.3) * aSwayAmp * 0.7;
        transformed += petalAnchor;
        vec4 petalViewPos = modelViewMatrix * vec4(transformed, 1.0);
        vNearFade = smoothstep(uNearFadeStart, uNearFadeEnd, -petalViewPos.z);
        `,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `
        #include <common>
        varying vec3 vTintColor;
        varying float vNearFade;
        uniform float uOpacity;
        `,
      )
      .replace(
        "#include <color_fragment>",
        `
        #include <color_fragment>
        diffuseColor.rgb *= vTintColor;
        diffuseColor.a *= uOpacity * vNearFade;
        if (diffuseColor.a < 0.01) discard;
        `,
      );

    material.userData.shader = shader;
  };

  // Force a unique program per material so onBeforeCompile fires for each
  const cacheKey = `petal-${++petalProgramCounter}`;
  material.customProgramCacheKey = () => cacheKey;
}

function addPetalVariant(geometry, sourceMaterial, count, opacity, baseScale, options) {
  const sizeMin = options.sizeMin;
  const sizeMax = options.sizeMax;
  const fallMin = options.fallMin;
  const fallMax = options.fallMax;
  const tumbleMin = options.tumbleMin;
  const tumbleMax = options.tumbleMax;
  const swayMin = options.swayMin;
  const swayMax = options.swayMax;
  const innerR = options.innerRadius;
  const outerR = options.outerRadius;

  const basePos = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const sizes = new Float32Array(count);
  const fallSpeeds = new Float32Array(count);
  const swayAmps = new Float32Array(count);
  const tumbleAxes = new Float32Array(count * 3);
  const tumbleSpeeds = new Float32Array(count);

  const axisVec = new THREE.Vector3();
  for (let i = 0; i < count; i += 1) {
    const p = spawnPetalInstance(innerR, outerR);
    const color = p.color.clone().lerp(new THREE.Color(0xffffff), 0.05 + Math.random() * 0.1);
    basePos[i * 3] = p.x;
    basePos[i * 3 + 1] = p.y;
    basePos[i * 3 + 2] = p.z;
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
    phases[i] = Math.random() * Math.PI * 2;
    sizes[i] = baseScale * THREE.MathUtils.lerp(sizeMin, sizeMax, Math.random());
    fallSpeeds[i] = THREE.MathUtils.lerp(fallMin, fallMax, Math.random());
    swayAmps[i] = THREE.MathUtils.lerp(swayMin, swayMax, Math.random());
    axisVec
      .set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
      .normalize();
    tumbleAxes[i * 3] = axisVec.x;
    tumbleAxes[i * 3 + 1] = axisVec.y;
    tumbleAxes[i * 3 + 2] = axisVec.z;
    tumbleSpeeds[i] =
      (Math.random() < 0.5 ? -1 : 1) *
      THREE.MathUtils.lerp(tumbleMin, tumbleMax, Math.random());
  }

  const instGeom = new THREE.InstancedBufferGeometry();
  instGeom.index = geometry.index;
  instGeom.attributes.position = geometry.attributes.position;
  if (geometry.attributes.normal) instGeom.attributes.normal = geometry.attributes.normal;
  if (geometry.attributes.uv) instGeom.attributes.uv = geometry.attributes.uv;
  instGeom.instanceCount = count;
  instGeom.setAttribute("aBasePos", new THREE.InstancedBufferAttribute(basePos, 3));
  instGeom.setAttribute("aColor", new THREE.InstancedBufferAttribute(colors, 3));
  instGeom.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phases, 1));
  instGeom.setAttribute("aSize", new THREE.InstancedBufferAttribute(sizes, 1));
  instGeom.setAttribute("aFallSpeed", new THREE.InstancedBufferAttribute(fallSpeeds, 1));
  instGeom.setAttribute("aSwayAmp", new THREE.InstancedBufferAttribute(swayAmps, 1));
  instGeom.setAttribute("aTumbleAxis", new THREE.InstancedBufferAttribute(tumbleAxes, 3));
  instGeom.setAttribute("aTumbleSpeed", new THREE.InstancedBufferAttribute(tumbleSpeeds, 1));

  // Reuse the source material from the .glb so we keep its baked diffuse map
  // / alpha / normal map. Fall back to a fresh MeshStandardMaterial only if
  // the .glb didn't ship one we can patch.
  const baseMaterial =
    sourceMaterial && sourceMaterial.isMeshStandardMaterial
      ? sourceMaterial.clone()
      : new THREE.MeshStandardMaterial({
          color: 0xffffff,
          roughness: 0.78,
          metalness: 0.0,
        });
  baseMaterial.side = THREE.DoubleSide;
  baseMaterial.transparent = true;
  baseMaterial.depthWrite = false;
  if (baseMaterial.alphaTest === 0) baseMaterial.alphaTest = 0.01;
  if (!baseMaterial.emissive || baseMaterial.emissive.getHex() === 0x000000) {
    baseMaterial.emissive = new THREE.Color(themeColors.rose).multiplyScalar(0.28);
    baseMaterial.emissiveIntensity = 0.35;
  }
  const material = baseMaterial;
  buildPetalShaderPatch(material, opacity);
  particleMaterials.push(material);

  const mesh = new THREE.Mesh(instGeom, material);
  mesh.name = "petals-variant";
  mesh.frustumCulled = false;
  particleRoot.add(mesh);
  return mesh;
}

async function buildParticles() {
  const variants = await loadPetalGltfs();
  if (variants.length === 0) {
    console.warn("No petal .glb variants loaded; skipping background petals.");
    return;
  }

  const totalCount = window.innerWidth < 700 ? 110 : 200;
  const perVariant = Math.ceil(totalCount / variants.length);
  const tuning = {
    sizeMin: 0.5,
    sizeMax: 1.8,
    fallMin: 0.35,
    fallMax: 0.9,
    tumbleMin: 0.3,
    tumbleMax: 1.4,
    swayMin: 0.15,
    swayMax: 0.55,
    innerRadius: 2.5,
    outerRadius: 15,
  };

  variants.forEach(({ geometry, sourceMaterial }) => {
    addPetalVariant(geometry, sourceMaterial, perVariant, 0.85, 0.55, tuning);
  });
}

function buildDots() {
  if (!cardDotsContainer) return;
  for (let i = 0; i < CARD_COUNT; i++) {
    const dot = document.createElement("div");
    dot.className = "card-dot";
    cardDotsContainer.appendChild(dot);
  }
}

function updateDots() {
  if (!cardDotsContainer) return;
  cardDotsContainer.querySelectorAll(".card-dot").forEach((dot, i) => {
    dot.classList.toggle("active", i === activeCardIndex);
  });
}

function getDisplaySkinName(fileName, index) {
  return getCardTitle(fileName, index)
    .split(" ")
    .map((w) => (w === "K/DA" ? w : w.charAt(0) + w.slice(1).toLowerCase()))
    .join(" ");
}

function getSkinListVisibleCount() {
  if (!skinListExpanded) return 5;

  const usableHeight = Math.max(220, window.innerHeight - 168);
  const countFromHeight = Math.floor(usableHeight / 34);
  const boundedCount = THREE.MathUtils.clamp(countFromHeight, 5, 11);
  return boundedCount % 2 === 0 ? boundedCount - 1 : boundedCount;
}

function scrollToCard(index) {
  const scrollMax = getScrollMax();
  const progress = index / Math.max(1, CARD_COUNT - 1);
  window.scrollTo({ top: progress * scrollMax, behavior: "smooth" });
}

function updateSkinList() {
  if (!skinListEl) return;
  const visibleCount = getSkinListVisibleCount();
  const sideCount = Math.floor(visibleCount / 2);
  const start = Math.max(0, activeCardIndex - sideCount);
  const end = Math.min(CARD_COUNT - 1, activeCardIndex + sideCount);
  const listKey = `${start}:${end}:${activeCardIndex}:${skinListExpanded}`;
  if (listKey === renderedSkinListKey) return;

  renderedSkinListKey = listKey;
  skinListEl.textContent = "";

  for (let i = start; i <= end; i += 1) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = "#";
    a.textContent = getDisplaySkinName(imageFiles[i], i);
    a.dataset.cardIndex = String(i);
    if (i === activeCardIndex) {
      a.classList.add("active");
      a.setAttribute("aria-current", "true");
    }
    a.addEventListener("click", (e) => {
      e.preventDefault();
      scrollToCard(i);
    });
    li.appendChild(a);
    skinListEl.appendChild(li);
  }
}

function setSkinListExpanded(expanded) {
  if (skinListExpanded === expanded) return;

  skinListExpanded = expanded;
  renderedSkinListKey = "";
  updateSkinList();
}

function getCardFocusRotation(index) {
  const cardAngle = CARD_ANGLE_OFFSET - index * CARD_ANGLE_STEP;
  return cardAngle - Math.PI / 2;
}

function getInteractionFocusIndex() {
  return activeCardIndex;
}

function getCardYAtIndex(index) {
  const progress = index / Math.max(1, CARD_COUNT - 1);
  return THREE.MathUtils.lerp(
    HELIX_HEIGHT / 2 - 0.8,
    -HELIX_HEIGHT / 2 + 0.8,
    progress,
  );
}

function updateFocusedCardTarget() {
  const focusY = getCardYAtIndex(getInteractionFocusIndex());
  targetGalleryY = -focusY * galleryRoot.scale.x + responsiveYOffset;
}

function getCardRenderOrder(base, rotationY) {
  const depth = -base.x * Math.sin(rotationY) + base.z * Math.cos(rotationY);
  return Math.round((depth + 10) * 1000);
}

function updateScrollState() {
  const scrollingElement = document.scrollingElement || document.documentElement;
  const scrollTop = scrollingElement.scrollTop;
  if (scrollTop === lastScrollTop) return;

  lastScrollTop = scrollTop;
  const scrollMax = Math.max(
    scrollingElement.scrollHeight - scrollingElement.clientHeight,
    1,
  );
  scrollProgress = THREE.MathUtils.clamp(scrollTop / scrollMax, 0, 1);
  activeCardIndex = Math.round(scrollProgress * (CARD_COUNT - 1));
  scrollRotation = getCardFocusRotation(activeCardIndex);
  updateFocusedCardTarget();
  updateDots();
  updateSkinList();
  window.helixDebug.activeCardIndex = activeCardIndex;
  window.helixDebug.scrollProgress = scrollProgress;
  document.documentElement.dataset.activeCard = String(activeCardIndex + 1).padStart(2, "0");

  if (!scrollHintHidden && scrollProgress > 0.015 && scrollHint) {
    scrollHintHidden = true;
    scrollHint.classList.add("hidden");
  }

  if (caption) {
    caption.style.setProperty(
      "--caption-opacity",
      String(THREE.MathUtils.clamp(1 - scrollProgress * 3, 0, 0.92)),
    );
  }
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  composer.setSize(width, height);
  bloomPass.setSize(Math.floor(width / 2), Math.floor(height / 2));

  camera.aspect = width / height;

  if (width < 560) {
    camera.position.z = 15.5;
    root.scale.setScalar(0.76);
    root.position.x = 0.3;
    galleryRoot.scale.setScalar(0.82);
    responsiveYOffset = 0.18;
  } else if (width < 980) {
    camera.position.z = 14.5;
    root.scale.setScalar(0.88);
    root.position.x = 0.14;
    galleryRoot.scale.setScalar(0.9);
    responsiveYOffset = 0.08;
  } else {
    camera.position.z = 13.0;
    root.scale.setScalar(1);
    root.position.x = 0;
    galleryRoot.scale.setScalar(1);
    responsiveYOffset = 0;
  }

  camera.updateProjectionMatrix();
  lastScrollTop = -1;
  updateScrollState();
  galleryRoot.rotation.y = scrollRotation;
  updateFocusedCardTarget();
  currentGalleryY = targetGalleryY;
  galleryRoot.position.y = currentGalleryY;
  particleRoot.rotation.y = galleryRoot.rotation.y;
  renderedSkinListKey = "";
  updateSkinList();
}

function animate(timestamp = 0) {
  requestAnimationFrame(animate);
  if (timestamp - lastFrameTime < FRAME_BUDGET_MS - 1) return;
  lastFrameTime = timestamp;

  const elapsed = clock.getElapsedTime();
  updateScrollState();

  const motionTime = animationPaused ? 0 : elapsed;
  const detailNow = performance.now();
  updateDetailView(detailNow);

  particleMaterials.forEach((mat) => {
    const u = mat.userData.uniforms;
    if (!u) return;
    u.uTime.value = motionTime;
    if (mat.userData.baseOpacity === undefined) mat.userData.baseOpacity = u.uOpacity.value;
    u.uOpacity.value = mat.userData.baseOpacity * (1 - detailFadeAmount);
  });

  if (detailState === "closed") {
    const targetRotation = scrollRotation + pointerX * 0.035;
    root.rotation.y = pointerX * 0.035;
    root.rotation.x = pointerY * -0.035;
    root.position.y = THREE.MathUtils.lerp(root.position.y, 0, 0.05);
    galleryRoot.rotation.y = THREE.MathUtils.lerp(galleryRoot.rotation.y, targetRotation, 0.08);
    updateFocusedCardTarget();
    currentGalleryY = THREE.MathUtils.lerp(currentGalleryY, targetGalleryY, 0.075);
    galleryRoot.position.y = currentGalleryY;
    particleRoot.rotation.y = galleryRoot.rotation.y;
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, 0.35 + pointerX * 0.24, 0.05);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, 0.15 + pointerY * 0.16, 0.05);
    camera.lookAt(0, 0, 0);
  }

  spineRoot.traverse((obj) => {
    if (obj.isMesh && obj.material) {
      if (obj.userData.baseOpacity === undefined) {
        obj.userData.baseOpacity = obj.material.opacity;
        if (!obj.material.transparent) obj.material.transparent = true;
      }
      obj.material.opacity = obj.userData.baseOpacity * (1 - detailFadeAmount);
    }
  });

  panelRoot.children.forEach((mesh) => {
    const { base, rotation, float, phase, parallax, index, angle } = mesh.userData;
    const focusIndex = getInteractionFocusIndex();
    const distance = Math.abs(index - focusIndex);
    const focusWeight = THREE.MathUtils.clamp(1 - distance / 2.15, 0, 1);

    mesh.userData.hoverWeight = THREE.MathUtils.lerp(
      mesh.userData.hoverWeight,
      index === hoveredCardIndex ? 1 : 0,
      0.1,
    );
    const hw = mesh.userData.hoverWeight;
    const radialPush = hw * 0.3;

    mesh.position.x =
      base.x + Math.cos(angle) * radialPush +
      pointerX * parallax +
      Math.sin(motionTime * 0.42 + phase) * float;
    mesh.position.y = base.y + Math.cos(motionTime * 0.38 + phase) * float;
    mesh.position.z =
      base.z + Math.sin(angle) * radialPush +
      Math.sin(motionTime * 0.32 + phase) * float * 0.7;
    mesh.rotation.y = Math.PI / 2 - angle + pointerX * 0.018;
    mesh.rotation.x = rotation.x + pointerY * 0.04;
    mesh.rotation.z = rotation.z * (0.55 + focusWeight * 0.45);
    mesh.scale.setScalar(0.84 + focusWeight * 0.24 + hw * 0.08);

    const isDetailCard = detailCardIndex >= 0 && index === detailCardIndex;
    if (isDetailCard && detailState !== "closed") {
      mesh.material.opacity = Math.max(0, 1 - detailFadeAmount);
    } else {
      mesh.material.opacity = (0.72 + focusWeight * 0.25) * (1 - detailFadeAmount);
    }

    mesh.renderOrder = getCardRenderOrder(base, galleryRoot.rotation.y);

    if (mesh.userData.glowMesh) {
      if (isDetailCard && detailState !== "closed") {
        mesh.userData.glowMesh.material.opacity = Math.max(0, 1 - detailFadeAmount);
      } else {
        mesh.userData.glowMesh.material.opacity = THREE.MathUtils.lerp(
          mesh.userData.glowMesh.material.opacity,
          hw * 0.85,
          0.1,
        );
      }
    }
  });

  floaters.forEach((mesh) => {
    mesh.rotation.y += animationPaused ? 0 : 0.0025;
    mesh.position.x += Math.sin(motionTime * 0.8 + mesh.userData.phase) * 0.0008;
  });

  if (hoverGlowLight) {
    hoverGlowLight.position.y = THREE.MathUtils.lerp(
      hoverGlowLight.position.y,
      getCardYAtIndex(activeCardIndex),
      0.08,
    );
    hoverGlowLight.intensity = THREE.MathUtils.lerp(
      hoverGlowLight.intensity,
      hoveredCardIndex >= 0 ? 24 : 0,
      0.1,
    );
  }

  composer.render();

  if (!firstRenderDone) {
    firstRenderDone = true;
    canvas.classList.add("ready");
  }
}

function getScrollingElement() {
  return document.scrollingElement || document.documentElement;
}

function getScrollTop() {
  return getScrollingElement().scrollTop;
}

function getScrollMax() {
  const scrollingElement = getScrollingElement();
  return Math.max(scrollingElement.scrollHeight - scrollingElement.clientHeight, 0);
}

function getCardIndexAtPointer(event) {
  pointerVec.set(
    (event.clientX / window.innerWidth) * 2 - 1,
    -(event.clientY / window.innerHeight) * 2 + 1,
  );
  raycaster.setFromCamera(pointerVec, camera);
  const hits = raycaster.intersectObjects(cardMeshes, false);
  return hits.length > 0 ? hits[0].object.userData.index : -1;
}

function scrollPageFromDrag(event) {
  const dx = event.clientX - dragStartX;
  const dy = event.clientY - dragStartY;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  if (!dragAxis && Math.max(absX, absY) > 6) {
    dragAxis = absX > absY ? "x" : "y";
  }

  if (!dragAxis) return;

  if (event.cancelable) {
    event.preventDefault();
  }

  const dragDistance = dragAxis === "x" ? -dx : -dy;
  const scrollMultiplier = dragAxis === "x" ? 1.45 : 1;
  const nextScrollTop = THREE.MathUtils.clamp(
    dragStartScrollTop + dragDistance * scrollMultiplier,
    0,
    getScrollMax(),
  );

  window.scrollTo({ top: nextScrollTop, behavior: "auto" });
}

function handlePointerMove(event) {
  pointerX = (event.clientX / window.innerWidth - 0.5) * 2;
  pointerY = (event.clientY / window.innerHeight - 0.5) * 2;

  if (isDragging) {
    scrollPageFromDrag(event);
  } else {
    pointerMoveCount += 1;
    if (pointerMoveCount % 3 === 0) {
      hoveredCardIndex = getCardIndexAtPointer(event);
    }
  }
}

function handlePointerDown(event) {
  isDragging = true;
  dragStartX = event.clientX;
  dragStartY = event.clientY;
  dragStartScrollTop = getScrollTop();
  dragAxis = null;
  canvas.setPointerCapture(event.pointerId);
}

function handlePointerUp(event) {
  const dx = event.clientX - dragStartX;
  const dy = event.clientY - dragStartY;
  const isClick = !dragAxis && Math.hypot(dx, dy) <= CLICK_MOVE_TOLERANCE;

  isDragging = false;
  dragAxis = null;
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }

  if (!isClick) return;

  const clickedCardIndex = getCardIndexAtPointer(event);
  if (clickedCardIndex >= 0) {
    if (clickedCardIndex === activeCardIndex) {
      openDetailView(clickedCardIndex);
    } else {
      scrollToCard(clickedCardIndex);
    }
  }
}

function handlePointerCancel(event) {
  isDragging = false;
  dragAxis = null;
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
}

function updateMusicButton(isPlaying) {
  if (!musicToggle) return;

  musicToggle.textContent = isPlaying ? "❚❚" : "▶";
  musicToggle.setAttribute("aria-pressed", String(isPlaying));
  musicToggle.setAttribute(
    "aria-label",
    `${isPlaying ? "Pause" : "Play"} Legends Never Die`,
  );
  if (musicKicker) {
    musicKicker.textContent = isPlaying ? "Now playing" : "Soundtrack";
  }
  musicPanel?.classList.toggle("is-playing", isPlaying);
}

function setMusicVolume(value) {
  const numericValue = Number(value);
  musicVolumeLevel = Number.isFinite(numericValue)
    ? THREE.MathUtils.clamp(numericValue, 0, 1)
    : DEFAULT_MUSIC_VOLUME;
  if (musicAudio) {
    musicAudio.volume = musicVolumeLevel * 0.5;
  }
  if (musicVolume) {
    musicVolume.value = String(musicVolumeLevel);
    musicVolume.style.setProperty("--volume-percent", `${musicVolumeLevel * 100}%`);
  }
}

function startMusic() {
  if (!musicAudio) return;

  musicRequested = true;
  musicPanel?.classList.remove("needs-interaction");
  musicAudio.volume = musicVolumeLevel * 0.5;
  const playAttempt = musicAudio.play();

  if (playAttempt) {
    playAttempt
      .then(() => updateMusicButton(true))
      .catch(() => {
        musicRequested = false;
        updateMusicButton(false);
        musicPanel?.classList.add("needs-interaction");
      });
  } else {
    updateMusicButton(true);
  }
}

function pauseMusic() {
  if (!musicAudio) return;

  musicRequested = false;
  musicAudio.pause();
  updateMusicButton(false);
}

function pauseMusicForFocusLoss() {
  if (!musicAudio || musicAudio.paused) return;

  pauseMusic();
}

function startMusicFromScroll() {
  if (!musicAudio || musicRequested || !musicAudio.paused || document.visibilityState === "hidden") return;

  startMusic();
}

const audioGraph = { built: false, ctx: null, source: null, lowpass: null, gain: null };

function ensureAudioGraph() {
  if (audioGraph.built || !musicAudio) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const source = ctx.createMediaElementSource(musicAudio);
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 20000;
    lowpass.Q.value = 0.5;
    const gain = ctx.createGain();
    gain.gain.value = 1;
    source.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(ctx.destination);
    audioGraph.ctx = ctx;
    audioGraph.source = source;
    audioGraph.lowpass = lowpass;
    audioGraph.gain = gain;
    audioGraph.built = true;
  } catch (_) {
    // Web Audio unavailable — music plays dry, no underwater effect
  }
}

function setUnderwater(active) {
  if (!audioGraph.built) return;
  if (audioGraph.ctx.state === "suspended") audioGraph.ctx.resume().catch(() => {});
  const now = audioGraph.ctx.currentTime;
  const targetHz = active ? 380 : 20000;
  const targetQ  = active ? 1.2 : 0.5;
  const targetG  = active ? 0.78 : 1.0;
  audioGraph.lowpass.frequency.cancelScheduledValues(now);
  audioGraph.lowpass.Q.cancelScheduledValues(now);
  audioGraph.gain.gain.cancelScheduledValues(now);
  audioGraph.lowpass.frequency.linearRampToValueAtTime(targetHz, now + 0.7);
  audioGraph.lowpass.Q.linearRampToValueAtTime(targetQ, now + 0.7);
  audioGraph.gain.gain.linearRampToValueAtTime(targetG, now + 0.7);
}

function handleScrollKey(event) {
  if (!event.defaultPrevented && scrollStartKeys.has(event.key)) {
    startMusicFromScroll();
  }
}

// --- Detail view helpers ---

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function computeDetailCamTarget(mesh) {
  mesh.updateWorldMatrix(true, false);
  const worldPos = new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld);
  const normal = new THREE.Vector3(0, 0, 1).transformDirection(mesh.matrixWorld);
  _targetCamLookAt.copy(worldPos);
  _targetCamPos.copy(worldPos).addScaledVector(normal, 2.4);
}

function restoreCardTexture(mesh) {
  const baked = mesh.userData.getBakedCanvas?.();
  const c = mesh.userData.drawingCanvas;
  const ctx = mesh.userData.drawingCtx;
  if (!baked || !c || !ctx) return;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.drawImage(baked, 0, 0);
  mesh.material.map.needsUpdate = true;
}

function tickGasDissolve(mesh, p) {
  const baked = mesh.userData.getBakedCanvas?.();
  const c = mesh.userData.drawingCanvas;
  const ctx = mesh.userData.drawingCtx;
  if (!baked || !c || !ctx) return;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.drawImage(baked, 0, 0);
  ctx.globalCompositeOperation = "destination-out";
  const cx = c.width / 2;
  const cy = c.height / 2;
  const r = p * Math.hypot(c.width, c.height) * 0.6;
  if (r > 0) {
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, "rgba(0,0,0,1)");
    grad.addColorStop(0.7, "rgba(0,0,0,0.85)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, c.width, c.height);
  }
  ctx.globalCompositeOperation = "source-over";
  mesh.material.map.needsUpdate = true;
}

function typeInto(el, text, speed, token) {
  return new Promise((resolve) => {
    if (!el) { resolve(); return; }
    el.textContent = "";
    let i = 0;
    const tick = () => {
      if (activeTypingToken !== token) { resolve(); return; }
      if (i >= text.length) { resolve(); return; }
      el.textContent += text[i++];
      setTimeout(tick, speed);
    };
    setTimeout(tick, speed);
  });
}

async function runTypingSequence(meta, token) {
  const cdName = document.getElementById("cd-name");
  const cdDate = document.getElementById("cd-date");
  const cdPrice = document.getElementById("cd-price");
  await typeInto(cdName, meta.name, 38, token);
  if (activeTypingToken !== token) return;
  await typeInto(cdDate, "Released  " + meta.released, 26, token);
  if (activeTypingToken !== token) return;
  await typeInto(cdPrice, meta.price, 26, token);
}

function onDetailScrollAttempt() {
  closeDetailView();
}

function onDetailKey(event) {
  if (event.key === "Escape" || scrollStartKeys.has(event.key)) {
    closeDetailView();
  }
}

function onDetailBackdropClick(event) {
  if (event.target === cardDetailEl) closeDetailView();
}

function updateDetailView(now) {
  if (detailState === "closed") return;

  const mesh = detailCardIndex >= 0 ? cardMeshes[detailCardIndex] : null;
  const overlay = document.getElementById("card-detail");

  if (detailState === "opening") {
    const elapsed = now - detailAnimStart;
    const t = Math.min(elapsed / DETAIL_TWEEN_MS, 1);
    const e = easeInOutCubic(t);
    detailFadeAmount = e;

    camera.position.lerpVectors(_savedCamPos, _targetCamPos, e);
    camera.lookAt(
      _savedCamLookAt.x + (_targetCamLookAt.x - _savedCamLookAt.x) * e,
      _savedCamLookAt.y + (_targetCamLookAt.y - _savedCamLookAt.y) * e,
      _savedCamLookAt.z + (_targetCamLookAt.z - _savedCamLookAt.z) * e,
    );

    // Gas starts 100ms into the fly-in, runs 600ms (finishes at 700ms with camera)
    const gasT = Math.min(Math.max((elapsed - 100) / DETAIL_GAS_MS, 0), 1);
    gasProgress = easeInOutCubic(gasT);
    if (mesh) tickGasDissolve(mesh, gasProgress);

    // Show overlay the moment gas begins; opacity tracks gas progress
    if (gasT > 0) {
      if (overlay && !overlay.classList.contains("is-open")) {
        const cdImage = document.getElementById("cd-image");
        if (cdImage) {
          cdImage.src = `./assets/${encodeURIComponent(imageFiles[detailCardIndex])}`;
          cdImage.alt = getSkinMeta(detailCardIndex).name;
        }
        document.getElementById("cd-name").textContent = "";
        document.getElementById("cd-date").textContent = "";
        document.getElementById("cd-price").textContent = "";
        overlay.setAttribute("aria-hidden", "false");
        overlay.classList.add("is-open");
        overlay.style.opacity = "0";
        const token = ++activeTypingToken;
        runTypingSequence(getSkinMeta(detailCardIndex), token);
      }
      if (overlay) overlay.style.opacity = String(gasProgress);
    }

    if (t >= 1) {
      if (overlay) overlay.style.opacity = "1";
      detailState = "open";
    }

  } else if (detailState === "open") {
    camera.position.copy(_targetCamPos);
    camera.lookAt(_targetCamLookAt);

  } else if (detailState === "closing") {
    const elapsed = now - detailAnimStart;
    const t = Math.min(elapsed / DETAIL_TWEEN_MS, 1);
    const e = easeInOutCubic(t);
    detailFadeAmount = 1 - e;

    // Camera reverse: full 700ms
    camera.position.lerpVectors(_targetCamPos, _savedCamPos, e);
    camera.lookAt(
      _targetCamLookAt.x + (_savedCamLookAt.x - _targetCamLookAt.x) * e,
      _targetCamLookAt.y + (_savedCamLookAt.y - _targetCamLookAt.y) * e,
      _targetCamLookAt.z + (_savedCamLookAt.z - _targetCamLookAt.z) * e,
    );

    // Gas reverse: starts immediately, runs 600ms (matches open timing mirror)
    const gasT = Math.min(elapsed / DETAIL_GAS_MS, 1);
    gasProgress = 1 - easeInOutCubic(gasT);
    if (mesh) tickGasDissolve(mesh, gasProgress);

    // Overlay fades out with gas
    if (overlay) overlay.style.opacity = String(gasProgress);

    if (t >= 1) {
      if (mesh) restoreCardTexture(mesh);
      if (overlay) {
        overlay.classList.remove("is-open");
        overlay.setAttribute("aria-hidden", "true");
        overlay.style.opacity = "";
      }
      document.body.style.overflow = "";
      delete document.body.dataset.detailOpen;
      window.scrollTo({ top: savedScrollTop, behavior: "auto" });
      detailFadeAmount = 0;
      detailState = "closed";
      detailCardIndex = -1;
      gasProgress = 0;
    }
  }
}

function openDetailView(idx) {
  if (detailState !== "closed") return;

  detailCardIndex = idx;
  savedScrollTop = getScrollTop();
  _savedCamPos.copy(camera.position);
  _savedCamLookAt.set(0, 0, 0);

  const mesh = cardMeshes[idx];
  if (mesh) {
    computeDetailCamTarget(mesh);
  } else {
    _targetCamPos.copy(_savedCamPos);
    _targetCamLookAt.set(0, 0, 0);
  }

  document.body.style.overflow = "hidden";
  document.body.dataset.detailOpen = "1";

  detailState = "opening";
  detailAnimStart = performance.now();

  ensureAudioGraph();
  setUnderwater(true);

  window.addEventListener("wheel", onDetailScrollAttempt, { passive: true });
  window.addEventListener("touchmove", onDetailScrollAttempt, { passive: true });
  window.addEventListener("keydown", onDetailKey);
  document.getElementById("cd-close")?.addEventListener("click", closeDetailView);
  cardDetailEl?.addEventListener("click", onDetailBackdropClick);
}

function closeDetailView() {
  if (detailState === "closed" || detailState === "closing") return;

  window.removeEventListener("wheel", onDetailScrollAttempt);
  window.removeEventListener("touchmove", onDetailScrollAttempt);
  window.removeEventListener("keydown", onDetailKey);
  document.getElementById("cd-close")?.removeEventListener("click", closeDetailView);
  cardDetailEl?.removeEventListener("click", onDetailBackdropClick);
  ++activeTypingToken;

  setUnderwater(false);

  if (detailState === "opening") {
    // Interrupted mid-open: snap closed immediately
    const mesh = detailCardIndex >= 0 ? cardMeshes[detailCardIndex] : null;
    if (mesh) restoreCardTexture(mesh);
    const overlay = document.getElementById("card-detail");
    if (overlay) {
      overlay.classList.remove("is-open");
      overlay.setAttribute("aria-hidden", "true");
      overlay.style.opacity = "";
    }
    document.body.style.overflow = "";
    delete document.body.dataset.detailOpen;
    window.scrollTo({ top: savedScrollTop, behavior: "auto" });
    detailFadeAmount = 0;
    gasProgress = 0;
    detailState = "closed";
    detailCardIndex = -1;
    return;
  }

  // Closing from "open": set _targetCamPos to current (camera is at card) and reverse
  detailState = "closing";
  detailAnimStart = performance.now();
}

initThemeControl();
buildPanels();
buildSpine();
buildParticles();
buildDots();
updateSkinList();
setMusicVolume(DEFAULT_MUSIC_VOLUME);
resize();
requestAnimationFrame(animate);

window.addEventListener("resize", resize);
window.addEventListener("scroll", () => {
  updateScrollState();
  startMusicFromScroll();
}, { passive: true });
document.addEventListener("scroll", updateScrollState, { passive: true });
window.setInterval(updateScrollState, 120);
window.addEventListener("wheel", startMusicFromScroll, { passive: true });
window.addEventListener("touchmove", startMusicFromScroll, { passive: true });
window.addEventListener("keydown", handleScrollKey);
window.addEventListener("pointermove", handlePointerMove, { passive: false });
canvas.addEventListener("pointerdown", handlePointerDown);
canvas.addEventListener("pointerup", handlePointerUp);
canvas.addEventListener("pointercancel", handlePointerCancel);
themeForm?.addEventListener("submit", applyThemeSelection);
skinListEl?.closest(".seek-panel")?.addEventListener("mouseenter", () => setSkinListExpanded(true));
skinListEl?.closest(".seek-panel")?.addEventListener("mouseleave", () => setSkinListExpanded(false));
skinListEl?.closest(".seek-panel")?.addEventListener("focusin", () => setSkinListExpanded(true));
skinListEl?.closest(".seek-panel")?.addEventListener("focusout", (event) => {
  if (!event.currentTarget.contains(event.relatedTarget)) {
    setSkinListExpanded(false);
  }
});

musicToggle?.addEventListener("click", () => {
  if (musicRequested && !musicAudio?.paused) {
    pauseMusic();
  } else {
    startMusic();
  }
});

musicVolume?.addEventListener("input", (event) => {
  setMusicVolume(event.currentTarget.value);
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    pauseMusicForFocusLoss();
  }
});
window.addEventListener("blur", pauseMusicForFocusLoss);
window.addEventListener("pagehide", pauseMusicForFocusLoss);

musicAudio?.addEventListener("play", () => {
  musicRequested = true;
  updateMusicButton(true);
});
musicAudio?.addEventListener("pause", () => {
  musicRequested = false;
  updateMusicButton(false);
});

reduceMotion.addEventListener("change", (event) => {
  animationPaused = event.matches;
});
