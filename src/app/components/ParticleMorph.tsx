'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------
const PARTICLE_COUNT_DESKTOP = 30000
const PARTICLE_COUNT_MOBILE = 12000
const MORPH_DURATION = 2.2
const HOLD_DURATION = 4.0
const BLOOM_STRENGTH = 0.9
const BLOOM_RADIUS = 0.5
const BLOOM_THRESHOLD = 0.2
const MOUSE_RADIUS_WORLD = 0.7
const MOUSE_STRENGTH_WORLD = 0.5
const BASE_PARTICLE_SIZE = 2.5

// ---------------------------------------------------------------------------
// EASING
// ---------------------------------------------------------------------------
function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

// ---------------------------------------------------------------------------
// NOISE
// ---------------------------------------------------------------------------
function hash2d(x: number, y: number) {
  let h = x * 374761393 + y * 668265263
  h = (h ^ (h >> 13)) * 1274126177
  return ((h ^ (h >> 16)) & 0x7fffffff) / 0x7fffffff
}

function noise2d(x: number, y: number) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const a = hash2d(ix, iy)
  const b = hash2d(ix + 1, iy)
  const c = hash2d(ix, iy + 1)
  const d = hash2d(ix + 1, iy + 1)
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}

// ---------------------------------------------------------------------------
// SHAPE GENERATORS
// ---------------------------------------------------------------------------

function generateLightbulb(count: number): Float32Array {
  const positions = new Float32Array(count * 3)
  const bulbCount = Math.floor(count * 0.55)
  const neckCount = Math.floor(count * 0.10)
  const screwCount = Math.floor(count * 0.25)
  const discCount = Math.floor(count * 0.05)
  const filamentCount = count - bulbCount - neckCount - screwCount - discCount
  let idx = 0

  // Glass bulb — ellipsoid, wider at top, tapers to neck
  for (let i = 0; i < bulbCount; i++) {
    const theta = Math.random() * Math.PI * 2
    const phi = Math.random() * Math.PI * 0.7 // upper ~70% of sphere
    const rx = 1.4
    const ry = 1.6
    const rz = 1.4
    const x = rx * Math.sin(phi) * Math.cos(theta)
    const y = ry * Math.cos(phi) + 0.5 // center bulb above origin
    const z = rz * Math.sin(phi) * Math.sin(theta) * 0.65
    positions[idx++] = x + (Math.random() - 0.5) * 0.03
    positions[idx++] = y + (Math.random() - 0.5) * 0.03
    positions[idx++] = z + (Math.random() - 0.5) * 0.03
  }

  // Neck taper — cone from bulb bottom to screw top
  for (let i = 0; i < neckCount; i++) {
    const t = i / neckCount
    const y = -0.2 - t * 0.4 // y from -0.2 to -0.6
    const r = 0.7 - t * 0.25 // radius from 0.7 to 0.45
    const theta = Math.random() * Math.PI * 2
    positions[idx++] = r * Math.cos(theta)
    positions[idx++] = y
    positions[idx++] = r * Math.sin(theta) * 0.65
  }

  // Screw base — cylinder with helical thread
  for (let i = 0; i < screwCount; i++) {
    const t = i / screwCount
    const y = -0.6 - t * 0.8 // y from -0.6 to -1.4
    const helixAngle = t * Math.PI * 2 * 5 // 5 wraps
    const r = 0.45 + Math.sin(helixAngle) * 0.05
    const theta = Math.random() * Math.PI * 2
    positions[idx++] = r * Math.cos(theta)
    positions[idx++] = y
    positions[idx++] = r * Math.sin(theta) * 0.65
  }

  // Base contact disc
  for (let i = 0; i < discCount; i++) {
    const r = Math.random() * 0.35
    const theta = Math.random() * Math.PI * 2
    positions[idx++] = r * Math.cos(theta)
    positions[idx++] = -1.5 + (Math.random() - 0.5) * 0.03
    positions[idx++] = r * Math.sin(theta) * 0.65
  }

  // Filament — two support wires + coil
  for (let i = 0; i < filamentCount; i++) {
    const t = i / filamentCount
    if (t < 0.3) {
      // Left support wire
      const lt = t / 0.3
      const y = -0.2 + lt * 1.0
      positions[idx++] = -0.12 + (Math.random() - 0.5) * 0.02
      positions[idx++] = y
      positions[idx++] = (Math.random() - 0.5) * 0.02
    } else if (t < 0.6) {
      // Right support wire
      const lt = (t - 0.3) / 0.3
      const y = -0.2 + lt * 1.0
      positions[idx++] = 0.12 + (Math.random() - 0.5) * 0.02
      positions[idx++] = y
      positions[idx++] = (Math.random() - 0.5) * 0.02
    } else {
      // Coil between wires
      const lt = (t - 0.6) / 0.4
      const y = 0.1 + lt * 0.6
      const x = Math.sin(lt * Math.PI * 8) * 0.1
      positions[idx++] = x + (Math.random() - 0.5) * 0.02
      positions[idx++] = y
      positions[idx++] = (Math.random() - 0.5) * 0.03
    }
  }

  return positions
}

function generateLaptop(count: number): Float32Array {
  const positions = new Float32Array(count * 3)
  const screenCount = Math.floor(count * 0.38)
  const screenGlowCount = Math.floor(count * 0.08)
  const bezelCount = Math.floor(count * 0.04)
  const baseCount = Math.floor(count * 0.34)
  const keyboardCount = Math.floor(count * 0.06)
  const hingeCount = count - screenCount - screenGlowCount - bezelCount - baseCount - keyboardCount
  let idx = 0

  const sw = 3.6
  const sh = 2.5
  const bw = 3.8
  const bd = 2.2
  // Screen tilted 75° from horizontal = 15° from vertical
  const tiltRad = (75 * Math.PI) / 180
  const hingeY = -0.8

  // Screen surface
  for (let i = 0; i < screenCount; i++) {
    const u = (Math.random() - 0.5) * sw
    const v = Math.random() * sh
    positions[idx++] = u
    positions[idx++] = hingeY + v * Math.sin(tiltRad)
    positions[idx++] = -v * Math.cos(tiltRad) + (Math.random() - 0.5) * 0.02
  }

  // Screen glow center (denser display area — inner 70%)
  for (let i = 0; i < screenGlowCount; i++) {
    const u = (Math.random() - 0.5) * sw * 0.7
    const v = 0.15 * sh + Math.random() * sh * 0.7
    positions[idx++] = u
    positions[idx++] = hingeY + v * Math.sin(tiltRad)
    positions[idx++] = -v * Math.cos(tiltRad) + (Math.random() - 0.5) * 0.02
  }

  // Screen bezel edges
  for (let i = 0; i < bezelCount; i++) {
    const side = Math.floor(Math.random() * 4)
    let u: number, v: number
    if (side === 0) { u = -sw / 2 + (Math.random() - 0.5) * 0.05; v = Math.random() * sh }
    else if (side === 1) { u = sw / 2 + (Math.random() - 0.5) * 0.05; v = Math.random() * sh }
    else if (side === 2) { u = (Math.random() - 0.5) * sw; v = sh + (Math.random() - 0.5) * 0.05 }
    else { u = (Math.random() - 0.5) * sw; v = (Math.random() - 0.5) * 0.05 }
    positions[idx++] = u
    positions[idx++] = hingeY + v * Math.sin(tiltRad)
    positions[idx++] = -v * Math.cos(tiltRad) + (Math.random() - 0.5) * 0.02
  }

  // Keyboard base — flat, extending forward
  for (let i = 0; i < baseCount; i++) {
    const u = (Math.random() - 0.5) * bw
    const v = Math.random() * bd
    positions[idx++] = u
    positions[idx++] = hingeY - 0.04
    positions[idx++] = v * 0.55 + (Math.random() - 0.5) * 0.02
  }

  // Keyboard key rows — denser bands
  for (let i = 0; i < keyboardCount; i++) {
    const row = Math.floor(Math.random() * 5)
    const u = (Math.random() - 0.5) * bw * 0.85
    const v = 0.2 + row * 0.28 + (Math.random() - 0.5) * 0.08
    positions[idx++] = u
    positions[idx++] = hingeY - 0.04
    positions[idx++] = v * 0.55
  }

  // Hinge cylinder
  for (let i = 0; i < hingeCount; i++) {
    const angle = Math.random() * Math.PI
    const r = 0.08
    const u = (Math.random() - 0.5) * sw * 0.85
    positions[idx++] = u
    positions[idx++] = hingeY + r * Math.sin(angle)
    positions[idx++] = r * Math.cos(angle) * 0.4
  }

  return positions
}

function generateEarth(count: number): Float32Array {
  const positions = new Float32Array(count * 3)
  const mainCount = Math.floor(count * 0.97)
  const atmosphereCount = count - mainCount
  const radius = 2.0
  const goldenRatio = (1 + Math.sqrt(5)) / 2
  let idx = 0

  // Fibonacci sphere — full coverage, then adjust density via radius
  for (let i = 0; i < mainCount; i++) {
    const theta = (2 * Math.PI * i) / goldenRatio
    const phi = Math.acos(1 - (2 * (i + 0.5)) / mainCount)
    const x = Math.sin(phi) * Math.cos(theta)
    const y = Math.sin(phi) * Math.sin(theta)
    const z = Math.cos(phi)

    // Two octaves of noise for continents
    const n = noise2d(x * 2.5 + 10, y * 2.5 + 10) * 0.6 +
              noise2d(x * 5 + 20, z * 5 + 20) * 0.4

    // Land (high noise) pushed outward, ocean (low noise) pushed inward
    const isLand = n > 0.45
    const r = isLand ? radius * 1.02 : radius * 0.97

    positions[idx++] = x * r
    positions[idx++] = y * r
    positions[idx++] = z * r * 0.7 // subtle z-compression, not 0.28
  }

  // Atmosphere halo
  for (let i = 0; i < atmosphereCount; i++) {
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    const r = 2.15 + (Math.random() - 0.5) * 0.1
    positions[idx++] = r * Math.sin(phi) * Math.cos(theta)
    positions[idx++] = r * Math.sin(phi) * Math.sin(theta)
    positions[idx++] = r * Math.cos(phi) * 0.7
  }

  return positions
}

function cubicBezier(t: number, p0: number, p1: number, p2: number, p3: number) {
  const mt = 1 - t
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3
}

function generateDollarSign(count: number): Float32Array {
  const positions = new Float32Array(count * 3)
  const sCurveCount = Math.floor(count * 0.65)
  const barCount = count - sCurveCount
  let idx = 0

  const scale = 1.1

  // S-curve: two semicircular arcs
  for (let i = 0; i < sCurveCount; i++) {
    const t = i / sCurveCount
    let x: number, y: number

    if (t < 0.5) {
      // Top arc: center (0, 0.55), radius 0.65
      // Sweep from ~200° to ~20° (opening right)
      const lt = t * 2
      const startAngle = 200 * Math.PI / 180
      const endAngle = 20 * Math.PI / 180
      const angle = startAngle + lt * (endAngle - startAngle)
      x = 0.65 * Math.cos(angle)
      y = 0.55 + 0.65 * Math.sin(angle)
    } else {
      // Bottom arc: center (0, -0.55), radius 0.65
      // Sweep from ~20° to ~200° (opening left, reversed)
      const lt = (t - 0.5) * 2
      const startAngle = 20 * Math.PI / 180
      const endAngle = 200 * Math.PI / 180
      const angle = startAngle + lt * (endAngle - startAngle)
      x = -0.65 * Math.cos(angle) // negate x for mirror
      y = -0.55 - 0.65 * Math.sin(angle) // negate y for mirror
    }

    // Thickness
    const thickness = 0.12
    const px = (Math.random() - 0.5) * thickness * 2
    const py = (Math.random() - 0.5) * thickness * 2

    positions[idx++] = (x + px) * scale
    positions[idx++] = (y + py) * scale
    positions[idx++] = (Math.random() - 0.5) * 0.15
  }

  // TWO vertical bars
  const barSpacing = 0.075
  for (let i = 0; i < barCount; i++) {
    const t = i / barCount
    const y = -1.6 + t * 3.2
    const barSide = i % 2 === 0 ? -barSpacing : barSpacing
    const barThickness = 0.03
    positions[idx++] = (barSide + (Math.random() - 0.5) * barThickness * 2) * scale
    positions[idx++] = y * scale
    positions[idx++] = (Math.random() - 0.5) * 0.08
  }

  return positions
}

// ---------------------------------------------------------------------------
// SHADERS
// ---------------------------------------------------------------------------
const vertexShader = /* glsl */ `
  attribute vec3 aPositionTarget1;
  attribute vec3 aPositionTarget2;
  attribute vec3 aPositionTarget3;
  attribute vec3 aPositionTarget4;
  attribute vec3 aRandom;
  attribute float aSize;

  uniform float uProgress;
  uniform float uCurrentShape;
  uniform float uNextShape;
  uniform float uTime;
  uniform vec3 uMouseWorld;
  uniform float uMouseRadius;
  uniform float uMouseStrength;
  uniform vec2 uMouseVelocity;
  uniform float uSize;
  uniform float uPixelRatio;

  varying float vAlpha;

  vec3 getShapePosition(float shapeIndex) {
    // shapeIndex >= 3.5 → use position attribute (scattered)
    float usePos = step(3.5, shapeIndex);
    float i1 = step(0.5, shapeIndex) - step(1.5, shapeIndex);
    float i2 = step(1.5, shapeIndex) - step(2.5, shapeIndex);
    float i3 = step(2.5, shapeIndex) - step(3.5, shapeIndex);
    float i0 = 1.0 - i1 - i2 - i3 - usePos;
    return aPositionTarget1 * i0 + aPositionTarget2 * i1 + aPositionTarget3 * i2 + aPositionTarget4 * i3 + position * usePos;
  }

  void main() {
    vec3 posSource = getShapePosition(uCurrentShape);
    vec3 posTarget = getShapePosition(uNextShape);

    float stagger = abs(aRandom.x) * 0.35;
    float adjustedProgress = clamp((uProgress - stagger) / (1.0 - stagger * 0.6), 0.0, 1.0);
    float easedProgress = smoothstep(0.0, 1.0, adjustedProgress);

    vec3 mixedPosition = mix(posSource, posTarget, easedProgress);

    // Explosion/scatter during mid-transition
    float explosionProgress = sin(easedProgress * 3.14159);
    vec3 explosionOffset = aRandom * explosionProgress * 1.4;
    mixedPosition += explosionOffset;

    // Layered ambient organic motion
    float t = uTime;
    mixedPosition += vec3(
      sin(t * 0.3 + aRandom.x * 10.0) * 0.025 + sin(t * 0.7 + aRandom.y * 5.0) * 0.012,
      cos(t * 0.2 + aRandom.y * 10.0) * 0.025 + cos(t * 0.6 + aRandom.z * 5.0) * 0.012,
      sin(t * 0.4 + aRandom.z * 10.0) * 0.018
    );

    // World-space mouse repulsion with swirl + velocity
    vec3 toParticle = mixedPosition - uMouseWorld;
    float dist = length(toParticle);
    float influence = 1.0 - smoothstep(0.0, uMouseRadius, dist);
    influence = influence * influence * (3.0 - 2.0 * influence);

    if (dist > 0.001 && influence > 0.0) {
      float velocityBoost = 1.0 + length(uMouseVelocity) * 2.5;
      vec3 pushDir = normalize(toParticle);
      // Perpendicular swirl
      vec3 swirlDir = vec3(-pushDir.y, pushDir.x, 0.0);
      float swirl = sin(aRandom.x * 6.28 + uTime * 2.0) * 0.35;
      vec3 totalPush = pushDir + swirlDir * swirl;
      totalPush = normalize(totalPush) * influence * uMouseStrength * velocityBoost;
      mixedPosition += totalPush;
      mixedPosition.z += influence * uMouseStrength * 0.3;
    }

    vec4 mvPosition = modelViewMatrix * vec4(mixedPosition, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = uSize * aSize * uPixelRatio * (1.0 / -mvPosition.z);

    vAlpha = 0.88 - explosionProgress * 0.25;
  }
`

const fragmentShader = /* glsl */ `
  varying float vAlpha;

  void main() {
    float dist = length(gl_PointCoord - vec2(0.5));

    // Bright pinpoint core
    float core = 1.0 - smoothstep(0.0, 0.15, dist);

    // Soft exponential glow halo
    float glow = exp(-dist * 5.5) * 0.6;

    float alpha = core + glow;

    // White core, subtle cool blue glow
    vec3 coreColor = vec3(1.0, 1.0, 1.0);
    vec3 glowColor = vec3(0.85, 0.92, 1.0);
    vec3 color = mix(glowColor, coreColor, core);

    gl_FragColor = vec4(color, alpha * vAlpha);
  }
`

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------
export default function ParticleMorph() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const isMobile = window.innerWidth < 768
    const PARTICLE_COUNT = isMobile ? PARTICLE_COUNT_MOBILE : PARTICLE_COUNT_DESKTOP

    // --- Scene ---
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(70, container.clientWidth / container.clientHeight, 0.1, 100)
    camera.position.z = 5

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false })
    renderer.setClearColor(0x000000, 1)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(container.clientWidth, container.clientHeight)
    container.appendChild(renderer.domElement)

    // --- Post-processing ---
    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight),
      BLOOM_STRENGTH,
      BLOOM_RADIUS,
      BLOOM_THRESHOLD
    )
    composer.addPass(bloomPass)
    composer.addPass(new OutputPass())

    // --- Shapes ---
    const shape1 = generateLightbulb(PARTICLE_COUNT)
    const shape2 = generateLaptop(PARTICLE_COUNT)
    const shape3 = generateEarth(PARTICLE_COUNT)
    const shape4 = generateDollarSign(PARTICLE_COUNT)

    // --- Geometry ---
    const geometry = new THREE.BufferGeometry()
    const initialPositions = new Float32Array(PARTICLE_COUNT * 3)
    const randoms = new Float32Array(PARTICLE_COUNT * 3)
    const sizes = new Float32Array(PARTICLE_COUNT)
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      initialPositions[i * 3] = (Math.random() - 0.5) * 8
      initialPositions[i * 3 + 1] = (Math.random() - 0.5) * 6
      initialPositions[i * 3 + 2] = (Math.random() - 0.5) * 4
      randoms[i * 3] = Math.random() * 2 - 1
      randoms[i * 3 + 1] = Math.random() * 2 - 1
      randoms[i * 3 + 2] = Math.random() * 2 - 1
      sizes[i] = 0.5 + Math.random() * 0.8
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(initialPositions, 3))
    geometry.setAttribute('aPositionTarget1', new THREE.BufferAttribute(shape1, 3))
    geometry.setAttribute('aPositionTarget2', new THREE.BufferAttribute(shape2, 3))
    geometry.setAttribute('aPositionTarget3', new THREE.BufferAttribute(shape3, 3))
    geometry.setAttribute('aPositionTarget4', new THREE.BufferAttribute(shape4, 3))
    geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 3))
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))

    // --- Material ---
    const uniforms = {
      uProgress: { value: 0 },
      uCurrentShape: { value: 4.0 }, // 4 = scattered (position attribute)
      uNextShape: { value: 0 },
      uTime: { value: 0 },
      uMouseWorld: { value: new THREE.Vector3(9999, 9999, 0) },
      uMouseRadius: { value: MOUSE_RADIUS_WORLD },
      uMouseStrength: { value: MOUSE_STRENGTH_WORLD },
      uMouseVelocity: { value: new THREE.Vector2(0, 0) },
      uSize: { value: BASE_PARTICLE_SIZE },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    }

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    })

    const points = new THREE.Points(geometry, material)
    scene.add(points)

    // --- Animation state ---
    type State = 'INITIAL_MORPH' | 'HOLDING' | 'MORPHING'
    let state: State = 'INITIAL_MORPH'
    let currentShape = 0
    let nextShape = 0
    let stateStartTime = performance.now() / 1000
    const clock = new THREE.Clock()

    // --- Mouse ---
    const mouseWorld = new THREE.Vector3(9999, 9999, 0)
    const mouseWorldTarget = new THREE.Vector3(9999, 9999, 0)
    const prevMouseWorld = new THREE.Vector3(9999, 9999, 0)
    const raycaster = new THREE.Raycaster()
    const zPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
    const intersectPoint = new THREE.Vector3()
    let mouseActiveTime = 0

    function unprojectMouseToWorld(ndcX: number, ndcY: number) {
      raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera)
      raycaster.ray.intersectPlane(zPlane, intersectPoint)
      if (intersectPoint) {
        mouseWorldTarget.copy(intersectPoint)
      }
    }

    const onPointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect()
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1
      unprojectMouseToWorld(ndcX, ndcY)
      mouseActiveTime = performance.now() / 1000
    }

    const onPointerLeave = () => {
      mouseWorldTarget.set(9999, 9999, 0)
    }

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 0) return
      const touch = e.touches[0]
      const rect = container.getBoundingClientRect()
      const ndcX = ((touch.clientX - rect.left) / rect.width) * 2 - 1
      const ndcY = -((touch.clientY - rect.top) / rect.height) * 2 + 1
      unprojectMouseToWorld(ndcX, ndcY)
      mouseActiveTime = performance.now() / 1000
    }

    const onTouchEnd = () => {
      mouseWorldTarget.set(9999, 9999, 0)
    }

    container.addEventListener('pointermove', onPointerMove)
    container.addEventListener('pointerleave', onPointerLeave)
    container.addEventListener('touchmove', onTouchMove, { passive: true })
    container.addEventListener('touchend', onTouchEnd)

    // --- Resize ---
    const onResize = () => {
      const w = container.clientWidth
      const h = container.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
      composer.setSize(w, h)
      bloomPass.resolution.set(w, h)
      uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2)
    }
    window.addEventListener('resize', onResize)

    // --- Animation loop ---
    let animId = 0
    const offScreen = new THREE.Vector3(9999, 9999, 0)

    const animate = () => {
      animId = requestAnimationFrame(animate)
      const elapsed = clock.getElapsedTime()
      const now = performance.now() / 1000

      uniforms.uTime.value = elapsed

      // Mouse smoothing + velocity tracking
      prevMouseWorld.copy(mouseWorld)
      const timeSinceMouse = now - mouseActiveTime
      if (timeSinceMouse > 1.5) {
        mouseWorld.lerp(offScreen, 0.04)
      } else {
        mouseWorld.lerp(mouseWorldTarget, 0.18)
      }
      uniforms.uMouseWorld.value.copy(mouseWorld)
      uniforms.uMouseVelocity.value.set(
        mouseWorld.x - prevMouseWorld.x,
        mouseWorld.y - prevMouseWorld.y
      )

      // State machine
      const stateElapsed = now - stateStartTime

      if (state === 'INITIAL_MORPH') {
        const progress = Math.min(stateElapsed / MORPH_DURATION, 1)
        uniforms.uProgress.value = easeInOutCubic(progress)
        uniforms.uCurrentShape.value = 4.0 // scattered position attribute
        uniforms.uNextShape.value = 0
        if (progress >= 1) {
          state = 'HOLDING'
          currentShape = 0
          stateStartTime = now
        }
      } else if (state === 'HOLDING') {
        uniforms.uProgress.value = 0
        uniforms.uCurrentShape.value = currentShape
        uniforms.uNextShape.value = currentShape
        if (stateElapsed >= HOLD_DURATION) {
          state = 'MORPHING'
          nextShape = (currentShape + 1) % 4
          stateStartTime = now
        }
      } else if (state === 'MORPHING') {
        const progress = Math.min(stateElapsed / MORPH_DURATION, 1)
        uniforms.uProgress.value = easeInOutCubic(progress)
        uniforms.uCurrentShape.value = currentShape
        uniforms.uNextShape.value = nextShape
        if (progress >= 1) {
          state = 'HOLDING'
          currentShape = nextShape
          stateStartTime = now
        }
      }

      composer.render()
    }

    animate()

    return () => {
      cancelAnimationFrame(animId)
      container.removeEventListener('pointermove', onPointerMove)
      container.removeEventListener('pointerleave', onPointerLeave)
      container.removeEventListener('touchmove', onTouchMove)
      container.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('resize', onResize)
      geometry.dispose()
      material.dispose()
      renderer.dispose()
      composer.dispose()
      if (renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement)
      }
    }
  }, [])

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        background: '#000',
      }}
    />
  )
}
