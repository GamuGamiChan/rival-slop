import { useGLTF } from '@react-three/drei'
import { useMemo } from 'react'
import * as THREE from 'three'
import type { WeaponId } from '../../shared/types.ts'

const BASE_URL = import.meta.env.BASE_URL || './'

const WEAPON_GLB_PATHS: Record<WeaponId, string> = {
  pistol: `${BASE_URL}assets/models/weapons/blaster-h.glb`,
  rifle: `${BASE_URL}assets/models/weapons/blaster-n.glb`,
  shotgun: `${BASE_URL}assets/models/weapons/blaster-l.glb`,
  sniper: `${BASE_URL}assets/models/weapons/blaster-e.glb`,
  revolver: `${BASE_URL}assets/models/weapons/blaster-k.glb`,
  smg: `${BASE_URL}assets/models/weapons/blaster-k.glb`,
  burst: `${BASE_URL}assets/models/weapons/blaster-p.glb`,
  lmg: `${BASE_URL}assets/models/weapons/blaster-p.glb`,
}

// Preload the 4 primary Weapon Pool GLBs so switching weapons is instantaneous
useGLTF.preload(WEAPON_GLB_PATHS.pistol)
useGLTF.preload(WEAPON_GLB_PATHS.rifle)
useGLTF.preload(WEAPON_GLB_PATHS.shotgun)
useGLTF.preload(WEAPON_GLB_PATHS.sniper)

const WEAPON_TRANSFORMS: Record<
  WeaponId,
  { scale: number; position: [number, number, number]; accentLength: number; accentZ: number }
> = {
  pistol: { scale: 0.72, position: [0, -0.02, -0.08], accentLength: 0.24, accentZ: -0.14 },
  revolver: { scale: 0.76, position: [0, -0.02, -0.1], accentLength: 0.28, accentZ: -0.16 },
  smg: { scale: 0.78, position: [0, -0.02, -0.14], accentLength: 0.34, accentZ: -0.2 },
  rifle: { scale: 0.74, position: [0, -0.025, -0.18], accentLength: 0.44, accentZ: -0.24 },
  burst: { scale: 0.68, position: [0, -0.025, -0.2], accentLength: 0.46, accentZ: -0.26 },
  shotgun: { scale: 0.78, position: [0, -0.025, -0.18], accentLength: 0.42, accentZ: -0.24 },
  lmg: { scale: 0.75, position: [0, -0.03, -0.22], accentLength: 0.52, accentZ: -0.28 },
  sniper: { scale: 0.62, position: [0, -0.02, -0.22], accentLength: 0.62, accentZ: -0.36 },
}

export function ImportedWeaponModel({
  weapon,
  accent,
  scaleMultiplier = 1,
}: {
  weapon: WeaponId
  accent: string
  scaleMultiplier?: number
}) {
  const url = WEAPON_GLB_PATHS[weapon]
  const gltf = useGLTF(url)
  const tf = WEAPON_TRANSFORMS[weapon]

  const clonedScene = useMemo(() => {
    const clone = gltf.scene.clone(true)
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        mesh.castShadow = true
        mesh.receiveShadow = true
      }
    })
    return clone
  }, [gltf.scene])

  const finalScale = tf.scale * scaleMultiplier

  return (
    <group scale={[scaleMultiplier, scaleMultiplier, scaleMultiplier]}>
      {/* Audited Kenney Blaster Kit CC0 GLB Mesh rotated 180 deg so barrel points toward -Z */}
      <primitive
        object={clonedScene}
        position={tf.position}
        rotation={[0, Math.PI, 0]}
        scale={[finalScale / scaleMultiplier, finalScale / scaleMultiplier, finalScale / scaleMultiplier]}
      />
      {/* Subtle sci-fi weapon accent rail for instant weapon tier identification */}
      <mesh position={[0.042, 0.025, tf.accentZ]}>
        <boxGeometry args={[0.007, 0.012, tf.accentLength]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={2.6} />
      </mesh>
      <mesh position={[-0.042, 0.025, tf.accentZ]}>
        <boxGeometry args={[0.007, 0.012, tf.accentLength]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={2.6} />
      </mesh>
    </group>
  )
}
