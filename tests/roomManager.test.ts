import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { RoomManager } from '../server/roomManager.ts'
import { PLAYER_DIMENSIONS, resolvePlayerMovement } from '../shared/arena.ts'
import { QUESTION_BY_ID } from '../shared/questions.ts'
import { MATCH_CONFIG, SCORING } from '../shared/types.ts'
import { REWARD_WEAPON_POOL, rollRandomWeapon, WEAPONS } from '../shared/weapons.ts'

/**
 * Helper to advance a room from ROUND_START -> COMBAT_ACTIVE -> ROUND_END -> MATH_CHALLENGE
 */
function advanceToMathChallenge(
  mgr: RoomManager,
  roomCode: string,
  advanceNow: (ms: number) => void,
): void {
  const room = mgr.getRoom(roomCode)
  if (!room) throw new Error('no room')
  if (room.roundState === 'ROUND_START') {
    advanceNow(MATCH_CONFIG.ROUND_START_MS)
    mgr.tick()
  }
  if (room.roundState === 'COMBAT_ACTIVE') {
    advanceNow(MATCH_CONFIG.COMBAT_ROUND_MS)
    mgr.tick()
  }
  if (room.roundState === 'ROUND_END') {
    advanceNow(MATCH_CONFIG.ROUND_END_MS)
    mgr.tick()
  }
}

/**
 * Helper to advance a room from ANSWER_FEEDBACK -> WEAPON_REVEAL -> NEXT_ROUND -> next ROUND_START -> COMBAT_ACTIVE
 */
function advanceFromFeedbackToNextCombat(
  mgr: RoomManager,
  roomCode: string,
  advanceNow: (ms: number) => void,
): void {
  const room = mgr.getRoom(roomCode)
  if (!room) throw new Error('no room')
  if (room.roundState === 'ANSWER_FEEDBACK') {
    advanceNow(MATCH_CONFIG.ANSWER_FEEDBACK_MS)
    mgr.tick()
  }
  if (room.roundState === 'WEAPON_REVEAL') {
    advanceNow(MATCH_CONFIG.WEAPON_REVEAL_MS)
    mgr.tick()
  }
  if (room.phase === 'finished') return
  if (room.roundState === 'NEXT_ROUND') {
    advanceNow(MATCH_CONFIG.NEXT_ROUND_MS)
    mgr.tick()
  }
  if (room.roundState === 'ROUND_START') {
    advanceNow(MATCH_CONFIG.ROUND_START_MS)
    mgr.tick()
  }
}

describe('Authoritative RoomManager — Round-Synchronized Gameplay, Weapon Penalty & 3D Asset Security', () => {
  it('supports room creation, team auto-balancing, capacity limits, and host-only start', () => {
    const now = 1_000_000
    const mgr = new RoomManager(() => now)

    const host = mgr.createRoom('Alice')
    expect(host.roomCode).toMatch(/^[A-Z2-9]{6}$/)
    expect(host.snapshot.players).toHaveLength(1)
    expect(host.snapshot.players[0].team).toBe('blue')
    expect(host.snapshot.maxRounds).toBe(10)

    // Host cannot start solo (< 2 players)
    const soloStart = mgr.startMatch(host.roomCode, host.playerId)
    expect(soloStart.ok).toBe(false)
    if (!soloStart.ok) expect(soloStart.code).toBe('NOT_ENOUGH_PLAYERS')

    // Join second player -> auto-assigned to red
    const p2 = mgr.joinRoom(host.roomCode, 'Bob')
    expect(p2.ok).toBe(true)
    if (!p2.ok) throw new Error('expected join ok')
    expect(p2.snapshot.players.find((p) => p.id === p2.playerId)?.team).toBe('red')

    // Security: Non-host cannot start match
    const unauthorizedStart = mgr.startMatch(host.roomCode, p2.playerId)
    expect(unauthorizedStart.ok).toBe(false)
    if (!unauthorizedStart.ok) expect(unauthorizedStart.code).toBe('FORBIDDEN')

    // Join up to max 8 players
    for (let i = 3; i <= 8; i++) {
      const joined = mgr.joinRoom(host.roomCode, `Player${i}`)
      expect(joined.ok).toBe(true)
    }

    // 9th player rejected (ROOM_FULL)
    const ninth = mgr.joinRoom(host.roomCode, 'Overflow')
    expect(ninth.ok).toBe(false)
    if (!ninth.ok) expect(ninth.code).toBe('ROOM_FULL')

    // Invalid code rejected
    const badRoom = mgr.joinRoom('ZZZZZZ', 'Ghost')
    expect(badRoom.ok).toBe(false)
    if (!badRoom.ok) expect(badRoom.code).toBe('ROOM_NOT_FOUND')

    // Host starts match cleanly -> countdown
    const started = mgr.startMatch(host.roomCode, host.playerId)
    expect(started.ok).toBe(true)
    if (started.ok) {
      expect(started.snapshot.phase).toBe('countdown')
      expect(started.snapshot.countdownEndsAt).toBe(now + MATCH_CONFIG.COUNTDOWN_SEC * 1000)
    }
  })

  it('forbids manual random weapon rolling during Combat Round, auto-opens Math Challenge at round end, awards weapon on correct answer, and confiscates weapon + deducts 300 pts on wrong answer', () => {
    let now = 2_000_000
    const mgr = new RoomManager(() => now)
    const host = mgr.createRoom('HostOne')
    const guest = mgr.joinRoom(host.roomCode, 'GuestTwo')
    if (!guest.ok) throw new Error('join failed')

    mgr.startMatch(host.roomCode, host.playerId)
    now += MATCH_CONFIG.COUNTDOWN_SEC * 1000
    mgr.tick() // -> ROUND_START

    // Advance ROUND_START -> COMBAT_ACTIVE
    now += MATCH_CONFIG.ROUND_START_MS
    mgr.tick()

    const room = mgr.getRoom(host.roomCode)!
    expect(room.roundState).toBe('COMBAT_ACTIVE')
    expect(room.roundNumber).toBe(1)

    // Both players start Round 1 with starter pistol
    expect(room.players.get(host.playerId)!.weapon).toBe('pistol')
    expect(room.players.get(guest.playerId)!.weapon).toBe('pistol')

    // RULE 1 & 2: Manual weapon roll / question request during COMBAT_ACTIVE is STRICTLY FORBIDDEN
    const manualRollAttempt = mgr.requestQuestion(host.roomCode, host.playerId)
    expect(manualRollAttempt.ok).toBe(false)
    if (!manualRollAttempt.ok) {
      expect(manualRollAttempt.code).toBe('MANUAL_ROLL_FORBIDDEN')
    }

    // Advance to end of Combat Round -> ROUND_END -> MATH_CHALLENGE
    now += MATCH_CONFIG.COMBAT_ROUND_MS
    mgr.tick()
    expect(room.roundState).toBe('ROUND_END')

    // Combat is paused during ROUND_END (cannot shoot)
    const shootDuringRoundEnd = mgr.shoot(
      host.roomCode,
      host.playerId,
      { x: 0, y: 1.56, z: -10 },
      { x: 0, y: 0, z: 1 },
    )
    expect(shootDuringRoundEnd.ok).toBe(false)
    if (!shootDuringRoundEnd.ok) expect(shootDuringRoundEnd.code).toBe('MATCH_NOT_ACTIVE')

    // ROUND_END -> MATH_CHALLENGE automatically assigns the synchronized round question
    now += MATCH_CONFIG.ROUND_END_MS
    const challengeTransitions = mgr.tick()
    expect(room.roundState).toBe('MATH_CHALLENGE')
    const assignedQ = challengeTransitions.find((t) => t.assignedQuestion)?.assignedQuestion
    expect(assignedQ).toBeDefined()
    if (!assignedQ) throw new Error('expected assigned question')

    // Security: Submitting an unassigned question ID is rejected
    const fakeId = assignedQ.id === 'E01' ? 'E02' : 'E01'
    const fakeSubmit = mgr.submitAnswer(host.roomCode, host.playerId, fakeId, 0)
    expect(fakeSubmit.ok).toBe(false)
    if (!fakeSubmit.ok) expect(fakeSubmit.code).toBe('UNASSIGNED_QUESTION')

    // RULE 3: Host submits CORRECT answer -> +100 pts, weapon rolled strictly from REWARD_WEAPON_POOL
    const truth = QUESTION_BY_ID.get(assignedQ.id)!
    const correctRes = mgr.submitAnswer(host.roomCode, host.playerId, truth.id, truth.correctIndex)
    expect(correctRes.ok).toBe(true)
    if (!correctRes.ok) throw new Error('submit failed')
    expect(correctRes.result.correct).toBe(true)
    expect(correctRes.result.pointsAwarded).toBe(SCORING.MATH_CORRECT)
    expect(correctRes.result.awardedWeapon).not.toBeNull()
    expect(REWARD_WEAPON_POOL).toContain(correctRes.result.awardedWeapon!)
    expect(correctRes.result.weaponConfiscated).toBe(false)

    // Security: Duplicate submission in the same round is rejected (DUPLICATE_ANSWER)
    const dupSubmit = mgr.submitAnswer(host.roomCode, host.playerId, truth.id, truth.correctIndex)
    expect(dupSubmit.ok).toBe(false)
    if (!dupSubmit.ok) expect(dupSubmit.code).toBe('DUPLICATE_ANSWER')

    // RULE 4: Guest submits WRONG answer -> weapon confiscated immediately (weapon = null) & -300 points!
    const wrongIdx = (truth.correctIndex + 1) % 4
    const wrongRes = mgr.submitAnswer(host.roomCode, guest.playerId, truth.id, wrongIdx)
    expect(wrongRes.ok).toBe(true)
    if (!wrongRes.ok) throw new Error('wrong submit failed')
    expect(wrongRes.result.correct).toBe(false)
    expect(wrongRes.result.pointsAwarded).toBe(-300)
    expect(wrongRes.result.awardedWeapon).toBeNull()
    expect(wrongRes.result.weaponConfiscated).toBe(true)
    expect(wrongRes.result.confiscatedWeapon).toBe('pistol')

    const guestState = wrongRes.snapshot.players.find((p) => p.id === guest.playerId)!
    expect(guestState.weapon).toBeNull()
    expect(guestState.ammo).toBe(0)
    expect(guestState.totalScore).toBe(-300)

    // Because both connected players have answered, room transitions immediately to ANSWER_FEEDBACK
    expect(room.roundState).toBe('ANSWER_FEEDBACK')

    // Duplicate wrong submission after round moved to ANSWER_FEEDBACK is rejected (no double -300 deduction!)
    const lateDup = mgr.submitAnswer(host.roomCode, guest.playerId, truth.id, wrongIdx)
    expect(lateDup.ok).toBe(false)
    expect(room.players.get(guest.playerId)!.totalScore).toBe(-300)

    // Advance through ANSWER_FEEDBACK -> WEAPON_REVEAL -> NEXT_ROUND -> Round 2 COMBAT_ACTIVE
    advanceFromFeedbackToNextCombat(mgr, host.roomCode, (ms) => {
      now += ms
    })
    expect(room.roundNumber).toBe(2)
    expect(room.roundState).toBe('COMBAT_ACTIVE')
    // Guest remains Unarmed in Round 2 (no secret replacement weapon!)
    expect(room.players.get(guest.playerId)!.weapon).toBeNull()
  })

  it('applies the -300 PTS and weapon confiscation penalty if a player fails to answer before Math Challenge timeout', () => {
    let now = 2_500_000
    const mgr = new RoomManager(() => now)
    const host = mgr.createRoom('HostTimeout')
    const guest = mgr.joinRoom(host.roomCode, 'GuestTimeout')
    if (!guest.ok) throw new Error('join failed')

    mgr.startMatch(host.roomCode, host.playerId)
    now += MATCH_CONFIG.COUNTDOWN_SEC * 1000
    mgr.tick()

    advanceToMathChallenge(mgr, host.roomCode, (ms) => {
      now += ms
    })
    const room = mgr.getRoom(host.roomCode)!
    expect(room.roundState).toBe('MATH_CHALLENGE')
    const qId = room.activeRoundQuestionId!
    const truth = QUESTION_BY_ID.get(qId)!

    // Host answers correctly, Guest does not answer at all
    mgr.submitAnswer(host.roomCode, host.playerId, truth.id, truth.correctIndex)
    expect(room.roundState).toBe('ANSWER_SUBMITTED')

    // Expire the 20s Math Challenge timer (+1000ms past deadline)
    now += MATCH_CONFIG.MATH_CHALLENGE_MS + 1000
    // Submitting after the deadline (even before tick processes) is rejected with ANSWER_TIMEOUT
    const lateBeforeTick = mgr.submitAnswer(host.roomCode, guest.playerId, truth.id, truth.correctIndex)
    expect(lateBeforeTick.ok).toBe(false)
    if (!lateBeforeTick.ok) expect(lateBeforeTick.code).toBe('ANSWER_TIMEOUT')

    const ticks = mgr.tick()
    expect(room.roundState).toBe('ANSWER_FEEDBACK')

    const timeoutEntry = ticks.find((t) => t.timeoutResults)?.timeoutResults?.[0]
    expect(timeoutEntry).toBeDefined()
    expect(timeoutEntry?.playerId).toBe(guest.playerId)
    expect(timeoutEntry?.result.pointsAwarded).toBe(-300)
    expect(timeoutEntry?.result.weaponConfiscated).toBe(true)
    expect(room.players.get(guest.playerId)!.weapon).toBeNull()
    expect(room.players.get(guest.playerId)!.totalScore).toBe(-300)

    // Submitting again after timeout penalty was applied is rejected with DUPLICATE_ANSWER (no double penalty!)
    const afterTimeout = mgr.submitAnswer(host.roomCode, guest.playerId, truth.id, truth.correctIndex)
    expect(afterTimeout.ok).toBe(false)
    if (!afterTimeout.ok) expect(afterTimeout.code).toBe('DUPLICATE_ANSWER')
  })

  it('rolls strictly from the 4 official Weapon Pool types (Pistol, Rifle, Shotgun, Sniper)', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 300; i++) {
      const w = rollRandomWeapon('medium', null)
      expect(REWARD_WEAPON_POOL).toContain(w)
      seen.add(w)
    }
    expect(seen.size).toBe(4)
    expect(WEAPONS.sniper.headshotDamage).toBeGreaterThanOrEqual(100)
    expect(WEAPONS.shotgun.pellets).toBe(6)
    expect(WEAPONS.rifle.automatic).toBe(true)
    expect(WEAPONS.pistol.reloadMs).toBeLessThan(WEAPONS.sniper.reloadMs)
  })

  it('validates Valorant-style Agent selection, Q/C cooldowns, Ult charge, Barrier bullet blocking, and Orbital Strike across rounds', () => {
    let now = 4_000_000
    const mgr = new RoomManager(() => now, () => 0.99)
    const p1 = mgr.createRoom('AegisPlayer')
    const p2 = mgr.joinRoom(p1.roomCode, 'PhantomRival')
    if (!p2.ok) throw new Error('join failed')

    expect(mgr.selectAgent(p1.roomCode, p1.playerId, 'aegis').ok).toBe(true)
    expect(mgr.selectAgent(p1.roomCode, p2.playerId, 'phantom').ok).toBe(true)

    mgr.startMatch(p1.roomCode, p1.playerId)
    now += MATCH_CONFIG.COUNTDOWN_SEC * 1000
    mgr.tick()
    now += MATCH_CONFIG.ROUND_START_MS
    mgr.tick() // COMBAT_ACTIVE

    // Cannot switch Agent after match started
    expect(mgr.selectAgent(p1.roomCode, p1.playerId, 'vortex').ok).toBe(false)

    // Ultimate rejected before 4 ult points
    const earlyUlt = mgr.useSkill(p1.roomCode, p1.playerId, 'X', { x: 0, y: 1.56, z: -10 }, { x: 0, y: 0, z: 1 })
    expect(earlyUlt.ok).toBe(false)
    if (!earlyUlt.ok) expect(earlyUlt.code).toBe('ULT_NOT_READY')

    // Complete 4 rounds answering correctly -> earns 4 ult points
    for (let r = 0; r < 4; r++) {
      advanceToMathChallenge(mgr, p1.roomCode, (ms) => {
        now += ms
      })
      const room = mgr.getRoom(p1.roomCode)!
      const q = QUESTION_BY_ID.get(room.activeRoundQuestionId!)!
      mgr.submitAnswer(p1.roomCode, p1.playerId, q.id, q.correctIndex)
      mgr.submitAnswer(p1.roomCode, p2.playerId, q.id, q.correctIndex)
      advanceFromFeedbackToNextCombat(mgr, p1.roomCode, (ms) => {
        now += ms
      })
    }

    const room = mgr.getRoom(p1.roomCode)!
    const aegis = room.players.get(p1.playerId)!
    const phantom = room.players.get(p2.playerId)!
    expect(aegis.ultPoints).toBe(4)

    // Cast Aegis [X] TITAN SHIELD -> 175 HP overshield & consumes 4 ult points
    const titan = mgr.useSkill(p1.roomCode, p1.playerId, 'X', { x: 0, y: 1.56, z: -10 }, { x: 0, y: 0, z: 1 })
    expect(titan.ok).toBe(true)
    expect(aegis.hp).toBe(175)
    expect(aegis.maxHp).toBe(175)
    expect(aegis.ultPoints).toBe(0)

    // Place Aegis and Phantom face-to-face in open West lane (x = -11)
    aegis.position = { x: -11, y: 0, z: -6 }
    phantom.position = { x: -11, y: 0, z: 4 }
    phantom.weapon = 'sniper'
    phantom.ammo = 5

    // Aegis deploys [C] BARRIER WALL directly toward +Z
    const wall = mgr.useSkill(
      p1.roomCode,
      p1.playerId,
      'C',
      { x: -11, y: PLAYER_DIMENSIONS.eyeHeight, z: -6 },
      { x: 0, y: 0, z: 1 },
    )
    expect(wall.ok).toBe(true)
    expect(room.worldEffects.some((e) => e.kind === 'barrier')).toBe(true)

    // Phantom shoots straight at Aegis -> BLOCKED by Aegis Barrier Wall!
    const blockedByBarrier = mgr.shoot(
      p1.roomCode,
      p2.playerId,
      { x: -11, y: PLAYER_DIMENSIONS.eyeHeight, z: 4 },
      { x: 0, y: 0, z: -1 },
    )
    expect(blockedByBarrier.ok).toBe(true)
    if (blockedByBarrier.ok) {
      expect(blockedByBarrier.outcome.hits).toHaveLength(0)
    }

    // Phantom casts [X] ORBITAL STRIKE
    phantom.ultPoints = 4
    aegis.hp = 60
    const orbital = mgr.useSkill(
      p1.roomCode,
      p2.playerId,
      'X',
      { x: -11, y: PLAYER_DIMENSIONS.eyeHeight, z: 4 },
      { x: 0, y: -PLAYER_DIMENSIONS.eyeHeight / 10, z: -1 },
    )
    expect(orbital.ok).toBe(true)

    now += 950
    const orbTick = mgr.tick()
    const orbEvent = orbTick.find((t) => t.type === 'ORBITAL_DETONATED')
    expect(orbEvent).toBeDefined()
    expect(aegis.alive).toBe(false)
    expect(phantom.kills).toBe(1)
  })

  it('validates server-side hit detection, headshot bonus (+50), wall occlusion, fire rate, and respawn', () => {
    let now = 3_000_000
    // Force Sniper roll on deterministic rng = 0.99
    const mgr = new RoomManager(() => now, () => 0.99)
    const p1 = mgr.createRoom('SniperBlue')
    const p2 = mgr.joinRoom(p1.roomCode, 'TargetRed')
    if (!p2.ok) throw new Error('join failed')

    mgr.startMatch(p1.roomCode, p1.playerId)
    now += MATCH_CONFIG.COUNTDOWN_SEC * 1000
    mgr.tick()

    // Complete Round 1 Math Challenge to unlock Sniper (rng = 0.99 -> sniper)
    advanceToMathChallenge(mgr, p1.roomCode, (ms) => {
      now += ms
    })
    const room = mgr.getRoom(p1.roomCode)!
    const truth = QUESTION_BY_ID.get(room.activeRoundQuestionId!)!
    const ans = mgr.submitAnswer(p1.roomCode, p1.playerId, truth.id, truth.correctIndex)
    if (!ans.ok) throw new Error('ans failed')
    expect(ans.result.awardedWeapon).toBe('sniper')
    // p2 answers wrong -> becomes unarmed
    mgr.submitAnswer(p1.roomCode, p2.playerId, truth.id, (truth.correctIndex + 1) % 4)

    advanceFromFeedbackToNextCombat(mgr, p1.roomCode, (ms) => {
      now += ms
    })

    // p2 is now unarmed -> shooting is rejected with NO_WEAPON
    const unarmedShoot = mgr.shoot(
      p1.roomCode,
      p2.playerId,
      { x: 0, y: 1.56, z: 10 },
      { x: 0, y: 0, z: -1 },
    )
    expect(unarmedShoot.ok).toBe(false)
    if (!unarmedShoot.ok) expect(unarmedShoot.code).toBe('NO_WEAPON')

    // Position both players in open West lane (clear line of sight at x = -11)
    const shooter = room.players.get(p1.playerId)!
    const victim = room.players.get(p2.playerId)!
    shooter.position = { x: -11, y: 0, z: -6 }
    victim.position = { x: -11, y: 0, z: 6 }

    // Headshot aim from shooter eye (y=1.56) straight to victim head (y=1.58)
    const shot = mgr.shoot(
      p1.roomCode,
      p1.playerId,
      { x: -11, y: PLAYER_DIMENSIONS.eyeHeight, z: -6 },
      { x: 0, y: 0.001, z: 1 },
    )
    expect(shot.ok).toBe(true)
    if (!shot.ok) throw new Error('shot failed')
    expect(shot.outcome.hits).toHaveLength(1)
    expect(shot.outcome.hits[0].confirm.headshot).toBe(true)
    expect(shot.outcome.hits[0].confirm.killed).toBe(true)
    expect(shot.outcome.hits[0].confirm.pointsAwarded).toBe(SCORING.KILL + SCORING.HEADSHOT_BONUS)
    expect(shooter.totalScore).toBe(SCORING.MATH_CORRECT + SCORING.KILL + SCORING.HEADSHOT_BONUS)
    expect(victim.alive).toBe(false)
    expect(victim.deaths).toBe(1)

    // Fire-rate anti-spam check
    now += 50
    const spamShot = mgr.shoot(
      p1.roomCode,
      p1.playerId,
      { x: -11, y: PLAYER_DIMENSIONS.eyeHeight, z: -6 },
      { x: 0, y: 0, z: 1 },
    )
    expect(spamShot.ok).toBe(false)
    if (!spamShot.ok) expect(spamShot.code).toBe('FIRE_RATE_LIMIT')

    // Respawn after 3,000ms
    now += MATCH_CONFIG.RESPAWN_MS
    const transitions = mgr.tick()
    expect(transitions.some((t) => t.type === 'RESPAWNED')).toBe(true)
    expect(victim.alive).toBe(true)
  })

  it('automatically finishes the match after exactly 10 rounds (MAX_ROUNDS = 10) and preserves reconnect state', () => {
    let now = 5_000_000
    const mgr = new RoomManager(() => now)
    const p1 = mgr.createRoom('Alpha')
    const p2 = mgr.joinRoom(p1.roomCode, 'Beta')
    if (!p2.ok) throw new Error('join failed')

    mgr.startMatch(p1.roomCode, p1.playerId)
    now += MATCH_CONFIG.COUNTDOWN_SEC * 1000
    mgr.tick()

    const room = mgr.getRoom(p1.roomCode)!

    // Play through all 10 rounds!
    for (let r = 1; r <= MATCH_CONFIG.MAX_ROUNDS; r++) {
      expect(room.roundNumber).toBe(r)
      if (r === 1) {
        // Test disconnect & reconnect during Round 1 COMBAT_ACTIVE
        now += MATCH_CONFIG.ROUND_START_MS
        mgr.tick()
        expect(room.roundState).toBe('COMBAT_ACTIVE')
        const afterDc = mgr.markDisconnected(p1.roomCode, p1.playerId, false)
        expect(afterDc!.hostId).toBe(p2.playerId)
        const badRecon = mgr.reconnectPlayer(p1.roomCode, p1.playerId, 'forged_token')
        expect(badRecon.ok).toBe(false)
        const goodRecon = mgr.reconnectPlayer(p1.roomCode, p1.playerId, p1.sessionToken)
        expect(goodRecon.ok).toBe(true)
      }

      advanceToMathChallenge(mgr, p1.roomCode, (ms) => {
        now += ms
      })
      const q = QUESTION_BY_ID.get(room.activeRoundQuestionId!)!
      // Alpha answers right (+100), Beta answers wrong (-300)
      mgr.submitAnswer(p1.roomCode, p1.playerId, q.id, q.correctIndex)
      mgr.submitAnswer(p1.roomCode, p2.playerId, q.id, (q.correctIndex + 1) % 4)

      advanceFromFeedbackToNextCombat(mgr, p1.roomCode, (ms) => {
        now += ms
      })
    }

    // After Round 10 WEAPON_REVEAL finishes, the match must be in 'finished' phase!
    expect(room.phase).toBe('finished')
    expect(room.summary).not.toBeNull()
    expect(room.summary?.winnerPlayer?.name).toBe('Alpha')
    expect(room.summary?.winnerPlayer?.totalScore).toBe(10 * SCORING.MATH_CORRECT)
    const betaSummary = room.summary?.standings.find((s) => s.playerId === p2.playerId)
    expect(betaSummary?.totalScore).toBe(10 * SCORING.MATH_WRONG)
  })

  it('allows walking smoothly up the stepped central ramp onto the 2.0m center deck without jumping', () => {
    let pos = { x: -11.5, y: 0, z: 0 }
    let vy = 0
    for (let i = 0; i < 60; i++) {
      const desired = { x: pos.x + 0.22, y: pos.y - 0.1, z: 0 }
      const res = resolvePlayerMovement(pos, desired, vy)
      pos = res.position
      vy = res.velocityY
    }
    expect(pos.x).toBeGreaterThan(-4)
    expect(pos.y).toBeCloseTo(2.0, 2)
  })

  it('audits all imported 3D .glb models and PBR textures for binary safety, zero external URIs, and ASSET_CREDITS.md documentation', () => {
    const rootDir = path.resolve(__dirname, '..')
    const creditsPath = path.join(rootDir, 'ASSET_CREDITS.md')
    expect(fs.existsSync(creditsPath)).toBe(true)
    const creditsMd = fs.readFileSync(creditsPath, 'utf8')
    expect(creditsMd).toContain('| Asset Name | Creator | Source URL | License | Attribution | Modifications |')
    expect(creditsMd).toContain('CC0 1.0 Universal')

    const glbFiles = [
      'public/assets/models/weapons/blaster-h.glb',
      'public/assets/models/weapons/blaster-n.glb',
      'public/assets/models/weapons/blaster-l.glb',
      'public/assets/models/weapons/blaster-e.glb',
      'public/assets/models/weapons/blaster-k.glb',
      'public/assets/models/weapons/blaster-p.glb',
      'public/assets/models/props/quaternius-cube-crate.glb',
      'public/assets/models/props/quaternius-barrel.glb',
      'public/assets/models/props/kenney-fence-fortified.glb',
      'public/assets/models/props/quaternius-guard-tower.glb',
    ]

    for (const relPath of glbFiles) {
      const fullPath = path.join(rootDir, relPath)
      expect(fs.existsSync(fullPath)).toBe(true)
      const buf = fs.readFileSync(fullPath)
      // Verify GLB v2 magic ('glTF' = 0x46546C67) and version 2
      expect(buf.readUInt32LE(0)).toBe(0x46546c67)
      expect(buf.readUInt32LE(4)).toBe(2)
      expect(buf.readUInt32LE(8)).toBe(buf.length)

      // Parse JSON chunk
      const jsonLen = buf.readUInt32LE(12)
      const jsonType = buf.readUInt32LE(16)
      expect(jsonType).toBe(0x4e4f534a) // 'JSON'
      const jsonStr = buf.subarray(20, 20 + jsonLen).toString('utf8')
      expect(jsonStr.toLowerCase()).not.toContain('<script')
      expect(jsonStr.toLowerCase()).not.toContain('javascript:')
      expect(jsonStr.toLowerCase()).not.toContain('eval(')

      const gltf = JSON.parse(jsonStr) as {
        buffers?: Array<{ uri?: string }>
        images?: Array<{ uri?: string }>
        extensionsUsed?: string[]
      }
      // Zero external buffer or image URIs
      for (const b of gltf.buffers ?? []) {
        expect(b.uri).toBeUndefined()
      }
      for (const img of gltf.images ?? []) {
        expect(img.uri).toBeUndefined()
      }
      // Only safe standard extensions
      for (const ext of gltf.extensionsUsed ?? []) {
        expect(['KHR_texture_transform']).toContain(ext)
      }

      // Listed in ASSET_CREDITS.md
      const baseName = path.basename(relPath)
      expect(creditsMd).toContain(baseName)
    }
  })
})
