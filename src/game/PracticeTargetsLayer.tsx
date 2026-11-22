import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useGameStore, type PracticeTarget } from '../store/useGameStore.ts'

function TargetDrone({ target }: { target: PracticeTarget }) {
  if (!target.alive) return null
  const hpPct = Math.max(0, Math.min(100, (target.hp / target.maxHp) * 100))

  return (
    <group position={[target.position.x, target.position.y, target.position.z]}>
      {/* Base hover ring */}
      <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.36, 0.54, 20]} />
        <meshBasicMaterial color="#fb7185" transparent opacity={0.65} />
      </mesh>

      {/* Support pedestal */}
      <mesh position={[0, 0.42, 0]}>
        <cylinderGeometry args={[0.1, 0.22, 0.72, 12]} />
        <meshStandardMaterial color="#3b5378" metalness={0.25} roughness={0.42} />
      </mesh>

      {/* Armored torso target plate (Body hitbox) */}
      <mesh position={[0, 1.05, 0]} castShadow>
        <boxGeometry args={[0.68, 0.72, 0.32]} />
        <meshStandardMaterial
          color="#4c2640"
          emissive="#240e1f"
          emissiveIntensity={0.45}
          metalness={0.24}
          roughness={0.42}
        />
      </mesh>
      {/* Glowing chest bullseye visible from both sides */}
      <mesh position={[0, 1.05, -0.17]}>
        <ringGeometry args={[0.1, 0.22, 18]} />
        <meshStandardMaterial
          color="#ff4d6d"
          emissive="#ff2e5b"
          emissiveIntensity={2.2}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[0, 1.05, 0.17]}>
        <ringGeometry args={[0.1, 0.22, 18]} />
        <meshStandardMaterial
          color="#ff4d6d"
          emissive="#ff2e5b"
          emissiveIntensity={2.2}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Head target sphere (Headshot hitbox) */}
      <mesh position={[0, 1.58, 0]} castShadow>
        <sphereGeometry args={[0.28, 16, 14]} />
        <meshStandardMaterial
          color="#fbbf24"
          emissive="#f59e0b"
          emissiveIntensity={1.4}
          metalness={0.22}
          roughness={0.3}
        />
      </mesh>

      {/* Overhead label + HP bar */}
      <Html position={[0, 2.22, 0]} center distanceFactor={14} occlude={false}>
        <div className="pointer-events-none flex flex-col items-center gap-0.5 whitespace-nowrap">
          <div className="px-2 py-0.5 text-[10px] font-display font-bold tracking-wider uppercase bg-slate-950/85 border border-rose-400/70 text-rose-200">
            {target.label}
          </div>
          <div className="w-16 h-1.5 bg-slate-950 border border-slate-700 overflow-hidden">
            <div className="h-full bg-amber-400 transition-all duration-100" style={{ width: `${hpPct}%` }} />
          </div>
        </div>
      </Html>
    </group>
  )
}

export function PracticeTargetsLayer() {
  const practiceMode = useGameStore((s) => s.practiceMode)
  const targets = useGameStore((s) => s.practiceTargets)

  if (!practiceMode || targets.length === 0) return null

  return (
    <group>
      {targets.map((target) => (
        <TargetDrone key={target.id} target={target} />
      ))}
    </group>
  )
}
