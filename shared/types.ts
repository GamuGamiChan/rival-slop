export type Team = 'blue' | 'red'

export type WeaponId = 'pistol' | 'rifle' | 'shotgun' | 'sniper'

export type Difficulty = 'easy' | 'medium' | 'hard'

export type MatchPhase = 'lobby' | 'countdown' | 'playing' | 'finished'

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface WeaponSpec {
  id: WeaponId
  name: string
  codename: string
  category: string
  damage: number
  headshotDamage: number
  fireRateMs: number
  magSize: number
  reloadMs: number
  pellets: number
  spreadRad: number
  range: number
  automatic: boolean
  adsFov: number
  accentColor: string
  badge: string
  tagline: string
}

export interface MathQuestion {
  id: string
  difficulty: Difficulty
  topic: string
  formulaHint: string
  prompt: string
  choices: [string, string, string, string]
  correctIndex: 0 | 1 | 2 | 3
  explanation: string
  sourceRef: string
}

/** Sanitized question sent to clients — never leaks correctIndex or explanation prematurely */
export interface PublicMathQuestion {
  id: string
  difficulty: Difficulty
  topic: string
  formulaHint: string
  prompt: string
  choices: [string, string, string, string]
}

export interface PlayerPublicState {
  id: string
  name: string
  team: Team
  ready: boolean
  connected: boolean
  isHost: boolean
  position: Vec3
  yaw: number
  pitch: number
  hp: number
  maxHp: number
  alive: boolean
  respawnAt: number | null
  weapon: WeaponId | null
  ammo: number
  maxAmmo: number
  reloadingUntil: number | null
  kills: number
  deaths: number
  headshots: number
  correctAnswers: number
  wrongAnswers: number
  totalScore: number
  streak: number
}

export interface KillFeedItem {
  id: string
  killerId: string
  killerName: string
  killerTeam: Team
  victimId: string
  victimName: string
  victimTeam: Team
  weapon: WeaponId
  headshot: boolean
  pointsAwarded: number
  timestamp: number
}

export interface ShotEvent {
  id: string
  shooterId: string
  shooterTeam: Team
  weapon: WeaponId
  origin: Vec3
  endpoints: Vec3[]
  hitPlayerId?: string
  headshot?: boolean
  timestamp: number
}

export interface ScoreboardEntry {
  rank: number
  playerId: string
  name: string
  team: Team
  correctAnswers: number
  wrongAnswers: number
  kills: number
  deaths: number
  headshots: number
  totalScore: number
  connected: boolean
}

export interface MatchSummary {
  roomCode: string
  finishedAt: number
  winnerPlayer: ScoreboardEntry | null
  winnerTeam: Team | 'draw'
  teamScores: { blue: number; red: number }
  standings: ScoreboardEntry[]
}

export interface RoomSnapshot {
  roomCode: string
  hostId: string
  phase: MatchPhase
  serverNow: number
  countdownEndsAt: number | null
  matchStartedAt: number | null
  matchEndsAt: number | null
  matchDurationSec: number
  maxPlayers: number
  players: PlayerPublicState[]
  scoreboard: ScoreboardEntry[]
  killFeed: KillFeedItem[]
  summary: MatchSummary | null
}

export interface AnswerResultPayload {
  questionId: string
  correct: boolean
  pointsAwarded: number
  awardedWeapon: WeaponId | null
  correctIndex: 0 | 1 | 2 | 3
  correctChoiceText: string
  explanation: string
  totalScore: number
  correctAnswers: number
}

export interface HitConfirmPayload {
  victimId: string
  victimName: string
  damage: number
  headshot: boolean
  killed: boolean
  pointsAwarded: number
}

export interface DamageTakenPayload {
  attackerId: string
  attackerName: string
  weapon: WeaponId
  damage: number
  headshot: boolean
  remainingHp: number
  killed: boolean
}

// ==========================================
// Client -> Server WebSocket Messages
// ==========================================
export type ClientMessage =
  | { type: 'CREATE_ROOM'; playerName: string }
  | { type: 'JOIN_ROOM'; roomCode: string; playerName: string }
  | { type: 'RECONNECT'; roomCode: string; playerId: string; sessionToken: string }
  | { type: 'LEAVE_ROOM' }
  | { type: 'SET_READY'; ready: boolean }
  | { type: 'SWITCH_TEAM'; team: Team }
  | { type: 'START_MATCH' }
  | { type: 'RETURN_TO_LOBBY' }
  | { type: 'PLAYER_MOVE'; position: Vec3; yaw: number; pitch: number }
  | { type: 'REQUEST_QUESTION'; preferredDifficulty?: Difficulty }
  | { type: 'SUBMIT_ANSWER'; questionId: string; selectedIndex: number }
  | { type: 'SHOOT'; origin: Vec3; direction: Vec3 }
  | { type: 'RELOAD' }
  | { type: 'PING'; clientTime: number }

// ==========================================
// Server -> Client WebSocket Messages
// ==========================================
export type ServerMessage =
  | {
      type: 'ROOM_JOINED'
      playerId: string
      sessionToken: string
      room: RoomSnapshot
    }
  | { type: 'ROOM_STATE'; room: RoomSnapshot }
  | {
      type: 'POSITIONS_SYNC'
      serverNow: number
      positions: Array<{
        id: string
        position: Vec3
        yaw: number
        pitch: number
        hp: number
        alive: boolean
        respawnAt: number | null
        weapon: WeaponId | null
        ammo: number
        reloadingUntil: number | null
      }>
    }
  | { type: 'QUESTION_ASSIGNED'; question: PublicMathQuestion }
  | { type: 'ANSWER_RESULT'; result: AnswerResultPayload }
  | { type: 'SHOT_FIRED'; shot: ShotEvent }
  | { type: 'HIT_CONFIRMED'; hit: HitConfirmPayload }
  | { type: 'DAMAGE_TAKEN'; damage: DamageTakenPayload }
  | { type: 'KILL_EVENT'; kill: KillFeedItem }
  | { type: 'MATCH_FINISHED'; summary: MatchSummary; room: RoomSnapshot }
  | { type: 'PONG'; clientTime: number; serverNow: number }
  | { type: 'ERROR'; code: string; message: string }

// Scoring constants (exact specification)
export const SCORING = {
  MATH_CORRECT: 100,
  MATH_WRONG: 0,
  KILL: 150,
  HEADSHOT_BONUS: 50,
} as const

export const MATCH_CONFIG = {
  DURATION_SEC: 90,
  COUNTDOWN_SEC: 3,
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 8,
  RESPAWN_MS: 3000,
  MAX_HP: 100,
} as const
