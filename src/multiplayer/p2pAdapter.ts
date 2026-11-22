import Peer, { type DataConnection } from 'peerjs'
import { RoomManager, type CombatHitRecord } from '../../shared/roomManager.ts'
import type { ClientMessage, ServerMessage } from '../../shared/types.ts'
import { useGameStore } from '../store/useGameStore.ts'

const PEER_PREFIX = 'mr3d-'

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
]

interface GuestPeerSession {
  conn: DataConnection
  roomCode: string | null
  playerId: string | null
}

/**
 * Host-Authoritative WebRTC Multiplayer Adapter (PeerJS).
 * Enables zero-config real 2-8 player multiplayer on static hosts (GitHub Pages & Vercel)
 * with ZERO external backend servers or API keys required.
 *
 * The room creator's browser runs the exact same shared RoomManager simulation (20Hz tick,
 * server-side quiz validation, anti-duplicate farming, 3D raycast hit detection, 8 weapons,
 * 4 Agents & 12 skills), and guests connect directly via reliable WebRTC DataChannels.
 */
export class P2PAdapter {
  private peer: Peer | null = null
  private role: 'host' | 'guest' | null = null
  private manager: RoomManager | null = null
  private hostRoomCode: string | null = null
  private hostPlayerId: string | null = null
  private hostTickTimer: number | null = null
  private guestSessions = new Map<DataConnection, GuestPeerSession>()
  private playerConns = new Map<string, DataConnection>()
  private hostConn: DataConnection | null = null
  private onMessage: ((msg: ServerMessage) => void) | null = null

  setMessageHandler(handler: (msg: ServerMessage) => void): void {
    this.onMessage = handler
  }

  isActive(): boolean {
    return this.role !== null
  }

  async createRoom(playerName: string): Promise<void> {
    this.disconnect()
    useGameStore.getState().setConnectionStatus('connecting')

    const mgr = new RoomManager()
    const created = mgr.createRoom(playerName)
    const hostPeerId = `${PEER_PREFIX}${created.roomCode}`

    await new Promise<void>((resolve, reject) => {
      const peer = new Peer(hostPeerId, {
        debug: 0,
        config: { iceServers: ICE_SERVERS },
      })
      this.peer = peer
      let settled = false
      const timeout = window.setTimeout(() => {
        if (!settled) {
          settled = true
          reject(new Error('เชื่อมต่อเครือข่าย WebRTC P2P ไม่สำเร็จ (Timeout)'))
        }
      }, 10_000)

      peer.on('open', () => {
        window.clearTimeout(timeout)
        settled = true
        this.role = 'host'
        this.manager = mgr
        this.hostRoomCode = created.roomCode
        this.hostPlayerId = created.playerId

        useGameStore.getState().setTransportMode('p2p')
        useGameStore.getState().setConnectionStatus('connected')
        useGameStore.getState().setError(null)

        this.startHostTickLoop()
        this.onMessage?.({
          type: 'ROOM_JOINED',
          playerId: created.playerId,
          sessionToken: created.sessionToken,
          room: created.snapshot,
        })
        resolve()
      })

      peer.on('connection', (conn) => {
        this.attachGuestConnection(conn)
      })

      peer.on('error', (err) => {
        if (!settled) {
          window.clearTimeout(timeout)
          settled = true
          reject(new Error(`WebRTC P2P Error: ${err.message}`))
        }
      })
    })
  }

  async joinRoom(rawRoomCode: string, playerName: string): Promise<void> {
    this.disconnect()
    const roomCode = rawRoomCode.trim().toUpperCase()
    const hostPeerId = `${PEER_PREFIX}${roomCode}`
    useGameStore.getState().setConnectionStatus('connecting')

    await new Promise<void>((resolve, reject) => {
      const peer = new Peer({
        debug: 0,
        config: { iceServers: ICE_SERVERS },
      })
      this.peer = peer
      let settled = false
      const timeout = window.setTimeout(() => {
        if (!settled) {
          settled = true
          this.disconnect()
          reject(new Error(`ไม่พบห้องรหัส "${roomCode}" หรือเชื่อมต่อ Host ไม่สำเร็จ`))
        }
      }, 10_000)

      peer.on('open', () => {
        const conn = peer.connect(hostPeerId, { reliable: true })
        this.hostConn = conn

        conn.on('open', () => {
          window.clearTimeout(timeout)
          settled = true
          this.role = 'guest'
          useGameStore.getState().setTransportMode('p2p')
          useGameStore.getState().setConnectionStatus('connected')
          useGameStore.getState().setError(null)
          conn.send({ type: 'JOIN_ROOM', roomCode, playerName } satisfies ClientMessage)
          resolve()
        })

        conn.on('data', (raw) => {
          if (raw && typeof raw === 'object' && 'type' in raw) {
            this.onMessage?.(raw as ServerMessage)
          }
        })

        conn.on('close', () => {
          if (this.role === 'guest') {
            useGameStore.getState().setConnectionStatus('disconnected')
            useGameStore.getState().setError('Host ปิดห้องหรือการเชื่อมต่อหลุด')
          }
        })

        conn.on('error', () => {
          if (!settled) {
            window.clearTimeout(timeout)
            settled = true
            this.disconnect()
            reject(new Error(`ไม่สามารถเชื่อมต่อห้อง "${roomCode}" ได้`))
          }
        })
      })

      peer.on('error', (err) => {
        if (!settled) {
          window.clearTimeout(timeout)
          settled = true
          this.disconnect()
          reject(new Error(`ไม่พบห้อง "${roomCode}" (${err.type})`))
        }
      })
    })
  }

  async reconnectRoom(rawRoomCode: string, playerId: string, sessionToken: string): Promise<void> {
    this.disconnect()
    const roomCode = rawRoomCode.trim().toUpperCase()
    const hostPeerId = `${PEER_PREFIX}${roomCode}`
    useGameStore.getState().setConnectionStatus('reconnecting')

    await new Promise<void>((resolve, reject) => {
      const peer = new Peer({
        debug: 0,
        config: { iceServers: ICE_SERVERS },
      })
      this.peer = peer
      let settled = false
      const timeout = window.setTimeout(() => {
        if (!settled) {
          settled = true
          this.disconnect()
          reject(new Error(`เชื่อมต่อห้องเดิม "${roomCode}" ไม่สำเร็จ`))
        }
      }, 10_000)

      peer.on('open', () => {
        const conn = peer.connect(hostPeerId, { reliable: true })
        this.hostConn = conn

        conn.on('open', () => {
          window.clearTimeout(timeout)
          settled = true
          this.role = 'guest'
          useGameStore.getState().setTransportMode('p2p')
          useGameStore.getState().setConnectionStatus('connected')
          useGameStore.getState().setError(null)
          conn.send({
            type: 'RECONNECT',
            roomCode,
            playerId,
            sessionToken,
          } satisfies ClientMessage)
          resolve()
        })

        conn.on('data', (raw) => {
          if (raw && typeof raw === 'object' && 'type' in raw) {
            this.onMessage?.(raw as ServerMessage)
          }
        })

        conn.on('close', () => {
          if (this.role === 'guest') {
            useGameStore.getState().setConnectionStatus('disconnected')
            useGameStore.getState().setError('Host ปิดห้องหรือการเชื่อมต่อหลุด')
          }
        })

        conn.on('error', () => {
          if (!settled) {
            window.clearTimeout(timeout)
            settled = true
            this.disconnect()
            reject(new Error(`เชื่อมต่อห้องเดิม "${roomCode}" ไม่สำเร็จ`))
          }
        })
      })

      peer.on('error', (err) => {
        if (!settled) {
          window.clearTimeout(timeout)
          settled = true
          this.disconnect()
          reject(new Error(`ไม่พบห้องเดิม "${roomCode}" (${err.type})`))
        }
      })
    })
  }

  private attachGuestConnection(conn: DataConnection): void {
    const session: GuestPeerSession = { conn, roomCode: null, playerId: null }
    this.guestSessions.set(conn, session)

    conn.on('data', (raw) => {
      if (!raw || typeof raw !== 'object' || !('type' in raw)) return
      this.processHostMessage(raw as ClientMessage, session)
    })

    conn.on('close', () => {
      this.guestSessions.delete(conn)
      if (session.playerId && this.playerConns.get(session.playerId) === conn) {
        this.playerConns.delete(session.playerId)
      }
      if (this.manager && session.roomCode && session.playerId) {
        const updated = this.manager.markDisconnected(session.roomCode, session.playerId, false)
        if (updated) {
          this.broadcastToAll({ type: 'ROOM_STATE', room: updated })
        }
      }
    })
  }

  private sendToTarget(targetPlayerId: string, msg: ServerMessage): void {
    if (targetPlayerId === this.hostPlayerId) {
      this.onMessage?.(msg)
      return
    }
    const conn = this.playerConns.get(targetPlayerId)
    if (conn && conn.open) {
      conn.send(msg)
    }
  }

  private broadcastToAll(msg: ServerMessage, excludePlayerId?: string): void {
    if (this.hostPlayerId && this.hostPlayerId !== excludePlayerId) {
      this.onMessage?.(msg)
    }
    for (const [pid, conn] of this.playerConns.entries()) {
      if (pid === excludePlayerId) continue
      if (conn.open) {
        conn.send(msg)
      }
    }
  }

  private broadcastRoomState(): void {
    if (!this.manager || !this.hostRoomCode) return
    const room = this.manager.getRoom(this.hostRoomCode)
    if (!room) return
    this.broadcastToAll({ type: 'ROOM_STATE', room: this.manager.buildSnapshot(room) })
  }

  private emitCombatHits(attackerId: string, hits: CombatHitRecord[]): void {
    for (const hit of hits) {
      this.sendToTarget(attackerId, { type: 'HIT_CONFIRMED', hit: hit.confirm })
      this.sendToTarget(hit.victimId, { type: 'DAMAGE_TAKEN', damage: hit.damageTaken })
      if (hit.killEvent) {
        this.broadcastToAll({ type: 'KILL_EVENT', kill: hit.killEvent })
      }
    }
  }

  sendMessage(msg: ClientMessage): void {
    if (this.role === 'guest') {
      if (this.hostConn && this.hostConn.open) {
        this.hostConn.send(msg)
      }
      return
    }
    if (this.role === 'host') {
      this.processHostMessage(msg, null)
    }
  }

  private processHostMessage(msg: ClientMessage, guest: GuestPeerSession | null): void {
    if (!this.manager || !this.hostRoomCode) return
    const roomCode = this.hostRoomCode
    const senderId = guest ? guest.playerId : this.hostPlayerId

    const reply = (m: ServerMessage) => {
      if (guest) {
        if (guest.conn.open) guest.conn.send(m)
      } else {
        this.onMessage?.(m)
      }
    }

    switch (msg.type) {
      case 'PING':
        reply({ type: 'PONG', clientTime: msg.clientTime, serverNow: Date.now() })
        break

      case 'JOIN_ROOM': {
        if (!guest) return
        const res = this.manager.joinRoom(msg.roomCode ?? roomCode, msg.playerName ?? '')
        if (!res.ok) {
          reply({ type: 'ERROR', code: res.code, message: res.message })
          return
        }
        guest.roomCode = res.roomCode
        guest.playerId = res.playerId
        this.playerConns.set(res.playerId, guest.conn)
        reply({
          type: 'ROOM_JOINED',
          playerId: res.playerId,
          sessionToken: res.sessionToken,
          room: res.snapshot,
        })
        this.broadcastToAll({ type: 'ROOM_STATE', room: res.snapshot }, res.playerId)
        break
      }

      case 'RECONNECT': {
        if (!guest) return
        const res = this.manager.reconnectPlayer(msg.roomCode, msg.playerId, msg.sessionToken)
        if (!res.ok) {
          reply({ type: 'ERROR', code: res.code, message: res.message })
          return
        }
        guest.roomCode = res.roomCode
        guest.playerId = msg.playerId
        this.playerConns.set(msg.playerId, guest.conn)
        reply({
          type: 'ROOM_JOINED',
          playerId: msg.playerId,
          sessionToken: msg.sessionToken,
          room: res.snapshot,
        })
        this.broadcastToAll({ type: 'ROOM_STATE', room: res.snapshot }, msg.playerId)
        break
      }

      case 'SET_READY': {
        if (!senderId) return
        const res = this.manager.setReady(roomCode, senderId, msg.ready)
        if (!res.ok) reply({ type: 'ERROR', code: res.code, message: res.message })
        else this.broadcastToAll({ type: 'ROOM_STATE', room: res.snapshot })
        break
      }

      case 'SWITCH_TEAM': {
        if (!senderId) return
        const res = this.manager.switchTeam(roomCode, senderId, msg.team)
        if (!res.ok) reply({ type: 'ERROR', code: res.code, message: res.message })
        else this.broadcastToAll({ type: 'ROOM_STATE', room: res.snapshot })
        break
      }

      case 'SELECT_AGENT': {
        if (!senderId) return
        const res = this.manager.selectAgent(roomCode, senderId, msg.agent)
        if (!res.ok) reply({ type: 'ERROR', code: res.code, message: res.message })
        else this.broadcastToAll({ type: 'ROOM_STATE', room: res.snapshot })
        break
      }

      case 'START_MATCH': {
        if (!senderId) return
        const res = this.manager.startMatch(roomCode, senderId)
        if (!res.ok) reply({ type: 'ERROR', code: res.code, message: res.message })
        else this.broadcastToAll({ type: 'ROOM_STATE', room: res.snapshot })
        break
      }

      case 'RETURN_TO_LOBBY': {
        if (!senderId) return
        const res = this.manager.returnToLobby(roomCode, senderId)
        if (!res.ok) reply({ type: 'ERROR', code: res.code, message: res.message })
        else this.broadcastToAll({ type: 'ROOM_STATE', room: res.snapshot })
        break
      }

      case 'PLAYER_MOVE': {
        if (!senderId) return
        this.manager.updatePlayerMove(roomCode, senderId, msg.position, msg.yaw, msg.pitch)
        break
      }

      case 'REQUEST_QUESTION': {
        if (!senderId) return
        const res = this.manager.requestQuestion(roomCode, senderId, msg.preferredDifficulty)
        if (!res.ok) reply({ type: 'ERROR', code: res.code, message: res.message })
        else reply({ type: 'QUESTION_ASSIGNED', question: res.question })
        break
      }

      case 'SUBMIT_ANSWER': {
        if (!senderId) return
        const res = this.manager.submitAnswer(roomCode, senderId, msg.questionId, msg.selectedIndex)
        if (!res.ok) {
          reply({ type: 'ERROR', code: res.code, message: res.message })
        } else {
          reply({ type: 'ANSWER_RESULT', result: res.result })
          this.broadcastToAll({ type: 'ROOM_STATE', room: res.snapshot })
        }
        break
      }

      case 'RELOAD': {
        if (!senderId) return
        const res = this.manager.startReload(roomCode, senderId)
        if (res.ok) this.broadcastRoomState()
        break
      }

      case 'USE_SKILL': {
        if (!senderId) return
        const res = this.manager.useSkill(roomCode, senderId, msg.slot, msg.origin, msg.direction)
        if (!res.ok) {
          if (res.code === 'ULT_NOT_READY') {
            reply({ type: 'ERROR', code: res.code, message: res.message })
          }
          return
        }
        this.broadcastToAll({ type: 'SKILL_CAST', cast: res.outcome.cast })
        this.emitCombatHits(senderId, res.outcome.hits)
        if (res.outcome.roomStateChanged || res.outcome.scoreboardChanged) {
          this.broadcastRoomState()
        }
        break
      }

      case 'SHOOT': {
        if (!senderId) return
        const res = this.manager.shoot(roomCode, senderId, msg.origin, msg.direction)
        if (!res.ok) {
          if (res.code === 'NO_WEAPON') {
            reply({ type: 'ERROR', code: res.code, message: res.message })
          }
          return
        }
        this.broadcastToAll({ type: 'SHOT_FIRED', shot: res.outcome.shot })
        this.emitCombatHits(senderId, res.outcome.hits)
        if (res.scoreboardChanged) {
          this.broadcastRoomState()
        }
        break
      }

      case 'LEAVE_ROOM': {
        if (guest && guest.playerId) {
          const pid = guest.playerId
          guest.playerId = null
          this.playerConns.delete(pid)
          const updated = this.manager.markDisconnected(roomCode, pid, true)
          if (updated) this.broadcastToAll({ type: 'ROOM_STATE', room: updated })
        }
        break
      }
    }
  }

  private startHostTickLoop(): void {
    if (this.hostTickTimer !== null) window.clearInterval(this.hostTickTimer)
    this.hostTickTimer = window.setInterval(() => {
      if (!this.manager || !this.hostRoomCode) return
      const transitions = this.manager.tick()
      for (const t of transitions) {
        if (t.type === 'MATCH_FINISHED' && t.summary) {
          const room = this.manager.getRoom(this.hostRoomCode)
          if (room) {
            this.broadcastToAll({
              type: 'MATCH_FINISHED',
              summary: t.summary,
              room: this.manager.buildSnapshot(room),
            })
          }
        } else if (t.type === 'ORBITAL_DETONATED' && t.hits && t.attackerId) {
          this.emitCombatHits(t.attackerId, t.hits)
          this.broadcastRoomState()
        } else if (
          t.type === 'PHASE_PLAYING' ||
          t.type === 'RESPAWNED' ||
          t.type === 'RELOADED' ||
          t.type === 'EFFECTS_UPDATED'
        ) {
          this.broadcastRoomState()
        }
      }

      const room = this.manager.getRoom(this.hostRoomCode)
      if (!room || (room.phase !== 'playing' && room.phase !== 'countdown')) return
      const now = Date.now()
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
      this.broadcastToAll({ type: 'POSITIONS_SYNC', serverNow: now, positions })
    }, 50)
  }

  disconnect(): void {
    if (this.hostTickTimer !== null) {
      window.clearInterval(this.hostTickTimer)
      this.hostTickTimer = null
    }
    if (this.hostConn) {
      try {
        this.hostConn.close()
      } catch {
        // Ignore
      }
      this.hostConn = null
    }
    for (const conn of this.guestSessions.keys()) {
      try {
        conn.close()
      } catch {
        // Ignore
      }
    }
    this.guestSessions.clear()
    this.playerConns.clear()
    if (this.peer) {
      try {
        this.peer.destroy()
      } catch {
        // Ignore
      }
      this.peer = null
    }
    this.role = null
    this.manager = null
    this.hostRoomCode = null
    this.hostPlayerId = null
  }
}
