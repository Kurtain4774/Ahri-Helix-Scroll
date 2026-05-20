import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const PARTICLE_VERT = /* glsl */`
attribute vec3 aBasePos;
attribute float aPhase;
attribute vec3 aColor;
uniform float uTime;
uniform float uSizeScale;
uniform float uOpacity;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vColor = aColor;
  vec3 pos = aBasePos;
  pos.x += sin(uTime * 0.38 + aPhase) * 0.14;
  pos.y += cos(uTime * 0.32 + aPhase) * 0.12;
  pos.z += sin(uTime * 0.44 + aPhase + 1.5708) * 0.10;
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = uSizeScale / -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
  vAlpha = uOpacity;
}
`;

const PARTICLE_FRAG = /* glsl */`
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = dot(uv, uv) * 4.0;
  if (d > 1.0) discard;
  gl_FragColor = vec4(vColor, (1.0 - d) * vAlpha);
}
`;

const canvas = document.querySelector("#helix-canvas");
const caption = document.querySelector(".scene-caption");
const musicPanel = document.querySelector(".music-panel");
const musicAudio = document.querySelector("#legends-player");
const musicToggle = document.querySelector(".music-toggle");
const musicKicker = document.querySelector(".music-kicker");
const cardDotsContainer = document.querySelector("#card-dots");
const scrollHint = document.querySelector("#scroll-hint");
const skinListEl = document.querySelector("#skin-list");

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x120820, 0.034);

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
  envGrad.addColorStop(0, "#0d0614");
  envGrad.addColorStop(0.28, "#a855c8");
  envGrad.addColorStop(0.56, "#e8547a");
  envGrad.addColorStop(0.8, "#f5c842");
  envGrad.addColorStop(1, "#0d0614");
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
const FRAME_BUDGET_MS = 1000 / 60;
let lastFrameTime = 0;

const imageFiles = [
  "340px-Ahri_OriginalSkin.jpg",
  "340px-Ahri_DynastySkin.jpg",
  "340px-Ahri_MidnightSkin.jpg",
  "340px-Ahri_FoxfireSkin.jpg",
  "340px-Ahri_PopstarSkin.jpg",
  "340px-Ahri_AcademySkin.jpg",
  "340px-Ahri_ArcadeSkin.jpg",
  "340px-Ahri_StarGuardianSkin.jpg",
  "340px-Ahri_KDASkin.jpg",
  "340px-Ahri_ElderwoodSkin.jpg",
  "340px-Ahri_SpiritBlossomSkin.jpg",
  "340px-Ahri_KDAALLOUTSkin.jpg",
  "340px-Ahri_CovenSkin.jpg",
  "340px-Ahri_ArcanaSkin.jpg",
  "340px-Ahri_SnowMoonSkin.jpg",
  "340px-Ahri_SpiritBlossomSpringsSkin.jpg",
];

const CARD_COUNT = imageFiles.length;
const CARD_ANGLE_STEP = Math.PI / 3;
const CARD_ANGLE_OFFSET = 0.35;
const CARD_ASPECT_RATIO = 340 / 201;
const CARD_HEIGHT = 1.84;
const CARD_WIDTH = CARD_HEIGHT * CARD_ASPECT_RATIO;
const CARD_RADIUS = 3.2;
const HELIX_HEIGHT = 18.4;
const HELIX_TURNS = ((CARD_COUNT - 1) * CARD_ANGLE_STEP) / (Math.PI * 2);
const PARTICLE_HELIX_RADIUS = 24;
const PARTICLE_HELIX_HEIGHT = HELIX_HEIGHT;
const PARTICLE_HELIX_TURNS = HELIX_TURNS * 1.34;

window.helixDebug = {
  cardCount: CARD_COUNT,
  activeCardIndex,
  scrollProgress,
};

const palette = [
  new THREE.Color("#e8547a"),
  new THREE.Color("#f5c842"),
  new THREE.Color("#a855c8"),
];

const particleRingColors = [
  new THREE.Color("#e8547a"),
  new THREE.Color("#f5c842"),
  new THREE.Color("#a855c8"),
  new THREE.Color("#ff6eb4"),
  new THREE.Color("#f7f8ff"),
];

const cardMeshes = [];
const floaters = [];
const particleMaterials = [];
let hoveredCardIndex = -1;
let hoverGlowLight = null;
const raycaster = new THREE.Raycaster();
const pointerVec = new THREE.Vector2();

const keyLight = new THREE.DirectionalLight(0xfff0f6, 2.0);
keyLight.position.set(5, 6, 4);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xc8a0ff, 0.52);
fillLight.position.set(-4, -2, 3);
scene.add(fillLight);

const innerGlow = new THREE.PointLight(0xe8547a, 0.5, 8);
innerGlow.position.set(0, 0, 0);
scene.add(innerGlow);

scene.add(new THREE.AmbientLight(0xd4a0ff, 0.14));

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

  const image = new Image();
  image.onload = () => {
    drawPanel(ctx, width, height, image, index, { ...options, fileName });
    texture.needsUpdate = true;
  };
  image.src = `./assets/${encodeURIComponent(fileName)}`;

  return texture;
}

function drawPanel(ctx, width, height, image, index, options) {
  const radius = options.radius ?? 58;
  const inset = 34;
  const panelWidth = width - inset * 2;
  const panelHeight = height - inset * 2;
  ctx.clearRect(0, 0, width, height);

  ctx.save();
  roundedPath(ctx, inset, inset, panelWidth, panelHeight, radius);
  ctx.fillStyle = "rgba(13, 6, 20, 0.92)";
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundedPath(ctx, inset, inset, panelWidth, panelHeight, radius);
  ctx.clip();

  if (image) {
    ctx.save();
    ctx.globalAlpha = 0.96;
    ctx.filter = "saturate(0.95) contrast(1.02) brightness(0.9)";
    drawImageCover(ctx, image, inset, inset, panelWidth, panelHeight);
    ctx.restore();
  } else {
    ctx.save();
    const wash = ctx.createLinearGradient(0, 0, width, height);
    wash.addColorStop(0, "#1a0d28");
    wash.addColorStop(0.44, "#1a1030");
    wash.addColorStop(1, "#0d0620");
    ctx.fillStyle = wash;
    ctx.fillRect(inset, inset, panelWidth, panelHeight);
    ctx.restore();
  }

  ctx.globalCompositeOperation = "source-atop";
  const tint = ctx.createLinearGradient(inset, inset, width - inset, height - inset);
  tint.addColorStop(0, "rgba(40, 18, 50, 0.22)");
  tint.addColorStop(0.42, "rgba(80, 30, 100, 0.24)");
  tint.addColorStop(0.72, "rgba(140, 30, 70, 0.22)");
  tint.addColorStop(1, "rgba(100, 20, 50, 0.18)");
  ctx.fillStyle = tint;
  ctx.fillRect(inset, inset, panelWidth, panelHeight);

  const vignette = ctx.createRadialGradient(
    width * 0.5, height * 0.5, 20,
    width * 0.5, height * 0.5, width * 0.72,
  );
  vignette.addColorStop(0, "rgba(220, 200, 255, 0.1)");
  vignette.addColorStop(0.5, "rgba(15, 8, 28, 0.04)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.5)");
  ctx.fillStyle = vignette;
  ctx.fillRect(inset, inset, panelWidth, panelHeight);

  const gloss = ctx.createLinearGradient(width * 0.1, height * 0.08, width * 0.92, height * 0.82);
  gloss.addColorStop(0, "rgba(255, 240, 255, 0.1)");
  gloss.addColorStop(0.34, "rgba(220, 190, 255, 0.18)");
  gloss.addColorStop(0.5, "rgba(255, 255, 255, 0.04)");
  gloss.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = gloss;
  ctx.fillRect(inset, inset, panelWidth, panelHeight);

  const stripH = panelHeight * 0.32;
  const strip = ctx.createLinearGradient(0, inset + panelHeight - stripH, 0, inset + panelHeight);
  strip.addColorStop(0, "rgba(13, 6, 20, 0)");
  strip.addColorStop(0.48, "rgba(13, 6, 20, 0.74)");
  strip.addColorStop(1, "rgba(13, 6, 20, 0.92)");
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
    ? "rgba(232, 84, 122, 0.68)"
    : "rgba(168, 85, 200, 0.62)";
  ctx.lineWidth = 6;
  ctx.stroke();

  roundedPath(ctx, inset - 4, inset - 4, panelWidth + 8, panelHeight + 8, radius + 4);
  ctx.strokeStyle = "rgba(13, 6, 20, 0.72)";
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.restore();
}

function drawCardTitle(ctx, width, height, index, fileName = "") {
  const title = getCardTitle(fileName, index);
  const lines = splitTitleLines(title);
  const mainSize = lines.length > 1 ? 54 : 66;
  const lineHeight = mainSize * 1.02;

  const inset = 34;
  const panelHeight = height - inset * 2;
  const stripBottom = inset + panelHeight - 22;
  const textBlock = lines.length * lineHeight;
  const startY = stripBottom - textBlock - 10;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.font = `500 ${mainSize}px Consolas, 'Liberation Mono', monospace`;
  ctx.shadowColor = "rgba(232, 84, 122, 0.82)";
  ctx.shadowBlur = 14;
  ctx.strokeStyle = "rgba(13, 6, 20, 0.9)";
  ctx.lineWidth = 5;
  ctx.fillStyle = "rgba(247, 248, 255, 0.96)";

  lines.forEach((line, lineIndex) => {
    const y = startY + lineIndex * lineHeight;
    ctx.strokeText(line, width / 2, y);
    ctx.fillText(line, width / 2, y);
  });

  ctx.font = "500 24px Consolas, 'Liberation Mono', monospace";
  ctx.shadowColor = "rgba(168, 85, 200, 0.9)";
  ctx.shadowBlur = 10;
  ctx.fillStyle = "rgba(168, 85, 200, 0.9)";
  ctx.fillText("AHRI", width / 2, startY - 34);

  const indexLabel =
    String(index + 1).padStart(2, "0") + " / " + String(CARD_COUNT).padStart(2, "0");
  ctx.font = "400 19px Consolas, 'Liberation Mono', monospace";
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(245, 200, 66, 0.52)";
  ctx.textAlign = "right";
  ctx.fillText(indexLabel, width - inset - 18, inset + 26);

  ctx.restore();
}

function getCardTitle(fileName, index) {
  const fallback = `Skin ${String(index + 1).padStart(2, "0")}`;
  const match = fileName.match(/Ahri_(.+?)Skin/i);
  if (!match) return fallback.toUpperCase();

  return match[1]
    .replace(/KDAALLOUT/g, "KDA ALL OUT")
    .replace(/KDA/g, "KDA")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .toUpperCase();
}

function splitTitleLines(title) {
  const words = title.split(" ");
  if (title.length <= 12 || words.length === 1) return [title];

  const lines = [];
  let current = "";
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > 13 && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });

  if (current) lines.push(current);
  return lines.slice(0, 2);
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
  ctx.strokeStyle = "rgba(232, 84, 122, 0.9)";
  ctx.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    ctx.shadowColor = "#e8547a";
    ctx.shadowBlur = 8 + i * 14;
    roundedPath(ctx, 18, 18, w - 36, h - 36, 24);
    ctx.stroke();
  }
  sharedGlowTexture = new THREE.CanvasTexture(c);
  sharedGlowTexture.colorSpace = THREE.SRGBColorSpace;
  return sharedGlowTexture;
}

function makeGlassPanel(fileName, index, config) {
  const texture = makePanelTexture(fileName, index, {
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
    color: 0xa855c8,
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
        color: 0xe8547a,
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
        color: 0xa855c8,
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
        color: 0xe8547a,
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
        color: 0xa855c8,
        transparent: true,
        opacity: 0.07,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    ),
  );

  hoverGlowLight = new THREE.PointLight(0xe8547a, 0, 5);
  hoverGlowLight.position.set(0, 0, -0.8);
  galleryRoot.add(hoverGlowLight);
}

function particleSizeScale(size) {
  const h = renderer.getSize(new THREE.Vector2()).height * renderer.getPixelRatio();
  const projY = 1.0 / Math.tan((camera.fov * Math.PI) / 360);
  return size * projY * h * 0.5;
}

function addParticleSet(name, count, createPoint, size, opacity) {
  const basePos = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const phases = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const point = createPoint(i, count);
    const color = (
      point.color ?? palette[Math.floor(Math.random() * palette.length)]
    ).clone();
    color.lerp(new THREE.Color(0xffffff), 0.18 + Math.random() * 0.16);
    color.multiplyScalar(1.65);

    basePos[i * 3] = point.x;
    basePos[i * 3 + 1] = point.y;
    basePos[i * 3 + 2] = point.z;
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
    phases[i] = Math.random() * Math.PI * 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(basePos.slice(), 3));
  geometry.setAttribute("aBasePos", new THREE.BufferAttribute(basePos, 3));
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));

  const material = new THREE.ShaderMaterial({
    vertexShader: PARTICLE_VERT,
    fragmentShader: PARTICLE_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uSizeScale: { value: particleSizeScale(size) },
      uOpacity: { value: opacity },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  material.userData.baseSize = size;
  particleMaterials.push(material);

  const points = new THREE.Points(geometry, material);
  points.name = name;
  particleRoot.add(points);
  return points;
}

function buildParticles() {
  addParticleSet(
    "outerHelix",
    window.innerWidth < 700 ? 6200 : 11800,
    (i, count) => {
      const t = i / Math.max(1, count - 1);
      const turnOffset = (i % 17) / 17;
      const angle = t * Math.PI * 2 * PARTICLE_HELIX_TURNS + turnOffset * 0.34;
      const radius = PARTICLE_HELIX_RADIUS + THREE.MathUtils.randFloatSpread(1.4);
      const y = THREE.MathUtils.lerp(
        PARTICLE_HELIX_HEIGHT / 2,
        -PARTICLE_HELIX_HEIGHT / 2,
        t,
      );
      const ringIndex =
        Math.floor(t * PARTICLE_HELIX_TURNS) % particleRingColors.length;
      return {
        x: Math.cos(angle) * radius + THREE.MathUtils.randFloatSpread(0.34),
        y: y + THREE.MathUtils.randFloatSpread(0.62),
        z: Math.sin(angle) * radius + THREE.MathUtils.randFloatSpread(0.34),
        color: particleRingColors[ringIndex],
      };
    },
    0.12,
    0.95,
  );

  addParticleSet(
    "innerDust",
    window.innerWidth < 700 ? 160 : 320,
    () => {
      const angle = Math.random() * Math.PI * 2;
      const radius = 1.2 + Math.random() * 2.6;
      const y = THREE.MathUtils.lerp(
        HELIX_HEIGHT / 2,
        -HELIX_HEIGHT / 2,
        Math.random(),
      );
      return {
        x: Math.cos(angle) * radius + THREE.MathUtils.randFloatSpread(0.4),
        y,
        z: Math.sin(angle) * radius + THREE.MathUtils.randFloatSpread(0.4),
        color: palette[Math.floor(Math.random() * palette.length)],
      };
    },
    0.07,
    0.52,
  );
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

function buildSkinList() {
  if (!skinListEl) return;
  const showCount = Math.min(7, imageFiles.length);
  imageFiles.slice(0, showCount).forEach((fileName, i) => {
    const raw = getCardTitle(fileName, i);
    const displayName = raw
      .split(" ")
      .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
      .join(" ");
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = "#";
    a.textContent = displayName;
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const scrollMax = getScrollMax();
      window.scrollTo({ top: (i / (CARD_COUNT - 1)) * scrollMax, behavior: "smooth" });
    });
    li.appendChild(a);
    skinListEl.appendChild(li);
  });
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

  particleMaterials.forEach((mat) => {
    mat.uniforms.uSizeScale.value = particleSizeScale(mat.userData.baseSize);
  });
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
  particleRoot.position.y = galleryRoot.position.y;
}

function animate(timestamp = 0) {
  requestAnimationFrame(animate);
  if (timestamp - lastFrameTime < FRAME_BUDGET_MS - 1) return;
  lastFrameTime = timestamp;

  const elapsed = clock.getElapsedTime();
  updateScrollState();

  const motionTime = animationPaused ? 0 : elapsed;
  particleMaterials.forEach((mat) => { mat.uniforms.uTime.value = motionTime; });
  const targetRotation = scrollRotation + pointerX * 0.035;

  root.rotation.y = pointerX * 0.035;
  root.rotation.x = pointerY * -0.035;
  root.position.y = THREE.MathUtils.lerp(root.position.y, 0, 0.05);
  galleryRoot.rotation.y = THREE.MathUtils.lerp(
    galleryRoot.rotation.y,
    targetRotation,
    0.08,
  );
  updateFocusedCardTarget();
  currentGalleryY = THREE.MathUtils.lerp(currentGalleryY, targetGalleryY, 0.075);
  galleryRoot.position.y = currentGalleryY;
  particleRoot.rotation.y = galleryRoot.rotation.y;
  particleRoot.position.y = galleryRoot.position.y;
  camera.position.x = THREE.MathUtils.lerp(camera.position.x, 0.35 + pointerX * 0.24, 0.05);
  camera.position.y = THREE.MathUtils.lerp(camera.position.y, 0.15 + pointerY * 0.16, 0.05);
  camera.lookAt(0, 0, 0);

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
    mesh.material.opacity = 0.72 + focusWeight * 0.25;
    mesh.renderOrder = getCardRenderOrder(base, galleryRoot.rotation.y);

    if (mesh.userData.glowMesh) {
      mesh.userData.glowMesh.material.opacity = THREE.MathUtils.lerp(
        mesh.userData.glowMesh.material.opacity,
        hw * 0.85,
        0.1,
      );
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
      pointerVec.set(
        (event.clientX / window.innerWidth) * 2 - 1,
        -(event.clientY / window.innerHeight) * 2 + 1,
      );
      raycaster.setFromCamera(pointerVec, camera);
      const hits = raycaster.intersectObjects(cardMeshes, false);
      hoveredCardIndex = hits.length > 0 ? hits[0].object.userData.index : -1;
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
    musicKicker.textContent = isPlaying ? "Now playing" : "Tap to play";
  }
  musicPanel?.classList.toggle("is-playing", isPlaying);
}

function startMusic() {
  if (!musicAudio) return;

  musicRequested = true;
  musicPanel?.classList.remove("needs-interaction");
  musicAudio.volume = 0.72;
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

buildPanels();
buildSpine();
buildParticles();
buildDots();
buildSkinList();
resize();
requestAnimationFrame(animate);

window.addEventListener("resize", resize);
window.addEventListener("scroll", updateScrollState, { passive: true });
document.addEventListener("scroll", updateScrollState, { passive: true });
window.setInterval(updateScrollState, 120);
window.addEventListener("pointermove", handlePointerMove, { passive: false });
canvas.addEventListener("pointerdown", handlePointerDown);
canvas.addEventListener("pointerup", handlePointerUp);
canvas.addEventListener("pointercancel", handlePointerUp);

musicToggle?.addEventListener("click", () => {
  if (musicRequested && !musicAudio?.paused) {
    pauseMusic();
  } else {
    startMusic();
  }
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
