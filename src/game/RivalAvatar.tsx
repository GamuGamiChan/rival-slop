import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import type { PlayerPublicState } from '../../shared/types.ts'
import { WEAPONS } from '../../shared/weapons.ts'
import { useGameStore } from '../store/useGameStore.ts'

interface RivalAvatarProps {
  player: PlayerPublicState
}

export function RivalAvatar({ player }: RivalAvatarProps) {
  const groupRef = useRef<THREE.Group>(null)
  const leftLegRef = useRef<THREE.Mesh>(null)
  const rightLegRef = useRef<THREE.Mesh>(null)
  const strideRef = useRef(0)
  const smoothedPosRef = useRef(new THREE.Vector3(player.position.x, player.position.y, player.position.z))
  const smoothedYawRef = useRef(player.yaw)

  const teamColor = player.team === 'blue' ? '#00e5ff' : '#ff2e5b'
  const armorBase = player.team === 'blue' ? '#0d2238' : '#31101d'
  const weaponColor = player.weapon ? WEAPONS[player.weapon].accentColor : '#64748b'

  useFrame((_, rawDelta) => {
    const group = groupRef.current
    if (!group) return

    const dt = Math.min(rawDelta, 0.05)
    const live = useGameStore.getState().liveTransforms.get(player.id)
    const alive = live ? live.alive : player.alive

    group.visible = alive && player.connected
    if (!group.visible) return

    const targetPos = live ? live.position : player.position
    const targetYaw = live ? live.yaw : player.yaw

    const prevX = smoothedPosRef.current.x
    const prevZ = smoothedPosRef.current.z

    const alpha = Math.min(1, dt * 16)
    smoothedPosRef.current.lerp(new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z), alpha)

    // Shortest-angle yaw interpolation
    let diff = targetYaw - smoothedYawRef.current
    while (diff > Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2
    smoothedYawRef.current += diff * alpha

    group.position.copy(smoothedPosRef.current)
    group.rotation.y = smoothedYawRef.current

    // Leg stride animation based on horizontal speed
    const moved = Math.hypot(smoothedPosRef.current.x - prevX, smoothedPosRef.current.z - prevZ)
    const speed = moved / Math.max(0.001, dt)
    if (speed > 0.35) {
      strideRef.current += dt * Math.min(14, speed * 1.6)
      const swing = Math.sin(strideRef.current) * 0.45
      if (leftLegRef.current) leftLegRef.current.rotation.x = swing
      if (rightLegRef.current) rightLegRef.current.rotation.x = -swing
    } else {
      if (leftLegRef.current) leftLegRef.current.rotation.x *= 0.85
      if (rightLegRef.current) rightLegRef.current.rotation.x *= 0.85
    }
  })

  if (!player.connected) return null

  const hpPct = Math.max(0, Math.min(100, (player.hp / player.maxHp) * 100))

  return (
    <group ref={groupRef} position={[player.position.x, player.position.y, player.position.z]}>
      {/* Cyber Boots / Legs */}
      <mesh ref={leftLegRef} position={[-0.16, 0.36, 0]} castShadow>
        <boxGeometry args={[0.2, 0.72, 0.24]} />
        <meshStandardMaterial color={armorBase} metalness={0.55} roughness={0.35} />
      </mesh>
      <mesh ref={rightLegRef} position={[0.16, 0.36, 0]} castShadow>
        <boxGeometry args={[0.2, 0.72, 0.24]} />
        <meshStandardMaterial color={armorBase} metalness={0.55} roughness={0.35} />
      </mesh>

      {/* Armored Torso */}
      <mesh position={[0, 1.04, 0]} castShadow>
        <boxGeometry args={[0.64, 0.68, 0.36]} />
        <meshStandardMaterial color={armorBase} metalness={0.6} roughness={0.3} />
      </mesh>
      {/* Glowing Neon Chest Core */}
      <mesh position={[0, 1.08, -0.19]}>
        <boxGeometry args={[0.26, 0.22, 0.04]} />
        <meshStandardMaterial color={teamColor} emissive={teamColor} emissiveIntensity={3.0} />
      </mesh>
      {/* Back Spine Strip */}
      <mesh position={[0, 1.08, 0.19]}>
        <boxGeometry args={[0.12, 0.44, 0.04]} />
        <meshStandardMaterial color={teamColor} emissive={teamColor} emissiveIntensity={2.5} />
      </mesh>

      {/* Angular Shoulder Pauldrons */}
      <mesh position={[-0.42, 1.24, 0]}>
        <boxGeometry args={[0.2, 0.24, 0.34]} />
        <meshStandardMaterial color={teamColor} emissive={teamColor} emissiveIntensity={1.2} metalness={0.5} />
      </mesh>
      <mesh position={[0.42, 1.24, 0]}>
        <boxGeometry args={[0.2, 0.24, 0.34]} />
        <meshStandardMaterial color={teamColor} emissive={teamColor} emissiveIntensity={1.2} metalness={0.5} />
      </mesh>

      {/* Arms */}
      <mesh position={[-0.42, 0.96, -0.06]}>
        <boxGeometry args={[0.17, 0.44, 0.2]} />
        <meshStandardMaterial color={armorBase} metalness={0.55} roughness={0.4} />
      </mesh>
      <mesh position={[0.42, 0.98, -0.14]} rotation={[0.45, 0, 0]}>
        <boxGeometry args={[0.17, 0.46, 0.2]} />
        <meshStandardMaterial color={armorBase} metalness={0.55} roughness={0.4} />
      </mesh>

      {/* Cyber Helmet (Head Hitbox Center Y = 1.58) */}
      <mesh position={[0, 1.58, 0]} castShadow>
        <boxGeometry args={[0.44, 0.42, 0.44]} />
        <meshStandardMaterial color="#0f172a" metalness={0.7} roughness={0.25} />
      </mesh>
      {/* Bright Glowing Visor (Faces -Z forward) */}
      <mesh position={[0, 1.6, -0.225]}>
        <boxGeometry args={[0.36, 0.14, 0.04]} />
        <meshStandardMaterial color={teamColor} emissive={teamColor} emissiveIntensity={4.2} />
      </mesh>
      {/* Helmet Crest Glow */}
      <mesh position={[0, 1.81, 0]}>
        <boxGeometry args={[0.08, 0.05, 0.36]} />
        <meshStandardMaterial color={teamColor} emissive={teamColor} emissiveIntensity={3.2} />
      </mesh>

      {/* Held Sci-Fi Weapon */}
      {player.weapon && (
        <group position={[0.38, 1.02, -0.45]}>
          <mesh>
            <boxGeometry
              args={[
                0.09,
                0.1,
                player.weapon === 'sniper' ? 0.92 : player.weapon === 'pistol' ? 0.34 : 0.62,
              ]}
            />
            <meshStandardMaterial color="#e2e8f0" metalness={0.6} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.03, -0.12]}>
            <boxGeometry
              args={[
                0.1,
                0.025,
                player.weapon === 'sniper' ? 0.72 : player.weapon === 'pistol' ? 0.22 : 0.45,
              ]}
            />
            <meshStandardMaterial color={weaponColor} emissive={weaponColor} emissiveIntensity={3.5} />
          </mesh>
        </group>
      )}

      {/* Tactical Overhead Nameplate & HP Bar */}
      {player.alive && (
        <Html position={[0, 2.25, 0]} center distanceFactor={14} occlude={false}>
          <div className="pointer-events-none flex flex-col items-center gap-0.5 whitespace-nowrap">
            <div
              className={`px-2 py-0.5 text-[11px] font-bold tracking-wider uppercase rounded-sm border backdrop-blur-sm ${
                player.team === 'blue'
                  ? 'bg-sky-950/85 border-cyan-400/70 text-cyan-200'
                  : 'bg-rose-950/85 border-rose-500/70 text-rose-200'
              }`}
            >
              {player.name}
            </div>
            <div className="w-16 h-1.5 bg-slate-950/90 border border-slate-700/80 overflow-hidden">
              <div
                className={`h-full transition-all duration-100 ${
                  player.team === 'blue' ? 'bg-cyan-400' : 'bg-rose-500'
                }`}
                style={{ width: `${hpPct}%` }}
              />
            </div>
          </div>
        </Html>
      )}
    </group>
  )
}
