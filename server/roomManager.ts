import crypto from 'node:crypto'
import {
  clampPositionToArena,
  getSpawnForTeam,
  normalizeVec3,
  PLAYER_DIMENSIONS,
  raycastArenaObstacles,
  raycastPlayerHitbox,
} from '../shared/arena.ts'
import { pickNextQuestion, QUESTION_BY_ID, toPublicQuestion } from '../shared/questions.ts'
import {
  MATCH_CONFIG,
  SCORING,
  type AnswerResultPayload,
  type DamageTakenPayload,
  type Difficulty,
  type HitConfirmPayload,
  type KillFeedItem,
  type MatchPhase,
  type MatchSummary,
  type PlayerPublicState,
  type PublicMathQuestion,
  type RoomSnapshot,
  type ScoreboardEntry,
  type ShotEvent,
  type Team,
  type Vec3,
  type WeaponId,
} from '../shared/types.ts'
import { rollRandomWeapon, WEAPONS } from '../shared/weapons.ts'

export interface InternalPlayer extends PlayerPublicState {
  sessionToken: string
  lastShotAt: number
  lastMoveAt: number
  activeQuestionId: string | null
  attemptedQuestionIds: Set<string>
  disconnectedAt: number | null
}

export interface InternalRoom {
  roomCode: string
  hostId: string
  phase: MatchPhase
  createdAt: number
  countdownEndsAt: number | null
  matchStartedAt: number | null
  matchEndsAt: number | null
  players: Map<string, InternalPlayer>
  killFeed: KillFeedItem[]
  summary: MatchSummary | null
  spawnCounter: { blue: number; red: number }
}

export interface ShootOutcome {
  shot: ShotEvent
  hits: Array<{
    victimId: string
    confirm: HitConfirmPayload
    damageTaken: DamageTakenPayload
    killEvent?: KillFeedItem
  }>
}

export interface TickTransition {
  roomCode: string
  type: 'PHASE_PLAYING' | 'RESPAWNED' | 'RELOADED' | 'MATCH_FINISHED' | 'ROOM_CLEANED'
  summary?: MatchSummary
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateRoomCode(existing: Map<string, InternalRoom>): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = ''
    const bytes = crypto.randomBytes(6)
    for (let i = 0; i < 6; i++) {
      code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
    }
    if (!existing.has(code)) return code
  }
  return `M${Date.now().toString(36).slice(-5).toUpperCase()}`
}

function sanitizeName(raw: string): string {
  const cleaned = raw.replace(/[^\p{L}\p{N}_\-\s]/gu, '').trim().slice(0, 18)
  return cleaned.length >= 2 ? cleaned : `Rival_${crypto.randomBytes(2).toString('hex').toUpperCase()}`
}

function isFiniteVec3(v: Vec3 | undefined | null): v is Vec3 {
  return (
    Boolean(v) &&
    Number.isFinite(v!.x) &&
    Number.isFinite(v!.y) &&
    Number.isFinite(v!.z)
  )
}

export class RoomManager {
  private readonly rooms = new Map<string, InternalRoom>()
  private readonly nowFn: () => number
  private readonly rngFn: () => number

  constructor(nowFn: () => number = () => Date.now(), rngFn: () => number = Math.random) {
    this.nowFn = nowFn
    this.rngFn = rngFn
  }

  getRoomCount(): number {
    return this.rooms.size
  }

  getTotalConnectedPlayers(): number {
    let total = 0
    for (const room of this.rooms.values()) {
      for (const p of room.players.values()) {
        if (p.connected) total++
      }
    }
    return total
  }

  getAllRoomCodes(): string[] {
    return Array.from(this.rooms.keys())
  }

  getRoom(roomCode: string): InternalRoom | undefined {
    return this.rooms.get(roomCode.trim().toUpperCase())
  }

  createRoom(playerName: string): {
    roomCode: string
    playerId: string
    sessionToken: string
    snapshot: RoomSnapshot
  } {
    const now = this.nowFn()
    const roomCode = generateRoomCode(this.rooms)
    const playerId = crypto.randomUUID()
    const sessionToken = crypto.randomBytes(24).toString('hex')
    const spawn = getSpawnForTeam('blue', 0)

    const host: InternalPlayer = {
      id: playerId,
      sessionToken,
      name: sanitizeName(playerName),
      team: 'blue',
      ready: true,
      connected: true,
      isHost: true,
      position: spawn.position,
      yaw: spawn.yaw,
      pitch: 0,
      hp: MATCH_CONFIG.MAX_HP,
      maxHp: MATCH_CONFIG.MAX_HP,
      alive: true,
      respawnAt: null,
      weapon: null,
      ammo: 0,
      maxAmmo: 0,
      reloadingUntil: null,
      kills: 0,
      deaths: 0,
      headshots: 0,
      correctAnswers: 0,
      wrongAnswers: 0,
      totalScore: 0,
      streak: 0,
      lastShotAt: 0,
      lastMoveAt: now,
      activeQuestionId: null,
      attemptedQuestionIds: new Set<string>(),
      disconnectedAt: null,
    }

    const room: InternalRoom = {
      roomCode,
      hostId: playerId,
      phase: 'lobby',
      createdAt: now,
      countdownEndsAt: null,
      matchStartedAt: null,
      matchEndsAt: null,
      players: new Map([[playerId, host]]),
      killFeed: [],
      summary: null,
      spawnCounter: { blue: 1, red: 0 },
    }

    this.rooms.set(roomCode, room)
    return {
      roomCode,
      playerId,
      sessionToken,
      snapshot: this.buildSnapshot(room),
    }
  }

  joinRoom(
    rawRoomCode: string,
    playerName: string,
  ):
    | { ok: true; roomCode: string; playerId: string; sessionToken: string; snapshot: RoomSnapshot }
    | { ok: false; code: string; message: string } {
    const roomCode = rawRoomCode.trim().toUpperCase()
    const room = this.rooms.get(roomCode)
    if (!room) {
      return { ok: false, code: 'ROOM_NOT_FOUND', message: `ไม่พบห้องรหัส "${roomCode}"` }
    }
    if (room.players.size >= MATCH_CONFIG.MAX_PLAYERS) {
      return { ok: false, code: 'ROOM_FULL', message: 'ห้องเต็มแล้ว (สูงสุด 8 คน)' }
    }
    if (room.phase === 'finished') {
      return { ok: false, code: 'MATCH_FINISHED', message: 'เกมในห้องนี้จบลงแล้ว กรุณารอห้องรีเซ็ตหรือสร้างห้องใหม่' }
    }

    // Balance teams automatically (Blue vs Red)
    let blueCount = 0
    let redCount = 0
    for (const p of room.players.values()) {
      if (p.team === 'blue') blueCount++
      else redCount++
    }
    const team: Team = blueCount <= redCount ? 'blue' : 'red'
    const spawn = getSpawnForTeam(team, room.spawnCounter[team]++)

    const now = this.nowFn()
    const playerId = crypto.randomUUID()
    const sessionToken = crypto.randomBytes(24).toString('hex')

    const player: InternalPlayer = {
      id: playerId,
      sessionToken,
      name: sanitizeName(playerName),
      team,
      ready: false,
      connected: true,
      isHost: false,
      position: spawn.position,
      yaw: spawn.yaw,
      pitch: 0,
      hp: MATCH_CONFIG.MAX_HP,
      maxHp: MATCH_CONFIG.MAX_HP,
      alive: true,
      respawnAt: null,
      weapon: null,
      ammo: 0,
      maxAmmo: 0,
      reloadingUntil: null,
      kills: 0,
      deaths: 0,
      headshots: 0,
      correctAnswers: 0,
      wrongAnswers: 0,
      totalScore: 0,
      streak: 0,
      lastShotAt: 0,
      lastMoveAt: now,
      activeQuestionId: null,
      attemptedQuestionIds: new Set<string>(),
      disconnectedAt: null,
    }

    room.players.set(playerId, player)
    return {
      ok: true,
      roomCode,
      playerId,
      sessionToken,
      snapshot: this.buildSnapshot(room),
    }
  }

  reconnectPlayer(
    rawRoomCode: string,
    playerId: string,
    sessionToken: string,
  ):
    | { ok: true; roomCode: string; snapshot: RoomSnapshot }
    | { ok: false; code: string; message: string } {
    const roomCode = rawRoomCode.trim().toUpperCase()
    const room = this.rooms.get(roomCode)
    if (!room) {
      return { ok: false, code: 'ROOM_NOT_FOUND', message: 'ห้องหมดอายุหรือไม่พบในระบบแล้ว' }
    }
    const player = room.players.get(playerId)
    if (!player) {
      return { ok: false, code: 'PLAYER_NOT_FOUND', message: 'ไม่พบข้อมูลผู้เล่นในห้องนี้' }
    }
    // Timing-safe session token comparison to prevent spoofing
    const a = Buffer.from(player.sessionToken)
    const b = Buffer.from(sessionToken || '')
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { ok: false, code: 'UNAUTHORIZED', message: 'Session token ไม่ถูกต้อง' }
    }

    player.connected = true
    player.disconnectedAt = null
    return {
      ok: true,
      roomCode,
      snapshot: this.buildSnapshot(room),
    }
  }

  markDisconnected(roomCode: string, playerId: string, permanentLeave = false): RoomSnapshot | null {
    const room = this.rooms.get(roomCode)
    if (!room) return null
    const player = room.players.get(playerId)
    if (!player) return null

    if (permanentLeave || room.phase === 'lobby') {
      room.players.delete(playerId)
    } else {
      player.connected = false
      player.disconnectedAt = this.nowFn()
    }

    // Reassign host if host left or disconnected
    if (room.hostId === playerId) {
      const nextHost = Array.from(room.players.values()).find((p) => p.connected)
      if (nextHost) {
        room.hostId = nextHost.id
        for (const p of room.players.values()) {
          p.isHost = p.id === nextHost.id
        }
      }
    }

    // Remove completely empty rooms immediately
    const anyConnected = Array.from(room.players.values()).some((p) => p.connected)
    if (room.players.size === 0 || (!anyConnected && room.phase === 'lobby')) {
      this.rooms.delete(roomCode)
      return null
    }

    return this.buildSnapshot(room)
  }

  setReady(
    roomCode: string,
    playerId: string,
    ready: boolean,
  ): { ok: true; snapshot: RoomSnapshot } | { ok: false; code: string; message: string } {
    const room = this.rooms.get(roomCode)
    if (!room) return { ok: false, code: 'ROOM_NOT_FOUND', message: 'ไม่พบห้อง' }
    if (room.phase !== 'lobby') {
      return { ok: false, code: 'INVALID_PHASE', message: 'เปลี่ยนสถานะ Ready ได้เฉพาะใน Lobby เท่านั้น' }
    }
    const player = room.players.get(playerId)
    if (!player) return { ok: false, code: 'PLAYER_NOT_FOUND', message: 'ไม่พบผู้เล่น' }

    player.ready = Boolean(ready)
    return { ok: true, snapshot: this.buildSnapshot(room) }
  }

  switchTeam(
    roomCode: string,
    playerId: string,
    targetTeam: Team,
  ): { ok: true; snapshot: RoomSnapshot } | { ok: false; code: string; message: string } {
    const room = this.rooms.get(roomCode)
    if (!room) return { ok: false, code: 'ROOM_NOT_FOUND', message: 'ไม่พบห้อง' }
    if (room.phase !== 'lobby') {
      return { ok: false, code: 'INVALID_PHASE', message: 'เปลี่ยนทีมได้เฉพาะใน Lobby เท่านั้น' }
    }
    if (targetTeam !== 'blue' && targetTeam !== 'red') {
      return { ok: false, code: 'INVALID_TEAM', message: 'ทีมไม่ถูกต้อง' }
    }
    const player = room.players.get(playerId)
    if (!player) return { ok: false, code: 'PLAYER_NOT_FOUND', message: 'ไม่พบผู้เล่น' }
    if (player.team === targetTeam) {
      return { ok: true, snapshot: this.buildSnapshot(room) }
    }

    const teamCount = Array.from(room.players.values()).filter((p) => p.team === targetTeam).length
    if (teamCount >= MATCH_CONFIG.MAX_PLAYERS / 2) {
      return { ok: false, code: 'TEAM_FULL', message: 'ทีมนี้เต็มแล้ว (สูงสุดทีมละ 4 คน)' }
    }

    player.team = targetTeam
    const spawn = getSpawnForTeam(targetTeam, room.spawnCounter[targetTeam]++)
    player.position = spawn.position
    player.yaw = spawn.yaw
    return { ok: true, snapshot: this.buildSnapshot(room) }
  }

  startMatch(
    roomCode: string,
    requesterId: string,
  ): { ok: true; snapshot: RoomSnapshot } | { ok: false; code: string; message: string } {
    const room = this.rooms.get(roomCode)
    if (!room) return { ok: false, code: 'ROOM_NOT_FOUND', message: 'ไม่พบห้อง' }
    if (room.hostId !== requesterId) {
      return { ok: false, code: 'FORBIDDEN', message: 'เฉพาะหัวหน้าห้อง (Host) เท่านั้นที่เริ่มเกมได้' }
    }
    if (room.phase !== 'lobby') {
      return { ok: false, code: 'INVALID_PHASE', message: 'เกมกำลังดำเนินอยู่แล้ว' }
    }

    const connectedPlayers = Array.from(room.players.values()).filter((p) => p.connected)
    if (connectedPlayers.length < MATCH_CONFIG.MIN_PLAYERS) {
      return {
        ok: false,
        code: 'NOT_ENOUGH_PLAYERS',
        message: `ต้องมีผู้เล่นอย่างน้อย ${MATCH_CONFIG.MIN_PLAYERS} คนจึงจะเริ่มแข่งได้`,
      }
    }

    // Ensure at least 1 player per team if everyone stacked one side
    const bluePlayers = connectedPlayers.filter((p) => p.team === 'blue')
    const redPlayers = connectedPlayers.filter((p) => p.team === 'red')
    if (bluePlayers.length === 0 || redPlayers.length === 0) {
      // Auto-balance half to the empty team so players always have rivals to fight
      const half = Math.ceil(connectedPlayers.length / 2)
      connectedPlayers.forEach((p, idx) => {
        p.team = idx < half ? 'blue' : 'red'
      })
    }

    const now = this.nowFn()
    room.phase = 'countdown'
    room.countdownEndsAt = now + MATCH_CONFIG.COUNTDOWN_SEC * 1000
    room.matchStartedAt = null
    room.matchEndsAt = null
    room.killFeed = []
    room.summary = null
    room.spawnCounter = { blue: 0, red: 0 }

    for (const p of room.players.values()) {
      const spawn = getSpawnForTeam(p.team, room.spawnCounter[p.team]++)
      p.position = spawn.position
      p.yaw = spawn.yaw
      p.pitch = 0
      p.hp = MATCH_CONFIG.MAX_HP
      p.alive = true
      p.respawnAt = null
      p.weapon = null
      p.ammo = 0
      p.maxAmmo = 0
      p.reloadingUntil = null
      p.kills = 0
      p.deaths = 0
      p.headshots = 0
      p.correctAnswers = 0
      p.wrongAnswers = 0
      p.totalScore = 0
      p.streak = 0
      p.lastShotAt = 0
      p.activeQuestionId = null
      p.attemptedQuestionIds.clear()
    }

    return { ok: true, snapshot: this.buildSnapshot(room) }
  }

  returnToLobby(
    roomCode: string,
    requesterId: string,
  ): { ok: true; snapshot: RoomSnapshot } | { ok: false; code: string; message: string } {
    const room = this.rooms.get(roomCode)
    if (!room) return { ok: false, code: 'ROOM_NOT_FOUND', message: 'ไม่พบห้อง' }
    if (room.hostId !== requesterId) {
      return { ok: false, code: 'FORBIDDEN', message: 'เฉพาะหัวหน้าห้องเท่านั้นที่รีเซ็ตกลับ Lobby ได้' }
    }
    if (room.phase !== 'finished') {
      return { ok: false, code: 'INVALID_PHASE', message: 'สามารถกลับ Lobby ได้หลังจบเกมเท่านั้น' }
    }

    // Remove disconnected players when returning to lobby
    for (const [id, p] of room.players.entries()) {
      if (!p.connected) {
        room.players.delete(id)
      } else {
        p.ready = p.isHost
        p.weapon = null
        p.ammo = 0
        p.maxAmmo = 0
        p.hp = MATCH_CONFIG.MAX_HP
        p.alive = true
        p.respawnAt = null
        p.activeQuestionId = null
      }
    }

    room.phase = 'lobby'
    room.countdownEndsAt = null
    room.matchStartedAt = null
    room.matchEndsAt = null
    room.summary = null
    room.killFeed = []

    return { ok: true, snapshot: this.buildSnapshot(room) }
  }

  updatePlayerMove(
    roomCode: string,
    playerId: string,
    position: Vec3,
    yaw: number,
    pitch: number,
  ): boolean {
    const room = this.rooms.get(roomCode)
    if (!room || (room.phase !== 'playing' && room.phase !== 'countdown')) return false
    const player = room.players.get(playerId)
    if (!player || !player.alive || !player.connected) return false
    if (!isFiniteVec3(position) || !Number.isFinite(yaw) || !Number.isFinite(pitch)) return false

    const clamped = clampPositionToArena(position)
    const now = this.nowFn()
    const dtSec = Math.max(0.016, Math.min(1.0, (now - player.lastMoveAt) / 1000))

    // During countdown players can look around but remain at spawn
    if (room.phase === 'countdown') {
      player.yaw = yaw
      player.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, pitch))
      player.lastMoveAt = now
      return true
    }

    // Anti-teleport speed check (generous allowance for jump pads & lag spikes: max 28 m/s)
    const dx = clamped.x - player.position.x
    const dy = clamped.y - player.position.y
    const dz = clamped.z - player.position.z
    const dist = Math.hypot(dx, dy, dz)
    const maxAllowedDist = Math.max(4.5, 28 * dtSec)

    if (dist <= maxAllowedDist) {
      player.position = clamped
    } else {
      const scale = maxAllowedDist / dist
      player.position = clampPositionToArena({
        x: player.position.x + dx * scale,
        y: player.position.y + dy * scale,
        z: player.position.z + dz * scale,
      })
    }

    player.yaw = yaw
    player.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, pitch))
    player.lastMoveAt = now
    return true
  }

  requestQuestion(
    roomCode: string,
    playerId: string,
    preferredDifficulty?: Difficulty,
  ): { ok: true; question: PublicMathQuestion } | { ok: false; code: string; message: string } {
    const room = this.rooms.get(roomCode)
    if (!room) return { ok: false, code: 'ROOM_NOT_FOUND', message: 'ไม่พบห้อง' }
    if (room.phase !== 'playing') {
      return { ok: false, code: 'MATCH_NOT_ACTIVE', message: 'สามารถตอบคำถามได้ขณะแข่งขันเท่านั้น' }
    }
    const player = room.players.get(playerId)
    if (!player || !player.connected) {
      return { ok: false, code: 'PLAYER_NOT_FOUND', message: 'ไม่พบผู้เล่น' }
    }

    // If player already has a pending active question, return the same one (prevents cherry-picking)
    if (player.activeQuestionId && !player.attemptedQuestionIds.has(player.activeQuestionId)) {
      const existing = QUESTION_BY_ID.get(player.activeQuestionId)
      if (existing) {
        return { ok: true, question: toPublicQuestion(existing) }
      }
    }

    const nextQ = pickNextQuestion(player.attemptedQuestionIds, preferredDifficulty, this.rngFn)
    if (!nextQ) {
      return {
        ok: false,
        code: 'NO_MORE_QUESTIONS',
        message: 'คุณตอบโจทย์ครบทั้งคลัง 48 ข้อแล้ว! ใช้ทักษะการยิงเก็บแต้มต่อเลย',
      }
    }

    player.activeQuestionId = nextQ.id
    return { ok: true, question: toPublicQuestion(nextQ) }
  }

  submitAnswer(
    roomCode: string,
    playerId: string,
    questionId: string,
    selectedIndex: number,
  ):
    | { ok: true; result: AnswerResultPayload; snapshot: RoomSnapshot }
    | { ok: false; code: string; message: string } {
    const room = this.rooms.get(roomCode)
    if (!room) return { ok: false, code: 'ROOM_NOT_FOUND', message: 'ไม่พบห้อง' }
    if (room.phase !== 'playing') {
      return { ok: false, code: 'MATCH_NOT_ACTIVE', message: 'หมดเวลาการแข่งขันแล้ว' }
    }
    const player = room.players.get(playerId)
    if (!player || !player.connected) {
      return { ok: false, code: 'PLAYER_NOT_FOUND', message: 'ไม่พบผู้เล่น' }
    }
    if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex > 3) {
      return { ok: false, code: 'INVALID_CHOICE', message: 'ตัวเลือกคำตอบไม่ถูกต้อง' }
    }

    // Strict Anti-Farming Security Check 1: Prevent duplicate question submission
    if (player.attemptedQuestionIds.has(questionId)) {
      return {
        ok: false,
        code: 'DUPLICATE_ANSWER',
        message: 'คำถามนี้ถูกส่งคำตอบไปแล้ว ไม่สามารถตอบซ้ำเพื่อฟาร์มคะแนนได้',
      }
    }

    // Strict Anti-Farming Security Check 2: Only allow answering the question assigned by server
    if (player.activeQuestionId !== questionId) {
      return {
        ok: false,
        code: 'UNASSIGNED_QUESTION',
        message: 'คำถามนี้ไม่ได้ถูกสุ่มให้กับผู้เล่นในรอบปัจจุบัน',
      }
    }

    const question = QUESTION_BY_ID.get(questionId)
    if (!question) {
      return { ok: false, code: 'QUESTION_NOT_FOUND', message: 'ไม่พบคำถามในระบบ' }
    }

    // Consume question atomically
    player.attemptedQuestionIds.add(questionId)
    player.activeQuestionId = null

    const correct = selectedIndex === question.correctIndex
    let awardedWeapon: WeaponId | null = null
    let pointsAwarded = 0

    if (correct) {
      pointsAwarded = SCORING.MATH_CORRECT
      player.correctAnswers += 1
      player.totalScore += pointsAwarded

      awardedWeapon = rollRandomWeapon(question.difficulty, player.weapon, this.rngFn)
      const spec = WEAPONS[awardedWeapon]
      player.weapon = awardedWeapon
      player.ammo = spec.magSize
      player.maxAmmo = spec.magSize
      player.reloadingUntil = null
    } else {
      player.wrongAnswers += 1
    }

    return {
      ok: true,
      result: {
        questionId: question.id,
        correct,
        pointsAwarded,
        awardedWeapon,
        correctIndex: question.correctIndex,
        correctChoiceText: question.choices[question.correctIndex],
        explanation: question.explanation,
        totalScore: player.totalScore,
        correctAnswers: player.correctAnswers,
      },
      snapshot: this.buildSnapshot(room),
    }
  }

  startReload(
    roomCode: string,
    playerId: string,
  ): { ok: true; reloadingUntil: number } | { ok: false; code: string; message: string } {
    const room = this.rooms.get(roomCode)
    if (!room || room.phase !== 'playing') {
      return { ok: false, code: 'MATCH_NOT_ACTIVE', message: 'เกมยังไม่เริ่ม' }
    }
    const player = room.players.get(playerId)
    if (!player || !player.alive || !player.weapon) {
      return { ok: false, code: 'NO_WEAPON', message: 'ยังไม่มีอาวุธ' }
    }
    const spec = WEAPONS[player.weapon]
    if (player.ammo >= spec.magSize) {
      return { ok: false, code: 'AMMO_FULL', message: 'กระสุนเต็มแล้ว' }
    }
    const now = this.nowFn()
    if (player.reloadingUntil && now < player.reloadingUntil) {
      return { ok: true, reloadingUntil: player.reloadingUntil }
    }
    player.reloadingUntil = now + spec.reloadMs
    return { ok: true, reloadingUntil: player.reloadingUntil }
  }

  shoot(
    roomCode: string,
    shooterId: string,
    origin: Vec3,
    rawDirection: Vec3,
  ): { ok: true; outcome: ShootOutcome; scoreboardChanged: boolean } | { ok: false; code: string; message: string } {
    const room = this.rooms.get(roomCode)
    if (!room || room.phase !== 'playing') {
      return { ok: false, code: 'MATCH_NOT_ACTIVE', message: 'เกมยังไม่เริ่ม' }
    }
    const shooter = room.players.get(shooterId)
    if (!shooter || !shooter.connected || !shooter.alive) {
      return { ok: false, code: 'CANNOT_SHOOT', message: 'ผู้เล่นไม่สามารถยิงได้ในขณะนี้' }
    }
    if (!shooter.weapon) {
      return { ok: false, code: 'NO_WEAPON', message: 'ต้องตอบคำถามคณิตศาสตร์ให้ถูกก่อนจึงจะได้รับอาวุธ' }
    }
    if (!isFiniteVec3(origin) || !isFiniteVec3(rawDirection)) {
      return { ok: false, code: 'INVALID_VECTOR', message: 'ทิศทางการยิงไม่ถูกต้อง' }
    }

    const now = this.nowFn()
    const spec = WEAPONS[shooter.weapon]

    // Finish reload if elapsed
    if (shooter.reloadingUntil !== null) {
      if (now >= shooter.reloadingUntil) {
        shooter.ammo = spec.magSize
        shooter.reloadingUntil = null
      } else {
        return { ok: false, code: 'RELOADING', message: 'กำลังรีโหลดอาวุธ' }
      }
    }

    if (shooter.ammo <= 0) {
      return { ok: false, code: 'OUT_OF_AMMO', message: 'กระสุนหมด กด R เพื่อรีโหลด' }
    }

    // Server-side Fire Rate Enforcement (20ms jitter tolerance)
    if (now - shooter.lastShotAt < spec.fireRateMs - 20) {
      return { ok: false, code: 'FIRE_RATE_LIMIT', message: 'ยิงเร็วเกินขีดจำกัดของอาวุธ' }
    }

    // Validate origin is near shooter's authoritative eye position (anti-teleport shoot)
    const authEye: Vec3 = {
      x: shooter.position.x,
      y: shooter.position.y + PLAYER_DIMENSIONS.eyeHeight,
      z: shooter.position.z,
    }
    const originDelta = Math.hypot(
      origin.x - authEye.x,
      origin.y - authEye.y,
      origin.z - authEye.z,
    )
    const rayOrigin = originDelta <= 2.4 ? origin : authEye
    const baseDir = normalizeVec3(rawDirection)

    shooter.ammo -= 1
    shooter.lastShotAt = now

    const endpoints: Vec3[] = []
    const damageAccumulator = new Map<string, { damage: number; headshot: boolean }>()

    for (let pellet = 0; pellet < spec.pellets; pellet++) {
      let dir = baseDir
      if (spec.pellets > 1 && spec.spreadRad > 0) {
        const angle = (pellet / spec.pellets) * Math.PI * 2 + this.rngFn() * 0.5
        const mag = (0.35 + this.rngFn() * 0.65) * spec.spreadRad
        dir = normalizeVec3({
          x: baseDir.x + Math.cos(angle) * mag,
          y: baseDir.y + Math.sin(angle) * mag * 0.75,
          z: baseDir.z + Math.sin(angle + 1.2) * mag,
        })
      }

      const wallDist = raycastArenaObstacles(rayOrigin, dir, spec.range)
      let closestTarget: { player: InternalPlayer; distance: number; headshot: boolean } | null = null

      for (const candidate of room.players.values()) {
        if (candidate.id === shooter.id) continue
        if (candidate.team === shooter.team) continue // No friendly fire
        if (!candidate.alive || !candidate.connected) continue

        const hit = raycastPlayerHitbox(rayOrigin, dir, candidate.position, wallDist)
        if (hit && (!closestTarget || hit.distance < closestTarget.distance)) {
          closestTarget = { player: candidate, distance: hit.distance, headshot: hit.headshot }
        }
      }

      if (closestTarget) {
        endpoints.push({
          x: rayOrigin.x + dir.x * closestTarget.distance,
          y: rayOrigin.y + dir.y * closestTarget.distance,
          z: rayOrigin.z + dir.z * closestTarget.distance,
        })
        const dmg = closestTarget.headshot ? spec.headshotDamage : spec.damage
        const prev = damageAccumulator.get(closestTarget.player.id)
        damageAccumulator.set(closestTarget.player.id, {
          damage: (prev?.damage ?? 0) + dmg,
          headshot: Boolean(prev?.headshot || closestTarget.headshot),
        })
      } else {
        endpoints.push({
          x: rayOrigin.x + dir.x * wallDist,
          y: rayOrigin.y + dir.y * wallDist,
          z: rayOrigin.z + dir.z * wallDist,
        })
      }
    }

    const hits: ShootOutcome['hits'] = []
    let scoreboardChanged = false
    let primaryHitPlayerId: string | undefined
    let primaryHeadshot: boolean | undefined

    for (const [victimId, info] of damageAccumulator.entries()) {
      const victim = room.players.get(victimId)
      if (!victim || !victim.alive) continue

      primaryHitPlayerId = victim.id
      primaryHeadshot = info.headshot

      victim.hp = Math.max(0, victim.hp - info.damage)
      const killed = victim.hp <= 0
      let pointsAwarded = 0
      let killEvent: KillFeedItem | undefined

      if (killed) {
        victim.alive = false
        victim.respawnAt = now + MATCH_CONFIG.RESPAWN_MS
        victim.deaths += 1
        victim.streak = 0
        victim.weapon = null
        victim.ammo = 0
        victim.maxAmmo = 0
        victim.reloadingUntil = null

        shooter.kills += 1
        shooter.streak += 1
        if (info.headshot) shooter.headshots += 1
        pointsAwarded = SCORING.KILL + (info.headshot ? SCORING.HEADSHOT_BONUS : 0)
        shooter.totalScore += pointsAwarded
        scoreboardChanged = true

        killEvent = {
          id: crypto.randomUUID(),
          killerId: shooter.id,
          killerName: shooter.name,
          killerTeam: shooter.team,
          victimId: victim.id,
          victimName: victim.name,
          victimTeam: victim.team,
          weapon: shooter.weapon,
          headshot: info.headshot,
          pointsAwarded,
          timestamp: now,
        }
        room.killFeed.unshift(killEvent)
        if (room.killFeed.length > 8) room.killFeed.pop()
      }

      hits.push({
        victimId: victim.id,
        confirm: {
          victimId: victim.id,
          victimName: victim.name,
          damage: info.damage,
          headshot: info.headshot,
          killed,
          pointsAwarded,
        },
        damageTaken: {
          attackerId: shooter.id,
          attackerName: shooter.name,
          weapon: shooter.weapon,
          damage: info.damage,
          headshot: info.headshot,
          remainingHp: victim.hp,
          killed,
        },
        killEvent,
      })
    }

    const shot: ShotEvent = {
      id: crypto.randomUUID(),
      shooterId: shooter.id,
      shooterTeam: shooter.team,
      weapon: shooter.weapon,
      origin: rayOrigin,
      endpoints,
      hitPlayerId: primaryHitPlayerId,
      headshot: primaryHeadshot,
      timestamp: now,
    }

    return { ok: true, outcome: { shot, hits }, scoreboardChanged }
  }

  tick(): TickTransition[] {
    const now = this.nowFn()
    const transitions: TickTransition[] = []

    for (const [roomCode, room] of this.rooms.entries()) {
      // Clean up abandoned rooms where nobody has been connected for 10 minutes
      const anyConnected = Array.from(room.players.values()).some((p) => p.connected)
      if (!anyConnected) {
        const latestDisconnect = Math.max(
          room.createdAt,
          ...Array.from(room.players.values()).map((p) => p.disconnectedAt ?? room.createdAt),
        )
        if (now - latestDisconnect > 10 * 60 * 1000) {
          this.rooms.delete(roomCode)
          transitions.push({ roomCode, type: 'ROOM_CLEANED' })
          continue
        }
      }

      if (room.phase === 'countdown' && room.countdownEndsAt !== null && now >= room.countdownEndsAt) {
        room.phase = 'playing'
        room.matchStartedAt = now
        room.matchEndsAt = now + MATCH_CONFIG.DURATION_SEC * 1000
        room.countdownEndsAt = null
        transitions.push({ roomCode, type: 'PHASE_PLAYING' })
      }

      if (room.phase === 'playing') {
        // Process reloads and respawns
        let anyRespawn = false
        let anyReload = false
        for (const p of room.players.values()) {
          if (p.reloadingUntil !== null && now >= p.reloadingUntil && p.weapon) {
            p.ammo = WEAPONS[p.weapon].magSize
            p.reloadingUntil = null
            anyReload = true
          }
          if (!p.alive && p.respawnAt !== null && now >= p.respawnAt) {
            const spawn = getSpawnForTeam(p.team, room.spawnCounter[p.team]++)
            p.position = spawn.position
            p.yaw = spawn.yaw
            p.pitch = 0
            p.hp = MATCH_CONFIG.MAX_HP
            p.alive = true
            p.respawnAt = null
            anyRespawn = true
          }
        }
        if (anyRespawn) transitions.push({ roomCode, type: 'RESPAWNED' })
        if (anyReload) transitions.push({ roomCode, type: 'RELOADED' })

        // Match ends precisely at 90 seconds
        if (room.matchEndsAt !== null && now >= room.matchEndsAt) {
          room.phase = 'finished'
          const summary = this.buildMatchSummary(room, now)
          room.summary = summary
          transitions.push({ roomCode, type: 'MATCH_FINISHED', summary })
        }
      }
    }

    return transitions
  }

  buildScoreboard(room: InternalRoom): ScoreboardEntry[] {
    const entries: ScoreboardEntry[] = Array.from(room.players.values()).map((p) => ({
      rank: 0,
      playerId: p.id,
      name: p.name,
      team: p.team,
      correctAnswers: p.correctAnswers,
      wrongAnswers: p.wrongAnswers,
      kills: p.kills,
      deaths: p.deaths,
      headshots: p.headshots,
      totalScore: p.totalScore,
      connected: p.connected,
    }))

    entries.sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore
      if (b.kills !== a.kills) return b.kills - a.kills
      if (b.correctAnswers !== a.correctAnswers) return b.correctAnswers - a.correctAnswers
      return a.deaths - b.deaths
    })

    entries.forEach((entry, idx) => {
      entry.rank = idx + 1
    })
    return entries
  }

  buildMatchSummary(room: InternalRoom, finishedAt: number): MatchSummary {
    const standings = this.buildScoreboard(room)
    const teamScores = { blue: 0, red: 0 }
    for (const s of standings) {
      teamScores[s.team] += s.totalScore
    }
    const winnerTeam: Team | 'draw' =
      teamScores.blue > teamScores.red
        ? 'blue'
        : teamScores.red > teamScores.blue
          ? 'red'
          : 'draw'

    return {
      roomCode: room.roomCode,
      finishedAt,
      winnerPlayer: standings[0] ?? null,
      winnerTeam,
      teamScores,
      standings,
    }
  }

  buildSnapshot(room: InternalRoom): RoomSnapshot {
    const players: PlayerPublicState[] = Array.from(room.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
      team: p.team,
      ready: p.ready,
      connected: p.connected,
      isHost: p.isHost,
      position: { ...p.position },
      yaw: p.yaw,
      pitch: p.pitch,
      hp: p.hp,
      maxHp: p.maxHp,
      alive: p.alive,
      respawnAt: p.respawnAt,
      weapon: p.weapon,
      ammo: p.ammo,
      maxAmmo: p.maxAmmo,
      reloadingUntil: p.reloadingUntil,
      kills: p.kills,
      deaths: p.deaths,
      headshots: p.headshots,
      correctAnswers: p.correctAnswers,
      wrongAnswers: p.wrongAnswers,
      totalScore: p.totalScore,
      streak: p.streak,
    }))

    return {
      roomCode: room.roomCode,
      hostId: room.hostId,
      phase: room.phase,
      serverNow: this.nowFn(),
      countdownEndsAt: room.countdownEndsAt,
      matchStartedAt: room.matchStartedAt,
      matchEndsAt: room.matchEndsAt,
      matchDurationSec: MATCH_CONFIG.DURATION_SEC,
      maxPlayers: MATCH_CONFIG.MAX_PLAYERS,
      players,
      scoreboard: this.buildScoreboard(room),
      killFeed: [...room.killFeed],
      summary: room.summary,
    }
  }
}
