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
const PARTICLE_COUNT_DESKTOP = 18000
const PARTICLE_COUNT_MOBILE = 8000
const MORPH_DURATION = 2.0
const HOLD_DURATION = 4.0
const BLOOM_STRENGTH = 1.0
const BLOOM_RADIUS = 0.4
const BLOOM_THRESHOLD = 0.1
const MOUSE_RADIUS = 0.3
const MOUSE_STRENGTH = 0.15
const BASE_PARTICLE_SIZE = 2.0

// ---------------------------------------------------------------------------
// EASING
// ---------------------------------------------------------------------------
function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

// ---------------------------------------------------------------------------
// SIMPLEX-ISH NOISE (for Earth continents)
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
// SHAPE GENERATORS — each returns Float32Array of xyz positions
// ---------------------------------------------------------------------------
function generateLightbulb(count: number): Float32Array {
  const positions = new Float32Array(count * 3)
  const bulbCount = Math.floor(count * 0.6)
  const baseCount = Math.floor(count * 0.3)
  const filamentCount = count - bulbCount - baseCount
  let idx = 0

  // Bulb (upper hemisphere sphere)
  for (let i = 0; i < bulbCount; i++) {
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(1 - Math.random() * 1.2) // bias toward top
    const r = 1.5 + (Math.random() - 0.5) * 0.08
    positions[idx++] = r * Math.sin(phi) * Math.cos(theta)
    positions[idx++] = r * Math.cos(phi) + 0.3
    positions[idx++] = r * Math.sin(phi) * Math.sin(theta) * 0.3
  }

  // Base/screw
  for (let i = 0; i < baseCount; i++) {
    const t = i / baseCount
    const angle = t * Math.PI * 8 // helical ridges
    const y = -0.9 - t * 0.8
    const r = 0.5 + Math.sin(angle) * 0.06
    const theta = Math.random() * Math.PI * 2
    positions[idx++] = r * Math.cos(theta)
    positions[idx++] = y
    positions[idx++] = r * Math.sin(theta) * 0.3
  }

  // Filament
  for (let i = 0; i < filamentCount; i++) {
    const t = i / filamentCount
    const y = -0.2 + t * 1.0
    const x = Math.sin(t * Math.PI * 6) * 0.15
    positions[idx++] = x + (Math.random() - 0.5) * 0.05
    positions[idx++] = y + 0.3
    positions[idx++] = (Math.random() - 0.5) * 0.08
  }

  return positions
}

function generateLaptop(count: number): Float32Array {
  const positions = new Float32Array(count * 3)
  const screenCount = Math.floor(count * 0.45)
  const baseCount = Math.floor(count * 0.45)
  const hingeCount = count - screenCount - baseCount
  let idx = 0

  // Screen (tilted back ~110°)
  const screenAngle = (110 * Math.PI) / 180
  for (let i = 0; i < screenCount; i++) {
    const u = (Math.random() - 0.5) * 3.0
    const v = (Math.random() - 0.5) * 2.0
    // denser near edges (bezel)
    const edgeBias = Math.random() < 0.3
    const eu = edgeBias ? (Math.random() < 0.5 ? -1.4 + Math.random() * 0.15 : 1.4 - Math.random() * 0.15) : u
    const ev = edgeBias ? (Math.random() < 0.5 ? -0.9 + Math.random() * 0.1 : 0.9 - Math.random() * 0.1) : v
    const finalU = edgeBias ? eu : u
    const finalV = edgeBias ? ev : v
    positions[idx++] = finalU
    positions[idx++] = finalV * Math.cos(screenAngle) + 0.8
    positions[idx++] = finalV * Math.sin(screenAngle) * 0.15
  }

  // Keyboard/base
  for (let i = 0; i < baseCount; i++) {
    const u = (Math.random() - 0.5) * 3.0
    const v = Math.random() * 2.0
    positions[idx++] = u
    positions[idx++] = -0.9 + (Math.random() - 0.5) * 0.05
    positions[idx++] = v * 0.15
  }

  // Hinge
  for (let i = 0; i < hingeCount; i++) {
    const angle = Math.random() * Math.PI * 2
    const r = 0.08
    const x = (Math.random() - 0.5) * 2.8
    positions[idx++] = x
    positions[idx++] = -0.85 + r * Math.cos(angle)
    positions[idx++] = r * Math.sin(angle) * 0.15
  }

  return positions
}

function generateEarth(count: number): Float32Array {
  const positions = new Float32Array(count * 3)
  const radius = 2.0
  let idx = 0

  // Fibonacci sphere sampling with continent noise
  let placed = 0
  let attempts = 0
  const goldenRatio = (1 + Math.sqrt(5)) / 2

  while (placed < count && attempts < count * 4) {
    const i = attempts
    const theta = (2 * Math.PI * i) / goldenRatio
    const phi = Math.acos(1 - (2 * (i + 0.5)) / (count * 2))
    const x = Math.sin(phi) * Math.cos(theta)
    const y = Math.sin(phi) * Math.sin(theta)
    const z = Math.cos(phi)

    // Continent noise
    const noiseVal = noise2d(x * 3 + 10, y * 3 + 10) * 0.5 +
                     noise2d(x * 6 + 20, z * 6 + 20) * 0.3 +
                     noise2d(y * 9, z * 9) * 0.2
    const density = noiseVal > 0.45 ? 1.0 : 0.4

    if (Math.random() < density) {
      const radialOffset = radius + (Math.random() - 0.5) * 0.1
      positions[idx++] = x * radialOffset
      positions[idx++] = y * radialOffset
      positions[idx++] = z * radialOffset * 0.3
      placed++
    }
    attempts++
  }

  // Fill remaining with random sphere points
  while (placed < count) {
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    const r = radius + (Math.random() - 0.5) * 0.1
    positions[idx++] = r * Math.sin(phi) * Math.cos(theta)
    positions[idx++] = r * Math.sin(phi) * Math.sin(theta)
    positions[idx++] = r * Math.cos(phi) * 0.3
    placed++
  }

  return positions
}

function generateDollarSign(count: number): Float32Array {
  const positions = new Float32Array(count * 3)
  const sCurveCount = Math.floor(count * 0.75)
  const barCount = count - sCurveCount
  let idx = 0

  // S-curve: two half-circles stacked
  for (let i = 0; i < sCurveCount; i++) {
    const t = i / sCurveCount
    let x: number, y: number

    if (t < 0.5) {
      // Top half-circle (opens left)
      const angle = Math.PI * 0.1 + (t * 2) * Math.PI * 0.8
      x = -Math.cos(angle) * 0.9
      y = Math.sin(angle) * 0.7 + 0.7
    } else {
      // Bottom half-circle (opens right)
      const angle = Math.PI * 0.1 + ((t - 0.5) * 2) * Math.PI * 0.8
      x = Math.cos(angle) * 0.9
      y = -Math.sin(angle) * 0.7 - 0.7
    }

    // Add thickness
    const perpX = (Math.random() - 0.5) * 0.2
    const perpY = (Math.random() - 0.5) * 0.2
    positions[idx++] = x + perpX
    positions[idx++] = y + perpY
    positions[idx++] = (Math.random() - 0.5) * 0.1
  }

  // Vertical bars
  for (let i = 0; i < barCount; i++) {
    const t = i / barCount
    const y = -1.8 + t * 3.6
    const xOffset = (Math.random() - 0.5) * 0.12
    positions[idx++] = xOffset
    positions[idx++] = y
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
  uniform vec2 uMouse;
  uniform float uMouseRadius;
  uniform float uMouseStrength;
  uniform float uSize;
  uniform float uPixelRatio;

  varying float vAlpha;

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

    // Per-particle staggered progress
    float stagger = aRandom.x * 0.4;
    float adjustedProgress = clamp((uProgress - stagger) / (1.0 - stagger * 0.5), 0.0, 1.0);
    float easedProgress = smoothstep(0.0, 1.0, adjustedProgress);

    // Mix positions
    vec3 mixedPosition = mix(posSource, posTarget, easedProgress);

    // Explosion/scatter during mid-transition
    float explosionProgress = sin(easedProgress * 3.14159);
    vec3 explosionOffset = aRandom * explosionProgress * 1.5;
    mixedPosition += explosionOffset;

    // Ambient organic motion
    mixedPosition += vec3(
      sin(uTime * 0.3 + aRandom.x * 10.0) * aRandom.x * 0.03,
      cos(uTime * 0.2 + aRandom.y * 10.0) * aRandom.y * 0.03,
      sin(uTime * 0.4 + aRandom.z * 10.0) * aRandom.z * 0.02
    );

    // Mouse/touch repulsion
    vec4 viewPos = viewMatrix * modelMatrix * vec4(mixedPosition, 1.0);
    vec4 projected = projectionMatrix * viewPos;
    vec2 screenPos = projected.xy / projected.w;
    vec2 toMouse = screenPos - uMouse;
    float distToMouse = length(toMouse);
    if (distToMouse < uMouseRadius) {
      float repulsion = (1.0 - distToMouse / uMouseRadius) * uMouseStrength;
      vec2 repulseDir = normalize(toMouse);
      mixedPosition.xy += repulseDir * repulsion;
      mixedPosition.z += repulsion * 0.5;
    }

    vec4 mvPosition = modelViewMatrix * vec4(mixedPosition, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = uSize * aSize * uPixelRatio * (1.0 / -mvPosition.z);

    // Fade alpha based on transition for softer look
    vAlpha = 0.85 - explosionProgress * 0.3;
  }
`

const fragmentShader = /* glsl */ `
  varying float vAlpha;

  void main() {
    float dist = length(gl_PointCoord - vec2(0.5));
    float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
    alpha = pow(alpha, 1.5);
    gl_FragColor = vec4(1.0, 1.0, 1.0, alpha * vAlpha);
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

    // --- Scene setup ---
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

    // --- Generate shapes ---
    const shape1 = generateLightbulb(PARTICLE_COUNT)
    const shape2 = generateLaptop(PARTICLE_COUNT)
    const shape3 = generateEarth(PARTICLE_COUNT)
    const shape4 = generateDollarSign(PARTICLE_COUNT)

    // --- Build geometry ---
    const geometry = new THREE.BufferGeometry()

    // Initial position = scattered random
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
      sizes[i] = 0.5 + Math.random()
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
      uMouse: { value: new THREE.Vector2(9999, 9999) },
      uMouseRadius: { value: MOUSE_RADIUS },
      uMouseStrength: { value: MOUSE_STRENGTH },
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
    let nextShape = 0 // first morph: scattered → shape 0
    let stateStartTime = performance.now() / 1000
    const clock = new THREE.Clock()

    // --- Mouse ---
    const mouse = new THREE.Vector2(9999, 9999)
    const mouseTarget = new THREE.Vector2(9999, 9999)
    let mouseActiveTime = 0

    const onPointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect()
      mouseTarget.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      mouseTarget.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      mouseActiveTime = performance.now() / 1000
    }

    const onPointerLeave = () => {
      mouseTarget.set(9999, 9999)
    }

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 0) return
      const touch = e.touches[0]
      const rect = container.getBoundingClientRect()
      mouseTarget.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1
      mouseTarget.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1
      mouseActiveTime = performance.now() / 1000
    }

    const onTouchEnd = () => {
      mouseTarget.set(9999, 9999)
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

    const animate = () => {
      animId = requestAnimationFrame(animate)
      const elapsed = clock.getElapsedTime()
      const now = performance.now() / 1000

      uniforms.uTime.value = elapsed

      // Mouse smoothing
      const timeSinceMouse = now - mouseActiveTime
      if (timeSinceMouse > 2.0) {
        mouse.lerp(new THREE.Vector2(9999, 9999), 0.05)
      } else {
        mouse.x += (mouseTarget.x - mouse.x) * 0.1
        mouse.y += (mouseTarget.y - mouse.y) * 0.1
      }
      uniforms.uMouse.value.copy(mouse)

      // State machine
      const stateElapsed = now - stateStartTime

      if (state === 'INITIAL_MORPH') {
        // Morph from scattered to first shape
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

    // --- Cleanup ---
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
