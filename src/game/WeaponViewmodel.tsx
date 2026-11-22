import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import type { WeaponId } from '../../shared/types.ts'
import { WEAPONS } from '../../shared/weapons.ts'
import { selectMyPlayer, useGameStore } from '../store/useGameStore.ts'

function PistolMesh({ accent }: { accent: string }) {
  return (
    <group>
      {/* Main white-alloy upper slide */}
      <mesh position={[0, 0.02, -0.1]}>
        <boxGeometry args={[0.068, 0.072, 0.34]} />
        <meshStandardMaterial color="#e2e8f0" metalness={0.55} roughness={0.28} />
      </mesh>
      {/* Obsidian lower frame */}
      <mesh position={[0, -0.025, -0.07]}>
        <boxGeometry args={[0.056, 0.05, 0.28]} />
        <meshStandardMaterial color="#0f172a" metalness={0.7} roughness={0.35} />
      </mesh>
      {/* Angled grip */}
      <mesh position={[0, -0.095, 0.04]} rotation={[0.25, 0, 0]}>
        <boxGeometry args={[0.05, 0.13, 0.075]} />
        <meshStandardMaterial color="#1e293b" roughness={0.6} />
      </mesh>
      {/* Twin neon side rails */}
      <mesh position={[0.037, 0.025, -0.12]}>
        <boxGeometry args={[0.008, 0.016, 0.28]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={3.2} />
      </mesh>
      <mesh position={[-0.037, 0.025, -0.12]}>
        <boxGeometry args={[0.008, 0.016, 0.28]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={3.2} />
      </mesh>
      {/* Glowing emitter tip */}
      <mesh position={[0, 0.022, -0.275]}>
        <boxGeometry args={[0.036, 0.034, 0.02]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={4} />
      </mesh>
    </group>
  )
}

function RifleMesh({ accent }: { accent: string }) {
  return (
    <group>
      {/* Receiver body */}
      <mesh position={[0, 0.01, -0.16]}>
        <boxGeometry args={[0.078, 0.095, 0.54]} />
        <meshStandardMaterial color="#0f172a" metalness={0.65} roughness={0.3} />
      </mesh>
      {/* Sleek white upper shroud */}
      <mesh position={[0, 0.052, -0.18]}>
        <boxGeometry args={[0.064, 0.036, 0.48]} />
        <meshStandardMaterial color="#f1f5f9" metalness={0.45} roughness={0.25} />
      </mesh>
      {/* Extended plasma barrel */}
      <mesh position={[0, 0.022, -0.49]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.018, 0.022, 0.24, 12]} />
        <meshStandardMaterial color="#1e293b" metalness={0.85} roughness={0.2} />
      </mesh>
      {/* Holographic sight frame */}
      <mesh position={[0, 0.098, -0.08]}>
        <boxGeometry args={[0.05, 0.048, 0.085]} />
        <meshStandardMaterial color="#0b1120" metalness={0.8} roughness={0.25} />
      </mesh>
      {/* Glowing holo lens */}
      <mesh position={[0, 0.1, -0.08]}>
        <boxGeometry args={[0.036, 0.032, 0.01]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={2.8} transparent opacity={0.5} />
      </mesh>
      {/* Neon energy strips */}
      <mesh position={[0.041, 0.02, -0.22]}>
        <boxGeometry args={[0.008, 0.018, 0.4]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={3.5} />
      </mesh>
      <mesh position={[-0.041, 0.02, -0.22]}>
        <boxGeometry args={[0.008, 0.018, 0.4]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={3.5} />
      </mesh>
      {/* Energy cell magazine */}
      <mesh position={[0, -0.09, -0.16]} rotation={[0.16, 0, 0]}>
        <boxGeometry args={[0.046, 0.14, 0.072]} />
        <meshStandardMaterial color="#1e293b" metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[0, -0.11, -0.16]} rotation={[0.16, 0, 0]}>
        <boxGeometry args={[0.05, 0.06, 0.025]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={3.0} />
      </mesh>
    </group>
  )
}

function ShotgunMesh({ accent }: { accent: string }) {
  return (
    <group>
      {/* Heavy wide chassis */}
      <mesh position={[0, 0.01, -0.18]}>
        <boxGeometry args={[0.105, 0.11, 0.48]} />
        <meshStandardMaterial color="#111827" metalness={0.7} roughness={0.32} />
      </mesh>
      {/* White armored top shield */}
      <mesh position={[0, 0.065, -0.2]}>
        <boxGeometry args={[0.09, 0.03, 0.42]} />
        <meshStandardMaterial color="#e2e8f0" metalness={0.5} roughness={0.28} />
      </mesh>
      {/* Twin scatter barrels */}
      <mesh position={[-0.026, 0.025, -0.46]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.022, 0.024, 0.22, 12]} />
        <meshStandardMaterial color="#334155" metalness={0.85} roughness={0.2} />
      </mesh>
      <mesh position={[0.026, 0.025, -0.46]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.022, 0.024, 0.22, 12]} />
        <meshStandardMaterial color="#334155" metalness={0.85} roughness={0.2} />
      </mesh>
      {/* Glowing plasma pump & coils */}
      <mesh position={[0, -0.052, -0.32]}>
        <boxGeometry args={[0.088, 0.048, 0.22]} />
        <meshStandardMaterial color="#1e293b" roughness={0.5} />
      </mesh>
      <mesh position={[0.055, 0.015, -0.26]}>
        <boxGeometry args={[0.012, 0.026, 0.34]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={3.8} />
      </mesh>
      <mesh position={[-0.055, 0.015, -0.26]}>
        <boxGeometry args={[0.012, 0.026, 0.34]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={3.8} />
      </mesh>
    </group>
  )
}

function SniperMesh({ accent }: { accent: string }) {
  return (
    <group>
      {/* Sleek railgun frame */}
      <mesh position={[0, 0.01, -0.22]}>
        <boxGeometry args={[0.068, 0.085, 0.62]} />
        <meshStandardMaterial color="#0b1120" metalness={0.75} roughness={0.25} />
      </mesh>
      {/* Long split electromagnetic rails */}
      <mesh position={[0, 0.042, -0.62]}>
        <boxGeometry args={[0.028, 0.022, 0.5]} />
        <meshStandardMaterial color="#f1f5f9" metalness={0.6} roughness={0.2} />
      </mesh>
      <mesh position={[0, -0.01, -0.62]}>
        <boxGeometry args={[0.028, 0.022, 0.5]} />
        <meshStandardMaterial color="#f1f5f9" metalness={0.6} roughness={0.2} />
      </mesh>
      {/* Glowing crimson plasma channel between rails */}
      <mesh position={[0, 0.016, -0.58]}>
        <boxGeometry args={[0.016, 0.018, 0.56]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={4.5} />
      </mesh>
      {/* Precision scope cylinder */}
      <mesh position={[0, 0.095, -0.14]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.026, 0.022, 0.28, 14]} />
        <meshStandardMaterial color="#1e293b" metalness={0.85} roughness={0.2} />
      </mesh>
      {/* Glowing scope ring */}
      <mesh position={[0, 0.095, -0.28]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.028, 0.028, 0.018, 14]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={3.5} />
      </mesh>
    </group>
  )
}

export function WeaponViewmodel() {
  const { camera } = useThree()
  const rootRef = useRef<THREE.Group>(null)
  const weaponPivotRef = useRef<THREE.Group>(null)
  const muzzleRef = useRef<THREE.Mesh>(null)
  const bobPhaseRef = useRef(0)
  const prevPosRef = useRef(new THREE.Vector3())
  const adsLerpRef = useRef(0)

  const weapon: WeaponId | null = useGameStore((s) => selectMyPlayer(s)?.weapon ?? null)
  const alive = useGameStore((s) => selectMyPlayer(s)?.alive ?? false)
  const phase = useGameStore((s) => s.room?.phase ?? 'lobby')
  const isAdsZoom = useGameStore((s) => s.isAdsZoom)

  useFrame((_, rawDelta) => {
    const root = rootRef.current
    const pivot = weaponPivotRef.current
    if (!root || !pivot) return

    const dt = Math.min(rawDelta, 0.05)
    const state = useGameStore.getState()
    const me = selectMyPlayer(state)

    // Hide viewmodel in Sniper full-scope zoom or when unarmed/dead
    const hideForScope = state.isAdsZoom && me?.weapon === 'sniper'
    root.visible = Boolean(me?.weapon && me.alive && state.room?.phase === 'playing' && !hideForScope)
    if (!root.visible) return

    // Lock viewmodel root to camera transform seamlessly
    root.position.copy(camera.position)
    root.quaternion.copy(camera.quaternion)

    // Compute horizontal movement speed for smooth weapon walk bob
    const moveDist = Math.hypot(
      camera.position.x - prevPosRef.current.x,
      camera.position.z - prevPosRef.current.z,
    )
    prevPosRef.current.copy(camera.position)
    const speedNorm = Math.min(1, moveDist / Math.max(0.001, dt * 8))
    bobPhaseRef.current += dt * (4 + speedNorm * 8)

    // ADS interpolation
    const targetAds = state.isAdsZoom ? 1 : 0
    adsLerpRef.current += (targetAds - adsLerpRef.current) * Math.min(1, dt * 14)

    // Recoil kickback decay
    const msSinceShot = performance.now() - state.lastShotVisualAt
    const recoil = msSinceShot < 160 ? Math.pow(1 - msSinceShot / 160, 2) : 0

    // Reload tilt animation
    const nowServer = Date.now() + state.clockOffsetMs
    const isReloading = Boolean(me?.reloadingUntil && nowServer < me.reloadingUntil)
    const reloadTilt = isReloading ? -0.58 : 0
    const reloadDrop = isReloading ? -0.1 : 0

    const baseX = THREE.MathUtils.lerp(0.24, 0.0, adsLerpRef.current)
    const baseY = THREE.MathUtils.lerp(-0.21, -0.145, adsLerpRef.current)
    const baseZ = THREE.MathUtils.lerp(-0.38, -0.32, adsLerpRef.current)

    const bobX = Math.cos(bobPhaseRef.current) * 0.008 * speedNorm * (1 - adsLerpRef.current * 0.8)
    const bobY = Math.abs(Math.sin(bobPhaseRef.current)) * 0.01 * speedNorm * (1 - adsLerpRef.current * 0.8)

    pivot.position.set(baseX + bobX, baseY - bobY + reloadDrop + recoil * 0.018, baseZ + recoil * 0.075)
    pivot.rotation.set(recoil * 0.16 + reloadTilt, isReloading ? 0.35 : 0, isReloading ? -0.25 : 0)

    // Muzzle flash pop (first 65ms after shot)
    if (muzzleRef.current) {
      const flashVisible = msSinceShot < 65
      muzzleRef.current.visible = flashVisible
      if (flashVisible) {
        const s = 0.8 + (1 - msSinceShot / 65) * 0.7
        muzzleRef.current.scale.set(s, s, s)
        muzzleRef.current.rotation.z = msSinceShot * 0.25
      }
    }
  })

  if (!weapon || !alive || phase !== 'playing') return null
  const spec = WEAPONS[weapon]
  const muzzleZ = weapon === 'sniper' ? -0.9 : weapon === 'rifle' || weapon === 'shotgun' ? -0.62 : -0.31

  return (
    <group ref={rootRef} visible={!isAdsZoom || weapon !== 'sniper'}>
      <pointLight position={[0.15, 0.25, -0.15]} intensity={1.8} distance={2.5} color="#dbeafe" />
      <group ref={weaponPivotRef}>
        {weapon === 'pistol' && <PistolMesh accent={spec.accentColor} />}
        {weapon === 'rifle' && <RifleMesh accent={spec.accentColor} />}
        {weapon === 'shotgun' && <ShotgunMesh accent={spec.accentColor} />}
        {weapon === 'sniper' && <SniperMesh accent={spec.accentColor} />}

        {/* Muzzle energy burst */}
        <mesh ref={muzzleRef} position={[0, 0.025, muzzleZ]} visible={false}>
          <octahedronGeometry args={[0.075, 0]} />
          <meshBasicMaterial color={spec.accentColor} transparent opacity={0.92} />
        </mesh>
      </group>
    </group>
  )
}
