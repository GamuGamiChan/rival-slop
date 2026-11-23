import { describe, expect, it } from 'vitest'
import { RoomManager } from '../shared/roomManager.ts'

describe('Arena Supply Crates (Weapon Swap, Math Helper, Knife/Fist Upgrade)', () => {
  it('picks up weapon_swap, math_helper, and melee_upgrade crates and respawns them after 18s', () => {
    let now = 1_000_000
    const mgr = new RoomManager(
      () => now,
      () => 0.45,
    )

    const p1 = mgr.createRoom('CrateTester')
    const p2 = mgr.joinRoom(p1.roomCode, 'TargetDummy')
    expect(p2.ok).toBe(true)
    if (!p2.ok) return

    mgr.startMatch(p1.roomCode, p1.playerId)
    now += 4000
    mgr.tick() // countdown -> ROUND_START
    const room = mgr.getRoom(p1.roomCode)!
    now = (room.roundPhaseEndsAt ?? now) + 50
    mgr.tick() // ROUND_START -> COMBAT_ACTIVE
    expect(room.roundState).toBe('COMBAT_ACTIVE')

    const tester = room.players.get(p1.playerId)!
    const target = room.players.get(p2.playerId)!

    // 1. Math Helper Crate (+1 50/50 & +1 Step Hint)
    const helperCrate = room.crates.find((c) => c.kind === 'math_helper')!
    const before50 = tester.helperFiftyFiftyLeft
    const beforeStep = tester.helperStepHintLeft
    tester.position = { ...helperCrate.position }
    mgr.tick()
    expect(helperCrate.active).toBe(false)
    expect(tester.helperFiftyFiftyLeft).toBe(before50 + 1)
    expect(tester.helperStepHintLeft).toBe(beforeStep + 1)

    // 2. Weapon Swap Crate (equips new weapon with full ammo)
    const weaponCrate = room.crates.find((c) => c.kind === 'weapon_swap')!
    tester.ammo = 1
    tester.position = { ...weaponCrate.position }
    mgr.tick()
    expect(weaponCrate.active).toBe(false)
    expect(tester.weapon).not.toBeNull()
    expect(tester.ammo).toBe(tester.maxAmmo)

    // 3. Melee/Knife Upgrade Crate (tier 1 -> 2, deals 55 damage instead of 35 when unarmed)
    const meleeCrate = room.crates.find((c) => c.kind === 'melee_upgrade')!
    expect(tester.meleeTier).toBe(1)
    tester.position = { ...meleeCrate.position }
    mgr.tick()
    expect(meleeCrate.active).toBe(false)
    expect(tester.meleeTier).toBe(2)

    tester.weapon = null
    tester.ammo = 0
    tester.position = { x: -11, y: 0, z: -6 }
    target.position = { x: -11, y: 0, z: -4 }
    const punch = mgr.shoot(
      p1.roomCode,
      p1.playerId,
      { x: -11, y: 1.3, z: -6 },
      { x: 0, y: 0, z: 1 },
    )
    expect(punch.ok).toBe(true)
    if (punch.ok) {
      expect(punch.outcome.hits.length).toBe(1)
      expect(punch.outcome.hits[0].confirm.damage).toBe(55)
    }

    // 4. Respawns after 18 seconds
    now += 18_500
    mgr.tick()
    expect(helperCrate.active).toBe(true)
    expect(weaponCrate.active).toBe(true)
    expect(meleeCrate.active).toBe(true)
  })
})
