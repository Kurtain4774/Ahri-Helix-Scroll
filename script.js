import * as THREE from "three";

const canvas = document.querySelector("#helix-canvas");
const progressLabel = document.querySelector(".progress-label");
const heroCopy = document.querySelector(".hero-copy");

const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
});

renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
camera.position.set(0, 0, 10.25);

const helixGroup = new THREE.Group();
scene.add(helixGroup);

const cardImages = [
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

const CARD_COUNT = cardImages.length;
const CARD_ANGLE_STEP = Math.PI / 3;
const CARD_ANGLE_OFFSET = 0.35;
const CARD_ASPECT_RATIO = 340 / 201;
const CARD_HEIGHT = 1.28;
const CARD_WIDTH = CARD_HEIGHT * CARD_ASPECT_RATIO;
const HELIX_HEIGHT = 16.8;
const HELIX_TURNS = ((CARD_COUNT - 1) * CARD_ANGLE_STEP) / (Math.PI * 2);

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let animationPaused = reduceMotion.matches;
let scrollRotation = 0;
let dragOffset = 0;
let dragStartX = 0;
let dragStartOffset = 0;
let scrollProgress = 0;
let activeCardIndex = 0;
let targetGroupY = 0;
let currentGroupY = 0;
let responsiveYOffset = 0;
let lastScrollTop = -1;
let isDragging = false;
let lastTime = 0;
const cardMeshes = [];

function makeImageCardTexture(fileName, index) {
  const textureHeight = 512;
  const textureWidth = Math.round(textureHeight * CARD_ASPECT_RATIO);
  const canvasTexture = document.createElement("canvas");
  canvasTexture.width = textureWidth;
  canvasTexture.height = textureHeight;
  const ctx = canvasTexture.getContext("2d");
  const radius = 42;
  const inset = 14;
  const w = textureWidth - inset * 2;
  const h = textureHeight - inset * 2;

  const texture = new THREE.CanvasTexture(canvasTexture);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

  drawCardSurface(ctx, textureWidth, textureHeight, inset, w, h, radius, null, index);

  const image = new Image();
  image.onload = () => {
    drawCardSurface(ctx, textureWidth, textureHeight, inset, w, h, radius, image, index);
    texture.needsUpdate = true;
  };
  image.src = `./assets/${encodeURIComponent(fileName)}`;

  return texture;
}

function drawCardSurface(ctx, textureWidth, textureHeight, inset, w, h, radius, image, index) {
  ctx.clearRect(0, 0, textureWidth, textureHeight);
  ctx.shadowColor = "rgba(17, 19, 24, 0.26)";
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 16;

  roundRect(ctx, inset, inset, w, h, radius);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.shadowColor = "transparent";

  ctx.save();
  roundRect(ctx, inset, inset, w, h, radius);
  ctx.clip();

  if (image) {
    drawImageCover(ctx, image, inset, inset, w, h);
  } else {
    const placeholder = ctx.createLinearGradient(0, 0, textureWidth, textureHeight);
    placeholder.addColorStop(0, "#d9fff2");
    placeholder.addColorStop(0.55, "#7aa2ff");
    placeholder.addColorStop(1, "#f9cbff");
    ctx.fillStyle = placeholder;
    ctx.fillRect(inset, inset, w, h);
  }
  ctx.restore();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
  ctx.lineWidth = 5;
  roundRect(ctx, inset + 4, inset + 4, w - 8, h - 8, radius - 4);
  ctx.stroke();

  const badgeX = inset + 24;
  const badgeY = inset + 20;
  const badgeW = 88;
  const badgeH = 54;
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 18);
  ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
  ctx.font = "800 36px Inter, Arial, sans-serif";
  ctx.fillText(String(index + 1).padStart(2, "0"), badgeX + 18, badgeY + 38);
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

function roundRect(ctx, x, y, width, height, radius) {
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

function makeLine(points, color, opacity = 1, width = 1) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    linewidth: width,
  });
  return new THREE.Line(geometry, material);
}

function buildHelix() {
  const spineMaterial = new THREE.MeshBasicMaterial({ color: 0xf5f7fb });
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, HELIX_HEIGHT, 36), spineMaterial);
  helixGroup.add(spine);

  const railA = [];
  const railB = [];
  const radius = 0.58;

  for (let i = 0; i <= 560; i += 1) {
    const progress = i / 560;
    const angle = progress * Math.PI * 2 * HELIX_TURNS;
    const y = THREE.MathUtils.lerp(-HELIX_HEIGHT / 2, HELIX_HEIGHT / 2, progress);
    railA.push(new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius));
    railB.push(new THREE.Vector3(Math.cos(angle + Math.PI) * radius, y, Math.sin(angle + Math.PI) * radius));
  }

  helixGroup.add(makeLine(railA, 0x7df2d0, 0.62));
  helixGroup.add(makeLine(railB, 0xff6fb7, 0.32));

  const cardGeometry = new THREE.PlaneGeometry(CARD_WIDTH, CARD_HEIGHT);
  const cardRadius = 1.72;
  const count = cardImages.length;

  cardImages.forEach((fileName, index) => {
    const progress = index / (count - 1);
    const y = THREE.MathUtils.lerp(HELIX_HEIGHT / 2 - 0.75, -HELIX_HEIGHT / 2 + 0.75, progress);
    const angle = CARD_ANGLE_OFFSET - index * CARD_ANGLE_STEP;
    const x = Math.cos(angle) * cardRadius;
    const z = Math.sin(angle) * cardRadius;
    const texture = makeImageCardTexture(fileName, index);

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const card = new THREE.Mesh(cardGeometry, material);
    card.position.set(x, y, z);
    card.rotation.y = 0;
    card.rotation.z = 0;
    card.userData.home = card.position.clone();
    card.userData.angle = angle;
    card.userData.floatPhase = index * 0.65;
    card.userData.index = index;
    cardMeshes.push(card);
    helixGroup.add(card);
  });
}

function addLightRings() {
  const ringMaterial = new THREE.LineBasicMaterial({
    color: 0x7df2d0,
    transparent: true,
    opacity: 0.18,
  });
  const ringGeometry = new THREE.BufferGeometry();
  const ringPoints = [];

  for (let i = 0; i <= 140; i += 1) {
    const angle = (i / 140) * Math.PI * 2;
    ringPoints.push(new THREE.Vector3(Math.cos(angle) * 2.28, 0, Math.sin(angle) * 2.28));
  }

  ringGeometry.setFromPoints(ringPoints);

  [-7.2, -4.8, -2.4, 0, 2.4, 4.8, 7.2].forEach((y) => {
    const ring = new THREE.Line(ringGeometry, ringMaterial);
    ring.position.y = y;
    ring.rotation.x = Math.PI / 2;
    helixGroup.add(ring);
  });
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;

  if (width < 600) {
    camera.position.z = 13.2;
    helixGroup.scale.setScalar(0.82);
    responsiveYOffset = 0;
  } else if (width < 980) {
    camera.position.z = 12.4;
    helixGroup.scale.setScalar(0.92);
    responsiveYOffset = 0;
  } else {
    camera.position.z = 11.85;
    helixGroup.scale.setScalar(1);
    responsiveYOffset = 0;
  }

  camera.updateProjectionMatrix();
  lastScrollTop = -1;
  updateScrollState();
  helixGroup.rotation.y = scrollRotation + dragOffset;
  updateFocusedCardTarget();
  currentGroupY = targetGroupY;
  helixGroup.position.x = 0;
  helixGroup.position.y = currentGroupY;
}

function updateScrollState() {
  const scrollingElement = document.scrollingElement || document.documentElement;
  const scrollTop = scrollingElement.scrollTop;
  const scrollMax = Math.max(scrollingElement.scrollHeight - scrollingElement.clientHeight, 1);

  if (scrollTop === lastScrollTop) return;

  lastScrollTop = scrollTop;
  scrollProgress = THREE.MathUtils.clamp(scrollTop / scrollMax, 0, 1);
  activeCardIndex = Math.round(scrollProgress * (cardImages.length - 1));
  scrollRotation = getCardFocusRotation(activeCardIndex);
  updateFocusedCardTarget();
  updateHeroCopyPosition(scrollTop);

  updateProgressLabel();
}

function updateHeroCopyPosition(scrollTop) {
  if (!heroCopy) return;

  heroCopy.style.setProperty("--hero-copy-y", `${-scrollTop}px`);
}

function getCardFocusRotation(index) {
  const cardAngle = CARD_ANGLE_OFFSET - index * CARD_ANGLE_STEP;
  return cardAngle - Math.PI / 2;
}

function getInteractionFocusIndex() {
  const dragIndexOffset = dragOffset / CARD_ANGLE_STEP;
  return THREE.MathUtils.clamp(activeCardIndex - dragIndexOffset, 0, cardImages.length - 1);
}

function getCardYAtIndex(index) {
  const progress = index / (cardImages.length - 1);
  return THREE.MathUtils.lerp(HELIX_HEIGHT / 2 - 0.75, -HELIX_HEIGHT / 2 + 0.75, progress);
}

function updateFocusedCardTarget() {
  const scale = helixGroup.scale.x;
  const focusY = getCardYAtIndex(getInteractionFocusIndex());

  targetGroupY = -focusY * scale + responsiveYOffset;
}

function updateProgressLabel() {
  if (!progressLabel) return;

  const displayIndex = Math.round(getInteractionFocusIndex());
  progressLabel.textContent = String(displayIndex + 1).padStart(2, "0");
}

function animate(time = 0) {
  lastTime = time;
  updateScrollState();

  const targetRotation = scrollRotation + dragOffset;
  helixGroup.rotation.y = THREE.MathUtils.lerp(helixGroup.rotation.y, targetRotation, 0.08);
  updateFocusedCardTarget();
  updateProgressLabel();

  currentGroupY = THREE.MathUtils.lerp(currentGroupY, targetGroupY, 0.075);
  helixGroup.position.x = 0;
  helixGroup.position.y = currentGroupY;
  helixGroup.rotation.x = 0;

  helixGroup.children.forEach((child) => {
    if (!child.userData.home) return;
    const floatAmount = animationPaused
      ? 0
      : Math.sin(time * 0.001 + child.userData.floatPhase) * 0.035;
    const flatRotation = -helixGroup.rotation.y;

    child.position.y = child.userData.home.y + floatAmount;
    child.rotation.y = flatRotation;
    child.rotation.z = 0;
    child.renderOrder = getCardRenderOrder(child.userData.home, helixGroup.rotation.y);
  });

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function getCardRenderOrder(home, rotationY) {
  const depth = -home.x * Math.sin(rotationY) + home.z * Math.cos(rotationY);
  return Math.round((depth + 10) * 1000);
}

function setMotionState(paused) {
  animationPaused = paused;
}

function handlePointerDown(event) {
  isDragging = true;
  dragStartX = event.clientX;
  dragStartOffset = dragOffset;
  canvas.setPointerCapture(event.pointerId);
}

function handlePointerMove(event) {
  if (!isDragging) return;
  const distance = event.clientX - dragStartX;
  dragOffset = dragStartOffset + distance * 0.008;
  updateFocusedCardTarget();
  updateProgressLabel();
}

function handlePointerUp(event) {
  isDragging = false;
  canvas.releasePointerCapture(event.pointerId);
}

buildHelix();
addLightRings();
resize();
requestAnimationFrame(animate);

window.addEventListener("resize", resize);
window.addEventListener("scroll", updateScrollState, { passive: true });
document.addEventListener("scroll", updateScrollState, { passive: true });
canvas.addEventListener("pointerdown", handlePointerDown);
canvas.addEventListener("pointermove", handlePointerMove);
canvas.addEventListener("pointerup", handlePointerUp);
canvas.addEventListener("pointercancel", handlePointerUp);
window.setInterval(updateScrollState, 120);

reduceMotion.addEventListener("change", (event) => setMotionState(event.matches));
