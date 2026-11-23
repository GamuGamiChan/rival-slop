import {
  clampPositionToArena,
  PLAYER_DIMENSIONS,
  raycastArenaObstacles,
} from '../../shared/arena.ts'
import { AGENT_IDS } from '../../shared/agents.ts'
import { RoomManager } from '../../shared/roomManager.ts'
import type { ClientMessage, QuestionSet, ServerMessage, Vec3 } from '../../shared/types.ts'
import { WEAPONS } from '../../shared/weapons.ts'
import { useGameStore } from '../store/useGameStore.ts'

export type AiDifficulty = 'easy' | 'medium' | 'hard'

interface DifficultyTuning {
  moveSpeed: number
  aimSpreadRad: number
  fireIntervalScale: number
  minThinkMs: number
  maxThinkMs: number
  mathAccuracy: number
  skillChancePerTick: number
}

const DIFFICULTY_TUNING: Record<AiDifficulty, DifficultyTuning> = {
  easy: {
    moveSpeed: 3.4,
    aimSpreadRad: 0.16,
    fireIntervalScale: 2.3,
    minThinkMs: 4500,
    maxThinkMs: 11000,
    mathAccuracy: 0.55,
    skillChancePerTick: 0.008,
  },
  medium: {
    moveSpeed: 4.5,
    aimSpreadRad: 0.075,
    fireIntervalScale: 1.45,
    minThinkMs: 2800,
    maxThinkMs: 7800,
    mathAccuracy: 0.75,
    skillChancePerTick: 0.02,
  },
  hard: {
    moveSpeed: 5.5,
    aimSpreadRad: 0.025,
    fireIntervalScale: 1.05,
    minThinkMs: 1800,
    maxThinkMs: 5200,
    mathAccuracy: 0.9,
    skillChancePerTick: 0.038,
  },
}

const BOT_CALLSIGNS = ['AI-NEXUS', 'AI-GUARDIAN', 'AI-VALKYRIE']

/**
 * Local 10-Round VS AI Multiplayer Adapter.
 * Uses the exact same authoritative RoomManager rules (10 rounds, Math Challenge,
 * 8-weapon pool, -300 penalty + Cyber Fists, 3 Math Helpers, custom Question Sets)
 * while simulating 1v1 or 2v2 AI opponents in real time.
 */
export class VsAiAdapter {
  private manager: RoomManager | null = null
  private roomCode: string | null = null
  private playerId: string | null = null
  private botIds: string[] = []
  private difficulty: AiDifficulty = 'medium'
  private tickTimer: number | null = null
  private onMessage: ((msg: ServerMessage) => void) | null = null
  private botNextShotAt = new Map<string, number>()
  private botAnswerAt = new Map<string, number>()
  private scheduledQuestionKey = ''

  setMessageHandler(handler: (msg: ServerMessage) => void): void {
    this.onMessage = handler
  }

  start(
    playerName: string,
    difficulty: AiDifficulty = 'medium',
    questionSet?: QuestionSet,
    teamSize: 1 | 2 = 1,
  ): void {
    this.disconnect()
    this.difficulty = difficulty

    const mgr = new RoomManager()
    const created = mgr.createRoom(playerName || 'Rival', questionSet)
    const totalBots = teamSize === 2 ? 3 : 1
    const bots: string[] = []

    for (let i = 0; i < totalBots; i++) {
      const joined = mgr.joinRoom(created.roomCode, BOT_CALLSIGNS[i] ?? `AI-BOT-${i + 1}`)
      if (joined.ok) {
        bots.push(joined.playerId)
        mgr.selectAgent(created.roomCode, joined.playerId, AGENT_IDS[(i + 1) % AGENT_IDS.length])
        mgr.setReady(created.roomCode, joined.playerId, true)
      }
    }

    const started = mgr.startMatch(created.roomCode, created.playerId)
    if (!started.ok) return

    const room = mgr.getRoom(created.roomCode)
    if (!room) return

    this.manager = mgr
    this.roomCode = created.roomCode
    this.playerId = created.playerId
    this.botIds = bots

    const store = useGameStore.getState()
    store.setTransportMode('ai')
    store.setConnectionStatus('connected')
    store.setPracticeMode(false)

    this.onMessage?.({
      type: 'ROOM_JOINED',
      playerId: created.playerId,
      sessionToken: created.sessionToken,
      room: mgr.buildSnapshot(room),
    })

    this.startTickLoop()
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
        const res = this.manager.startFreePlay(roomCode, playerId)
        if (res.ok) this.onMessage?.({ type: 'ROOM_STATE', room: res.snapshot })
        break
      }

      case 'SELECT_FREE_WEAPON': {
        const res = this.manager.selectFreeWeapon(roomCode, playerId, msg.weapon ?? null)
        if (res.ok) this.onMessage?.({ type: 'ROOM_STATE', room: res.snapshot })
        break
      }

      case 'RETURN_TO_LOBBY': {
        const res = this.manager.returnToLobby(roomCode, playerId)
        if (res.ok) {
          for (const bid of this.botIds) {
            this.manager.setReady(roomCode, bid, true)
          }
          this.onMessage?.({ type: 'ROOM_STATE', room: res.snapshot })
        }
        break
      }

      case 'START_MATCH': {
        const res = this.manager.startMatch(roomCode, playerId)
        if (res.ok) this.onMessage?.({ type: 'ROOM_STATE', room: res.snapshot })
        break
      }

      case 'SET_QUESTION_SET': {
        const res = this.manager.setQuestionSet(roomCode, playerId, msg.questionSet)
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
        for (const hit of res.outcome.hits) {
          this.onMessage?.({ type: 'HIT_CONFIRMED', hit: hit.confirm })
          if (hit.killEvent) this.onMessage?.({ type: 'KILL_EVENT', kill: hit.killEvent })
        }
        this.emitSnapshot()
        break
      }

      case 'SHOOT': {
        const res = this.manager.shoot(roomCode, playerId, msg.origin, msg.direction)
        if (!res.ok) return
        this.onMessage?.({ type: 'SHOT_FIRED', shot: res.outcome.shot })
        for (const hit of res.outcome.hits) {
          this.onMessage?.({ type: 'HIT_CONFIRMED', hit: hit.confirm })
          if (hit.killEvent) this.onMessage?.({ type: 'KILL_EVENT', kill: hit.killEvent })
        }
        this.emitSnapshot()
        break
      }

      case 'LEAVE_ROOM':
        this.disconnect()
        break
    }
  }

  private emitSnapshot(): void {
    if (!this.manager || !this.roomCode) return
    const room = this.manager.getRoom(this.roomCode)
    if (!room) return
    this.onMessage?.({ type: 'ROOM_STATE', room: this.manager.buildSnapshot(room) })
  }

  private startTickLoop(): void {
    if (this.tickTimer !== null) window.clearInterval(this.tickTimer)
    this.tickTimer = window.setInterval(() => {
      if (!this.manager || !this.roomCode) return
      const now = Date.now()
      const transitions = this.manager.tick()
      const room = this.manager.getRoom(this.roomCode)
      if (!room) return

      for (const t of transitions) {
        if (t.roomCode !== this.roomCode) continue
        if (t.type === 'MATCH_FINISHED' && t.summary) {
          this.onMessage?.({
            type: 'MATCH_FINISHED',
            summary: t.summary,
            room: this.manager.buildSnapshot(room),
          })
        } else if (t.type === 'ORBITAL_DETONATED' && t.hits && t.attackerId) {
          for (const hit of t.hits) {
            if (t.attackerId === this.playerId) {
              this.onMessage?.({ type: 'HIT_CONFIRMED', hit: hit.confirm })
            }
            if (hit.victimId === this.playerId) {
              this.onMessage?.({ type: 'DAMAGE_TAKEN', damage: hit.damageTaken })
            }
            if (hit.killEvent) this.onMessage?.({ type: 'KILL_EVENT', kill: hit.killEvent })
          }
          this.emitSnapshot()
        } else if (t.type === 'ROUND_STATE_CHANGED') {
          if (t.assignedQuestion) {
            this.onMessage?.({
              type: 'QUESTION_ASSIGNED',
              question: t.assignedQuestion,
            })
          }
          if (t.timeoutResults) {
            for (const tr of t.timeoutResults) {
              if (tr.playerId === this.playerId) {
                this.onMessage?.({ type: 'ANSWER_RESULT', result: tr.result })
              }
            }
          }
          this.emitSnapshot()
        } else if (
          t.type === 'PHASE_PLAYING' ||
          t.type === 'RESPAWNED' ||
          t.type === 'RELOADED' ||
          t.type === 'EFFECTS_UPDATED'
        ) {
          this.emitSnapshot()
        }
      }

      if (room.phase === 'playing') {
        if (room.roundState === 'COMBAT_ACTIVE' || room.roundState === 'FREE_PLAY') {
          this.stepBotsCombat(now, 0.05)
        } else if (room.roundState === 'MATH_CHALLENGE') {
          this.stepBotsMath(now)
        }
      }

      const positions = Array.from(room.players.values()).map((p) => ({
        id: p.id,
        position: p.position,
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
      this.onMessage?.({ type: 'POSITIONS_SYNC', serverNow: now, positions })
    }, 50)
  }

  private stepBotsCombat(now: number, dt: number): void {
    if (!this.manager || !this.roomCode) return
    const room = this.manager.getRoom(this.roomCode)
    if (!room) return
    const tuning = DIFFICULTY_TUNING[this.difficulty]

    for (let bIdx = 0; bIdx < this.botIds.length; bIdx++) {
      const botId = this.botIds[bIdx]
      const bot = room.players.get(botId)
      if (!bot || !bot.alive) continue

      // Find nearest alive opponent
      let target = null as typeof bot | null
      let bestDistSq = Number.POSITIVE_INFINITY
      for (const p of room.players.values()) {
        if (p.team === bot.team || !p.alive) continue
        const dx = p.position.x - bot.position.x
        const dz = p.position.z - bot.position.z
        const dSq = dx * dx + dz * dz
        if (dSq < bestDistSq) {
          bestDistSq = dSq
          target = p
        }
      }
      if (!target) continue

      const dx = target.position.x - bot.position.x
      const dy = target.position.y - bot.position.y
      const dz = target.position.z - bot.position.z
      const horizDist = Math.hypot(dx, dz) || 0.001

      const yaw = Math.atan2(-dx, -dz)
      const pitch = Math.max(-0.55, Math.min(0.55, Math.atan2(dy, horizDist)))

      const dirX = dx / horizDist
      const dirZ = dz / horizDist
      const strafeX = -dirZ
      const strafeZ = dirX
      const strafeDir = Math.sin(now * 0.0017 + bIdx * 2.3)

      let forwardMove = 0
      if (bot.weapon === null) {
        // Cyber Fists: close distance to melee range
        forwardMove = horizDist > 2.0 ? 1 : 0
      } else if (horizDist > 15) {
        forwardMove = 1
      } else if (horizDist < 7.5) {
        forwardMove = -0.75
      }

      const vx = (dirX * forwardMove + strafeX * strafeDir * 0.8) * tuning.moveSpeed * dt
      const vz = (dirZ * forwardMove + strafeZ * strafeDir * 0.8) * tuning.moveSpeed * dt
      const nextPos = clampPositionToArena({
        x: bot.position.x + vx,
        y: bot.position.y,
        z: bot.position.z + vz,
      })
      this.manager.updatePlayerMove(this.roomCode, botId, nextPos, yaw, pitch)

      // Auto-reload when empty
      if (bot.weapon !== null && bot.ammo <= 0 && !bot.reloadingUntil) {
        this.manager.startReload(this.roomCode, botId)
      }

      const eyeOrigin: Vec3 = {
        x: nextPos.x,
        y: nextPos.y + PLAYER_DIMENSIONS.eyeHeight,
        z: nextPos.z,
      }
      const targetCenter: Vec3 = {
        x: target.position.x,
        y: target.position.y + PLAYER_DIMENSIONS.eyeHeight - 0.18,
        z: target.position.z,
      }
      const aimVec = {
        x: targetCenter.x - eyeOrigin.x,
        y: targetCenter.y - eyeOrigin.y,
        z: targetCenter.z - eyeOrigin.z,
      }
      const aimLen = Math.hypot(aimVec.x, aimVec.y, aimVec.z) || 1
      const aimDir: Vec3 = {
        x: aimVec.x / aimLen,
        y: aimVec.y / aimLen,
        z: aimVec.z / aimLen,
      }

      // Occasionally cast an Agent skill (Q, C, or X)
      if (Math.random() < tuning.skillChancePerTick) {
        const slot = bot.ultPoints >= bot.ultMax ? 'X' : Math.random() < 0.5 ? 'Q' : 'C'
        const skillRes = this.manager.useSkill(this.roomCode, botId, slot, eyeOrigin, aimDir)
        if (skillRes.ok) {
          this.onMessage?.({ type: 'SKILL_CAST', cast: skillRes.outcome.cast })
          for (const hit of skillRes.outcome.hits) {
            if (hit.victimId === this.playerId) {
              this.onMessage?.({ type: 'DAMAGE_TAKEN', damage: hit.damageTaken })
            }
            if (hit.killEvent) this.onMessage?.({ type: 'KILL_EVENT', kill: hit.killEvent })
          }
          this.emitSnapshot()
        }
      }

      // Shoot if not blinded, within weapon range, line of sight clear, and cooldown elapsed
      if (bot.blindedUntil && bot.blindedUntil > now) continue
      const maxRange = bot.weapon ? WEAPONS[bot.weapon].range : 3.4
      if (aimLen > maxRange) continue

      const nextAllowedShot = this.botNextShotAt.get(botId) ?? 0
      if (now < nextAllowedShot) continue

      const blocked = raycastArenaObstacles(eyeOrigin, aimDir, aimLen - 0.35, [])
      if (blocked !== null) continue

      // Add difficulty-based angular spread
      const spreadX = (Math.random() - 0.5) * 2 * tuning.aimSpreadRad
      const spreadY = (Math.random() - 0.5) * 2 * tuning.aimSpreadRad
      const spreadZ = (Math.random() - 0.5) * 2 * tuning.aimSpreadRad
      const sx = aimDir.x + spreadX
      const sy = aimDir.y + spreadY
      const sz = aimDir.z + spreadZ
      const sLen = Math.hypot(sx, sy, sz) || 1
      const finalDir: Vec3 = { x: sx / sLen, y: sy / sLen, z: sz / sLen }

      const fireCooldown = bot.weapon ? WEAPONS[bot.weapon].fireRateMs : 520
      this.botNextShotAt.set(
        botId,
        now + fireCooldown * tuning.fireIntervalScale * (0.85 + Math.random() * 0.45),
      )

      const shotRes = this.manager.shoot(this.roomCode, botId, eyeOrigin, finalDir)
      if (shotRes.ok) {
        this.onMessage?.({ type: 'SHOT_FIRED', shot: shotRes.outcome.shot })
        for (const hit of shotRes.outcome.hits) {
          if (hit.victimId === this.playerId) {
            this.onMessage?.({ type: 'DAMAGE_TAKEN', damage: hit.damageTaken })
          }
          if (hit.killEvent) this.onMessage?.({ type: 'KILL_EVENT', kill: hit.killEvent })
        }
        if (shotRes.outcome.hits.length > 0) {
          this.emitSnapshot()
        }
      }
    }
  }

  private stepBotsMath(now: number): void {
    if (!this.manager || !this.roomCode) return
    const room = this.manager.getRoom(this.roomCode)
    if (!room || !room.activeRoundQuestionId) return
    const qId = room.activeRoundQuestionId
    const key = `${room.roundNumber}:${qId}`
    const tuning = DIFFICULTY_TUNING[this.difficulty]

    if (this.scheduledQuestionKey !== key) {
      this.scheduledQuestionKey = key
      this.botAnswerAt.clear()
      for (const bid of this.botIds) {
        const delay =
          tuning.minThinkMs + Math.random() * (tuning.maxThinkMs - tuning.minThinkMs)
        this.botAnswerAt.set(bid, now + delay)
      }
    }

    const question = room.questionById.get(qId)
    if (!question) return

    for (const bid of this.botIds) {
      if (room.roundAnsweredPlayerIds.has(bid)) continue
      const dueAt = this.botAnswerAt.get(bid) ?? Number.POSITIVE_INFINITY
      if (now < dueAt) continue

      const willAnswerCorrectly = Math.random() < tuning.mathAccuracy
      const choice = willAnswerCorrectly
        ? question.correctIndex
        : (question.correctIndex + 1 + Math.floor(Math.random() * 3)) % 4

      const res = this.manager.submitAnswer(this.roomCode, bid, qId, choice)
      if (res.ok) {
        this.onMessage?.({ type: 'ROOM_STATE', room: res.snapshot })
      }
    }
  }

  disconnect(): void {
    if (this.tickTimer !== null) {
      window.clearInterval(this.tickTimer)
      this.tickTimer = null
    }
    this.manager = null
    this.roomCode = null
    this.playerId = null
    this.botIds = []
    this.botNextShotAt.clear()
    this.botAnswerAt.clear()
    this.scheduledQuestionKey = ''
  }
}
