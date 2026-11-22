import { create } from 'zustand'
import type {
  AnswerResultPayload,
  DamageTakenPayload,
  HitConfirmPayload,
  KillFeedItem,
  MatchSummary,
  MathHistoryEntry,
  PlayerPublicState,
  PublicMathQuestion,
  RoomSnapshot,
  ShotEvent,
  SkillCastPayload,
  Vec3,
  WeaponId,
} from '../../shared/types.ts'

export type ScreenMode = 'menu' | 'room' | 'lobby' | 'arena' | 'result'
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'
export type TransportMode = 'ws' | 'p2p' | 'supabase' | 'practice'

/**
 * Explicit Math Question & Weapon Reward state machine.
 * Guarantees questions never disappear abruptly and duplicate submissions are impossible.
 */
export type MathFlowPhase =
  | 'COMBAT_READY'
  | 'QUESTION_ACTIVE'
  | 'ANSWER_SUBMITTED'
  | 'ANSWER_FEEDBACK'
  | 'WEAPON_REVEAL'

export interface PracticeTarget {
  id: string
  label: string
  basePosition: Vec3
  position: Vec3
  strafeRange: number
  strafeSpeed: number
  hp: number
  maxHp: number
  alive: boolean
  respawnAt: number | null
}

export interface TutorialProgress {
  moved: boolean
  looked: boolean
  aimed: boolean
  sprinted: boolean
  shot: boolean
  solvedMath: boolean
}

export interface RemoteTransform {
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
  updatedAt: number
}

export interface PersistedSession {
  roomCode: string
  playerId: string
  sessionToken: string
  playerName: string
}

export interface PersistedSettings {
  mouseSensitivity: number
  aimSensitivityMultiplier: number
  invertY: boolean
  muted: boolean
}

export const DEFAULT_SETTINGS: PersistedSettings = {
  mouseSensitivity: 0.002,
  aimSensitivityMultiplier: 0.55,
  invertY: false,
  muted: false,
}

const SESSION_KEY = 'math_rivals_3d_session'
const SETTINGS_KEY = 'math_rivals_3d_settings'
const TUTORIAL_KEY = 'math_rivals_3d_tutorial_done'

export function saveSession(session: PersistedSession | null): void {
  try {
    if (!session) {
      sessionStorage.removeItem(SESSION_KEY)
    } else {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
    }
  } catch {
    // Ignore storage errors
  }
}

export function loadSession(): PersistedSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PersistedSession>
    if (parsed.roomCode && parsed.playerId && parsed.sessionToken) {
      return {
        roomCode: parsed.roomCode,
        playerId: parsed.playerId,
        sessionToken: parsed.sessionToken,
        playerName: parsed.playerName ?? 'Rival',
      }
    }
    return null
  } catch {
    return null
  }
}

function loadSettings(): PersistedSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const p = JSON.parse(raw) as Partial<PersistedSettings>
    return {
      mouseSensitivity:
        typeof p.mouseSensitivity === 'number' && Number.isFinite(p.mouseSensitivity)
          ? Math.max(0.0005, Math.min(0.006, p.mouseSensitivity))
          : DEFAULT_SETTINGS.mouseSensitivity,
      aimSensitivityMultiplier:
        typeof p.aimSensitivityMultiplier === 'number' && Number.isFinite(p.aimSensitivityMultiplier)
          ? Math.max(0.2, Math.min(1.0, p.aimSensitivityMultiplier))
          : DEFAULT_SETTINGS.aimSensitivityMultiplier,
      invertY: Boolean(p.invertY),
      muted: Boolean(p.muted),
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

function persistSettings(settings: PersistedSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // Ignore storage errors
  }
}

function loadTutorialDone(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_KEY) === '1'
  } catch {
    return false
  }
}

function persistTutorialDone(done: boolean): void {
  try {
    if (done) localStorage.setItem(TUTORIAL_KEY, '1')
    else localStorage.removeItem(TUTORIAL_KEY)
  } catch {
    // Ignore storage errors
  }
}

export interface HitMarkerState {
  id: number
  headshot: boolean
  killed: boolean
  damage: number
  pointsAwarded: number
  timestamp: number
}

export interface WeaponRevealState {
  id: number
  weapon: WeaponId
  pointsAwarded: number
  timestamp: number
}

export interface WeaponPenaltyState {
  id: number
  confiscatedWeapon: WeaponId | null
  pointsDeducted: number
  timestamp: number
}

export interface ActiveTracer {
  id: string
  shooterId?: string
  shooterTeam: 'blue' | 'red'
  weapon: WeaponId
  origin: Vec3
  endpoints: Vec3[]
  createdAt: number
  isLocalPredicted?: boolean
}

const initialSettings = loadSettings()

const EMPTY_TUTORIAL: TutorialProgress = {
  moved: false,
  looked: false,
  aimed: false,
  sprinted: false,
  shot: false,
  solvedMath: false,
}

export interface GameState {
  screen: ScreenMode
  connectionStatus: ConnectionStatus
  transportMode: TransportMode
  practiceMode: boolean
  practiceTargets: PracticeTarget[]
  playerName: string
  playerId: string | null
  sessionToken: string | null
  room: RoomSnapshot | null
  clockOffsetMs: number

  liveTransforms: Map<string, RemoteTransform>
  localPredictedPos: Vec3
  localYaw: number
  localPitch: number
  pendingSnapPos: Vec3 | null
  lastShotVisualAt: number
  isAdsZoom: boolean
  isSprinting: boolean
  rrHintUntil: number

  // Explicit Math Flow Machine & History
  mathFlowPhase: MathFlowPhase
  activeQuestion: PublicMathQuestion | null
  submittedQuestion: PublicMathQuestion | null
  selectedChoiceIndex: number | null
  lastAnswerResult: AnswerResultPayload | null
  mathModalOpen: boolean
  mathHistory: MathHistoryEntry[]
  weaponReveal: WeaponRevealState | null
  weaponPenalty: WeaponPenaltyState | null
  lastSkillBanner: (SkillCastPayload & { receivedAt: number }) | null
  hitMarker: HitMarkerState | null
  lastDamageTaken: (DamageTakenPayload & { timestamp: number }) | null
  tracers: ActiveTracer[]
  recentKills: KillFeedItem[]
  matchSummary: MatchSummary | null

  // Controls, UI & Accessibility
  pointerLocked: boolean
  pauseOpen: boolean
  scoreboardOpen: boolean
  controlsGuideOpen: boolean
  creditsModalOpen: boolean
  settingsModalOpen: boolean
  showControlsRef: boolean
  tutorialOpen: boolean
  tutorialCompleted: boolean
  tutorialProgress: TutorialProgress
  muted: boolean
  mouseSensitivity: number
  aimSensitivityMultiplier: number
  invertY: boolean
  errorMessage: string | null
  statusToast: string | null

  setScreen: (screen: ScreenMode) => void
  setPlayerName: (name: string) => void
  setConnectionStatus: (status: ConnectionStatus) => void
  setTransportMode: (mode: TransportMode) => void
  setPracticeMode: (enabled: boolean, targets?: PracticeTarget[]) => void
  setPracticeTargets: (targets: PracticeTarget[]) => void
  setClockOffset: (serverNow: number) => void
  setError: (msg: string | null) => void
  setStatusToast: (msg: string | null) => void
  setPointerLocked: (locked: boolean) => void
  setMathModalOpen: (open: boolean) => void
  setPauseOpen: (open: boolean) => void
  setScoreboardOpen: (open: boolean) => void
  setControlsGuideOpen: (open: boolean) => void
  setCreditsModalOpen: (open: boolean) => void
  setSettingsModalOpen: (open: boolean) => void
  toggleControlsRef: () => void
  setTutorialOpen: (open: boolean) => void
  markTutorialStep: (step: keyof TutorialProgress) => void
  resetTutorial: () => void
  setMuted: (muted: boolean) => void
  setMouseSensitivity: (sens: number) => void
  setAimSensitivityMultiplier: (mult: number) => void
  setInvertY: (invert: boolean) => void
  resetSettingsToDefault: () => void
  setAdsZoom: (zoom: boolean) => void
  setSprinting: (sprinting: boolean) => void
  triggerRrHint: () => void
  triggerLocalShotVisual: () => void
  addLocalTracer: (
    shooterTeam: 'blue' | 'red',
    weapon: WeaponId,
    origin: Vec3,
    endpoints: Vec3[],
  ) => void
  setLocalTransform: (pos: Vec3, yaw: number, pitch: number) => void
  consumePendingSnap: () => Vec3 | null

  // Explicit Math State Machine transitions
  beginMathSubmission: (question: PublicMathQuestion, choiceIndex: number) => void
  advanceMathToWeaponReveal: () => void
  completeMathFlowToCombat: () => void
  recoverMathSubmissionError: (message: string) => void

  onRoomJoined: (playerId: string, sessionToken: string, room: RoomSnapshot) => void
  onRoomState: (room: RoomSnapshot) => void
  onPositionsSync: (
    serverNow: number,
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
    }>,
  ) => void
  onQuestionAssigned: (question: PublicMathQuestion) => void
  onAnswerResult: (result: AnswerResultPayload) => void
  onShotFired: (shot: ShotEvent) => void
  onSkillCast: (cast: SkillCastPayload) => void
  onHitConfirmed: (hit: HitConfirmPayload) => void
  onDamageTaken: (damage: DamageTakenPayload) => void
  onKillEvent: (kill: KillFeedItem) => void
  onMatchFinished: (summary: MatchSummary, room: RoomSnapshot) => void
  clearWeaponReveal: () => void
  clearWeaponPenalty: () => void
  clearLastAnswer: () => void
  resetToMenu: () => void
}

function screenForPhase(phase: RoomSnapshot['phase']): ScreenMode {
  switch (phase) {
    case 'lobby':
      return 'lobby'
    case 'countdown':
    case 'playing':
      return 'arena'
    case 'finished':
      return 'result'
  }
}

export const useGameStore = create<GameState>((set, get) => ({
  screen: 'menu',
  connectionStatus: 'disconnected',
  transportMode: 'ws',
  practiceMode: false,
  practiceTargets: [],
  playerName: loadSession()?.playerName ?? '',
  playerId: null,
  sessionToken: null,
  room: null,
  clockOffsetMs: 0,

  liveTransforms: new Map<string, RemoteTransform>(),
  localPredictedPos: { x: 0, y: 0, z: -26 },
  localYaw: Math.PI,
  localPitch: 0,
  pendingSnapPos: null,
  lastShotVisualAt: 0,
  isAdsZoom: false,
  isSprinting: false,
  rrHintUntil: 0,

  mathFlowPhase: 'COMBAT_READY',
  activeQuestion: null,
  submittedQuestion: null,
  selectedChoiceIndex: null,
  lastAnswerResult: null,
  mathModalOpen: false,
  mathHistory: [],
  weaponReveal: null,
  weaponPenalty: null,
  lastSkillBanner: null,
  hitMarker: null,
  lastDamageTaken: null,
  tracers: [],
  recentKills: [],
  matchSummary: null,

  pointerLocked: false,
  pauseOpen: false,
  scoreboardOpen: false,
  controlsGuideOpen: false,
  creditsModalOpen: false,
  settingsModalOpen: false,
  showControlsRef: false,
  tutorialOpen: false,
  tutorialCompleted: loadTutorialDone(),
  tutorialProgress: { ...EMPTY_TUTORIAL },
  muted: initialSettings.muted,
  mouseSensitivity: initialSettings.mouseSensitivity,
  aimSensitivityMultiplier: initialSettings.aimSensitivityMultiplier,
  invertY: initialSettings.invertY,
  errorMessage: null,
  statusToast: null,

  setScreen: (screen) => set({ screen, errorMessage: null }),
  setPlayerName: (playerName) => set({ playerName }),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  setTransportMode: (transportMode) => set({ transportMode }),
  setPracticeMode: (practiceMode, targets) =>
    set({
      practiceMode,
      practiceTargets: targets ?? (practiceMode ? get().practiceTargets : []),
      tutorialOpen: practiceMode ? true : get().tutorialOpen,
      tutorialProgress: practiceMode ? { ...EMPTY_TUTORIAL } : get().tutorialProgress,
    }),
  setPracticeTargets: (practiceTargets) => set({ practiceTargets }),
  setClockOffset: (serverNow) => {
    const sample = serverNow - Date.now()
    const prev = get().clockOffsetMs
    set({ clockOffsetMs: prev === 0 ? sample : prev * 0.7 + sample * 0.3 })
  },
  setError: (errorMessage) => set({ errorMessage }),
  setStatusToast: (statusToast) => set({ statusToast }),
  setPointerLocked: (pointerLocked) => set({ pointerLocked }),
  setMathModalOpen: (mathModalOpen) =>
    set((state) => ({
      mathModalOpen,
      mathFlowPhase: mathModalOpen
        ? state.mathFlowPhase === 'COMBAT_READY' && state.activeQuestion
          ? 'QUESTION_ACTIVE'
          : state.mathFlowPhase
        : 'COMBAT_READY',
    })),
  setPauseOpen: (pauseOpen) => set({ pauseOpen }),
  setScoreboardOpen: (scoreboardOpen) => set({ scoreboardOpen }),
  setControlsGuideOpen: (controlsGuideOpen) => set({ controlsGuideOpen }),
  setCreditsModalOpen: (creditsModalOpen) => set({ creditsModalOpen }),
  setSettingsModalOpen: (settingsModalOpen) => set({ settingsModalOpen }),
  toggleControlsRef: () => set((s) => ({ showControlsRef: !s.showControlsRef })),
  setTutorialOpen: (tutorialOpen) => set({ tutorialOpen }),
  markTutorialStep: (step) => {
    const state = get()
    if (!state.tutorialOpen || state.tutorialProgress[step]) return
    const next = { ...state.tutorialProgress, [step]: true }
    const allDone =
      next.moved && next.looked && next.aimed && next.sprinted && next.shot && next.solvedMath
    if (allDone) {
      persistTutorialDone(true)
    }
    set({
      tutorialProgress: next,
      tutorialCompleted: state.tutorialCompleted || allDone,
    })
  },
  resetTutorial: () => {
    persistTutorialDone(false)
    set({ tutorialCompleted: false, tutorialProgress: { ...EMPTY_TUTORIAL }, tutorialOpen: true })
  },
  setMuted: (muted) => {
    const s = get()
    persistSettings({
      mouseSensitivity: s.mouseSensitivity,
      aimSensitivityMultiplier: s.aimSensitivityMultiplier,
      invertY: s.invertY,
      muted,
    })
    set({ muted })
  },
  setMouseSensitivity: (mouseSensitivity) => {
    const clamped = Math.max(0.0005, Math.min(0.006, mouseSensitivity))
    const s = get()
    persistSettings({
      mouseSensitivity: clamped,
      aimSensitivityMultiplier: s.aimSensitivityMultiplier,
      invertY: s.invertY,
      muted: s.muted,
    })
    set({ mouseSensitivity: clamped })
  },
  setAimSensitivityMultiplier: (aimSensitivityMultiplier) => {
    const clamped = Math.max(0.2, Math.min(1.0, aimSensitivityMultiplier))
    const s = get()
    persistSettings({
      mouseSensitivity: s.mouseSensitivity,
      aimSensitivityMultiplier: clamped,
      invertY: s.invertY,
      muted: s.muted,
    })
    set({ aimSensitivityMultiplier: clamped })
  },
  setInvertY: (invertY) => {
    const s = get()
    persistSettings({
      mouseSensitivity: s.mouseSensitivity,
      aimSensitivityMultiplier: s.aimSensitivityMultiplier,
      invertY,
      muted: s.muted,
    })
    set({ invertY })
  },
  resetSettingsToDefault: () => {
    persistSettings({ ...DEFAULT_SETTINGS })
    set({
      mouseSensitivity: DEFAULT_SETTINGS.mouseSensitivity,
      aimSensitivityMultiplier: DEFAULT_SETTINGS.aimSensitivityMultiplier,
      invertY: DEFAULT_SETTINGS.invertY,
      muted: DEFAULT_SETTINGS.muted,
    })
  },
  setAdsZoom: (isAdsZoom) => {
    if (get().isAdsZoom === isAdsZoom) return
    set({ isAdsZoom })
  },
  setSprinting: (isSprinting) => {
    if (get().isSprinting === isSprinting) return
    set({ isSprinting })
  },
  triggerRrHint: () => set({ rrHintUntil: Date.now() + 1400 }),
  triggerLocalShotVisual: () => set({ lastShotVisualAt: performance.now() }),
  addLocalTracer: (shooterTeam, weapon, origin, endpoints) => {
    const now = performance.now()
    const myId = get().playerId ?? undefined
    const nextTracer: ActiveTracer = {
      id: `local-${now}-${Math.random().toString(36).slice(2, 6)}`,
      shooterId: myId,
      shooterTeam,
      weapon,
      origin,
      endpoints,
      createdAt: now,
      isLocalPredicted: true,
    }
    const kept = get().tracers.filter((t) => now - t.createdAt < 260)
    kept.push(nextTracer)
    set({ tracers: kept })
  },
  setLocalTransform: (localPredictedPos, localYaw, localPitch) => {
    const state = get()
    state.localPredictedPos = localPredictedPos
    state.localYaw = localYaw
    state.localPitch = localPitch
  },
  consumePendingSnap: () => {
    const pos = get().pendingSnapPos
    if (pos) {
      get().pendingSnapPos = null
    }
    return pos
  },

  beginMathSubmission: (question, choiceIndex) => {
    const state = get()
    // Strict duplicate-submission guard
    if (state.mathFlowPhase !== 'QUESTION_ACTIVE') return
    set({
      mathFlowPhase: 'ANSWER_SUBMITTED',
      submittedQuestion: question,
      selectedChoiceIndex: choiceIndex,
      errorMessage: null,
    })
  },

  advanceMathToWeaponReveal: () => {
    const state = get()
    if (state.mathFlowPhase !== 'ANSWER_FEEDBACK') return
    if (!state.lastAnswerResult?.correct || !state.lastAnswerResult.awardedWeapon) return
    set({ mathFlowPhase: 'WEAPON_REVEAL' })
  },

  completeMathFlowToCombat: () => {
    const curReveal = get().weaponReveal
    set({
      mathModalOpen: false,
      mathFlowPhase: 'COMBAT_READY',
      lastAnswerResult: null,
      submittedQuestion: null,
      selectedChoiceIndex: null,
      weaponReveal: curReveal ? { ...curReveal, timestamp: Date.now() } : null,
    })
  },

  recoverMathSubmissionError: (message) => {
    const state = get()
    if (state.mathFlowPhase === 'ANSWER_SUBMITTED') {
      // Preserve the active question cleanly on transient network error so it never vanishes
      set({
        mathFlowPhase: state.activeQuestion ? 'QUESTION_ACTIVE' : 'COMBAT_READY',
        selectedChoiceIndex: null,
        errorMessage: message,
      })
    } else {
      set({ errorMessage: message })
    }
  },

  onRoomJoined: (playerId, sessionToken, room) => {
    const me = room.players.find((p) => p.id === playerId)
    const transforms = new Map<string, RemoteTransform>()
    const now = performance.now()
    for (const p of room.players) {
      transforms.set(p.id, {
        position: { ...p.position },
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
        updatedAt: now,
      })
    }

    if (!get().practiceMode) {
      saveSession({
        roomCode: room.roomCode,
        playerId,
        sessionToken,
        playerName: me?.name ?? get().playerName,
      })
    }

    set({
      playerId,
      sessionToken,
      playerName: me?.name ?? get().playerName,
      room,
      liveTransforms: transforms,
      localPredictedPos: me ? { ...me.position } : { x: 0, y: 0, z: -26 },
      localYaw: me?.yaw ?? Math.PI,
      localPitch: me?.pitch ?? 0,
      screen: screenForPhase(room.phase),
      matchSummary: room.summary,
      recentKills: room.killFeed,
      clockOffsetMs: room.serverNow - Date.now(),
      errorMessage: null,
      pauseOpen: false,
    })
  },

  onRoomState: (room) => {
    const prevRoom = get().room
    const myId = get().playerId
    const prevPhase = prevRoom?.phase
    const nextScreen = screenForPhase(room.phase)

    const transforms = get().liveTransforms
    const now = performance.now()
    for (const p of room.players) {
      transforms.set(p.id, {
        position: { ...p.position },
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
        updatedAt: now,
      })
    }

    const prevMe = prevRoom?.players.find((p) => p.id === myId)
    const nextMe = room.players.find((p) => p.id === myId)
    let nextLocalPos = get().localPredictedPos
    let nextLocalYaw = get().localYaw
    if (
      nextMe &&
      (prevPhase !== room.phase || (prevMe && !prevMe.alive && nextMe.alive))
    ) {
      nextLocalPos = { ...nextMe.position }
      nextLocalYaw = nextMe.yaw
    }

    const stillPlaying = room.phase === 'playing'
    const isMathWindow =
      stillPlaying &&
      (room.roundState === 'MATH_CHALLENGE' ||
        room.roundState === 'ANSWER_SUBMITTED' ||
        room.roundState === 'ANSWER_FEEDBACK' ||
        room.roundState === 'WEAPON_REVEAL')

    const cur = get()
    const iHaveAnswered = Boolean(myId && room.answeredPlayerIds?.includes(myId))
    let nextMathModalOpen: boolean
    let nextMathFlowPhase: MathFlowPhase
    let nextActiveQuestion = cur.activeQuestion
    let nextSubmittedQuestion = cur.submittedQuestion
    let nextSelectedChoiceIndex = cur.selectedChoiceIndex
    let nextLastAnswerResult = cur.lastAnswerResult
    let nextWeaponReveal = cur.weaponReveal

    if (isMathWindow) {
      nextMathModalOpen = true
      if (room.activeRoundQuestion && !nextActiveQuestion && !nextSubmittedQuestion) {
        nextActiveQuestion = room.activeRoundQuestion
      }
      if (room.roundState === 'WEAPON_REVEAL') {
        nextMathFlowPhase =
          nextLastAnswerResult?.correct && nextLastAnswerResult.awardedWeapon
            ? 'WEAPON_REVEAL'
            : 'ANSWER_FEEDBACK'
      } else if (room.roundState === 'ANSWER_FEEDBACK') {
        nextMathFlowPhase = 'ANSWER_FEEDBACK'
      } else if (
        iHaveAnswered ||
        cur.mathFlowPhase === 'ANSWER_SUBMITTED' ||
        cur.mathFlowPhase === 'ANSWER_FEEDBACK' ||
        cur.mathFlowPhase === 'WEAPON_REVEAL'
      ) {
        nextMathFlowPhase =
          cur.mathFlowPhase === 'QUESTION_ACTIVE' || cur.mathFlowPhase === 'COMBAT_READY'
            ? nextLastAnswerResult
              ? 'ANSWER_FEEDBACK'
              : 'ANSWER_SUBMITTED'
            : cur.mathFlowPhase
      } else {
        nextMathFlowPhase = 'QUESTION_ACTIVE'
      }
    } else {
      // Combat Round active (ROUND_START / COMBAT_ACTIVE / ROUND_END / NEXT_ROUND): Math Modal closes automatically
      nextMathModalOpen = false
      nextMathFlowPhase = 'COMBAT_READY'
      nextActiveQuestion = null
      nextSubmittedQuestion = null
      nextSelectedChoiceIndex = null
      nextLastAnswerResult = null
      if (cur.mathModalOpen && cur.weaponReveal) {
        nextWeaponReveal = { ...cur.weaponReveal, timestamp: Date.now() }
      }
    }

    set({
      room,
      screen: nextScreen,
      localPredictedPos: nextLocalPos,
      localYaw: nextLocalYaw,
      recentKills: room.killFeed,
      matchSummary: room.summary ?? get().matchSummary,
      clockOffsetMs: room.serverNow - Date.now(),
      mathModalOpen: nextMathModalOpen,
      mathFlowPhase: nextMathFlowPhase,
      activeQuestion: nextActiveQuestion,
      submittedQuestion: nextSubmittedQuestion,
      selectedChoiceIndex: nextSelectedChoiceIndex,
      lastAnswerResult: nextLastAnswerResult,
      weaponReveal: nextWeaponReveal,
      pauseOpen: stillPlaying ? get().pauseOpen : false,
    })
  },

  onPositionsSync: (serverNow, positions) => {
    const state = get()
    const transforms = state.liveTransforms
    const now = performance.now()

    for (const item of positions) {
      transforms.set(item.id, {
        position: item.position,
        yaw: item.yaw,
        pitch: item.pitch,
        hp: item.hp,
        maxHp: item.maxHp,
        alive: item.alive,
        respawnAt: item.respawnAt,
        weapon: item.weapon,
        ammo: item.ammo,
        reloadingUntil: item.reloadingUntil,
        skillQReadyAt: item.skillQReadyAt,
        skillCReadyAt: item.skillCReadyAt,
        ultPoints: item.ultPoints,
        overdriveUntil: item.overdriveUntil,
        overshieldUntil: item.overshieldUntil,
        blindedUntil: item.blindedUntil,
        revealedUntil: item.revealedUntil,
        updatedAt: now,
      })
    }

    if (state.room && state.playerId) {
      const mySync = positions.find((p) => p.id === state.playerId)
      const myCurrent = state.room.players.find((p) => p.id === state.playerId)
      const anyRevealChanged = positions.some((s) => {
        const cur = state.room?.players.find((p) => p.id === s.id)
        return cur && cur.revealedUntil !== s.revealedUntil
      })

      if (
        anyRevealChanged ||
        (mySync &&
          myCurrent &&
          (myCurrent.hp !== mySync.hp ||
            myCurrent.maxHp !== mySync.maxHp ||
            myCurrent.ammo !== mySync.ammo ||
            myCurrent.alive !== mySync.alive ||
            myCurrent.weapon !== mySync.weapon ||
            myCurrent.reloadingUntil !== mySync.reloadingUntil ||
            myCurrent.skillQReadyAt !== mySync.skillQReadyAt ||
            myCurrent.skillCReadyAt !== mySync.skillCReadyAt ||
            myCurrent.ultPoints !== mySync.ultPoints ||
            myCurrent.overdriveUntil !== mySync.overdriveUntil ||
            myCurrent.overshieldUntil !== mySync.overshieldUntil ||
            myCurrent.blindedUntil !== mySync.blindedUntil))
      ) {
        const updatedPlayers: PlayerPublicState[] = state.room.players.map((p) => {
          const sync = positions.find((s) => s.id === p.id)
          if (!sync) return p
          return {
            ...p,
            position: sync.position,
            yaw: sync.yaw,
            pitch: sync.pitch,
            hp: sync.hp,
            maxHp: sync.maxHp,
            alive: sync.alive,
            respawnAt: sync.respawnAt,
            weapon: sync.weapon,
            ammo: sync.ammo,
            reloadingUntil: sync.reloadingUntil,
            skillQReadyAt: sync.skillQReadyAt,
            skillCReadyAt: sync.skillCReadyAt,
            ultPoints: sync.ultPoints,
            overdriveUntil: sync.overdriveUntil,
            overshieldUntil: sync.overshieldUntil,
            blindedUntil: sync.blindedUntil,
            revealedUntil: sync.revealedUntil,
          }
        })
        set({
          room: { ...state.room, serverNow, players: updatedPlayers },
        })
      }
    }
  },

  onQuestionAssigned: (question) => {
    set({
      activeQuestion: question,
      submittedQuestion: null,
      selectedChoiceIndex: null,
      lastAnswerResult: null,
      mathModalOpen: true,
      mathFlowPhase: 'QUESTION_ACTIVE',
      errorMessage: null,
    })
  },

  onAnswerResult: (result) => {
    const state = get()
    const preservedQuestion =
      state.submittedQuestion ?? state.activeQuestion ?? state.room?.activeRoundQuestion ?? null
    if (result.correct) {
      state.markTutorialStep('solvedMath')
    }
    const historyEntry: MathHistoryEntry = {
      roundNumber: result.roundNumber ?? state.room?.roundNumber ?? 1,
      questionId: result.questionId,
      topic: preservedQuestion?.topic ?? 'คณิตศาสตร์ ม.4',
      correct: result.correct,
      pointsDelta: result.pointsAwarded,
      awardedWeapon: result.awardedWeapon,
      confiscatedWeapon: result.confiscatedWeapon ?? null,
      timestamp: Date.now(),
    }
    const nextHistory = [
      historyEntry,
      ...state.mathHistory.filter(
        (h) => !(h.roundNumber === historyEntry.roundNumber && h.questionId === historyEntry.questionId),
      ),
    ].slice(0, 12)

    set({
      submittedQuestion: preservedQuestion,
      lastAnswerResult: result,
      activeQuestion: null,
      mathModalOpen: true,
      mathFlowPhase: 'ANSWER_FEEDBACK',
      mathHistory: nextHistory,
      weaponReveal:
        result.correct && result.awardedWeapon
          ? {
              id: Date.now(),
              weapon: result.awardedWeapon,
              pointsAwarded: result.pointsAwarded,
              timestamp: Date.now(),
            }
          : null,
      weaponPenalty: !result.correct
        ? {
            id: Date.now(),
            confiscatedWeapon: result.confiscatedWeapon ?? null,
            pointsDeducted: Math.abs(result.pointsAwarded),
            timestamp: Date.now(),
          }
        : null,
    })
  },

  onShotFired: (shot) => {
    const state = get()
    const now = performance.now()
    if (
      shot.shooterId === state.playerId &&
      state.tracers.some((t) => t.isLocalPredicted && now - t.createdAt < 180)
    ) {
      return
    }
    const nextTracer: ActiveTracer = {
      id: shot.id,
      shooterId: shot.shooterId,
      shooterTeam: shot.shooterTeam,
      weapon: shot.weapon,
      origin: shot.origin,
      endpoints: shot.endpoints,
      createdAt: now,
    }
    const kept = state.tracers.filter((t) => now - t.createdAt < 260)
    kept.push(nextTracer)
    set({ tracers: kept })
  },

  onSkillCast: (cast) => {
    const state = get()
    const snap =
      cast.playerId === state.playerId && cast.newPosition
        ? { ...cast.newPosition }
        : state.pendingSnapPos

    set({
      pendingSnapPos: snap,
      lastSkillBanner: { ...cast, receivedAt: Date.now() },
    })
  },

  onHitConfirmed: (hit) => {
    set({
      hitMarker: {
        id: Date.now(),
        headshot: hit.headshot,
        killed: hit.killed,
        damage: hit.damage,
        pointsAwarded: hit.pointsAwarded,
        timestamp: Date.now(),
      },
    })
  },

  onDamageTaken: (damage) => {
    set({
      lastDamageTaken: {
        ...damage,
        timestamp: Date.now(),
      },
    })
  },

  onKillEvent: (kill) => {
    const next = [kill, ...get().recentKills.filter((k) => k.id !== kill.id)].slice(0, 6)
    set({ recentKills: next })
  },

  onMatchFinished: (summary, room) => {
    if (document.pointerLockElement) {
      document.exitPointerLock()
    }
    set({
      room,
      matchSummary: summary,
      screen: 'result',
      mathModalOpen: false,
      mathFlowPhase: 'COMBAT_READY',
      activeQuestion: null,
      submittedQuestion: null,
      selectedChoiceIndex: null,
      lastAnswerResult: null,
      pauseOpen: false,
      scoreboardOpen: false,
      pointerLocked: false,
      isAdsZoom: false,
      isSprinting: false,
    })
  },

  clearWeaponReveal: () => set({ weaponReveal: null }),
  clearWeaponPenalty: () => set({ weaponPenalty: null }),
  clearLastAnswer: () =>
    set({
      lastAnswerResult: null,
      submittedQuestion: null,
      selectedChoiceIndex: null,
    }),

  resetToMenu: () => {
    saveSession(null)
    if (document.pointerLockElement) {
      document.exitPointerLock()
    }
    set({
      screen: 'menu',
      practiceMode: false,
      practiceTargets: [],
      playerId: null,
      sessionToken: null,
      room: null,
      liveTransforms: new Map(),
      pendingSnapPos: null,
      activeQuestion: null,
      submittedQuestion: null,
      selectedChoiceIndex: null,
      lastAnswerResult: null,
      mathModalOpen: false,
      mathFlowPhase: 'COMBAT_READY',
      mathHistory: [],
      weaponReveal: null,
      weaponPenalty: null,
      lastSkillBanner: null,
      hitMarker: null,
      lastDamageTaken: null,
      tracers: [],
      recentKills: [],
      matchSummary: null,
      pointerLocked: false,
      pauseOpen: false,
      scoreboardOpen: false,
      tutorialOpen: false,
      isAdsZoom: false,
      isSprinting: false,
      errorMessage: null,
    })
  },
}))

export function selectMyPlayer(state: GameState): PlayerPublicState | null {
  if (!state.room || !state.playerId) return null
  return state.room.players.find((p) => p.id === state.playerId) ?? null
}

if (typeof window !== 'undefined') {
  ;(
    window as unknown as {
      __MATH_RIVALS_TELEMETRY__?: () => {
        yaw: number
        pitch: number
        x: number
        y: number
        z: number
      }
    }
  ).__MATH_RIVALS_TELEMETRY__ = () => {
    const s = useGameStore.getState()
    return {
      yaw: s.localYaw,
      pitch: s.localPitch,
      x: s.localPredictedPos.x,
      y: s.localPredictedPos.y,
      z: s.localPredictedPos.z,
    }
  }
}

