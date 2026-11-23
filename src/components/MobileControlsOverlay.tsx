import { Crosshair, Pause, RotateCw, Shield, Sparkles, Target, Zap } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { AGENTS } from '../../shared/agents.ts'
import type { SkillSlot } from '../../shared/types.ts'
import { mobileInput, resetMobileInput } from '../game/mobileControlsState.ts'
import { selectMyPlayer, useGameStore } from '../store/useGameStore.ts'

export function MobileControlsOverlay() {
  const mobileControlsEnabled = useGameStore((s) => s.mobileControlsEnabled)
  const room = useGameStore((s) => s.room)
  const me = useGameStore(selectMyPlayer)
  const mathModalOpen = useGameStore((s) => s.mathModalOpen)
  const pauseOpen = useGameStore((s) => s.pauseOpen)
  const setPauseOpen = useGameStore((s) => s.setPauseOpen)
  const isAdsZoom = useGameStore((s) => s.isAdsZoom)

  const [thumbOffset, setThumbOffset] = useState({ x: 0, y: 0 })
  const joyPointerIdRef = useRef<number | null>(null)
  const joyCenterRef = useRef({ x: 0, y: 0 })
  const lookPointerIdRef = useRef<number | null>(null)
  const lookLastRef = useRef({ x: 0, y: 0 })
  const joyBaseRef = useRef<HTMLDivElement | null>(null)

  const visible =
    mobileControlsEnabled &&
    Boolean(room) &&
    Boolean(me) &&
    room?.phase === 'playing' &&
    (room.roundState === 'COMBAT_ACTIVE' || room.roundState === 'FREE_PLAY') &&
    !mathModalOpen &&
    !pauseOpen

  useEffect(() => {
    if (!visible) {
      resetMobileInput()
      joyPointerIdRef.current = null
      lookPointerIdRef.current = null
    }
  }, [visible])

  if (!visible || !me) return null

  const agent = AGENTS[me.agent]
  const maxRadius = 46

  const updateJoystick = (clientX: number, clientY: number) => {
    const dx = clientX - joyCenterRef.current.x
    const dy = clientY - joyCenterRef.current.y
    const dist = Math.hypot(dx, dy)
    const clamped = Math.min(dist, maxRadius)
    const angle = Math.atan2(dy, dx)
    const cx = Math.cos(angle) * clamped
    const cy = Math.sin(angle) * clamped
    setThumbOffset({ x: cx, y: cy })
    mobileInput.moveX = cx / maxRadius
    mobileInput.moveY = -cy / maxRadius
  }

  const handleJoyDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (joyPointerIdRef.current !== null) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    joyPointerIdRef.current = e.pointerId
    const rect = joyBaseRef.current?.getBoundingClientRect()
    if (rect) {
      joyCenterRef.current = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      }
    } else {
      joyCenterRef.current = { x: e.clientX, y: e.clientY }
    }
    updateJoystick(e.clientX, e.clientY)
  }

  const handleJoyMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (joyPointerIdRef.current !== e.pointerId) return
    e.stopPropagation()
    updateJoystick(e.clientX, e.clientY)
  }

  const handleJoyUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (joyPointerIdRef.current !== e.pointerId) return
    e.stopPropagation()
    joyPointerIdRef.current = null
    setThumbOffset({ x: 0, y: 0 })
    mobileInput.moveX = 0
    mobileInput.moveY = 0
  }

  const handleLookDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (lookPointerIdRef.current !== null) return
    e.currentTarget.setPointerCapture(e.pointerId)
    lookPointerIdRef.current = e.pointerId
    lookLastRef.current = { x: e.clientX, y: e.clientY }
  }

  const handleLookMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (lookPointerIdRef.current !== e.pointerId) return
    const dx = e.clientX - lookLastRef.current.x
    const dy = e.clientY - lookLastRef.current.y
    lookLastRef.current = { x: e.clientX, y: e.clientY }
    mobileInput.lookDeltaYaw -= dx * 1.9
    mobileInput.lookDeltaPitch += dy * 1.9
  }

  const handleLookUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (lookPointerIdRef.current !== e.pointerId) return
    lookPointerIdRef.current = null
  }

  const triggerSkill = (slot: SkillSlot) => {
    mobileInput.pendingSkill = slot
  }

  const ultReady = me.ultPoints >= me.ultMax

  return (
    <div
      id="mobile-controls-overlay"
      className="fixed inset-0 z-20 pointer-events-none select-none touch-none"
    >
      {/* Right-half invisible touch-look pad */}
      <div
        id="mobile-look-zone"
        onPointerDown={handleLookDown}
        onPointerMove={handleLookMove}
        onPointerUp={handleLookUp}
        onPointerCancel={handleLookUp}
        className="pointer-events-auto absolute top-16 right-0 bottom-0 left-[40%] touch-none"
      />

      {/* Mobile Top-Left Pause button */}
      <button
        id="btn-mobile-pause"
        type="button"
        onPointerDown={(e) => {
          e.stopPropagation()
          setPauseOpen(true)
        }}
        className="pointer-events-auto absolute top-16 left-3 h-10 w-10 rounded-full bg-slate-950/80 border border-slate-700 text-slate-200 flex items-center justify-center active:scale-95"
        aria-label="Pause Menu"
      >
        <Pause className="w-4 h-4" />
      </button>

      {/* Left Virtual Joystick */}
      <div
        id="mobile-joystick-zone"
        ref={joyBaseRef}
        onPointerDown={handleJoyDown}
        onPointerMove={handleJoyMove}
        onPointerUp={handleJoyUp}
        onPointerCancel={handleJoyUp}
        className="pointer-events-auto absolute left-5 bottom-24 h-32 w-32 rounded-full bg-slate-950/55 border-2 border-cyan-400/55 backdrop-blur-sm flex items-center justify-center touch-none shadow-[0_0_24px_rgba(0,229,255,0.18)]"
      >
        <div className="h-14 w-14 rounded-full border border-cyan-400/30 pointer-events-none" />
        <div
          id="mobile-joystick-thumb"
          className="absolute h-14 w-14 rounded-full bg-cyan-400/80 border-2 border-white shadow-[0_0_16px_rgba(0,229,255,0.65)] pointer-events-none"
          style={{
            transform: `translate(${thumbOffset.x}px, ${thumbOffset.y}px)`,
          }}
        />
      </div>

      {/* Right Action Buttons */}
      <div className="pointer-events-auto absolute right-4 bottom-24 flex flex-col items-end gap-2.5 touch-none">
        {/* Skill Row: Q / C / X */}
        <div className="flex items-center gap-2">
          <button
            id="btn-mobile-skill-Q"
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation()
              triggerSkill('Q')
            }}
            className="h-11 w-11 rounded-full bg-slate-950/85 border border-cyan-400/60 text-cyan-200 font-display text-xs font-black flex flex-col items-center justify-center active:scale-90"
          >
            <Shield className="w-3.5 h-3.5" />
            <span className="text-[9px]">Q</span>
          </button>
          <button
            id="btn-mobile-skill-C"
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation()
              triggerSkill('C')
            }}
            className="h-11 w-11 rounded-full bg-slate-950/85 border border-amber-400/60 text-amber-200 font-display text-xs font-black flex flex-col items-center justify-center active:scale-90"
          >
            <Zap className="w-3.5 h-3.5" />
            <span className="text-[9px]">C</span>
          </button>
          <button
            id="btn-mobile-skill-X"
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation()
              triggerSkill('X')
            }}
            className={`h-11 w-11 rounded-full border font-display text-xs font-black flex flex-col items-center justify-center active:scale-90 ${
              ultReady
                ? 'bg-emerald-500/85 border-white text-slate-950 shadow-[0_0_16px_rgba(16,185,129,0.7)]'
                : 'bg-slate-950/85 border-slate-700 text-slate-400'
            }`}
            title={agent.skills.X.name}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="text-[9px]">X</span>
          </button>
        </div>

        {/* Combat Row: Reload / Aim / Jump + Big Fire */}
        <div className="flex items-end gap-2.5">
          <button
            id="btn-mobile-reload"
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation()
              mobileInput.pendingReload = true
            }}
            className="h-12 w-12 rounded-full bg-slate-950/80 border border-slate-600 text-slate-200 flex items-center justify-center active:scale-90"
            aria-label="Reload"
          >
            <RotateCw className="w-5 h-5" />
          </button>

          <button
            id="btn-mobile-aim"
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation()
              mobileInput.aiming = !mobileInput.aiming
            }}
            className={`h-12 w-12 rounded-full border flex items-center justify-center active:scale-90 ${
              isAdsZoom
                ? 'bg-cyan-500 border-white text-slate-950'
                : 'bg-slate-950/80 border-cyan-400/60 text-cyan-200'
            }`}
            aria-label="Toggle Aim"
          >
            <Target className="w-5 h-5" />
          </button>

          <button
            id="btn-mobile-jump"
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation()
              mobileInput.jumping = true
            }}
            className="h-12 w-12 rounded-full bg-slate-950/80 border border-emerald-400/60 text-emerald-200 font-display text-[10px] font-black flex items-center justify-center active:scale-90"
          >
            JUMP
          </button>

          <button
            id="btn-mobile-fire"
            type="button"
            onPointerDown={(e) => {
              e.stopPropagation()
              e.currentTarget.setPointerCapture(e.pointerId)
              mobileInput.firing = true
            }}
            onPointerUp={(e) => {
              e.stopPropagation()
              mobileInput.firing = false
            }}
            onPointerCancel={(e) => {
              e.stopPropagation()
              mobileInput.firing = false
            }}
            className="h-20 w-20 rounded-full bg-rose-600/90 active:bg-rose-500 border-2 border-rose-200 text-white font-display font-black text-xs tracking-wider uppercase flex flex-col items-center justify-center gap-1 shadow-[0_0_26px_rgba(244,63,94,0.65)] active:scale-95"
          >
            <Crosshair className="w-6 h-6" />
            <span>{me.weapon ? 'FIRE' : 'PUNCH'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
