import type { ClientMessage, ServerMessage } from '../../shared/types.ts'
import { loadSession, useGameStore } from '../store/useGameStore.ts'

export function resolveWebSocketUrl(): string {
  const configured = import.meta.env.VITE_WS_URL?.trim()
  if (configured) return configured
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/ws`
}

export class WebSocketAdapter {
  private ws: WebSocket | null = null
  private reconnectTimer: number | null = null
  private pingTimer: number | null = null
  private manualClose = false
  private pendingQueue: ClientMessage[] = []
  private connectPromise: Promise<void> | null = null
  private onMessageCallback: ((msg: ServerMessage) => void) | null = null

  setMessageHandler(handler: (msg: ServerMessage) => void): void {
    this.onMessageCallback = handler
  }

  async ensureConnected(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return
    if (this.connectPromise) return this.connectPromise

    this.manualClose = false
    const store = useGameStore.getState()
    store.setConnectionStatus(store.connectionStatus === 'reconnecting' ? 'reconnecting' : 'connecting')

    this.connectPromise = new Promise<void>((resolve, reject) => {
      const url = resolveWebSocketUrl()
      const ws = new WebSocket(url)
      this.ws = ws

      let settled = false
      const timeoutId = window.setTimeout(() => {
        if (!settled) {
          settled = true
          ws.close()
          reject(new Error('เชื่อมต่อ Game Server ไม่สำเร็จ (Timeout) กรุณาตรวจสอบว่า Server ทำงานอยู่'))
        }
      }, 6000)

      ws.onopen = () => {
        window.clearTimeout(timeoutId)
        settled = true
        this.connectPromise = null
        useGameStore.getState().setConnectionStatus('connected')
        useGameStore.getState().setError(null)

        // Start clock sync heartbeat
        this.startPingLoop()

        // Flush queued messages
        const queued = [...this.pendingQueue]
        this.pendingQueue = []
        for (const m of queued) {
          this.sendRaw(m)
        }
        resolve()
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data)) as ServerMessage
          this.onMessageCallback?.(msg)
        } catch {
          // Ignore malformed message
        }
      }

      ws.onerror = () => {
        if (!settled) {
          window.clearTimeout(timeoutId)
          settled = true
          this.connectPromise = null
          useGameStore.getState().setConnectionStatus('disconnected')
          reject(new Error('ไม่สามารถเชื่อมต่อ WebSocket Game Server ได้'))
        }
      }

      ws.onclose = () => {
        this.stopPingLoop()
        this.ws = null
        this.connectPromise = null
        if (this.manualClose) {
          useGameStore.getState().setConnectionStatus('disconnected')
          return
        }

        // Auto-reconnect if we are inside an active room/session
        const saved = loadSession()
        const currentRoom = useGameStore.getState().room
        if (saved && currentRoom) {
          useGameStore.getState().setConnectionStatus('reconnecting')
          this.scheduleReconnect(saved.roomCode, saved.playerId, saved.sessionToken)
        } else {
          useGameStore.getState().setConnectionStatus('disconnected')
        }
      }
    })

    return this.connectPromise
  }

  private scheduleReconnect(roomCode: string, playerId: string, sessionToken: string): void {
    if (this.reconnectTimer !== null) return
    this.reconnectTimer = window.setTimeout(async () => {
      this.reconnectTimer = null
      try {
        await this.ensureConnected()
        this.sendRaw({
          type: 'RECONNECT',
          roomCode,
          playerId,
          sessionToken,
        })
      } catch {
        // Retry if still not manually closed
        if (!this.manualClose && loadSession()) {
          this.scheduleReconnect(roomCode, playerId, sessionToken)
        }
      }
    }, 1200)
  }

  private startPingLoop(): void {
    this.stopPingLoop()
    this.sendRaw({ type: 'PING', clientTime: Date.now() })
    this.pingTimer = window.setInterval(() => {
      this.sendRaw({ type: 'PING', clientTime: Date.now() })
    }, 5000)
  }

  private stopPingLoop(): void {
    if (this.pingTimer !== null) {
      window.clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }

  sendRaw(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    } else if (msg.type !== 'PLAYER_MOVE' && msg.type !== 'PING') {
      this.pendingQueue.push(msg)
    }
  }

  disconnect(): void {
    this.manualClose = true
    this.stopPingLoop()
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.pendingQueue = []
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect')
      this.ws = null
    }
    useGameStore.getState().setConnectionStatus('disconnected')
  }
}
