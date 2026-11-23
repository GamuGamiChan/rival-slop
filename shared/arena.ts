import type { PickupCrateKind, Team, Vec3 } from './types.ts'

export interface ArenaBox {
  id: string
  minX: number
  maxX: number
  minY: number
  maxY: number
  minZ: number
  maxZ: number
  kind: 'wall' | 'platform' | 'pillar' | 'cover' | 'glass' | 'arch'
  accent?: 'blue' | 'red' | 'neutral'
}

export interface JumpPad {
  id: string
  x: number
  y: number
  z: number
  radius: number
  boostY: number
  accent: 'blue' | 'red' | 'neutral'
}

export const ARENA_BOUNDS = {
  halfWidth: 46, // X: -46..46 (92m wide)
  halfLength: 56, // Z: -56..56 (112m long)
  ceilingY: 20,
} as const

export const PLAYER_DIMENSIONS = {
  radius: 0.48,
  height: 1.85,
  eyeHeight: 1.56,
  headCenterY: 1.58,
  headRadius: 0.3,
  bodyMinY: 0.05,
  bodyMaxY: 1.38,
  bodyRadius: 0.44,
} as const

/**
 * Expanded Symmetric Futuristic Neon Arena (92m x 112m):
 * - Blue Base at Z = -48 (facing +Z)
 * - Red Base at Z = +48 (facing -Z)
 * - Center elevated Math Core Platform (Y = 2.0) accessible via stepped ramps & 6 jump pads
 * - Outer flanking decks, tactical cover bunkers, neon pillars, and wide slide lanes
 */
export const ARENA_BOXES: ArenaBox[] = [
  // Perimeter Arena Walls
  { id: 'wall-north', minX: -47, maxX: 47, minY: 0, maxY: 14, minZ: -57, maxZ: -56, kind: 'wall', accent: 'blue' },
  { id: 'wall-south', minX: -47, maxX: 47, minY: 0, maxY: 14, minZ: 56, maxZ: 57, kind: 'wall', accent: 'red' },
  { id: 'wall-west', minX: -47, maxX: -46, minY: 0, maxY: 14, minZ: -56, maxZ: 56, kind: 'wall', accent: 'neutral' },
  { id: 'wall-east', minX: 46, maxX: 47, minY: 0, maxY: 14, minZ: -56, maxZ: 56, kind: 'wall', accent: 'neutral' },

  // Central Elevated Neon Core Platform (walkable top at Y = 2.0)
  { id: 'center-deck', minX: -9.0, maxX: 9.0, minY: 0, maxY: 2.0, minZ: -7.5, maxZ: 7.5, kind: 'platform', accent: 'neutral' },
  // Stepped Ramps onto Central Deck (West & East sides — keep X=-11 maxY<=0.65 so eyeHeight=1.56 stays clear)
  { id: 'ramp-w1', minX: -10.5, maxX: -9.0, minY: 0, maxY: 1.32, minZ: -4.0, maxZ: 4.0, kind: 'platform', accent: 'neutral' },
  { id: 'ramp-w2', minX: -13.0, maxX: -10.5, minY: 0, maxY: 0.65, minZ: -4.0, maxZ: 4.0, kind: 'platform', accent: 'neutral' },
  { id: 'ramp-e1', minX: 9.0, maxX: 10.5, minY: 0, maxY: 1.32, minZ: -4.0, maxZ: 4.0, kind: 'platform', accent: 'neutral' },
  { id: 'ramp-e2', minX: 10.5, maxX: 13.0, minY: 0, maxY: 0.65, minZ: -4.0, maxZ: 4.0, kind: 'platform', accent: 'neutral' },

  // Center Deck Chest-High Cover Shields (Blue & Red edges)
  { id: 'center-shield-n', minX: -4.5, maxX: 4.5, minY: 2.0, maxY: 3.3, minZ: -7.2, maxZ: -6.5, kind: 'glass', accent: 'blue' },
  { id: 'center-shield-s', minX: -4.5, maxX: 4.5, minY: 2.0, maxY: 3.3, minZ: 6.5, maxZ: 7.2, kind: 'glass', accent: 'red' },

  // Four Towering Neon Arena Pillars (Wide Outer Ring)
  { id: 'pillar-nw', minX: -25.0, maxX: -22.0, minY: 0, maxY: 13, minZ: -24.0, maxZ: -21.0, kind: 'pillar', accent: 'blue' },
  { id: 'pillar-ne', minX: 22.0, maxX: 25.0, minY: 0, maxY: 13, minZ: -24.0, maxZ: -21.0, kind: 'pillar', accent: 'blue' },
  { id: 'pillar-sw', minX: -25.0, maxX: -22.0, minY: 0, maxY: 13, minZ: 21.0, maxZ: 24.0, kind: 'pillar', accent: 'red' },
  { id: 'pillar-se', minX: 22.0, maxX: 25.0, minY: 0, maxY: 13, minZ: 21.0, maxZ: 24.0, kind: 'pillar', accent: 'red' },

  // Mid-Lane Tactical Bunkers & Cover Crates
  { id: 'mid-bunker-nw', minX: -19.0, maxX: -15.0, minY: 0, maxY: 2.2, minZ: -14.0, maxZ: -11.5, kind: 'cover', accent: 'blue' },
  { id: 'mid-bunker-ne', minX: 15.0, maxX: 19.0, minY: 0, maxY: 2.2, minZ: -14.0, maxZ: -11.5, kind: 'cover', accent: 'blue' },
  { id: 'mid-bunker-sw', minX: -19.0, maxX: -15.0, minY: 0, maxY: 2.2, minZ: 11.5, maxZ: 14.0, kind: 'cover', accent: 'red' },
  { id: 'mid-bunker-se', minX: 15.0, maxX: 19.0, minY: 0, maxY: 2.2, minZ: 11.5, maxZ: 14.0, kind: 'cover', accent: 'red' },

  // Blue Side Base Cover & Energy Glass Walls
  { id: 'blue-bunker-c', minX: -6.5, maxX: 6.5, minY: 0, maxY: 2.4, minZ: -31.5, maxZ: -30.0, kind: 'cover', accent: 'blue' },
  { id: 'blue-glass-l', minX: -22.0, maxX: -13.0, minY: 0, maxY: 3.2, minZ: -38.5, maxZ: -37.6, kind: 'glass', accent: 'blue' },
  { id: 'blue-glass-r', minX: 13.0, maxX: 22.0, minY: 0, maxY: 3.2, minZ: -38.5, maxZ: -37.6, kind: 'glass', accent: 'blue' },
  { id: 'blue-crate-l', minX: -36.0, maxX: -32.0, minY: 0, maxY: 2.2, minZ: -20.0, maxZ: -17.0, kind: 'cover', accent: 'blue' },
  { id: 'blue-crate-r', minX: 32.0, maxX: 36.0, minY: 0, maxY: 2.2, minZ: -20.0, maxZ: -17.0, kind: 'cover', accent: 'blue' },

  // Red Side Base Cover & Energy Glass Walls (mirror of Blue)
  { id: 'red-bunker-c', minX: -6.5, maxX: 6.5, minY: 0, maxY: 2.4, minZ: 30.0, maxZ: 31.5, kind: 'cover', accent: 'red' },
  { id: 'red-glass-l', minX: -22.0, maxX: -13.0, minY: 0, maxY: 3.2, minZ: 37.6, maxZ: 38.5, kind: 'glass', accent: 'red' },
  { id: 'red-glass-r', minX: 13.0, maxX: 22.0, minY: 0, maxY: 3.2, minZ: 37.6, maxZ: 38.5, kind: 'glass', accent: 'red' },
  { id: 'red-crate-l', minX: -36.0, maxX: -32.0, minY: 0, maxY: 2.2, minZ: 17.0, maxZ: 20.0, kind: 'cover', accent: 'red' },
  { id: 'red-crate-r', minX: 32.0, maxX: 36.0, minY: 0, maxY: 2.2, minZ: 17.0, maxZ: 20.0, kind: 'cover', accent: 'red' },

  // Side Balcony Overlooks (West & East Mid-Lane)
  { id: 'side-deck-w', minX: -45.5, maxX: -36.5, minY: 0, maxY: 3.2, minZ: -8.0, maxZ: 8.0, kind: 'platform', accent: 'neutral' },
  { id: 'side-deck-e', minX: 36.5, maxX: 45.5, minY: 0, maxY: 3.2, minZ: -8.0, maxZ: 8.0, kind: 'platform', accent: 'neutral' },
]

export const JUMP_PADS: JumpPad[] = [
  { id: 'jp-w-n', x: -32.5, y: 0.08, z: -6.5, radius: 1.7, boostY: 12.6, accent: 'blue' },
  { id: 'jp-w-s', x: -32.5, y: 0.08, z: 6.5, radius: 1.7, boostY: 12.6, accent: 'red' },
  { id: 'jp-e-n', x: 32.5, y: 0.08, z: -6.5, radius: 1.7, boostY: 12.6, accent: 'blue' },
  { id: 'jp-e-s', x: 32.5, y: 0.08, z: 6.5, radius: 1.7, boostY: 12.6, accent: 'red' },
  { id: 'jp-b-c', x: 0, y: 0.08, z: -36.0, radius: 1.8, boostY: 13.0, accent: 'blue' },
  { id: 'jp-r-c', x: 0, y: 0.08, z: 36.0, radius: 1.8, boostY: 13.0, accent: 'red' },
]

export const TEAM_SPAWNS: Record<Team, Array<{ position: Vec3; yaw: number }>> = {
  blue: [
    { position: { x: -12, y: 0, z: -47 }, yaw: Math.PI },
    { position: { x: 0, y: 0, z: -49 }, yaw: Math.PI },
    { position: { x: 12, y: 0, z: -47 }, yaw: Math.PI },
    { position: { x: -24, y: 0, z: -45 }, yaw: Math.PI },
  ],
  red: [
    { position: { x: -12, y: 0, z: 47 }, yaw: 0 },
    { position: { x: 0, y: 0, z: 49 }, yaw: 0 },
    { position: { x: 12, y: 0, z: 47 }, yaw: 0 },
    { position: { x: 24, y: 0, z: 45 }, yaw: 0 },
  ],
}

export const ARENA_CRATE_SPAWNS: Array<{ id: string; kind: PickupCrateKind; position: Vec3 }> = [
  { id: 'crate-weapon-w', kind: 'weapon_swap', position: { x: -28, y: 0, z: 0 } },
  { id: 'crate-weapon-e', kind: 'weapon_swap', position: { x: 28, y: 0, z: 0 } },
  { id: 'crate-helper-n', kind: 'math_helper', position: { x: 0, y: 0, z: -22 } },
  { id: 'crate-helper-s', kind: 'math_helper', position: { x: 0, y: 0, z: 22 } },
  { id: 'crate-melee-c', kind: 'melee_upgrade', position: { x: 0, y: 2.0, z: 0 } },
  { id: 'crate-melee-w', kind: 'melee_upgrade', position: { x: -40, y: 3.2, z: 0 } },
]

export function getSpawnForTeam(team: Team, slotIndex: number): { position: Vec3; yaw: number } {
  const spawns = TEAM_SPAWNS[team]
  const pick = spawns[Math.abs(slotIndex) % spawns.length]
  return {
    position: { ...pick.position },
    yaw: pick.yaw,
  }
}

export function clampPositionToArena(pos: Vec3): Vec3 {
  const r = PLAYER_DIMENSIONS.radius
  return {
    x: Math.max(-ARENA_BOUNDS.halfWidth + r, Math.min(ARENA_BOUNDS.halfWidth - r, pos.x)),
    y: Math.max(0, Math.min(ARENA_BOUNDS.ceilingY, pos.y)),
    z: Math.max(-ARENA_BOUNDS.halfLength + r, Math.min(ARENA_BOUNDS.halfLength - r, pos.z)),
  }
}

/**
 * Resolves horizontal XZ circle-vs-AABB collisions and computes walkable ground height.
 * Allows smooth stepping up ledges <= 0.65m (ramps & stairs).
 */
export function resolvePlayerMovement(
  current: Vec3,
  desired: Vec3,
  velocityY: number,
  extraBoxes: ArenaBox[] = [],
): { position: Vec3; velocityY: number; grounded: boolean; hitJumpPad: boolean } {
  const r = PLAYER_DIMENSIONS.radius
  const stepHeight = 0.75
  let x = desired.x
  let y = desired.y
  let z = desired.z
  let vy = velocityY
  const allBoxes = extraBoxes.length > 0 ? [...ARENA_BOXES, ...extraBoxes] : ARENA_BOXES

  // 1. Resolve horizontal overlaps against boxes we cannot step onto (2 passes for crisp corner sliding)
  for (let pass = 0; pass < 2; pass++) {
    for (const box of allBoxes) {
      // Only collide horizontally if player vertical body overlaps box vertical extent
      const playerBottom = current.y
      const playerTop = current.y + PLAYER_DIMENSIONS.height
      if (playerTop <= box.minY + 0.05) continue
      if (playerBottom >= box.maxY - stepHeight) continue

      const closestX = Math.max(box.minX, Math.min(x, box.maxX))
      const closestZ = Math.max(box.minZ, Math.min(z, box.maxZ))
      const dx = x - closestX
      const dz = z - closestZ
      const distSq = dx * dx + dz * dz

      if (distSq < r * r) {
        const dist = Math.sqrt(distSq)
        if (dist > 0.0001) {
          const push = r - dist
          x += (dx / dist) * push
          z += (dz / dist) * push
        } else {
          // Inside box center fallback: push along smallest overlap axis
          const penLeft = Math.abs(x - box.minX)
          const penRight = Math.abs(box.maxX - x)
          const penBack = Math.abs(z - box.minZ)
          const penFront = Math.abs(box.maxZ - z)
          const m = Math.min(penLeft, penRight, penBack, penFront)
          if (m === penLeft) x = box.minX - r
          else if (m === penRight) x = box.maxX + r
          else if (m === penBack) z = box.minZ - r
          else z = box.maxZ + r
        }
      }
    }
  }

  // Clamp inside arena bounds
  x = Math.max(-ARENA_BOUNDS.halfWidth + r, Math.min(ARENA_BOUNDS.halfWidth - r, x))
  z = Math.max(-ARENA_BOUNDS.halfLength + r, Math.min(ARENA_BOUNDS.halfLength - r, z))

  // 2. Find highest supporting surface under (x, z)
  let groundY = 0
  for (const box of allBoxes) {
    if (x + r * 0.75 > box.minX && x - r * 0.75 < box.maxX && z + r * 0.75 > box.minZ && z - r * 0.75 < box.maxZ) {
      if (current.y + stepHeight >= box.maxY && box.maxY > groundY) {
        groundY = box.maxY
      }
    }
  }

  let grounded = false
  if (y <= groundY) {
    y = groundY
    if (vy < 0) vy = 0
    grounded = true
  }

  // 3. Jump pad boost check
  let hitJumpPad = false
  if (y <= 0.35) {
    for (const pad of JUMP_PADS) {
      const dx = x - pad.x
      const dz = z - pad.z
      if (dx * dx + dz * dz <= pad.radius * pad.radius) {
        vy = pad.boostY
        grounded = false
        hitJumpPad = true
        break
      }
    }
  }

  return { position: { x, y, z }, velocityY: vy, grounded, hitJumpPad }
}

/** Ray vs AABB intersection (slab method). Returns distance t >= 0 or null. */
export function rayIntersectsBox(origin: Vec3, dir: Vec3, box: ArenaBox, maxDist: number): number | null {
  let tmin = 0
  let tmax = maxDist

  const axes: Array<[number, number, number, number]> = [
    [origin.x, dir.x, box.minX, box.maxX],
    [origin.y, dir.y, box.minY, box.maxY],
    [origin.z, dir.z, box.minZ, box.maxZ],
  ]

  for (const [o, d, bmin, bmax] of axes) {
    if (Math.abs(d) < 1e-8) {
      if (o < bmin || o > bmax) return null
    } else {
      let t1 = (bmin - o) / d
      let t2 = (bmax - o) / d
      if (t1 > t2) {
        const tmp = t1
        t1 = t2
        t2 = tmp
      }
      tmin = Math.max(tmin, t1)
      tmax = Math.min(tmax, t2)
      if (tmin > tmax) return null
    }
  }

  return tmin >= 0 && tmin <= maxDist ? tmin : null
}

/** Finds closest obstacle distance along a ray (walls, floors, cover, dynamic barrier walls). */
export function raycastArenaObstacles(
  origin: Vec3,
  dir: Vec3,
  maxDist: number,
  extraBoxes: ArenaBox[] = [],
): number {
  let closest = maxDist

  // Floor plane (y = 0)
  if (dir.y < -1e-6 && origin.y > 0) {
    const tFloor = -origin.y / dir.y
    if (tFloor >= 0 && tFloor < closest) {
      closest = tFloor
    }
  }

  for (const box of ARENA_BOXES) {
    const t = rayIntersectsBox(origin, dir, box, closest)
    if (t !== null && t < closest) {
      closest = t
    }
  }

  for (const box of extraBoxes) {
    const t = rayIntersectsBox(origin, dir, box, closest)
    if (t !== null && t < closest) {
      closest = t
    }
  }

  return closest
}

/** Ray vs Sphere intersection. Returns closest positive t or null. */
export function rayIntersectsSphere(
  origin: Vec3,
  dir: Vec3,
  center: Vec3,
  radius: number,
  maxDist: number,
): number | null {
  const ocX = origin.x - center.x
  const ocY = origin.y - center.y
  const ocZ = origin.z - center.z
  const b = ocX * dir.x + ocY * dir.y + ocZ * dir.z
  const c = ocX * ocX + ocY * ocY + ocZ * ocZ - radius * radius
  const disc = b * b - c
  if (disc < 0) return null
  const sqrtD = Math.sqrt(disc)
  const t = -b - sqrtD
  if (t >= 0 && t <= maxDist) return t
  const t2 = -b + sqrtD
  if (t2 >= 0 && t2 <= maxDist) return t2
  return null
}

/**
 * Ray vs vertical player hitbox (separate Head sphere + Body bounding cylinder/box)
 * Used server-side for authoritative headshot & bodyshot hit detection.
 */
export function raycastPlayerHitbox(
  origin: Vec3,
  dir: Vec3,
  targetPos: Vec3,
  maxDist: number,
): { distance: number; headshot: boolean } | null {
  // 1. Check Head Sphere (responsive online FPS feel)
  const headCenter: Vec3 = {
    x: targetPos.x,
    y: targetPos.y + PLAYER_DIMENSIONS.headCenterY,
    z: targetPos.z,
  }
  const headT = rayIntersectsSphere(origin, dir, headCenter, PLAYER_DIMENSIONS.headRadius + 0.1, maxDist)

  // 2. Check Body AABB
  const r = PLAYER_DIMENSIONS.bodyRadius + 0.14
  const bodyBox: ArenaBox = {
    id: 'body',
    minX: targetPos.x - r,
    maxX: targetPos.x + r,
    minY: targetPos.y + PLAYER_DIMENSIONS.bodyMinY,
    maxY: targetPos.y + 1.42,
    minZ: targetPos.z - r,
    maxZ: targetPos.z + r,
    kind: 'cover',
  }
  const bodyT = rayIntersectsBox(origin, dir, bodyBox, maxDist)

  if (headT !== null && (bodyT === null || headT <= bodyT + 0.18)) {
    return { distance: headT, headshot: true }
  }
  if (bodyT !== null) {
    return { distance: bodyT, headshot: false }
  }
  return null
}

export function normalizeVec3(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z)
  if (len < 1e-8) return { x: 0, y: 0, z: -1 }
  return { x: v.x / len, y: v.y / len, z: v.z / len }
}
