export type Team = 'blue' | 'red'

export type WeaponId =
  | 'pistol'
  | 'revolver'
  | 'smg'
  | 'rifle'
  | 'burst'
  | 'shotgun'
  | 'lmg'
  | 'sniper'

export type AgentId = 'vortex' | 'aegis' | 'phantom' | 'pulse'

export type SkillSlot = 'Q' | 'C' | 'X'

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

export type WorldEffectKind = 'barrier' | 'smoke' | 'sonar' | 'orbital' | 'explosion' | 'flash'

export interface WorldEffect {
  id: string
  kind: WorldEffectKind
  ownerId: string
  ownerTeam: Team
  position: Vec3
  radius: number
  yaw?: number
  /** For 'barrier' walls: exact world-space AABB so client & server share identical collision */
  box?: {
    minX: number
    maxX: number
    minY: number
    maxY: number
    minZ: number
    maxZ: number
  }
  createdAt: number
  detonateAt?: number
  detonated?: boolean
  expiresAt: number
  color: string
}

export interface SkillCastPayload {
  id: string
  playerId: string
  playerName: string
  team: Team
  agent: AgentId
  slot: SkillSlot
  skillId: string
  skillName: string
  origin: Vec3
  target: Vec3
  /** Authoritative teleport/dash destination when applicable */
  newPosition?: Vec3
  timestamp: number
}

export interface PlayerPublicState {
  id: string
  name: string
  team: Team
  agent: AgentId
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
  // Valorant-style tactical ability cooldowns & buffs
  skillQReadyAt: number
  skillCReadyAt: number
  ultPoints: number
  ultMax: number
  overdriveUntil: number | null
  overshieldUntil: number | null
  blindedUntil: number | null
  revealedUntil: number | null
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
  weapon: WeaponId | 'skill'
  skillLabel?: string
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
  agent: AgentId
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

export type RoundState =
  | 'ROUND_START'
  | 'COMBAT_ACTIVE'
  | 'ROUND_END'
  | 'MATH_CHALLENGE'
  | 'ANSWER_SUBMITTED'
  | 'ANSWER_FEEDBACK'
  | 'WEAPON_REVEAL'
  | 'NEXT_ROUND'

export interface MathHistoryEntry {
  roundNumber: number
  questionId: string
  topic: string
  correct: boolean
  pointsDelta: number
  awardedWeapon: WeaponId | null
  weaponConfiscated?: boolean
  confiscatedWeapon: WeaponId | null
  timestamp: number
}

export interface RoomSnapshot {
  roomCode: string
  hostId: string
  phase: MatchPhase
  roundNumber: number
  maxRounds: number
  roundState: RoundState
  roundPhaseEndsAt: number | null
  activeRoundQuestion: PublicMathQuestion | null
  answeredPlayerIds: string[]
  serverNow: number
  countdownEndsAt: number | null
  matchStartedAt: number | null
  matchEndsAt: number | null
  matchDurationSec: number
  maxPlayers: number
  players: PlayerPublicState[]
  scoreboard: ScoreboardEntry[]
  killFeed: KillFeedItem[]
  worldEffects: WorldEffect[]
  summary: MatchSummary | null
}

export interface AnswerResultPayload {
  roundNumber?: number
  questionId: string
  correct: boolean
  pointsAwarded: number
  awardedWeapon: WeaponId | null
  weaponConfiscated?: boolean
  confiscatedWeapon?: WeaponId | null
  correctIndex: 0 | 1 | 2 | 3
  correctChoiceText: string
  explanation: string
  totalScore: number
  correctAnswers: number
  wrongAnswers?: number
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
  weapon: WeaponId | 'skill'
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
  | { type: 'SELECT_AGENT'; agent: AgentId }
  | { type: 'START_MATCH' }
  | { type: 'RETURN_TO_LOBBY' }
  | { type: 'PLAYER_MOVE'; position: Vec3; yaw: number; pitch: number }
  | { type: 'REQUEST_QUESTION'; preferredDifficulty?: Difficulty }
  | { type: 'SUBMIT_ANSWER'; questionId: string; selectedIndex: number }
  | { type: 'SHOOT'; origin: Vec3; direction: Vec3 }
  | { type: 'USE_SKILL'; slot: SkillSlot; origin: Vec3; direction: Vec3 }
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
        maxHp: number
        alive: boolean
        respawnAt: number | null
        weapon: WeaponId | null
        ammo: number
        reloadingUntil: number | null
        skillQReadyAt: number
        skillCReadyAt: number
        ultPoints: number
        overdriveUntil: number | null
        overshieldUntil: number | null
        blindedUntil: number | null
        revealedUntil: number | null
      }>
    }
  | { type: 'QUESTION_ASSIGNED'; question: PublicMathQuestion }
  | { type: 'ANSWER_RESULT'; result: AnswerResultPayload }
  | { type: 'SHOT_FIRED'; shot: ShotEvent }
  | { type: 'SKILL_CAST'; cast: SkillCastPayload }
  | { type: 'HIT_CONFIRMED'; hit: HitConfirmPayload }
  | { type: 'DAMAGE_TAKEN'; damage: DamageTakenPayload }
  | { type: 'KILL_EVENT'; kill: KillFeedItem }
  | { type: 'MATCH_FINISHED'; summary: MatchSummary; room: RoomSnapshot }
  | { type: 'PONG'; clientTime: number; serverNow: number }
  | { type: 'ERROR'; code: string; message: string }

export const SCORING = {
  MATH_CORRECT: 100,
  MATH_WRONG: -300,
  KILL: 150,
  HEADSHOT_BONUS: 50,
} as const

export const MATCH_CONFIG = {
  MAX_ROUNDS: 10,
  DURATION_SEC: 600,
  COUNTDOWN_SEC: 3,
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 8,
  RESPAWN_MS: 3000,
  MAX_HP: 100,
  ROUND_START_MS: 1200,
  COMBAT_ROUND_MS: 22_000,
  ROUND_END_MS: 1500,
  MATH_CHALLENGE_MS: 20_000,
  ANSWER_FEEDBACK_MS: 2200,
  WEAPON_REVEAL_MS: 2600,
  NEXT_ROUND_MS: 1000,
} as const
