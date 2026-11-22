import http from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'
import type { ClientMessage, ServerMessage } from '../shared/types.ts'
import { RoomManager } from './roomManager.ts'

interface ClientSession {
  ws: WebSocket
  roomCode: string | null
  playerId: string | null
}

const PORT = Number(process.env.PORT ?? 3001)
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? '*'

const manager = new RoomManager()
const clients = new Set<ClientSession>()
const playerSockets = new Map<string, ClientSession>()
const startedAt = Date.now()

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
  }
}

function broadcastToRoom(roomCode: string, msg: ServerMessage, excludePlayerId?: string): void {
  const payload = JSON.stringify(msg)
  for (const session of clients) {
    if (
      session.roomCode === roomCode &&
      session.playerId !== excludePlayerId &&
      session.ws.readyState === WebSocket.OPEN
    ) {
      session.ws.send(payload)
    }
  }
}

function broadcastRoomState(roomCode: string): void {
  const room = manager.getRoom(roomCode)
  if (!room) return
  broadcastToRoom(roomCode, {
    type: 'ROOM_STATE',
    room: manager.buildSnapshot(room),
  })
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        service: 'math-rivals-3d-server',
        status: 'ok',
        rooms: manager.getRoomCount(),
        players: manager.getTotalConnectedPlayers(),
        uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
      }),
    )
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not Found' }))
})

const wss = new WebSocketServer({ server })

wss.on('connection', (ws) => {
  const session: ClientSession = { ws, roomCode: null, playerId: null }
  clients.add(session)

  ws.on('message', (raw) => {
    let msg: ClientMessage
    try {
      const text = typeof raw === 'string' ? raw : raw.toString('utf8')
      if (text.length > 8192) {
        send(ws, { type: 'ERROR', code: 'PAYLOAD_TOO_LARGE', message: 'Payload too large' })
        return
      }
      msg = JSON.parse(text) as ClientMessage
    } catch {
      send(ws, { type: 'ERROR', code: 'BAD_JSON', message: 'Invalid JSON payload' })
      return
    }

    switch (msg.type) {
      case 'PING': {
        send(ws, { type: 'PONG', clientTime: msg.clientTime, serverNow: Date.now() })
        break
      }

      case 'CREATE_ROOM': {
        if (session.roomCode && session.playerId) {
          manager.markDisconnected(session.roomCode, session.playerId, true)
          broadcastRoomState(session.roomCode)
        }
        const created = manager.createRoom(msg.playerName ?? '')
        session.roomCode = created.roomCode
        session.playerId = created.playerId
        playerSockets.set(created.playerId, session)
        send(ws, {
          type: 'ROOM_JOINED',
          playerId: created.playerId,
          sessionToken: created.sessionToken,
          room: created.snapshot,
        })
        break
      }

      case 'JOIN_ROOM': {
        if (session.roomCode && session.playerId) {
          manager.markDisconnected(session.roomCode, session.playerId, true)
          broadcastRoomState(session.roomCode)
        }
        const res = manager.joinRoom(msg.roomCode ?? '', msg.playerName ?? '')
        if (!res.ok) {
          send(ws, { type: 'ERROR', code: res.code, message: res.message })
          break
        }
        session.roomCode = res.roomCode
        session.playerId = res.playerId
        playerSockets.set(res.playerId, session)
        send(ws, {
          type: 'ROOM_JOINED',
          playerId: res.playerId,
          sessionToken: res.sessionToken,
          room: res.snapshot,
        })
        broadcastToRoom(res.roomCode, { type: 'ROOM_STATE', room: res.snapshot }, res.playerId)
        break
      }

      case 'RECONNECT': {
        const res = manager.reconnectPlayer(msg.roomCode ?? '', msg.playerId ?? '', msg.sessionToken ?? '')
        if (!res.ok) {
          send(ws, { type: 'ERROR', code: res.code, message: res.message })
          break
        }
        // Close stale socket for this player if any
        const old = playerSockets.get(msg.playerId)
        if (old && old !== session) {
          old.roomCode = null
          old.playerId = null
          old.ws.close(1000, 'Reconnected on a new session')
        }
        session.roomCode = res.roomCode
        session.playerId = msg.playerId
        playerSockets.set(msg.playerId, session)
        send(ws, {
          type: 'ROOM_JOINED',
          playerId: msg.playerId,
          sessionToken: msg.sessionToken,
          room: res.snapshot,
        })
        broadcastToRoom(res.roomCode, { type: 'ROOM_STATE', room: res.snapshot }, msg.playerId)
        break
      }

      case 'LEAVE_ROOM': {
        if (session.roomCode && session.playerId) {
          const code = session.roomCode
          const pid = session.playerId
          session.roomCode = null
          session.playerId = null
          playerSockets.delete(pid)
          const updated = manager.markDisconnected(code, pid, true)
          if (updated) {
            broadcastToRoom(code, { type: 'ROOM_STATE', room: updated })
          }
        }
        break
      }

      case 'SET_READY': {
        if (!session.roomCode || !session.playerId) return
        const res = manager.setReady(session.roomCode, session.playerId, msg.ready)
        if (!res.ok) {
          send(ws, { type: 'ERROR', code: res.code, message: res.message })
        } else {
          broadcastToRoom(session.roomCode, { type: 'ROOM_STATE', room: res.snapshot })
        }
        break
      }

      case 'SWITCH_TEAM': {
        if (!session.roomCode || !session.playerId) return
        const res = manager.switchTeam(session.roomCode, session.playerId, msg.team)
        if (!res.ok) {
          send(ws, { type: 'ERROR', code: res.code, message: res.message })
        } else {
          broadcastToRoom(session.roomCode, { type: 'ROOM_STATE', room: res.snapshot })
        }
        break
      }

      case 'START_MATCH': {
        if (!session.roomCode || !session.playerId) return
        const res = manager.startMatch(session.roomCode, session.playerId)
        if (!res.ok) {
          send(ws, { type: 'ERROR', code: res.code, message: res.message })
        } else {
          broadcastToRoom(session.roomCode, { type: 'ROOM_STATE', room: res.snapshot })
        }
        break
      }

      case 'RETURN_TO_LOBBY': {
        if (!session.roomCode || !session.playerId) return
        const res = manager.returnToLobby(session.roomCode, session.playerId)
        if (!res.ok) {
          send(ws, { type: 'ERROR', code: res.code, message: res.message })
        } else {
          broadcastToRoom(session.roomCode, { type: 'ROOM_STATE', room: res.snapshot })
        }
        break
      }

      case 'PLAYER_MOVE': {
        if (!session.roomCode || !session.playerId) return
        manager.updatePlayerMove(session.roomCode, session.playerId, msg.position, msg.yaw, msg.pitch)
        break
      }

      case 'REQUEST_QUESTION': {
        if (!session.roomCode || !session.playerId) return
        const res = manager.requestQuestion(session.roomCode, session.playerId, msg.preferredDifficulty)
        if (!res.ok) {
          send(ws, { type: 'ERROR', code: res.code, message: res.message })
        } else {
          send(ws, { type: 'QUESTION_ASSIGNED', question: res.question })
        }
        break
      }

      case 'SUBMIT_ANSWER': {
        if (!session.roomCode || !session.playerId) return
        const res = manager.submitAnswer(
          session.roomCode,
          session.playerId,
          msg.questionId,
          msg.selectedIndex,
        )
        if (!res.ok) {
          send(ws, { type: 'ERROR', code: res.code, message: res.message })
        } else {
          send(ws, { type: 'ANSWER_RESULT', result: res.result })
          broadcastToRoom(session.roomCode, { type: 'ROOM_STATE', room: res.snapshot })
        }
        break
      }

      case 'RELOAD': {
        if (!session.roomCode || !session.playerId) return
        const res = manager.startReload(session.roomCode, session.playerId)
        if (res.ok) {
          broadcastRoomState(session.roomCode)
        }
        break
      }

      case 'SHOOT': {
        if (!session.roomCode || !session.playerId) return
        const res = manager.shoot(session.roomCode, session.playerId, msg.origin, msg.direction)
        if (!res.ok) {
          // Silently ignore harmless fire-rate/reload race conditions; notify real errors
          if (res.code === 'NO_WEAPON') {
            send(ws, { type: 'ERROR', code: res.code, message: res.message })
          }
          return
        }

        broadcastToRoom(session.roomCode, { type: 'SHOT_FIRED', shot: res.outcome.shot })

        for (const hit of res.outcome.hits) {
          send(ws, { type: 'HIT_CONFIRMED', hit: hit.confirm })
          const victimSocket = playerSockets.get(hit.victimId)
          if (victimSocket) {
            send(victimSocket.ws, { type: 'DAMAGE_TAKEN', damage: hit.damageTaken })
          }
          if (hit.killEvent) {
            broadcastToRoom(session.roomCode, { type: 'KILL_EVENT', kill: hit.killEvent })
          }
        }

        if (res.scoreboardChanged) {
          broadcastRoomState(session.roomCode)
        }
        break
      }
    }
  })

  ws.on('close', () => {
    clients.delete(session)
    if (session.playerId && playerSockets.get(session.playerId) === session) {
      playerSockets.delete(session.playerId)
    }
    if (session.roomCode && session.playerId) {
      const updated = manager.markDisconnected(session.roomCode, session.playerId, false)
      if (updated) {
        broadcastToRoom(session.roomCode, { type: 'ROOM_STATE', room: updated })
      }
    }
  })
})

// 20 Hz Authoritative Simulation & Position Sync Loop
setInterval(() => {
  const transitions = manager.tick()
  for (const t of transitions) {
    if (t.type === 'MATCH_FINISHED' && t.summary) {
      const room = manager.getRoom(t.roomCode)
      if (room) {
        broadcastToRoom(t.roomCode, {
          type: 'MATCH_FINISHED',
          summary: t.summary,
          room: manager.buildSnapshot(room),
        })
      }
    } else if (t.type === 'PHASE_PLAYING' || t.type === 'RESPAWNED' || t.type === 'RELOADED') {
      broadcastRoomState(t.roomCode)
    }
  }

  // Broadcast low-overhead player positions for active matches
  const now = Date.now()
  for (const code of manager.getAllRoomCodes()) {
    const room = manager.getRoom(code)
    if (!room || (room.phase !== 'playing' && room.phase !== 'countdown')) continue
    const positions = Array.from(room.players.values()).map((p) => ({
      id: p.id,
      position: p.position,
      yaw: p.yaw,
      pitch: p.pitch,
      hp: p.hp,
      alive: p.alive,
      respawnAt: p.respawnAt,
      weapon: p.weapon,
      ammo: p.ammo,
      reloadingUntil: p.reloadingUntil,
    }))
    broadcastToRoom(code, { type: 'POSITIONS_SYNC', serverNow: now, positions })
  }
}, 50)

server.listen(PORT, () => {
  console.log(`[MATH RIVALS 3D] Authoritative Game Server listening on http://localhost:${PORT} (WS: /ws)`)
})
