import {
  PLAYER_DIMENSIONS,
  raycastArenaObstacles,
  raycastPlayerHitbox,
  type ArenaBox,
} from '../../shared/arena.ts'
import { RoomManager } from '../../shared/roomManager.ts'
import type { ClientMessage, QuestionSet, ServerMessage, Vec3 } from '../../shared/types.ts'
import { WEAPONS } from '../../shared/weapons.ts'
import { useGameStore, type PracticeTarget } from '../store/useGameStore.ts'

function createInitialPracticeTargets(): PracticeTarget[] {
  return [
    {
      id: 'target-close',
      label: 'CLOSE DRONE (7M)',
      basePosition: { x: 0, y: 0, z: -8.5 },
      position: { x: 0, y: 0, z: -8.5 },
      strafeRange: 0,
      strafeSpeed: 0,
      hp: 100,
      maxHp: 100,
      alive: true,
      respawnAt: null,
    },
    {
      id: 'target-mid-left',
      label: 'STRAFE DRONE L',
      basePosition: { x: -7, y: 0, z: -8 },
      position: { x: -7, y: 0, z: -8 },
      strafeRange: 3.4,
      strafeSpeed: 1.3,
      hp: 100,
      maxHp: 100,
      alive: true,
      respawnAt: null,
    },
    {
      id: 'target-mid-right',
      label: 'STRAFE DRONE R',
      basePosition: { x: 7, y: 0, z: -8 },
      position: { x: 7, y: 0, z: -8 },
      strafeRange: 3.4,
      strafeSpeed: 1.6,
      hp: 100,
      maxHp: 100,
      alive: true,
      respawnAt: null,
    },
    {
      id: 'target-center-deck',
      label: 'HIGH DECK TARGET',
      basePosition: { x: 0, y: 2.0, z: 0 },
      position: { x: 0, y: 2.0, z: 0 },
      strafeRange: 2.5,
      strafeSpeed: 0.9,
      hp: 100,
      maxHp: 100,
      alive: true,
      respawnAt: null,
    },
    {
      id: 'target-long',
      label: 'LONG RANGE (32m)',
      basePosition: { x: 0, y: 0, z: 10 },
      position: { x: 0, y: 0, z: 10 },
      strafeRange: 4.0,
      strafeSpeed: 1.1,
      hp: 100,
      maxHp: 100,
      alive: true,
      respawnAt: null,
    },
  ]
}

/**
 * Offline single-player Training Range adapter for beginners.
 * Reuses the exact shared RoomManager simulation (48 Math Questions, 8 Weapons, 4 Agents)
 * alongside Hologram Training Target Drones — strictly separate from real 2-8 player Multiplayer.
 */
export class PracticeAdapter {
  private manager: RoomManager | null = null
  private roomCode: string | null = null
  private playerId: string | null = null
  private tickTimer: number | null = null
  private startedAt = 0
  private targets: PracticeTarget[] = []
  private onMessage: ((msg: ServerMessage) => void) | null = null

  setMessageHandler(handler: (msg: ServerMessage) => void): void {
    this.onMessage = handler
  }

  start(playerName: string, freePlay = false, questionSet?: QuestionSet): void {
    this.disconnect()
    const mgr = new RoomManager()
    const created = mgr.createRoom(playerName || 'Trainee', questionSet)
    // Add an internal hidden sparring anchor solely so RoomManager transitions to playing cleanly,
    // then mark it permanently hidden (disconnected) and spawn Hologram Target Drones instead.
    const dummy = mgr.joinRoom(created.roomCode, 'RangeAnchor')
    if (!dummy.ok) return

    mgr.startMatch(created.roomCode, created.playerId)
    // Skip countdown & extend timer so Practice Range has zero time pressure (30 minutes)
    const room = mgr.getRoom(created.roomCode)
    if (!room) return
    const now = Date.now()
    room.phase = 'playing'
    room.countdownEndsAt = null
    room.matchStartedAt = now
    room.matchEndsAt = now + 30 * 60 * 1000
    room.roundNumber = 1
    room.roundState = freePlay ? 'FREE_PLAY' : 'COMBAT_ACTIVE'
    room.roundPhaseEndsAt = freePlay ? null : now + 35_000
    room.players.delete(dummy.playerId)

    const me = room.players.get(created.playerId)
    if (me) {
      me.position = { x: 0, y: 0, z: -15.5 }
      me.yaw = Math.PI
      me.weapon = freePlay ? 'rifle' : 'pistol'
      me.ammo = WEAPONS[me.weapon].magSize
      me.maxAmmo = WEAPONS[me.weapon].magSize
    }

    this.manager = mgr
    this.roomCode = created.roomCode
    this.playerId = created.playerId
    this.startedAt = now
    this.targets = createInitialPracticeTargets()

    const store = useGameStore.getState()
    store.setTransportMode('practice')
    store.setConnectionStatus('connected')
    store.setPracticeMode(true, this.targets.map((t) => ({ ...t, position: { ...t.position } })))

    this.onMessage?.({
      type: 'ROOM_JOINED',
      playerId: created.playerId,
      sessionToken: created.sessionToken,
      room: mgr.buildSnapshot(room),
    })

    this.startTickLoop()
  }

  setFreePlayMode(enabled: boolean): void {
    if (!this.manager || !this.roomCode) return
    const room = this.manager.getRoom(this.roomCode)
    if (!room) return
    const now = Date.now()
    if (enabled) {
      room.roundState = 'FREE_PLAY'
      room.roundPhaseEndsAt = null
      room.activeRoundQuestionId = null
      room.roundAnsweredPlayerIds.clear()
    } else {
      room.roundState = 'COMBAT_ACTIVE'
      room.roundPhaseEndsAt = now + 35_000
      room.activeRoundQuestionId = null
      room.roundAnsweredPlayerIds.clear()
    }
    this.emitSnapshot()
  }

  sendMessage(msg: ClientMessage): void {
    if (!this.manager || !this.roomCode || !this.playerId) return
    const roomCode = this.roomCode
    const playerId = this.playerId

    switch (msg.type) {
      case 'PLAYER_MOVE':
        this.manager.updatePlayerMove(roomCode, playerId, msg.position, msg.yaw, msg.pitch)
        break

      case 'REQUEST_QUESTION': {
        const res = this.manager.requestQuestion(roomCode, playerId, msg.preferredDifficulty)
        if (!res.ok) this.onMessage?.({ type: 'ERROR', code: res.code, message: res.message })
        else this.onMessage?.({ type: 'QUESTION_ASSIGNED', question: res.question })
        break
      }

      case 'SUBMIT_ANSWER': {
        const res = this.manager.submitAnswer(roomCode, playerId, msg.questionId, msg.selectedIndex)
        if (!res.ok) {
          this.onMessage?.({ type: 'ERROR', code: res.code, message: res.message })
        } else {
          this.onMessage?.({ type: 'ANSWER_RESULT', result: res.result })
          this.onMessage?.({ type: 'ROOM_STATE', room: res.snapshot })
        }
        break
      }

      case 'USE_MATH_HELPER': {
        const res = this.manager.useMathHelper(roomCode, playerId, msg.questionId, msg.helper)
        if (!res.ok) {
          this.onMessage?.({ type: 'ERROR', code: res.code, message: res.message })
        } else {
          this.onMessage?.({ type: 'MATH_HELPER_RESULT', helper: res.payload })
        }
        break
      }

      case 'RELOAD': {
        const res = this.manager.startReload(roomCode, playerId)
        if (res.ok) this.emitSnapshot()
        break
      }

      case 'SELECT_AGENT': {
        const res = this.manager.selectAgent(roomCode, playerId, msg.agent)
        if (res.ok) this.onMessage?.({ type: 'ROOM_STATE', room: res.snapshot })
        break
      }

      case 'START_FREE_PLAY': {
        this.setFreePlayMode(true)
        break
      }

      case 'SELECT_FREE_WEAPON': {
        const res = this.manager.selectFreeWeapon(roomCode, playerId, msg.weapon ?? null)
        if (res.ok) this.onMessage?.({ type: 'ROOM_STATE', room: res.snapshot })
        break
      }

      case 'USE_SKILL': {
        const res = this.manager.useSkill(roomCode, playerId, msg.slot, msg.origin, msg.direction)
        if (!res.ok) {
          if (res.code === 'ULT_NOT_READY') {
            this.onMessage?.({ type: 'ERROR', code: res.code, message: res.message })
          }
          return
        }
        this.onMessage?.({ type: 'SKILL_CAST', cast: res.outcome.cast })
        this.emitSnapshot()
        break
      }

      case 'SHOOT': {
        const res = this.manager.shoot(roomCode, playerId, msg.origin, msg.direction)
        if (!res.ok) return
        this.onMessage?.({ type: 'SHOT_FIRED', shot: res.outcome.shot })
        this.checkPracticeTargetHits(msg.origin, msg.direction, res.outcome.shot.weapon)
        this.emitSnapshot()
        break
      }

      case 'LEAVE_ROOM':
        this.disconnect()
        break
    }
  }

  private checkPracticeTargetHits(
    origin: Vec3,
    rawDir: Vec3,
    weaponId: keyof typeof WEAPONS | 'melee',
  ): void {
    if (!this.manager || !this.roomCode || !this.playerId) return
    const room = this.manager.getRoom(this.roomCode)
    const me = room?.players.get(this.playerId)
    if (!room || !me) return

    const isMelee = weaponId === 'melee'
    const spec = isMelee ? null : WEAPONS[weaponId]
    const maxRange = spec ? spec.range : 3.4
    const len = Math.hypot(rawDir.x, rawDir.y, rawDir.z) || 1
    const dir = { x: rawDir.x / len, y: rawDir.y / len, z: rawDir.z / len }
    const now = Date.now()

    const barriers: ArenaBox[] = room.worldEffects
      .filter((e) => e.kind === 'barrier' && e.box && e.expiresAt > now)
      .map((e) => ({
        id: e.id,
        minX: e.box!.minX,
        maxX: e.box!.maxX,
        minY: e.box!.minY,
        maxY: e.box!.maxY,
        minZ: e.box!.minZ,
        maxZ: e.box!.maxZ,
        kind: 'glass',
        accent: e.ownerTeam,
      }))

    const wallDist = raycastArenaObstacles(origin, dir, maxRange, barriers)
    let closest: { target: PracticeTarget; distance: number; headshot: boolean } | null = null

    for (const target of this.targets) {
      if (!target.alive) continue
      const hit = raycastPlayerHitbox(origin, dir, target.position, wallDist)
      if (hit && (!closest || hit.distance < closest.distance)) {
        closest = { target, distance: hit.distance, headshot: hit.headshot }
      }
    }

    if (!closest) return
    const pellets = !spec ? 1 : spec.id === 'shotgun' ? 4 : spec.id === 'burst' ? 3 : 1
    const baseDmg = !spec
      ? closest.headshot
        ? 55
        : 35
      : closest.headshot
        ? spec.headshotDamage
        : spec.damage
    const dmg = baseDmg * pellets
    closest.target.hp = Math.max(0, closest.target.hp - dmg)
    const killed = closest.target.hp <= 0

    if (killed) {
      closest.target.alive = false
      closest.target.respawnAt = now + 2400
      me.kills += 1
      if (closest.headshot) me.headshots += 1
      const pts = 150 + (closest.headshot ? 50 : 0)
      me.totalScore += pts
      me.ultPoints = Math.min(me.ultMax, me.ultPoints + 1)

      this.onMessage?.({
        type: 'HIT_CONFIRMED',
        hit: {
          victimId: closest.target.id,
          victimName: closest.target.label,
          damage: dmg,
          headshot: closest.headshot,
          killed: true,
          pointsAwarded: pts,
        },
      })
      this.onMessage?.({
        type: 'KILL_EVENT',
        kill: {
          id: `practice-kill-${now}`,
          killerId: me.id,
          killerName: me.name,
          killerTeam: me.team,
          victimId: closest.target.id,
          victimName: closest.target.label,
          victimTeam: 'red',
          weapon: weaponId,
          headshot: closest.headshot,
          pointsAwarded: pts,
          timestamp: now,
        },
      })
    } else {
      this.onMessage?.({
        type: 'HIT_CONFIRMED',
        hit: {
          victimId: closest.target.id,
          victimName: closest.target.label,
          damage: dmg,
          headshot: closest.headshot,
          killed: false,
          pointsAwarded: 0,
        },
      })
    }

    this.syncTargetsToStore()
  }

  private emitSnapshot(): void {
    if (!this.manager || !this.roomCode) return
    const room = this.manager.getRoom(this.roomCode)
    if (!room) return
    this.onMessage?.({ type: 'ROOM_STATE', room: this.manager.buildSnapshot(room) })
  }

  private syncTargetsToStore(): void {
    useGameStore.getState().setPracticeTargets(
      this.targets.map((t) => ({ ...t, position: { ...t.position } })),
    )
  }

  private startTickLoop(): void {
    if (this.tickTimer !== null) window.clearInterval(this.tickTimer)
    this.tickTimer = window.setInterval(() => {
      if (!this.manager || !this.roomCode) return
      const now = Date.now()
      const tSec = (now - this.startedAt) / 1000
      const transitions = this.manager.tick()
      for (const tr of transitions) {
        if (tr.type === 'ROUND_STATE_CHANGED') {
          if (tr.assignedQuestion) {
            this.onMessage?.({ type: 'QUESTION_ASSIGNED', question: tr.assignedQuestion })
          }
          if (tr.timeoutResults) {
            for (const item of tr.timeoutResults) {
              this.onMessage?.({ type: 'ANSWER_RESULT', result: item.result })
            }
          }
          this.emitSnapshot()
        } else if (tr.type === 'RELOADED' || tr.type === 'EFFECTS_UPDATED') {
          this.emitSnapshot()
        }
      }

      // Animate training target drones smoothly & respawn destroyed drones after 2.4s
      for (const target of this.targets) {
        if (!target.alive && target.respawnAt && now >= target.respawnAt) {
          target.alive = true
          target.hp = target.maxHp
          target.respawnAt = null
        }
        if (target.strafeRange > 0) {
          target.position.x =
            target.basePosition.x + Math.sin(tSec * target.strafeSpeed) * target.strafeRange
        }
      }
      this.syncTargetsToStore()

      const room = this.manager.getRoom(this.roomCode)
      if (!room) return
      const positions = Array.from(room.players.values()).map((p) => ({
        id: p.id,
        position: { ...p.position, y: p.position.y },
        yaw: p.yaw,
        pitch: p.pitch,
        hp: p.hp,
        maxHp: p.maxHp,
        alive: p.alive,
        respawnAt: p.respawnAt,
        weapon: p.weapon,
        ammo: p.ammo,
        reloadingUntil: p.reloadingUntil,
        skillQReadyAt: p.skillQReadyAt,
        skillCReadyAt: p.skillCReadyAt,
        ultPoints: p.ultPoints,
        overdriveUntil: p.overdriveUntil,
        overshieldUntil: p.overshieldUntil,
        blindedUntil: p.blindedUntil,
        revealedUntil: p.revealedUntil,
      }))
      // Keep PLAYER_DIMENSIONS referenced cleanly if needed
      if (PLAYER_DIMENSIONS.height > 0) {
        this.onMessage?.({ type: 'POSITIONS_SYNC', serverNow: now, positions })
      }
    }, 50)
  }

  disconnect(): void {
    if (this.tickTimer !== null) {
      window.clearInterval(this.tickTimer)
      this.tickTimer = null
    }
    this.manager = null
    this.roomCode = null
    this.playerId = null
    this.targets = []
  }
}
