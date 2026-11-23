import { Canvas, useFrame } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { ARENA_BOUNDS, ARENA_BOXES, JUMP_PADS, TEAM_SPAWNS, type ArenaBox } from '../../shared/arena.ts'
import { useGameStore } from '../store/useGameStore.ts'
import { EffectsLayer } from './EffectsLayer.tsx'
import { ImportedArenaProps } from './ImportedArenaProps.tsx'
import { PlayerController } from './PlayerController.tsx'
import { PracticeTargetsLayer } from './PracticeTargetsLayer.tsx'
import { RivalAvatar } from './RivalAvatar.tsx'
import { WeaponViewmodel } from './WeaponViewmodel.tsx'
import { WorldEffectsLayer } from './WorldEffectsLayer.tsx'

/**
 * Brushed dark-navy metallic stadium deck plate texture.
 * Clean readability with subtle cyan tech panel lines — avoids visual clutter or overblown neon.
 */
function createTechFloorTexture(): THREE.CanvasTexture {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  // Clean dark navy metallic base
  ctx.fillStyle = '#152238'
  ctx.fillRect(0, 0, size, size)

  // Recessed outer bevel seam
  ctx.strokeStyle = '#0c1526'
  ctx.lineWidth = 10
  ctx.strokeRect(5, 5, size - 10, size - 10)

  // Brushed inner metallic quadrants
  ctx.fillStyle = '#1b2c47'
  const pad = 16
  const half = size / 2
  ctx.fillRect(pad, pad, half - pad - 6, half - pad - 6)
  ctx.fillRect(half + 6, pad, half - pad - 6, half - pad - 6)
  ctx.fillRect(pad, half + 6, half - pad - 6, half - pad - 6)
  ctx.fillRect(half + 6, half + 6, half - pad - 6, half - pad - 6)

  // Subtle horizontal metallic brush micro-lines
  ctx.fillStyle = 'rgba(255, 255, 255, 0.025)'
  for (let y = 18; y < size - 18; y += 8) {
    ctx.fillRect(18, y, size - 36, 2)
  }

  // Controlled cyan precision inlay lines along center cross
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.34)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(half, 14)
  ctx.lineTo(half, size - 14)
  ctx.moveTo(14, half)
  ctx.lineTo(size - 14, half)
  ctx.stroke()

  // Corner titanium fasteners
  ctx.fillStyle = '#334e73'
  const rivets = [
    [28, 28],
    [size - 28, 28],
    [28, size - 28],
    [size - 28, size - 28],
  ]
  for (const [rx, ry] of rivets) {
    ctx.beginPath()
    ctx.arc(rx, ry, 5, 0, Math.PI * 2)
    ctx.fill()
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(13, 16)
  tex.anisotropy = 8
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** Architectural gunmetal/navy wall bulkhead paneling with recessed seams and lower dado rail. */
function createWallPanelTexture(): THREE.CanvasTexture {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#1b2a42'
  ctx.fillRect(0, 0, size, size)

  // Lower dark armored base band
  ctx.fillStyle = '#121d30'
  ctx.fillRect(0, size * 0.68, size, size * 0.32)

  // Vertical structural bulkhead ribs
  for (let x = 0; x < size; x += 128) {
    ctx.fillStyle = '#243754'
    ctx.fillRect(x + 8, 16, 112, size * 0.62)
    ctx.strokeStyle = '#0e1726'
    ctx.lineWidth = 4
    ctx.strokeRect(x + 8, 16, 112, size * 0.62)

    // Recessed acoustic/cooling louver vents
    ctx.fillStyle = '#142238'
    for (let v = 0; v < 4; v++) {
      ctx.fillRect(x + 24, 52 + v * 22, 80, 10)
    }
  }

  // Clean steel horizontal trim strip
  ctx.fillStyle = '#3b5275'
  ctx.fillRect(0, size * 0.66, size, 10)

  // Subtle industrial caution hash marks near floor level
  ctx.fillStyle = 'rgba(148, 163, 184, 0.14)'
  for (let x = -64; x < size + 64; x += 36) {
    ctx.beginPath()
    ctx.moveTo(x, size - 32)
    ctx.lineTo(x + 16, size - 32)
    ctx.lineTo(x + 4, size - 12)
    ctx.lineTo(x - 12, size - 12)
    ctx.closePath()
    ctx.fill()
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(8, 2)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** Armored tactical bunker / cover block texture. */
function createCoverTechTexture(): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#263854'
  ctx.fillRect(0, 0, size, size)

  ctx.strokeStyle = '#121e33'
  ctx.lineWidth = 8
  ctx.strokeRect(4, 4, size - 8, size - 8)

  ctx.fillStyle = '#314769'
  ctx.fillRect(20, 20, size - 40, size - 40)

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)'
  ctx.lineWidth = 2
  ctx.strokeRect(24, 24, size - 48, size - 48)

  // Clean horizontal reinforcement ridge
  ctx.fillStyle = '#1b2b44'
  ctx.fillRect(24, size / 2 - 8, size - 48, 16)

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** Semi-transparent futuristic energy glass tactical cover texture. */
function createEnergyGlassTexture(color: 'blue' | 'red'): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  const isRed = color === 'red'
  ctx.fillStyle = isRed ? 'rgba(244, 63, 94, 0.24)' : 'rgba(56, 189, 248, 0.24)'
  ctx.fillRect(0, 0, size, size)

  const step = 64
  for (let y = 0; y < size; y += step) {
    for (let x = 0; x < size; x += step) {
      const alpha = ((x + y) / step) % 2 === 0 ? 0.2 : 0.08
      ctx.fillStyle = isRed ? `rgba(251, 113, 133, ${alpha})` : `rgba(56, 189, 248, ${alpha})`
      ctx.fillRect(x + 4, y + 4, step - 8, step - 8)
    }
  }

  ctx.strokeStyle = isRed ? 'rgba(251, 113, 133, 0.78)' : 'rgba(56, 189, 248, 0.78)'
  ctx.lineWidth = 3
  for (let i = 0; i <= size; i += step) {
    ctx.beginPath()
    ctx.moveTo(i, 0)
    ctx.lineTo(i, size)
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(0, i)
    ctx.lineTo(size, i)
    ctx.stroke()
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(2, 1)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function accentHex(accent?: ArenaBox['accent']): string {
  if (accent === 'blue') return '#38bdf8'
  if (accent === 'red') return '#fb7185'
  return '#22d3ee'
}

function ArenaBlock({
  box,
  blueGlassTex,
  redGlassTex,
  wallTex,
  coverTex,
}: {
  box: ArenaBox
  blueGlassTex: THREE.CanvasTexture
  redGlassTex: THREE.CanvasTexture
  wallTex: THREE.CanvasTexture
  coverTex: THREE.CanvasTexture
}) {
  const sx = box.maxX - box.minX
  const sy = box.maxY - box.minY
  const sz = box.maxZ - box.minZ
  const cx = (box.minX + box.maxX) / 2
  const cy = (box.minY + box.maxY) / 2
  const cz = (box.minZ + box.maxZ) / 2
  const glow = accentHex(box.accent)

  if (box.kind === 'glass') {
    const tex = box.accent === 'red' ? redGlassTex : blueGlassTex
    return (
      <group position={[cx, cy, cz]}>
        {/* Lower solid armored base foot */}
        <mesh position={[0, -sy / 2 + 0.14, 0]} castShadow receiveShadow>
          <boxGeometry args={[sx + 0.08, 0.28, sz + 0.12]} />
          <meshStandardMaterial color="#364e73" metalness={0.26} roughness={0.42} />
        </mesh>
        {/* Translucent energy-glass tactical shield */}
        <mesh>
          <boxGeometry args={[sx, sy - 0.14, sz]} />
          <meshStandardMaterial
            map={tex}
            color={glow}
            emissive={glow}
            emissiveIntensity={0.65}
            transparent
            opacity={0.62}
            roughness={0.18}
            metalness={0.22}
          />
        </mesh>
        {/* Side steel frame posts */}
        <mesh position={[-sx / 2 + 0.06, 0, 0]}>
          <boxGeometry args={[0.12, sy, sz + 0.08]} />
          <meshStandardMaterial color="#47638c" metalness={0.26} roughness={0.38} />
        </mesh>
        <mesh position={[sx / 2 - 0.06, 0, 0]}>
          <boxGeometry args={[0.12, sy, sz + 0.08]} />
          <meshStandardMaterial color="#47638c" metalness={0.26} roughness={0.38} />
        </mesh>
        {/* Clean glowing top rail */}
        <mesh position={[0, sy / 2 + 0.04, 0]}>
          <boxGeometry args={[sx + 0.1, 0.08, sz + 0.08]} />
          <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={1.8} />
        </mesh>
      </group>
    )
  }

  if (box.kind === 'pillar') {
    return (
      <group position={[cx, cy, cz]}>
        {/* Concrete-steel pillar core */}
        <mesh castShadow receiveShadow>
          <boxGeometry args={[sx, sy, sz]} />
          <meshStandardMaterial
            map={coverTex}
            color="#4b648a"
            emissive="#101e33"
            emissiveIntensity={0.4}
            metalness={0.22}
            roughness={0.48}
          />
        </mesh>
        {/* Heavy armored base plinth */}
        <mesh position={[0, -sy / 2 + 0.45, 0]} receiveShadow>
          <boxGeometry args={[sx + 0.36, 0.9, sz + 0.36]} />
          <meshStandardMaterial color="#273a57" metalness={0.28} roughness={0.42} />
        </mesh>
        {/* Upper structural collar */}
        <mesh position={[0, sy / 2 - 0.5, 0]}>
          <boxGeometry args={[sx + 0.32, 0.65, sz + 0.32]} />
          <meshStandardMaterial color="#2d4363" metalness={0.28} roughness={0.4} />
        </mesh>
        {/* Controlled vertical accent light strips */}
        {[
          [-sx / 2 - 0.02, -sz / 2 - 0.02],
          [sx / 2 + 0.02, -sz / 2 - 0.02],
          [-sx / 2 - 0.02, sz / 2 + 0.02],
          [sx / 2 + 0.02, sz / 2 + 0.02],
        ].map(([ox, oz], idx) => (
          <mesh key={idx} position={[ox, 0.4, oz]}>
            <boxGeometry args={[0.1, sy - 2.0, 0.1]} />
            <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={1.6} />
          </mesh>
        ))}
        {/* Mid-height team ring */}
        <mesh position={[0, 1.4, 0]}>
          <boxGeometry args={[sx + 0.14, 0.16, sz + 0.14]} />
          <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={1.5} />
        </mesh>
      </group>
    )
  }

  if (box.kind === 'platform') {
    const isSideDeck = box.id === 'side-deck-w' || box.id === 'side-deck-e'
    return (
      <group position={[cx, cy, cz]}>
        <mesh receiveShadow castShadow>
          <boxGeometry args={[sx, sy, sz]} />
          <meshStandardMaterial
            map={coverTex}
            color="#466085"
            emissive="#0f1d33"
            emissiveIntensity={0.45}
            metalness={0.2}
            roughness={0.5}
          />
        </mesh>
        {/* Top metallic walking surface plate */}
        <mesh position={[0, sy / 2 + 0.02, 0]} receiveShadow>
          <boxGeometry args={[sx - 0.12, 0.04, sz - 0.12]} />
          <meshStandardMaterial color="#4e6b94" metalness={0.22} roughness={0.46} />
        </mesh>
        {/* Crisp glowing cyan safety edge trim */}
        <mesh position={[0, sy / 2 - 0.04, sz / 2 + 0.02]}>
          <boxGeometry args={[sx, 0.09, 0.06]} />
          <meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={1.4} />
        </mesh>
        <mesh position={[0, sy / 2 - 0.04, -sz / 2 - 0.02]}>
          <boxGeometry args={[sx, 0.09, 0.06]} />
          <meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={1.4} />
        </mesh>
        {/* Side Overlook Balcony Guardrail */}
        {isSideDeck && (
          <mesh position={[box.id === 'side-deck-w' ? sx / 2 - 0.12 : -sx / 2 + 0.12, sy / 2 + 0.45, 0]}>
            <boxGeometry args={[0.08, 0.72, sz - 1.2]} />
            <meshStandardMaterial
              color="#38bdf8"
              emissive="#38bdf8"
              emissiveIntensity={0.6}
              transparent
              opacity={0.35}
            />
          </mesh>
        )}
      </group>
    )
  }

  if (box.kind === 'wall') {
    const stripZ = box.id === 'wall-north' ? sz / 2 + 0.05 : box.id === 'wall-south' ? -sz / 2 - 0.05 : 0
    const stripX = box.id === 'wall-west' ? sx / 2 + 0.05 : box.id === 'wall-east' ? -sx / 2 - 0.05 : 0
    const isNS = box.id === 'wall-north' || box.id === 'wall-south'
    return (
      <group position={[cx, cy, cz]}>
        <mesh receiveShadow>
          <boxGeometry args={[sx, sy, sz]} />
          <meshStandardMaterial
            map={wallTex}
            color="#465f82"
            emissive="#0e1a2e"
            emissiveIntensity={0.42}
            metalness={0.18}
            roughness={0.55}
          />
        </mesh>
        {/* Lower accent band */}
        <mesh position={[stripX, -2.6, stripZ]}>
          <boxGeometry args={[isNS ? sx - 1 : 0.1, 0.16, isNS ? 0.1 : sz - 1]} />
          <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={1.4} />
        </mesh>
        {/* Upper stadium light frieze */}
        <mesh position={[stripX, 3.6, stripZ]}>
          <boxGeometry args={[isNS ? sx - 1 : 0.1, 0.14, isNS ? 0.1 : sz - 1]} />
          <meshStandardMaterial color="#94a3b8" emissive={glow} emissiveIntensity={0.85} />
        </mesh>
      </group>
    )
  }

  // Tactical Cover Bunkers & Crates
  return (
    <group position={[cx, cy, cz]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[sx, sy, sz]} />
        <meshStandardMaterial
          map={coverTex}
          color="#4c678d"
          emissive="#112138"
          emissiveIntensity={0.48}
          metalness={0.2}
          roughness={0.48}
        />
      </mesh>
      {/* Top armored cap */}
      <mesh position={[0, sy / 2 + 0.04, 0]} receiveShadow>
        <boxGeometry args={[sx + 0.1, 0.08, sz + 0.1]} />
        <meshStandardMaterial color="#58759e" metalness={0.24} roughness={0.42} />
      </mesh>
      {/* Controlled team identification stripe */}
      <mesh position={[0, sy / 2 - 0.18, 0]}>
        <boxGeometry args={[sx + 0.06, 0.1, sz + 0.06]} />
        <meshStandardMaterial color={glow} emissive={glow} emissiveIntensity={1.5} />
      </mesh>
    </group>
  )
}

/** Central Math Core Reactor Landmark on elevated mid deck (distinctive arena focal point). */
function CenterMathCoreReactor() {
  const crystalRef = useRef<THREE.Mesh>(null)
  const ring1Ref = useRef<THREE.Mesh>(null)
  const ring2Ref = useRef<THREE.Mesh>(null)

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (crystalRef.current) {
      crystalRef.current.rotation.y = t * 0.75
      crystalRef.current.rotation.x = Math.sin(t * 0.6) * 0.22
      crystalRef.current.position.y = 6.2 + Math.sin(t * 1.6) * 0.3
    }
    if (ring1Ref.current) {
      ring1Ref.current.rotation.z = t * 0.65
      ring1Ref.current.rotation.x = Math.PI / 3
    }
    if (ring2Ref.current) {
      ring2Ref.current.rotation.z = -t * 0.5
      ring2Ref.current.rotation.y = Math.PI / 4
    }
  })

  return (
    <group>
      {/* Tiered octagonal pedestal resting on center-deck (y = 2.0) */}
      <mesh position={[0, 2.18, 0]} receiveShadow>
        <cylinderGeometry args={[2.1, 2.45, 0.32, 8]} />
        <meshStandardMaterial color="#344c73" metalness={0.28} roughness={0.4} />
      </mesh>
      <mesh position={[0, 2.38, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.65, 1.98, 24]} />
        <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={1.6} />
      </mesh>

      {/* Subtle holographic emitter column */}
      <mesh position={[0, 4.4, 0]}>
        <cylinderGeometry args={[0.35, 0.85, 4.0, 16, 1, true]} />
        <meshBasicMaterial
          color="#38bdf8"
          transparent
          opacity={0.14}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Suspended Crystalline Math Core */}
      <mesh ref={crystalRef} position={[0, 6.2, 0]}>
        <octahedronGeometry args={[1.1, 0]} />
        <meshStandardMaterial
          color="#7dd3fc"
          emissive="#0ea5e9"
          emissiveIntensity={1.9}
          metalness={0.25}
          roughness={0.16}
        />
      </mesh>
      <mesh ref={ring1Ref} position={[0, 6.2, 0]}>
        <torusGeometry args={[2.0, 0.055, 8, 42]} />
        <meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={1.8} />
      </mesh>
      <mesh ref={ring2Ref} position={[0, 6.2, 0]}>
        <torusGeometry args={[2.45, 0.045, 8, 42]} />
        <meshStandardMaterial color="#fb7185" emissive="#fb7185" emissiveIntensity={1.8} />
      </mesh>
    </group>
  )
}

/** Distinct Blue Command Bay & Red Vanguard Bay Spawn Portals, Pedestals & Lane Navigation Chevrons. */
function TeamBaseLandmarks() {
  const chevronsZ = [-26, -18, 18, 26]
  return (
    <group>
      {/* Blue Command Gate Arch (North) & Red Vanguard Gate Arch (South) */}
      {[
        { z: -43.5, color: '#38bdf8', team: 'blue' as const },
        { z: 43.5, color: '#fb7185', team: 'red' as const },
      ].map(({ z, color, team }) => (
        <group key={team} position={[0, 0, z]}>
          {/* Left & Right Frame Columns */}
          <mesh position={[-11, 3.6, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.9, 7.2, 1.1]} />
            <meshStandardMaterial color="#3a537a" emissive="#0d192d" emissiveIntensity={0.35} metalness={0.26} roughness={0.42} />
          </mesh>
          <mesh position={[11, 3.6, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.9, 7.2, 1.1]} />
            <meshStandardMaterial color="#3a537a" emissive="#0d192d" emissiveIntensity={0.35} metalness={0.26} roughness={0.42} />
          </mesh>
          {/* Overhead Team Header Beam */}
          <mesh position={[0, 7.3, 0]} castShadow>
            <boxGeometry args={[23.2, 0.95, 1.25]} />
            <meshStandardMaterial color="#30486d" emissive="#0c1729" emissiveIntensity={0.35} metalness={0.26} roughness={0.42} />
          </mesh>
          {/* Team Accent Light Bar */}
          <mesh position={[0, 6.82, 0]}>
            <boxGeometry args={[18, 0.16, 1.32]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.8} />
          </mesh>
        </group>
      ))}

      {/* Circular Illuminated Spawn Pad Pedestals */}
      {(['blue', 'red'] as const).map((team) => {
        const col = team === 'blue' ? '#38bdf8' : '#fb7185'
        return TEAM_SPAWNS[team].map((sp, i) => (
          <group key={`${team}-sp-${i}`} position={[sp.position.x, 0.03, sp.position.z]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.9, 1.15, 24]} />
              <meshBasicMaterial color={col} transparent opacity={0.55} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.88, 24]} />
              <meshStandardMaterial color="#253b5c" metalness={0.24} roughness={0.42} />
            </mesh>
          </group>
        ))
      })}

      {/* Floor Lane Directional Strips guiding beginners from Base -> Center Math Core */}
      {chevronsZ.map((z) => {
        const isBlue = z < 0
        const col = isBlue ? '#38bdf8' : '#fb7185'
        return (
          <group key={`lane-${z}`} position={[0, 0.025, z]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[5.5, 0.35]} />
              <meshBasicMaterial color={col} transparent opacity={0.36} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

function JumpPadsVisual() {
  const ringsRef = useRef<Array<THREE.Mesh | null>>([])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    ringsRef.current.forEach((mesh, idx) => {
      if (!mesh) return
      const phase = (t * 1.35 + idx * 0.4) % 1
      mesh.position.y = 0.14 + phase * 1.15
      const s = 1 - phase * 0.32
      mesh.scale.set(s, s, 1)
      const mat = mesh.material as THREE.MeshBasicMaterial
      mat.opacity = (1 - phase) * 0.72
    })
  })

  return (
    <group>
      {JUMP_PADS.map((pad, idx) => {
        const color = pad.accent === 'blue' ? '#38bdf8' : '#fb7185'
        return (
          <group key={pad.id} position={[pad.x, 0, pad.z]}>
            <mesh position={[0, 0.07, 0]} receiveShadow>
              <cylinderGeometry args={[pad.radius, pad.radius + 0.25, 0.14, 20]} />
              <meshStandardMaterial color="#334c72" metalness={0.26} roughness={0.38} />
            </mesh>
            <mesh position={[0, 0.15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[pad.radius * 0.55, pad.radius * 0.92, 20]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={2.1} side={THREE.DoubleSide} />
            </mesh>
            <mesh
              ref={(el) => {
                ringsRef.current[idx] = el
              }}
              position={[0, 0.5, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <ringGeometry args={[pad.radius * 0.65, pad.radius * 0.82, 20]} />
              <meshBasicMaterial color={color} transparent opacity={0.65} side={THREE.DoubleSide} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

/** Stadium Overhead Structural Steel Trusses & Skylight Ceiling Panels. */
function StadiumRoofTrusses() {
  const archPositions = [-40, -20, 0, 20, 40]
  return (
    <group>
      {/* Side longitudinal beams connecting roof trusses */}
      {[-24, 24].map((xPos) => (
        <mesh key={`long-${xPos}`} position={[xPos, 14.1, 0]}>
          <boxGeometry args={[0.7, 0.55, ARENA_BOUNDS.halfLength * 2]} />
          <meshStandardMaterial color="#2d4264" metalness={0.28} roughness={0.44} />
        </mesh>
      ))}
      {archPositions.map((zPos) => {
        const color = zPos === 0 ? '#22d3ee' : zPos < 0 ? '#38bdf8' : '#fb7185'
        return (
          <group key={zPos} position={[0, 13.8, zPos]}>
            <mesh>
              <boxGeometry args={[ARENA_BOUNDS.halfWidth * 2, 0.72, 0.95]} />
              <meshStandardMaterial color="#324a70" metalness={0.28} roughness={0.42} />
            </mesh>
            {/* Cool stadium skylight strip */}
            <mesh position={[0, -0.39, 0]}>
              <boxGeometry args={[ARENA_BOUNDS.halfWidth * 1.45, 0.1, 0.34]} />
              <meshStandardMaterial color="#e2e8f0" emissive={color} emissiveIntensity={1.35} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

function ArenaWorld() {
  const textures = useMemo(
    () => ({
      floor: createTechFloorTexture(),
      wall: createWallPanelTexture(),
      cover: createCoverTechTexture(),
      blueGlass: createEnergyGlassTexture('blue'),
      redGlass: createEnergyGlassTexture('red'),
    }),
    [],
  )

  useEffect(() => {
    return () => {
      textures.floor.dispose()
      textures.wall.dispose()
      textures.cover.dispose()
      textures.blueGlass.dispose()
      textures.redGlass.dispose()
    }
  }, [textures])

  const players = useGameStore((s) => s.room?.players)
  const myId = useGameStore((s) => s.playerId)
  const screen = useGameStore((s) => s.screen)

  const remotePlayers = useMemo(
    () => (players ? players.filter((p) => p.id !== myId) : []),
    [players, myId],
  )

  return (
    <>
      {/* Balanced deep-navy futuristic arena atmosphere (bright enough for instant target clarity) */}
      <color attach="background" args={['#0c1629']} />
      <fog attach="fog" args={['#0c1629', 58, 165]} />

      {/* Balanced 3-Point Esports Arena Lighting */}
      <ambientLight intensity={0.82} color="#cbd5e1" />
      <hemisphereLight args={['#bae6fd', '#24344d', 0.96]} />
      <directionalLight
        position={[18, 32, 16]}
        intensity={1.35}
        color="#f8fafc"
      />
      <directionalLight position={[-16, 20, -16]} intensity={0.95} color="#dbeafe" />

      {/* Controlled Blue vs Red Sector Key Lights */}
      <pointLight position={[0, 10.5, -42]} intensity={32} distance={70} color="#38bdf8" />
      <pointLight position={[0, 10.5, 42]} intensity={32} distance={70} color="#fb7185" />
      <pointLight position={[0, 11.5, 0]} intensity={26} distance={54} color="#bae6fd" />

      {/* Brushed Metallic Arena Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[ARENA_BOUNDS.halfWidth * 2, ARENA_BOUNDS.halfLength * 2]} />
        <meshStandardMaterial
          map={textures.floor}
          emissive="#0d182b"
          emissiveIntensity={0.3}
          roughness={0.48}
          metalness={0.22}
        />
      </mesh>

      {/* Subtle Team Base Zone Floor Tints */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, -47]}>
        <planeGeometry args={[46, 10]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, 47]}>
        <planeGeometry args={[46, 10]} />
        <meshBasicMaterial color="#fb7185" transparent opacity={0.1} />
      </mesh>

      {/* Architectural Blocks (Perimeter Walls, Center Deck, Ramps, Pillars, Bunkers, Energy Glass) */}
      {ARENA_BOXES.map((box) => (
        <ArenaBlock
          key={box.id}
          box={box}
          blueGlassTex={textures.blueGlass}
          redGlassTex={textures.redGlass}
          wallTex={textures.wall}
          coverTex={textures.cover}
        />
      ))}

      <StadiumRoofTrusses />
      <TeamBaseLandmarks />
      <CenterMathCoreReactor />
      <JumpPadsVisual />
      <Suspense fallback={null}>
        <ImportedArenaProps />
      </Suspense>

      {/* Remote Players (Real Multiplayer) & Practice Target Drones (Solo Training Range) */}
      {screen === 'arena' &&
        remotePlayers.map((p) => <RivalAvatar key={p.id} player={p} />)}
      {screen === 'arena' && <PracticeTargetsLayer />}

      {/* 3D Laser Tracers & Tactical Skill World Effects */}
      {screen === 'arena' && <EffectsLayer />}
      {screen === 'arena' && <WorldEffectsLayer />}

      {/* FPS Controller MUST mount before WeaponViewmodel so camera updates first each frame */}
      <PlayerController />
      <WeaponViewmodel />
    </>
  )
}

export function ArenaScene() {
  return (
    <div className="fixed inset-0 z-0">
      <Canvas
        camera={{ fov: 75, near: 0.06, far: 180, position: [0, 10, 26] }}
        dpr={1}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <ArenaWorld />
      </Canvas>
    </div>
  )
}
