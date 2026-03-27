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
const PARTICLE_COUNT_DESKTOP = 20000
const PARTICLE_COUNT_MOBILE = 9000
const MORPH_DURATION = 2.2
const HOLD_DURATION = 4.0
const BLOOM_STRENGTH = 1.1
const BLOOM_RADIUS = 0.45
const BLOOM_THRESHOLD = 0.08
const MOUSE_RADIUS_WORLD = 0.6
const MOUSE_STRENGTH_WORLD = 0.45
const BASE_PARTICLE_SIZE = 2.2

// ---------------------------------------------------------------------------
// EASING
// ---------------------------------------------------------------------------
function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

// ---------------------------------------------------------------------------
// NOISE (for Earth continents)
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
  const bulbCount = Math.floor(count * 0.58)
  const baseCount = Math.floor(count * 0.3)
  const filamentCount = count - bulbCount - baseCount
  let idx = 0

  for (let i = 0; i < bulbCount; i++) {
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(1 - Math.random() * 1.3)
    const r = 1.5 + (Math.random() - 0.5) * 0.06
    positions[idx++] = r * Math.sin(phi) * Math.cos(theta)
    positions[idx++] = r * Math.cos(phi) + 0.3
    positions[idx++] = r * Math.sin(phi) * Math.sin(theta) * 0.28
  }

  for (let i = 0; i < baseCount; i++) {
    const t = i / baseCount
    const angle = t * Math.PI * 10
    const y = -0.85 - t * 0.85
    const r = 0.48 + Math.sin(angle) * 0.07
    const theta = Math.random() * Math.PI * 2
    positions[idx++] = r * Math.cos(theta)
    positions[idx++] = y
    positions[idx++] = r * Math.sin(theta) * 0.28
  }

  for (let i = 0; i < filamentCount; i++) {
    const t = i / filamentCount
    const y = -0.15 + t * 0.95
    const x = Math.sin(t * Math.PI * 7) * 0.14
    positions[idx++] = x + (Math.random() - 0.5) * 0.04
    positions[idx++] = y + 0.3
    positions[idx++] = (Math.random() - 0.5) * 0.06
  }

  return positions
}

function generateLaptop(count: number): Float32Array {
  const positions = new Float32Array(count * 3)
  // Open laptop seen from slight 3/4 angle
  // Screen: rectangle standing upright, tilted back slightly
  // Base: rectangle lying flat below, connected at hinge
  const screenCount = Math.floor(count * 0.42)
  const screenBezelCount = Math.floor(count * 0.08)
  const baseCount = Math.floor(count * 0.38)
  const baseDetailCount = Math.floor(count * 0.05)
  const hingeCount = count - screenCount - screenBezelCount - baseCount - baseDetailCount
  let idx = 0

  const sw = 2.6  // screen width
  const sh = 1.8  // screen height
  const tilt = 0.25 // slight backward tilt (radians)
  const hingeY = -0.6 // where screen meets base

  // Screen face — upright rectangle tilted back
  for (let i = 0; i < screenCount; i++) {
    const u = (Math.random() - 0.5) * sw
    const v = Math.random() * sh // 0 = bottom (hinge), 1 = top
    positions[idx++] = u
    positions[idx++] = hingeY + v * Math.cos(tilt)
    positions[idx++] = -v * Math.sin(tilt) + (Math.random() - 0.5) * 0.02
  }

  // Screen bezel (denser edges)
  for (let i = 0; i < screenBezelCount; i++) {
    const side = Math.floor(Math.random() * 4)
    let u: number, v: number
    if (side === 0) { u = -sw / 2 + (Math.random() - 0.5) * 0.06; v = Math.random() * sh }
    else if (side === 1) { u = sw / 2 + (Math.random() - 0.5) * 0.06; v = Math.random() * sh }
    else if (side === 2) { u = (Math.random() - 0.5) * sw; v = sh + (Math.random() - 0.5) * 0.06 }
    else { u = (Math.random() - 0.5) * sw; v = (Math.random() - 0.5) * 0.06 }
    positions[idx++] = u
    positions[idx++] = hingeY + v * Math.cos(tilt)
    positions[idx++] = -v * Math.sin(tilt) + (Math.random() - 0.5) * 0.02
  }

  // Base/keyboard — flat rectangle extending forward from hinge
  const bw = 2.8  // base width (slightly wider)
  const bd = 1.7  // base depth
  for (let i = 0; i < baseCount; i++) {
    const u = (Math.random() - 0.5) * bw
    const v = Math.random() * bd
    positions[idx++] = u
    positions[idx++] = hingeY - 0.03 // sits just below hinge
    positions[idx++] = v * 0.4 + (Math.random() - 0.5) * 0.02
  }

  // Keyboard keys / trackpad detail (subtle density variation on base)
  for (let i = 0; i < baseDetailCount; i++) {
    // Trackpad area (center of base)
    const u = (Math.random() - 0.5) * 0.8
    const v = 0.3 + Math.random() * 0.5
    positions[idx++] = u
    positions[idx++] = hingeY - 0.03
    positions[idx++] = v * 0.4 + (Math.random() - 0.5) * 0.01
  }

  // Hinge — cylinder connecting screen to base
  for (let i = 0; i < hingeCount; i++) {
    const angle = Math.random() * Math.PI
    const r = 0.06
    const x = (Math.random() - 0.5) * sw * 0.9
    positions[idx++] = x
    positions[idx++] = hingeY + r * Math.sin(angle)
    positions[idx++] = r * Math.cos(angle) * 0.3
  }

  return positions
}

function generateEarth(count: number): Float32Array {
  const positions = new Float32Array(count * 3)
  const radius = 2.0
  let idx = 0
  let placed = 0
  let attempts = 0
  const goldenRatio = (1 + Math.sqrt(5)) / 2

  while (placed < count && attempts < count * 5) {
    const theta = (2 * Math.PI * attempts) / goldenRatio
    const phi = Math.acos(1 - (2 * (attempts + 0.5)) / (count * 2.5))
    const x = Math.sin(phi) * Math.cos(theta)
    const y = Math.sin(phi) * Math.sin(theta)
    const z = Math.cos(phi)

    const noiseVal = noise2d(x * 3 + 10, y * 3 + 10) * 0.5 +
                     noise2d(x * 6 + 20, z * 6 + 20) * 0.3 +
                     noise2d(y * 9, z * 9) * 0.2
    const density = noiseVal > 0.42 ? 1.0 : 0.35

    if (Math.random() < density) {
      const radialOffset = radius + (Math.random() - 0.5) * 0.1
      positions[idx++] = x * radialOffset
      positions[idx++] = y * radialOffset
      positions[idx++] = z * radialOffset * 0.28
      placed++
    }
    attempts++
  }

  while (placed < count) {
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    const r = radius + (Math.random() - 0.5) * 0.1
    positions[idx++] = r * Math.sin(phi) * Math.cos(theta)
    positions[idx++] = r * Math.sin(phi) * Math.sin(theta)
    positions[idx++] = r * Math.cos(phi) * 0.28
    placed++
  }

  return positions
}

function generateDollarSign(count: number): Float32Array {
  const positions = new Float32Array(count * 3)
  const sCurveCount = Math.floor(count * 0.7)
  const barCount = count - sCurveCount
  let idx = 0

  const scale = 1.3

  // Clean S-curve using sine: x oscillates as y sweeps top-to-bottom
  // -sin gives: top goes LEFT, bottom goes RIGHT = correct $ orientation
  for (let i = 0; i < sCurveCount; i++) {
    const t = i / sCurveCount // 0 (top) → 1 (bottom)

    // y: linear top to bottom
    const y = 1.3 - t * 2.6

    // x: sine wave creates the S shape
    // Wider at the bulges, narrower at crossing
    const x = -Math.sin(t * Math.PI * 2) * 0.85

    // Vary thickness along the curve — thicker at the bulges
    const bulge = Math.abs(Math.sin(t * Math.PI * 2))
    const thickness = 0.08 + bulge * 0.1
    const px = (Math.random() - 0.5) * thickness * 2
    const py = (Math.random() - 0.5) * thickness * 2

    positions[idx++] = (x + px) * scale
    positions[idx++] = (y + py) * scale
    positions[idx++] = (Math.random() - 0.5) * 0.05
  }

  // Vertical bar through center — extends beyond S top and bottom
  for (let i = 0; i < barCount; i++) {
    const t = i / barCount
    const y = -1.55 + t * 3.1
    positions[idx++] = (Math.random() - 0.5) * 0.07 * scale
    positions[idx++] = y * scale
    positions[idx++] = (Math.random() - 0.5) * 0.04
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
  uniform vec3 uMouseWorld;        // mouse unprojected to world-space z=0 plane
  uniform float uMouseRadius;      // world-space radius
  uniform float uMouseStrength;    // world-space push strength
  uniform float uSize;
  uniform float uPixelRatio;

  varying float vAlpha;
  varying float vMouseProximity;

  vec3 getShapePosition(float shapeIndex) {
    float i1 = step(0.5, shapeIndex) - step(1.5, shapeIndex);
    float i2 = step(1.5, shapeIndex) - step(2.5, shapeIndex);
    float i3 = step(2.5, shapeIndex);
    float i0 = 1.0 - i1 - i2 - i3;
    return aPositionTarget1 * i0 + aPositionTarget2 * i1 + aPositionTarget3 * i2 + aPositionTarget4 * i3;
  }

  void main() {
    vec3 posSource = getShapePosition(uCurrentShape);
    vec3 posTarget = getShapePosition(uNextShape);

    // Per-particle staggered progress with abs for symmetric distribution
    float stagger = abs(aRandom.x) * 0.35;
    float adjustedProgress = clamp((uProgress - stagger) / (1.0 - stagger * 0.6), 0.0, 1.0);
    float easedProgress = smoothstep(0.0, 1.0, adjustedProgress);

    vec3 mixedPosition = mix(posSource, posTarget, easedProgress);

    // Explosion/scatter — arc outward during mid-transition
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

    // ---- World-space mouse repulsion (precise) ----
    vec3 toParticle = mixedPosition - uMouseWorld;
    float dist = length(toParticle);
    float influence = 1.0 - smoothstep(0.0, uMouseRadius, dist);
    // Cubic falloff for buttery feel
    influence = influence * influence * (3.0 - 2.0 * influence);

    if (dist > 0.001 && influence > 0.0) {
      vec3 pushDir = normalize(toParticle);
      // Push outward from cursor in all 3 axes
      mixedPosition += pushDir * influence * uMouseStrength;
      // Extra z push for depth pop
      mixedPosition.z += influence * uMouseStrength * 0.3;
    }

    vMouseProximity = influence;

    vec4 mvPosition = modelViewMatrix * vec4(mixedPosition, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Size: minimal mouse-proximity boost
    float sizeBoost = 1.0 + vMouseProximity * 0.15;
    gl_PointSize = uSize * aSize * uPixelRatio * sizeBoost * (1.0 / -mvPosition.z);

    vAlpha = 0.88 - explosionProgress * 0.25;
  }
`

const fragmentShader = /* glsl */ `
  varying float vAlpha;
  varying float vMouseProximity;

  void main() {
    float dist = length(gl_PointCoord - vec2(0.5));
    float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
    alpha = pow(alpha, 1.4);

    // Subtle warm tint near mouse
    float warmth = vMouseProximity * 0.08;
    vec3 color = vec3(1.0, 1.0 - warmth * 0.2, 1.0 - warmth * 0.4);

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
      initialPositions[i * 3 + 2] = (Math.random() - 0.5) * 3
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
      uCurrentShape: { value: 0 },
      uNextShape: { value: 0 },
      uTime: { value: 0 },
      uMouseWorld: { value: new THREE.Vector3(9999, 9999, 0) },
      uMouseRadius: { value: MOUSE_RADIUS_WORLD },
      uMouseStrength: { value: MOUSE_STRENGTH_WORLD },
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

    // --- Mouse: unproject NDC to world-space z=0 plane ---
    const mouseNDC = new THREE.Vector2(9999, 9999)
    const mouseNDCTarget = new THREE.Vector2(9999, 9999)
    const mouseWorld = new THREE.Vector3(9999, 9999, 0)
    const mouseWorldTarget = new THREE.Vector3(9999, 9999, 0)
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
      mouseNDCTarget.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      mouseNDCTarget.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      unprojectMouseToWorld(mouseNDCTarget.x, mouseNDCTarget.y)
      mouseActiveTime = performance.now() / 1000
    }

    const onPointerLeave = () => {
      mouseWorldTarget.set(9999, 9999, 0)
      mouseNDCTarget.set(9999, 9999)
    }

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 0) return
      const touch = e.touches[0]
      const rect = container.getBoundingClientRect()
      mouseNDCTarget.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1
      mouseNDCTarget.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1
      unprojectMouseToWorld(mouseNDCTarget.x, mouseNDCTarget.y)
      mouseActiveTime = performance.now() / 1000
    }

    const onTouchEnd = () => {
      mouseWorldTarget.set(9999, 9999, 0)
      mouseNDCTarget.set(9999, 9999)
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

      // Smooth mouse with higher lerp for responsiveness
      const timeSinceMouse = now - mouseActiveTime
      if (timeSinceMouse > 1.5) {
        mouseWorld.lerp(offScreen, 0.04)
      } else {
        mouseWorld.lerp(mouseWorldTarget, 0.18)
      }
      uniforms.uMouseWorld.value.copy(mouseWorld)

      // State machine
      const stateElapsed = now - stateStartTime

      if (state === 'INITIAL_MORPH') {
        const progress = Math.min(stateElapsed / MORPH_DURATION, 1)
        uniforms.uProgress.value = easeInOutCubic(progress)
        uniforms.uCurrentShape.value = 0
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
