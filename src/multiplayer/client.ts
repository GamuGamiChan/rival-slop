import type {
  AgentId,
  Difficulty,
  MathHelperType,
  QuestionSet,
  ServerMessage,
  SkillSlot,
  Team,
  Vec3,
} from '../../shared/types.ts'
import { getSelectedQuestionSet } from '../game/questionSetStore.ts'
import { soundEngine } from '../game/sound.ts'
import { loadSession, useGameStore } from '../store/useGameStore.ts'
import { P2PAdapter } from './p2pAdapter.ts'
import { PracticeAdapter } from './practiceAdapter.ts'
import { SupabaseAdapter } from './supabaseAdapter.ts'
import { VsAiAdapter, type AiDifficulty } from './vsAiAdapter.ts'
import { WebSocketAdapter } from './wsAdapter.ts'

function resolveInitialTransportMode(): 'ws' | 'p2p' | 'supabase' {
  const envMode = import.meta.env.VITE_MULTIPLAYER_MODE?.trim().toLowerCase()
  if (envMode === 'supabase' && SupabaseAdapter.isConfigured()) {
    return 'supabase'
  }
  if (envMode === 'p2p') {
    return 'p2p'
  }
  // When deployed statically on GitHub Pages or Vercel without a dedicated WS server URL,
  // default straight to zero-config WebRTC P2P so multiplayer works out of the box!
  const hasExplicitWs = Boolean(import.meta.env.VITE_WS_URL?.trim())
  if (typeof window !== 'undefined' && !hasExplicitWs) {
    const host = window.location.hostname.toLowerCase()
    if (host.endsWith('.github.io') || host.endsWith('.vercel.app') || host.endsWith('.netlify.app')) {
      return 'p2p'
    }
  }
  return 'ws'
}

class MultiplayerClient {
  private mode: 'ws' | 'p2p' | 'supabase' | 'practice' | 'ai'
  private readonly ws = new WebSocketAdapter()
  private readonly p2p = new P2PAdapter()
  private readonly sb = new SupabaseAdapter()
  private readonly practice = new PracticeAdapter()
  private readonly ai = new VsAiAdapter()
  private lastMoveSentAt = 0

  constructor() {
    this.mode = resolveInitialTransportMode()
    useGameStore.getState().setTransportMode(this.mode)
    this.ws.setMessageHandler((msg) => this.handleServerMessage(msg))
    this.p2p.setMessageHandler((msg) => this.handleServerMessage(msg))
    this.sb.setMessageHandler((msg) => this.handleServerMessage(msg))
    this.practice.setMessageHandler((msg) => this.handleServerMessage(msg))
    this.ai.setMessageHandler((msg) => this.handleServerMessage(msg))
  }

  getMode(): 'ws' | 'p2p' | 'supabase' | 'practice' | 'ai' {
    return this.mode
  }

  /** Built-in sets are sent by reference only (server resolves canonical questions); custom sets are sent in full. */
  private toWireQuestionSet(set: QuestionSet): QuestionSet {
    if (set.builtIn) {
      return { id: set.id, name: set.name, description: set.description, builtIn: true, questions: [] }
    }
    return set
  }

  /** Host-only: change the room's question set while in the lobby. */
  setQuestionSet(set: QuestionSet): void {
    const wire = this.toWireQuestionSet(set)
    if (this.mode === 'p2p') {
      this.p2p.sendMessage({ type: 'SET_QUESTION_SET', questionSet: wire })
    } else if (this.mode === 'ws') {
      this.ws.sendRaw({ type: 'SET_QUESTION_SET', questionSet: wire })
    } else if (this.mode === 'practice') {
      this.practice.sendMessage({ type: 'SET_QUESTION_SET', questionSet: wire })
    } else if (this.mode === 'ai') {
      this.ai.sendMessage({ type: 'SET_QUESTION_SET', questionSet: wire })
    }
  }

  startVsAiMode(
    playerName: string,
    difficulty: AiDifficulty = 'medium',
    questionSet: QuestionSet = getSelectedQuestionSet(),
    teamSize: 1 | 2 = 1,
  ): void {
    this.ws.disconnect()
    this.p2p.disconnect()
    this.sb.disconnect()
    this.practice.disconnect()
    this.mode = 'ai'
    const clean = playerName.trim() || 'Rival'
    useGameStore.getState().setPlayerName(clean)
    useGameStore.getState().setError(null)
    this.ai.start(clean, difficulty, this.toWireQuestionSet(questionSet), teamSize)
  }

  startPracticeMode(playerName: string, freePlay = false): void {
    this.ai.disconnect()
    this.ws.disconnect()
    this.p2p.disconnect()
    this.sb.disconnect()
    this.mode = 'practice'
    const clean = playerName.trim() || 'Trainee'
    useGameStore.getState().setPlayerName(clean)
    useGameStore.getState().setError(null)
    this.practice.start(clean, freePlay, this.toWireQuestionSet(getSelectedQuestionSet()))
  }

  setPracticeFreePlay(enabled: boolean): void {
    if (this.mode !== 'practice') return
    this.practice.setFreePlayMode(enabled)
  }

  private handleServerMessage(msg: ServerMessage): void {
    const store = useGameStore.getState()
    switch (msg.type) {
      case 'PONG': {
        const rtt = Date.now() - msg.clientTime
        store.setClockOffset(msg.serverNow + rtt / 2)
        break
      }
      case 'ROOM_JOINED':
        store.onRoomJoined(msg.playerId, msg.sessionToken, msg.room)
        break
      case 'ROOM_STATE':
        store.onRoomState(msg.room)
        break
      case 'POSITIONS_SYNC':
        store.onPositionsSync(msg.serverNow, msg.positions)
        break
      case 'QUESTION_ASSIGNED':
        store.onQuestionAssigned(msg.question)
        break
      case 'MATH_HELPER_RESULT':
        store.onMathHelperResult(msg.helper)
        break
      case 'ANSWER_RESULT':
        store.onAnswerResult(msg.result)
        if (msg.result.correct) {
          soundEngine.playMathCorrect()
        } else {
          soundEngine.playMathWrong()
        }
        break
      case 'SHOT_FIRED':
        store.onShotFired(msg.shot)
        if (msg.shot.shooterId !== store.playerId) {
          soundEngine.playWeaponFire(msg.shot.weapon, 0.32)
        }
        break
      case 'SKILL_CAST':
        store.onSkillCast(msg.cast)
        soundEngine.playSkillCast(msg.cast.skillId, msg.cast.playerId === store.playerId ? 1 : 0.45)
        break
      case 'HIT_CONFIRMED':
        store.onHitConfirmed(msg.hit)
        soundEngine.playHitMarker(msg.hit.headshot, msg.hit.killed)
        break
      case 'DAMAGE_TAKEN':
        store.onDamageTaken(msg.damage)
        soundEngine.playDamageTaken()
        break
      case 'KILL_EVENT':
        store.onKillEvent(msg.kill)
        break
      case 'MATCH_FINISHED':
        store.onMatchFinished(msg.summary, msg.room)
        soundEngine.playMatchEnd()
        break
      case 'ERROR':
        store.recoverMathSubmissionError(msg.message)
        break
    }
  }

  async createRoom(playerName: string, questionSet: QuestionSet = getSelectedQuestionSet()): Promise<void> {
    const wireSet = this.toWireQuestionSet(questionSet)
    if (this.mode === 'practice' || this.mode === 'ai') {
      this.practice.disconnect()
      this.ai.disconnect()
      this.mode = resolveInitialTransportMode()
      useGameStore.getState().setPracticeMode(false)
      useGameStore.getState().setTransportMode(this.mode)
    }
    const clean = playerName.trim() || 'Rival'
    useGameStore.getState().setPlayerName(clean)
    useGameStore.getState().setError(null)
    try {
      if (this.mode === 'supabase') {
        await this.sb.createRoom(clean)
        return
      }
      if (this.mode === 'p2p') {
        await this.p2p.createRoom(clean, wireSet)
        return
      }
      // Try dedicated WebSocket/HTTP server first; if absent (static host), fall back to WebRTC P2P!
      try {
        await this.ws.ensureConnected()
        this.ws.sendRaw({ type: 'CREATE_ROOM', playerName: clean, questionSet: wireSet })
      } catch {
        this.mode = 'p2p'
        useGameStore.getState().setTransportMode('p2p')
        await this.p2p.createRoom(clean, wireSet)
      }
    } catch (err) {
      useGameStore.getState().setError(err instanceof Error ? err.message : 'เชื่อมต่อไม่สำเร็จ')
    }
  }

  async joinRoom(roomCode: string, playerName: string): Promise<void> {
    if (this.mode === 'practice' || this.mode === 'ai') {
      this.practice.disconnect()
      this.ai.disconnect()
      this.mode = resolveInitialTransportMode()
      useGameStore.getState().setPracticeMode(false)
      useGameStore.getState().setTransportMode(this.mode)
    }
    const cleanName = playerName.trim() || 'Rival'
    const cleanCode = roomCode.trim().toUpperCase()
    if (cleanCode.length !== 6) {
      useGameStore.getState().setError('รหัสห้องต้องมีความยาว 6 ตัวอักษร')
      return
    }
    useGameStore.getState().setPlayerName(cleanName)
    useGameStore.getState().setError(null)
    try {
      if (this.mode === 'supabase') {
        await this.sb.joinRoom(cleanCode, cleanName)
        return
      }
      if (this.mode === 'p2p') {
        await this.p2p.joinRoom(cleanCode, cleanName)
        return
      }
      try {
        await this.ws.ensureConnected()
        this.ws.sendRaw({ type: 'JOIN_ROOM', roomCode: cleanCode, playerName: cleanName })
      } catch {
        this.mode = 'p2p'
        useGameStore.getState().setTransportMode('p2p')
        await this.p2p.joinRoom(cleanCode, cleanName)
      }
    } catch (err) {
      useGameStore.getState().setError(err instanceof Error ? err.message : 'เข้าร่วมห้องไม่สำเร็จ')
    }
  }

  async tryReconnectSavedSession(): Promise<boolean> {
    const saved = loadSession()
    if (!saved) return false
    if (this.mode === 'practice' || this.mode === 'ai') {
      this.practice.disconnect()
      this.ai.disconnect()
      this.mode = resolveInitialTransportMode()
      useGameStore.getState().setPracticeMode(false)
      useGameStore.getState().setTransportMode(this.mode)
    }
    if (this.mode === 'p2p') {
      try {
        await this.p2p.reconnectRoom(saved.roomCode, saved.playerId, saved.sessionToken)
        return true
      } catch {
        return false
      }
    }
    if (this.mode !== 'ws') return false
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await this.ws.ensureConnected()
        this.ws.sendRaw({
          type: 'RECONNECT',
          roomCode: saved.roomCode,
          playerId: saved.playerId,
          sessionToken: saved.sessionToken,
        })
        return true
      } catch {
        if (attempt === 0) {
          await new Promise((r) => window.setTimeout(r, 350))
        }
      }
    }
    try {
      this.mode = 'p2p'
      useGameStore.getState().setTransportMode('p2p')
      await this.p2p.reconnectRoom(saved.roomCode, saved.playerId, saved.sessionToken)
      return true
    } catch {
      return false
    }
  }

  setReady(ready: boolean): void {
    if (this.mode === 'p2p') {
      this.p2p.sendMessage({ type: 'SET_READY', ready })
    } else if (this.mode === 'ws') {
      this.ws.sendRaw({ type: 'SET_READY', ready })
    }
  }

  switchTeam(team: Team): void {
    if (this.mode === 'p2p') {
      this.p2p.sendMessage({ type: 'SWITCH_TEAM', team })
    } else if (this.mode === 'ws') {
      this.ws.sendRaw({ type: 'SWITCH_TEAM', team })
    }
  }

  selectAgent(agent: AgentId): void {
    if (this.mode === 'practice') {
      this.practice.sendMessage({ type: 'SELECT_AGENT', agent })
    } else if (this.mode === 'ai') {
      this.ai.sendMessage({ type: 'SELECT_AGENT', agent })
    } else if (this.mode === 'p2p') {
      this.p2p.sendMessage({ type: 'SELECT_AGENT', agent })
    } else if (this.mode === 'ws') {
      this.ws.sendRaw({ type: 'SELECT_AGENT', agent })
    }
  }

  startMatch(): void {
    if (this.mode === 'ai') {
      this.ai.sendMessage({ type: 'START_MATCH' })
    } else if (this.mode === 'supabase') {
      void this.sb.startMatch()
    } else if (this.mode === 'p2p') {
      this.p2p.sendMessage({ type: 'START_MATCH' })
    } else if (this.mode === 'ws') {
      this.ws.sendRaw({ type: 'START_MATCH' })
    }
  }

  startFreePlay(): void {
    if (this.mode === 'practice') {
      this.practice.sendMessage({ type: 'START_FREE_PLAY' })
    } else if (this.mode === 'ai') {
      this.ai.sendMessage({ type: 'START_FREE_PLAY' })
    } else if (this.mode === 'p2p') {
      this.p2p.sendMessage({ type: 'START_FREE_PLAY' })
    } else if (this.mode === 'ws') {
      this.ws.sendRaw({ type: 'START_FREE_PLAY' })
    }
  }

  selectFreeWeapon(weapon: import('../../shared/types.ts').WeaponId | null): void {
    if (this.mode === 'practice') {
      this.practice.sendMessage({ type: 'SELECT_FREE_WEAPON', weapon })
    } else if (this.mode === 'ai') {
      this.ai.sendMessage({ type: 'SELECT_FREE_WEAPON', weapon })
    } else if (this.mode === 'p2p') {
      this.p2p.sendMessage({ type: 'SELECT_FREE_WEAPON', weapon })
    } else if (this.mode === 'ws') {
      this.ws.sendRaw({ type: 'SELECT_FREE_WEAPON', weapon })
    }
  }

  returnToLobby(): void {
    if (this.mode === 'ai') {
      this.ai.sendMessage({ type: 'RETURN_TO_LOBBY' })
    } else if (this.mode === 'p2p') {
      this.p2p.sendMessage({ type: 'RETURN_TO_LOBBY' })
    } else if (this.mode === 'ws') {
      this.ws.sendRaw({ type: 'RETURN_TO_LOBBY' })
    }
  }

  leaveRoom(): void {
    if (this.mode === 'practice' || this.mode === 'ai') {
      this.practice.disconnect()
      this.ai.disconnect()
      this.mode = resolveInitialTransportMode()
      useGameStore.getState().setTransportMode(this.mode)
    } else if (this.mode === 'p2p') {
      this.p2p.sendMessage({ type: 'LEAVE_ROOM' })
      this.p2p.disconnect()
    } else if (this.mode === 'ws') {
      this.ws.sendRaw({ type: 'LEAVE_ROOM' })
      this.ws.disconnect()
    } else {
      this.sb.disconnect()
    }
    useGameStore.getState().resetToMenu()
  }

  sendMove(position: Vec3, yaw: number, pitch: number): void {
    const now = performance.now()
    if (now - this.lastMoveSentAt < 45) return
    this.lastMoveSentAt = now
    if (this.mode === 'practice') {
      this.practice.sendMessage({ type: 'PLAYER_MOVE', position, yaw, pitch })
    } else if (this.mode === 'ai') {
      this.ai.sendMessage({ type: 'PLAYER_MOVE', position, yaw, pitch })
    } else if (this.mode === 'supabase') {
      this.sb.sendMove(position, yaw, pitch)
    } else if (this.mode === 'p2p') {
      this.p2p.sendMessage({ type: 'PLAYER_MOVE', position, yaw, pitch })
    } else {
      this.ws.sendRaw({ type: 'PLAYER_MOVE', position, yaw, pitch })
    }
  }

  requestQuestion(preferredDifficulty?: Difficulty): void {
    if (this.mode === 'practice') {
      this.practice.sendMessage({ type: 'REQUEST_QUESTION', preferredDifficulty })
    } else if (this.mode === 'ai') {
      this.ai.sendMessage({ type: 'REQUEST_QUESTION', preferredDifficulty })
    } else if (this.mode === 'supabase') {
      this.sb.requestQuestion(preferredDifficulty)
    } else if (this.mode === 'p2p') {
      this.p2p.sendMessage({ type: 'REQUEST_QUESTION', preferredDifficulty })
    } else {
      this.ws.sendRaw({ type: 'REQUEST_QUESTION', preferredDifficulty })
    }
  }

  submitAnswer(questionId: string, selectedIndex: number): void {
    if (this.mode === 'practice') {
      this.practice.sendMessage({ type: 'SUBMIT_ANSWER', questionId, selectedIndex })
    } else if (this.mode === 'ai') {
      this.ai.sendMessage({ type: 'SUBMIT_ANSWER', questionId, selectedIndex })
    } else if (this.mode === 'supabase') {
      void this.sb.submitAnswer(questionId, selectedIndex)
    } else if (this.mode === 'p2p') {
      this.p2p.sendMessage({ type: 'SUBMIT_ANSWER', questionId, selectedIndex })
    } else {
      this.ws.sendRaw({ type: 'SUBMIT_ANSWER', questionId, selectedIndex })
    }
  }

  useMathHelper(questionId: string, helper: MathHelperType): void {
    if (this.mode === 'practice') {
      this.practice.sendMessage({ type: 'USE_MATH_HELPER', questionId, helper })
    } else if (this.mode === 'ai') {
      this.ai.sendMessage({ type: 'USE_MATH_HELPER', questionId, helper })
    } else if (this.mode === 'p2p') {
      this.p2p.sendMessage({ type: 'USE_MATH_HELPER', questionId, helper })
    } else if (this.mode === 'ws') {
      this.ws.sendRaw({ type: 'USE_MATH_HELPER', questionId, helper })
    }
  }

  shoot(origin: Vec3, direction: Vec3): void {
    if (this.mode === 'practice') {
      this.practice.sendMessage({ type: 'SHOOT', origin, direction })
    } else if (this.mode === 'ai') {
      this.ai.sendMessage({ type: 'SHOOT', origin, direction })
    } else if (this.mode === 'supabase') {
      void this.sb.shoot(origin, direction)
    } else if (this.mode === 'p2p') {
      this.p2p.sendMessage({ type: 'SHOOT', origin, direction })
    } else {
      this.ws.sendRaw({ type: 'SHOOT', origin, direction })
    }
  }

  useSkill(slot: SkillSlot, origin: Vec3, direction: Vec3): void {
    if (this.mode === 'practice') {
      this.practice.sendMessage({ type: 'USE_SKILL', slot, origin, direction })
    } else if (this.mode === 'ai') {
      this.ai.sendMessage({ type: 'USE_SKILL', slot, origin, direction })
    } else if (this.mode === 'p2p') {
      this.p2p.sendMessage({ type: 'USE_SKILL', slot, origin, direction })
    } else if (this.mode === 'ws') {
      this.ws.sendRaw({ type: 'USE_SKILL', slot, origin, direction })
    }
  }

  reload(): void {
    if (this.mode === 'practice') {
      this.practice.sendMessage({ type: 'RELOAD' })
    } else if (this.mode === 'ai') {
      this.ai.sendMessage({ type: 'RELOAD' })
    } else if (this.mode === 'p2p') {
      this.p2p.sendMessage({ type: 'RELOAD' })
    } else if (this.mode === 'ws') {
      this.ws.sendRaw({ type: 'RELOAD' })
    }
  }
}

export const multiplayerClient = new MultiplayerClient()
