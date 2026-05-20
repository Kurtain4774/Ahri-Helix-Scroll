import * as THREE from "three";

const canvas = document.querySelector("#helix-canvas");
const caption = document.querySelector(".scene-caption");
const musicPanel = document.querySelector(".music-panel");
const musicAudio = document.querySelector("#legends-player");
const musicToggle = document.querySelector(".music-toggle");
const musicKicker = document.querySelector(".music-kicker");

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x060c14, 0.034);

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
renderer.toneMappingExposure = 1.2;

{
  const envCanvas = document.createElement("canvas");
  envCanvas.width = 256;
  envCanvas.height = 128;
  const envCtx = envCanvas.getContext("2d");
  const envGrad = envCtx.createLinearGradient(0, 0, 0, 128);
  envGrad.addColorStop(0, "#0a1428");
  envGrad.addColorStop(0.35, "#2f8cff");
  envGrad.addColorStop(0.6, "#c9365a");
  envGrad.addColorStop(1, "#050810");
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

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 80);
camera.position.set(0.35, 0.15, 10.5);

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
  new THREE.Color("#2F8CFF"),
  new THREE.Color("#C9365A"),
  new THREE.Color("#E9EDF7"),
];

const particleRingColors = [
  new THREE.Color("#2F8CFF"),
  new THREE.Color("#FF3C7D"),
  new THREE.Color("#FFD25A"),
  new THREE.Color("#7DF7FF"),
  new THREE.Color("#E9EDF7"),
];

const cardMeshes = [];
const floaters = [];
let hoveredCardIndex = -1;
let hoverGlowLight = null;
const raycaster = new THREE.Raycaster();
const pointerVec = new THREE.Vector2();

const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
keyLight.position.set(5, 6, 4);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x9fb8ff, 0.5);
fillLight.position.set(-4, -2, 3);
scene.add(fillLight);

const innerGlow = new THREE.PointLight(0xffffff, 0.6, 8);
innerGlow.position.set(0, 0, 0);
scene.add(innerGlow);

scene.add(new THREE.AmbientLight(0xb3d6ff, 0.15));

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
  ctx.shadowColor = "rgba(200, 220, 255, 0.22)";
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 8;
  roundedPath(ctx, inset, inset, panelWidth, panelHeight, radius);
  ctx.fillStyle = "rgba(8, 15, 35, 0.90)";
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundedPath(ctx, inset, inset, panelWidth, panelHeight, radius);
  ctx.clip();

  if (image) {
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.filter = "saturate(0.92) contrast(1) brightness(0.94)";
    drawImageCover(ctx, image, inset, inset, panelWidth, panelHeight);
    ctx.restore();
  } else {
    ctx.save();
    ctx.globalAlpha = 1.0;
    const wash = ctx.createLinearGradient(0, 0, width, height);
    wash.addColorStop(0, "#1a1b22");
    wash.addColorStop(0.44, "#131a2e");
    wash.addColorStop(1, "#0d1220");
    ctx.fillStyle = wash;
    ctx.fillRect(inset, inset, panelWidth, panelHeight);
    ctx.restore();
  }

  ctx.globalCompositeOperation = "source-atop";
  const tint = ctx.createLinearGradient(
    inset,
    inset,
    width - inset,
    height - inset,
  );
  tint.addColorStop(0, "rgba(42, 34, 40, 0.26)");
  tint.addColorStop(0.42, "rgba(47, 100, 180, 0.3)");
  tint.addColorStop(0.72, "rgba(30, 80, 160, 0.28)");
  tint.addColorStop(1, "rgba(151, 113, 78, 0.18)");
  ctx.fillStyle = tint;
  ctx.fillRect(inset, inset, panelWidth, panelHeight);

  const vignette = ctx.createRadialGradient(
    width * 0.56,
    height * 0.48,
    20,
    width * 0.5,
    height * 0.5,
    width * 0.74,
  );
  vignette.addColorStop(0, "rgba(200, 220, 255, 0.14)");
  vignette.addColorStop(0.55, "rgba(20, 40, 80, 0.05)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.42)");
  ctx.fillStyle = vignette;
  ctx.fillRect(inset, inset, panelWidth, panelHeight);

  const gloss = ctx.createLinearGradient(
    width * 0.1,
    height * 0.08,
    width * 0.92,
    height * 0.82,
  );
  gloss.addColorStop(0, "rgba(255, 255, 255, 0.12)");
  gloss.addColorStop(0.34, "rgba(220, 240, 255, 0.22)");
  gloss.addColorStop(0.5, "rgba(255, 255, 255, 0.06)");
  gloss.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = gloss;
  ctx.fillRect(inset, inset, panelWidth, panelHeight);

  drawCardGrain(ctx, inset, inset, panelWidth, panelHeight, index);
  drawCardTitle(ctx, width, height, index, options.fileName);
  ctx.restore();

  ctx.save();
  roundedPath(ctx, inset, inset, panelWidth, panelHeight, radius);
  ctx.strokeStyle = "rgba(190, 215, 255, 0.55)";
  ctx.lineWidth = 15;
  ctx.stroke();

  roundedPath(
    ctx,
    inset + 9,
    inset + 9,
    panelWidth - 18,
    panelHeight - 18,
    radius - 10,
  );
  ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
  ctx.lineWidth = 2;
  ctx.stroke();

  roundedPath(
    ctx,
    inset - 4,
    inset - 4,
    panelWidth + 8,
    panelHeight + 8,
    radius + 4,
  );
  ctx.strokeStyle = "rgba(3, 8, 8, 0.64)";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.restore();
}

function drawCardTitle(ctx, width, height, index, fileName = "") {
  const title = getCardTitle(fileName, index);
  const lines = splitTitleLines(title);
  const mainSize = lines.length > 1 ? 64 : 76;
  const lineHeight = mainSize * 0.98;
  const startY = height * 0.53 - ((lines.length - 1) * lineHeight) / 2;

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(47, 140, 255, 0.78)";
  ctx.shadowBlur = 12;
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(20, 50, 100, 0.82)";
  ctx.fillStyle = "rgba(252, 255, 238, 0.98)";

  ctx.font = "600 34px Georgia, 'Times New Roman', serif";
  ctx.fillText("Ahri", width / 2, height * 0.38);

  ctx.font = `500 ${mainSize}px Consolas, 'Liberation Mono', monospace`;
  lines.forEach((line, lineIndex) => {
    const y = startY + lineIndex * lineHeight;
    ctx.strokeText(line, width / 2, y);
    ctx.fillText(line, width / 2, y);
  });

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
  let value = (seed + 1) * 9301 + 49297;
  ctx.save();
  ctx.globalAlpha = 0.16;
  for (let i = 0; i < 950; i += 1) {
    value = (value * 233 + 17) % 9973;
    const px = x + (value / 9973) * width;
    value = (value * 233 + 17) % 9973;
    const py = y + (value / 9973) * height;
    value = (value * 233 + 17) % 9973;
    const shade = 160 + Math.floor((value / 9973) * 95);
    ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
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

  ctx.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height,
  );
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
  ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
  ctx.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    ctx.shadowColor = "#ffffff";
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
      x,
      y,
      z,
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
    color: 0xffffff,
    metalness: 0.3,
    roughness: 0.05,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    iridescence: 0.8,
    iridescenceIOR: 1.5,
    envMapIntensity: 1.5,
  });

  const rimMaterial = new THREE.MeshBasicMaterial({
    color: 0x2f8cff,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
  });

  const vertebraGeometry = new THREE.TorusKnotGeometry(0.38, 0.16, 48, 6, 2, 3);
  const haloGeometry = new THREE.TorusGeometry(0.62, 0.014, 8, 80);

  const vertebraCount = 23;
  for (let i = 0; i < vertebraCount; i += 1) {
    const progress = i / Math.max(1, vertebraCount - 1);
    const y = THREE.MathUtils.lerp(
      HELIX_HEIGHT / 2,
      -HELIX_HEIGHT / 2,
      progress,
    );
    const vertebra = new THREE.Mesh(vertebraGeometry, coreMaterial);
    vertebra.position.set(0.08 * Math.sin(i * 0.9), y, -0.18);
    vertebra.rotation.set(i * 0.22, i * 0.56, Math.PI * 0.48 + i * 0.18);
    vertebra.scale.set(0.82 + Math.sin(i) * 0.1, 0.46, 0.92);
    vertebra.userData.phase = i * 0.4;
    spineRoot.add(vertebra);
    floaters.push(vertebra);

    if (i % 2 === 0) {
      const halo = new THREE.Mesh(haloGeometry, rimMaterial);
      halo.position.set(0, y + 0.05, -0.14);
      halo.rotation.set(Math.PI / 2, i * 0.22, 0);
      halo.scale.set(1.08, 0.74, 1);
      spineRoot.add(halo);
    }
  }

  const railGeometryA = new THREE.BufferGeometry();
  const railGeometryB = new THREE.BufferGeometry();
  const railA = [];
  const railB = [];
  const railRadius = 0.74;
  for (let i = 0; i <= 640; i += 1) {
    const progress = i / 640;
    const angle = progress * Math.PI * 2 * HELIX_TURNS;
    const y = THREE.MathUtils.lerp(
      HELIX_HEIGHT / 2,
      -HELIX_HEIGHT / 2,
      progress,
    );
    railA.push(
      new THREE.Vector3(
        Math.cos(angle) * railRadius,
        y,
        Math.sin(angle) * railRadius,
      ),
    );
    railB.push(
      new THREE.Vector3(
        Math.cos(angle + Math.PI) * railRadius,
        y,
        Math.sin(angle + Math.PI) * railRadius,
      ),
    );
  }
  railGeometryA.setFromPoints(railA);
  railGeometryB.setFromPoints(railB);
  spineRoot.add(
    new THREE.Line(
      railGeometryA,
      new THREE.LineBasicMaterial({
        color: 0x2f8cff,
        transparent: true,
        opacity: 0.46,
      }),
    ),
  );
  spineRoot.add(
    new THREE.Line(
      railGeometryB,
      new THREE.LineBasicMaterial({
        color: 0xc9365a,
        transparent: true,
        opacity: 0.32,
      }),
    ),
  );

  hoverGlowLight = new THREE.PointLight(0xffffff, 0, 5);
  hoverGlowLight.position.set(0, 0, -0.8);
  galleryRoot.add(hoverGlowLight);
}

function addParticleSet(name, count, createPoint, size, opacity) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const phases = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const point = createPoint(i, count);
    const color = (
      point.color ?? palette[Math.floor(Math.random() * palette.length)]
    ).clone();
    color.lerp(new THREE.Color(0xffffff), 0.18 + Math.random() * 0.16);
    color.multiplyScalar(1.65);

    positions[i * 3] = point.x;
    positions[i * 3 + 1] = point.y;
    positions[i * 3 + 2] = point.z;
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
    phases[i] = Math.random() * Math.PI * 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.userData.base = positions.slice();
  geometry.userData.phases = phases;

  const material = new THREE.PointsMaterial({
    size,
    transparent: true,
    opacity,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  });

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
      const radius =
        PARTICLE_HELIX_RADIUS + THREE.MathUtils.randFloatSpread(1.4);
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
  const scrollingElement =
    document.scrollingElement || document.documentElement;
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
  window.helixDebug.activeCardIndex = activeCardIndex;
  window.helixDebug.scrollProgress = scrollProgress;
  document.documentElement.dataset.activeCard = String(
    activeCardIndex + 1,
  ).padStart(2, "0");

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

function animate() {
  const elapsed = clock.getElapsedTime();
  updateScrollState();

  const motionTime = animationPaused ? 0 : elapsed;
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
  currentGalleryY = THREE.MathUtils.lerp(
    currentGalleryY,
    targetGalleryY,
    0.075,
  );
  galleryRoot.position.y = currentGalleryY;
  particleRoot.rotation.y = galleryRoot.rotation.y;
  particleRoot.position.y = galleryRoot.position.y;
  camera.position.x = THREE.MathUtils.lerp(
    camera.position.x,
    0.35 + pointerX * 0.24,
    0.05,
  );
  camera.position.y = THREE.MathUtils.lerp(
    camera.position.y,
    0.15 + pointerY * 0.16,
    0.05,
  );
  camera.lookAt(0, 0, 0);

  panelRoot.children.forEach((mesh) => {
    const { base, rotation, float, phase, parallax, index, angle } =
      mesh.userData;
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
    mesh.position.x +=
      Math.sin(motionTime * 0.8 + mesh.userData.phase) * 0.0008;
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

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function getScrollingElement() {
  return document.scrollingElement || document.documentElement;
}

function getScrollTop() {
  return getScrollingElement().scrollTop;
}

function getScrollMax() {
  const scrollingElement = getScrollingElement();
  return Math.max(
    scrollingElement.scrollHeight - scrollingElement.clientHeight,
    0,
  );
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

  window.scrollTo({
    top: nextScrollTop,
    behavior: "auto",
  });
}

function handlePointerMove(event) {
  pointerX = (event.clientX / window.innerWidth - 0.5) * 2;
  pointerY = (event.clientY / window.innerHeight - 0.5) * 2;

  if (isDragging) {
    scrollPageFromDrag(event);
  } else {
    pointerVec.set(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1,
    );
    raycaster.setFromCamera(pointerVec, camera);
    const hits = raycaster.intersectObjects(cardMeshes, false);
    hoveredCardIndex = hits.length > 0 ? hits[0].object.userData.index : -1;
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

  musicToggle.textContent = isPlaying ? "Pause" : "Play";
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

buildPanels();
buildSpine();
buildParticles();
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
