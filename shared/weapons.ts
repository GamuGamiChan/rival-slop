import type { Difficulty, WeaponId, WeaponSpec } from './types.ts'

export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  pistol: {
    id: 'pistol',
    name: 'Pulse Pistol',
    codename: 'MK-IV SIDEARM',
    category: 'PRECISION SIDEARM',
    damage: 28,
    headshotDamage: 52,
    fireRateMs: 260,
    magSize: 12,
    reloadMs: 1100,
    pellets: 1,
    spreadRad: 0.008,
    range: 75,
    automatic: false,
    adsFov: 62,
    accentColor: '#38bdf8',
    badge: 'RAPID DRAW',
    tagline: 'คล่องตัว ยิงแม่น รีโหลดไวสุดในสนาม',
  },
  rifle: {
    id: 'rifle',
    name: 'Vector AR-42',
    codename: 'ASSAULT CARBINE',
    category: 'FULL-AUTO RIFLE',
    damage: 20,
    headshotDamage: 38,
    fireRateMs: 115,
    magSize: 28,
    reloadMs: 1650,
    pellets: 1,
    spreadRad: 0.018,
    range: 85,
    automatic: true,
    adsFov: 58,
    accentColor: '#00f0ff',
    badge: 'FULL AUTO',
    tagline: 'ยิงรัวต่อเนื่อง คุมระยะกลางได้เหนือกว่า',
  },
  shotgun: {
    id: 'shotgun',
    name: 'Nova-8 Scatter',
    codename: 'PLASMA BREACHER',
    category: 'CLOSE QUARTERS',
    damage: 18,
    headshotDamage: 28,
    fireRateMs: 740,
    magSize: 6,
    reloadMs: 1950,
    pellets: 6,
    spreadRad: 0.072,
    range: 34,
    automatic: false,
    adsFov: 68,
    accentColor: '#ff7b00',
    badge: '6x PELLETS',
    tagline: 'ระเบิดพลาสมา 6 นัดพร้อมกัน รุนแรงระยะประชิด',
  },
  sniper: {
    id: 'sniper',
    name: 'Hyperion Rail',
    codename: 'X-9 RAILGUN',
    category: 'LONG-RANGE SNIPER',
    damage: 75,
    headshotDamage: 120,
    fireRateMs: 1120,
    magSize: 4,
    reloadMs: 2150,
    pellets: 1,
    spreadRad: 0.001,
    range: 140,
    automatic: false,
    adsFov: 28,
    accentColor: '#f43f5e',
    badge: '1-SHOT HEAD',
    tagline: 'ลำแสงเรลกันแรงสูง ยิงหัวทีเดียวดับ',
  },
}

export const WEAPON_IDS: WeaponId[] = ['pistol', 'rifle', 'shotgun', 'sniper']

const DIFFICULTY_WEIGHTS: Record<Difficulty, Record<WeaponId, number>> = {
  easy: { pistol: 35, rifle: 30, shotgun: 22, sniper: 13 },
  medium: { pistol: 20, rifle: 32, shotgun: 26, sniper: 22 },
  hard: { pistol: 10, rifle: 28, shotgun: 27, sniper: 35 },
}

/**
 * Randomly rolls one of the 4 weapons. Avoids giving the exact same weapon twice
 * in a row when possible so every math answer feels rewarding and varied.
 */
export function rollRandomWeapon(
  difficulty: Difficulty,
  previousWeapon: WeaponId | null = null,
  rng: () => number = Math.random,
): WeaponId {
  const weights = { ...DIFFICULTY_WEIGHTS[difficulty] }
  if (previousWeapon) {
    weights[previousWeapon] = Math.max(4, Math.floor(weights[previousWeapon] * 0.35))
  }
  const total = WEAPON_IDS.reduce((acc, id) => acc + weights[id], 0)
  let roll = rng() * total
  for (const id of WEAPON_IDS) {
    roll -= weights[id]
    if (roll <= 0) return id
  }
  return 'rifle'
}
