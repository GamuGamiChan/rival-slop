import { useGLTF, useTexture } from '@react-three/drei'
import { useMemo } from 'react'
import * as THREE from 'three'

const BASE_URL = import.meta.env.BASE_URL || './'

const ARENA_PROP_PATHS = {
  crate: `${BASE_URL}assets/models/props/quaternius-cube-crate.glb`,
  barrel: `${BASE_URL}assets/models/props/quaternius-barrel.glb`,
  fence: `${BASE_URL}assets/models/props/kenney-fence-fortified.glb`,
  tower: `${BASE_URL}assets/models/props/quaternius-guard-tower.glb`,
} as const

const ARENA_PBR_TEXTURE_PATHS = {
  metalColor: `${BASE_URL}assets/textures/metal038/Metal038_1K-JPG_Color.jpg`,
  metalRoughness: `${BASE_URL}assets/textures/metal038/Metal038_1K-JPG_Roughness.jpg`,
} as const

useGLTF.preload(ARENA_PROP_PATHS.crate)
useGLTF.preload(ARENA_PROP_PATHS.barrel)
useGLTF.preload(ARENA_PROP_PATHS.fence)
useGLTF.preload(ARENA_PROP_PATHS.tower)

const CRATE_PLACEMENTS: Array<{
  pos: [number, number, number]
  rotY: number
  scale: number
}> = [
  // Blue command sector supply crates
  { pos: [-16.2, 0.55, -21.5], rotY: 0.35, scale: 0.55 },
  { pos: [16.2, 0.55, -21.5], rotY: -0.35, scale: 0.55 },
  // Red vanguard sector supply crates
  { pos: [-16.2, 0.55, 21.5], rotY: 0.45, scale: 0.55 },
  { pos: [16.2, 0.55, 21.5], rotY: -0.45, scale: 0.55 },
  // Mid flank deck tactical cargo crates
  { pos: [-18.2, 2.55, -4.2], rotY: 0.2, scale: 0.52 },
  { pos: [18.2, 2.55, 4.2], rotY: -0.2, scale: 0.52 },
]

const BARREL_PLACEMENTS: Array<{
  pos: [number, number, number]
  rotY: number
  scale: number
}> = [
  { pos: [-17.4, 0.48, -20.2], rotY: 0.1, scale: 0.65 },
  { pos: [17.4, 0.48, -20.2], rotY: 1.2, scale: 0.65 },
  { pos: [-17.4, 0.48, 20.2], rotY: 0.8, scale: 0.65 },
  { pos: [17.4, 0.48, 20.2], rotY: 2.1, scale: 0.65 },
]

const FENCE_PLACEMENTS: Array<{
  pos: [number, number, number]
  rotY: number
  scale: [number, number, number]
}> = [
  { pos: [-13.5, 0, -25.2], rotY: 0, scale: [3.2, 2.4, 3.2] },
  { pos: [13.5, 0, -25.2], rotY: 0, scale: [3.2, 2.4, 3.2] },
  { pos: [-13.5, 0, 25.2], rotY: Math.PI, scale: [3.2, 2.4, 3.2] },
  { pos: [13.5, 0, 25.2], rotY: Math.PI, scale: [3.2, 2.4, 3.2] },
]

const TOWER_PLACEMENTS: Array<{
  pos: [number, number, number]
  rotY: number
  scale: number
}> = [
  { pos: [-19.2, 1.9, -28.2], rotY: 0.78, scale: 1.35 },
  { pos: [19.2, 1.9, -28.2], rotY: -0.78, scale: 1.35 },
  { pos: [-19.2, 1.9, 28.2], rotY: 2.35, scale: 1.35 },
  { pos: [19.2, 1.9, 28.2], rotY: -2.35, scale: 1.35 },
]

export function ImportedArenaProps() {
  const crateGltf = useGLTF(ARENA_PROP_PATHS.crate)
  const barrelGltf = useGLTF(ARENA_PROP_PATHS.barrel)
  const fenceGltf = useGLTF(ARENA_PROP_PATHS.fence)
  const towerGltf = useGLTF(ARENA_PROP_PATHS.tower)

  const pbrMaps = useTexture(
    {
      map: ARENA_PBR_TEXTURE_PATHS.metalColor,
      roughnessMap: ARENA_PBR_TEXTURE_PATHS.metalRoughness,
    },
    (loaded) => {
      const textures = Array.isArray(loaded) ? loaded : Object.values(loaded)
      textures.forEach((tex, idx) => {
        tex.wrapS = THREE.RepeatWrapping
        tex.wrapT = THREE.RepeatWrapping
        tex.repeat.set(4, 4)
        if (idx === 0) {
          tex.colorSpace = THREE.SRGBColorSpace
        }
      })
    },
  )

  const crates = useMemo(
    () => CRATE_PLACEMENTS.map(() => crateGltf.scene.clone(true)),
    [crateGltf.scene],
  )
  const barrels = useMemo(
    () => BARREL_PLACEMENTS.map(() => barrelGltf.scene.clone(true)),
    [barrelGltf.scene],
  )
  const fences = useMemo(
    () => FENCE_PLACEMENTS.map(() => fenceGltf.scene.clone(true)),
    [fenceGltf.scene],
  )
  const towers = useMemo(
    () => TOWER_PLACEMENTS.map(() => towerGltf.scene.clone(true)),
    [towerGltf.scene],
  )

  return (
    <group name="audited-cc0-arena-props">
      {/* Audited ambientCG Metal038 PBR Center Reactor Armour Ring */}
      <mesh position={[0, 2.04, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[2.45, 3.85, 32]} />
        <meshStandardMaterial
          map={pbrMaps.map}
          roughnessMap={pbrMaps.roughnessMap}
          color="#64748b"
          metalness={0.78}
          roughness={0.42}
        />
      </mesh>

      {/* Quaternius Sci-Fi Cargo Crates (CC0) */}
      {CRATE_PLACEMENTS.map((item, i) => (
        <primitive
          key={`crate-${i}`}
          object={crates[i]}
          position={item.pos}
          rotation={[0, item.rotY, 0]}
          scale={[item.scale, item.scale, item.scale]}
        />
      ))}

      {/* Quaternius Sci-Fi Energy Barrels (CC0) */}
      {BARREL_PLACEMENTS.map((item, i) => (
        <primitive
          key={`barrel-${i}`}
          object={barrels[i]}
          position={item.pos}
          rotation={[0, item.rotY, 0]}
          scale={[item.scale, item.scale, item.scale]}
        />
      ))}

      {/* Kenney Fortified Perimeter Barriers (CC0) */}
      {FENCE_PLACEMENTS.map((item, i) => (
        <primitive
          key={`fence-${i}`}
          object={fences[i]}
          position={item.pos}
          rotation={[0, item.rotY, 0]}
          scale={item.scale}
        />
      ))}

      {/* Quaternius Corner Guard Watchtowers (CC0) */}
      {TOWER_PLACEMENTS.map((item, i) => (
        <primitive
          key={`tower-${i}`}
          object={towers[i]}
          position={item.pos}
          rotation={[0, item.rotY, 0]}
          scale={[item.scale, item.scale, item.scale]}
        />
      ))}
    </group>
  )
}
