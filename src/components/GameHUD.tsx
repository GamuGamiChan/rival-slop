import {
  Brain,
  Crosshair,
  Eye,
  Flame,
  Heart,
  Keyboard,
  Lock,
  Shield,
  Skull,
  Target,
  Unlock,
  Zap,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { AGENT_IDS, AGENTS } from '../../shared/agents.ts'
import { MobileControlsOverlay } from './MobileControlsOverlay.tsx'
import type { SkillSlot } from '../../shared/types.ts'
import { getMeleeSpecForTier, WEAPON_IDS, WEAPONS } from '../../shared/weapons.ts'
import { soundEngine } from '../game/sound.ts'
import { multiplayerClient } from '../multiplayer/client.ts'
import { selectMyPlayer, useGameStore } from '../store/useGameStore.ts'
import { FullscreenButton } from './FullscreenButton.tsx'

function formatTimer(ms: number): string {
  const clamped = Math.max(0, Math.ceil(ms / 1000))
  const min = Math.floor(clamped / 60)
  const sec = clamped % 60
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export function GameHUD() {
  const room = useGameStore((s) => s.room)
  const me = useGameStore(selectMyPlayer)
  const clockOffsetMs = useGameStore((s) => s.clockOffsetMs)
  const pointerLocked = useGameStore((s) => s.pointerLocked)
  const mathModalOpen = useGameStore((s) => s.mathModalOpen)
  const pauseOpen = useGameStore((s) => s.pauseOpen)
  const isAdsZoom = useGameStore((s) => s.isAdsZoom)
  const isSprinting = useGameStore((s) => s.isSprinting)
  const isSliding = useGameStore((s) => s.isSliding)
  const mobileControlsEnabled = useGameStore((s) => s.mobileControlsEnabled)
  const practiceMode = useGameStore((s) => s.practiceMode)
  const showControlsRef = useGameStore((s) => s.showControlsRef)
  const toggleControlsRef = useGameStore((s) => s.toggleControlsRef)
  const hitMarker = useGameStore((s) => s.hitMarker)
  const lastDamageTaken = useGameStore((s) => s.lastDamageTaken)
  const lastSkillBanner = useGameStore((s) => s.lastSkillBanner)
  const recentKills = useGameStore((s) => s.recentKills)
  const connectionStatus = useGameStore((s) => s.connectionStatus)
  const lastShotVisualAt = useGameStore((s) => s.lastShotVisualAt)
  const weaponPenalty = useGameStore((s) => s.weaponPenalty)

  const [nowTick, setNowTick] = useState(() => Date.now())
  const [perfNowTick, setPerfNowTick] = useState(() => performance.now())
  const lastBeepSecRef = useRef<number | null>(null)
  const prevPhaseRef = useRef<string | null>(null)

  useEffect(() => {
    const id = window.setInterval(() => {
      setNowTick(Date.now())
      setPerfNowTick(performance.now())
    }, 60)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (!room) return
    const serverNow = nowTick + clockOffsetMs
    if (room.phase === 'countdown' && room.countdownEndsAt) {
      const secLeft = Math.max(1, Math.ceil((room.countdownEndsAt - serverNow) / 1000))
      if (lastBeepSecRef.current !== secLeft) {
        lastBeepSecRef.current = secLeft
        soundEngine.playCountdown(false)
      }
    }
    if (prevPhaseRef.current === 'countdown' && room.phase === 'playing') {
      soundEngine.playCountdown(true)
      lastBeepSecRef.current = null
    }
    prevPhaseRef.current = room.phase
  }, [room, nowTick, clockOffsetMs])

  if (!room || !me) return null

  const serverNow = nowTick + clockOffsetMs
  const timeLeftMs =
    room.phase === 'playing' && room.matchEndsAt
      ? Math.max(0, room.matchEndsAt - serverNow)
      : room.matchDurationSec * 1000
  const roundLeftMs =
    room.phase === 'playing' && room.roundPhaseEndsAt
      ? Math.max(0, room.roundPhaseEndsAt - serverNow)
      : 0
  const roundLeftSec = Math.max(0, Math.ceil(roundLeftMs / 1000))
  const countdownSec =
    room.phase === 'countdown' && room.countdownEndsAt
      ? Math.max(1, Math.ceil((room.countdownEndsAt - serverNow) / 1000))
      : null

  const blueTotal = room.scoreboard
    .filter((s) => s.team === 'blue')
    .reduce((acc, s) => acc + s.totalScore, 0)
  const redTotal = room.scoreboard
    .filter((s) => s.team === 'red')
    .reduce((acc, s) => acc + s.totalScore, 0)

  const agentSpec = AGENTS[me.agent]
  const weaponSpec = me.weapon ? WEAPONS[me.weapon] : null
  const isReloading = Boolean(me.reloadingUntil && serverNow < me.reloadingUntil)
  const reloadProgress =
    isReloading && weaponSpec && me.reloadingUntil
      ? Math.max(0, Math.min(100, 100 - ((me.reloadingUntil - serverNow) / weaponSpec.reloadMs) * 100))
      : 0

  const qCdSec = Math.max(0, Math.ceil((me.skillQReadyAt - serverNow) / 1000))
  const cCdSec = Math.max(0, Math.ceil((me.skillCReadyAt - serverNow) / 1000))
  const ultReady = me.ultPoints >= me.ultMax

  const overdriveLeft =
    me.overdriveUntil && serverNow < me.overdriveUntil
      ? ((me.overdriveUntil - serverNow) / 1000).toFixed(1)
      : null
  const overshieldLeft =
    me.overshieldUntil && serverNow < me.overshieldUntil
      ? ((me.overshieldUntil - serverNow) / 1000).toFixed(1)
      : null
  const blindOpacity =
    me.blindedUntil && serverNow < me.blindedUntil
      ? Math.min(0.95, (me.blindedUntil - serverNow) / 1600)
      : 0
  const anyEnemyRevealed = room.players.some(
    (p) => p.team !== me.team && p.alive && p.revealedUntil && serverNow < p.revealedUntil,
  )

  const showHitMarker = hitMarker && nowTick - hitMarker.timestamp < 320
  const showDamageFlash = lastDamageTaken && nowTick - lastDamageTaken.timestamp < 380
  const showSkillToast = lastSkillBanner && nowTick - lastSkillBanner.receivedAt < 2200
  const showPenaltyBanner = Boolean(
    weaponPenalty && nowTick - weaponPenalty.timestamp < 3600 && !mathModalOpen,
  )
  const shotBloomPx =
    lastShotVisualAt > 0 && perfNowTick - lastShotVisualAt < 140
      ? Math.round((1 - (perfNowTick - lastShotVisualAt) / 140) * (isAdsZoom ? 5 : 9))
      : 0
  const respawnSec =
    !me.alive && me.respawnAt ? Math.max(0.1, (me.respawnAt - serverNow) / 1000).toFixed(1) : null
  const lowTime = !practiceMode && room.phase === 'playing' && timeLeftMs <= 15000

  const triggerSkillFromHud = (slot: SkillSlot) => {
    window.dispatchEvent(new CustomEvent('math-rivals-cast-skill', { detail: slot }))
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-20 select-none">
      {/* Vortex Flashpulse Blind Overlay */}
      {blindOpacity > 0 && (
        <div
          id="hud-blind-overlay"
          className="fixed inset-0 z-40 flex items-center justify-center bg-cyan-50 transition-opacity duration-100"
          style={{ opacity: blindOpacity }}
        >
          <span className="font-display text-3xl font-black tracking-[0.35em] text-cyan-950/60 uppercase">
            BLINDED
          </span>
        </div>
      )}

      {/* Damage Vignette Flash */}
      {showDamageFlash && (
        <div
          key={lastDamageTaken.timestamp}
          className="animate-damage-flash fixed inset-0 border-[12px] border-rose-500/80 shadow-[inset_0_0_90px_rgba(255,46,91,0.7)]"
        />
      )}

      {/* Overdrive Aura Edge Glow */}
      {overdriveLeft && (
        <div className="fixed inset-0 border-4 border-cyan-400/50 shadow-[inset_0_0_70px_rgba(0,229,255,0.28)]" />
      )}

      {/* Sniper Railgun Full-Scope Overlay */}
      {isAdsZoom && me.weapon === 'sniper' && me.alive && !mathModalOpen && !pauseOpen && (
        <div className="fixed inset-0 flex items-center justify-center">
          <div
            className="w-[min(78vh,78vw)] h-[min(78vh,78vw)] rounded-full border-2 border-rose-500/80 relative"
            style={{ boxShadow: '0 0 0 9999px rgba(3, 6, 14, 0.92)' }}
          >
            <div className="absolute inset-x-0 top-1/2 h-[1px] bg-rose-500/50" />
            <div className="absolute inset-y-0 left-1/2 w-[1px] bg-rose-500/50" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-rose-400" />
          </div>
        </div>
      )}

      {/* Reconnecting Warning Pill */}
      {connectionStatus === 'reconnecting' && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-amber-500/20 border border-amber-400 text-amber-200 font-display text-xs tracking-widest uppercase">
          RECONNECTING TO SERVER...
        </div>
      )}

      {/* TOP CENTER — Synchronized Round State, Combat Round Timer & Team Scores */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5">
        <div className="flex items-center gap-2">
          <div className="hud-panel hud-cut-sm border border-cyan-500/50 px-4 py-1.5 text-right min-w-[96px]">
            <div className="text-[9px] font-display tracking-[0.2em] text-cyan-400 uppercase">BLUE</div>
            <div className="font-display text-xl font-black text-white">{blueTotal}</div>
          </div>

          <div
            className={`hud-panel hud-cut px-6 py-2 border-2 text-center min-w-[164px] ${
              practiceMode
                ? 'border-emerald-400/70'
                : lowTime
                  ? 'border-rose-500 animate-pulse'
                  : 'border-slate-600/80'
            }`}
          >
            <div
              id="hud-round-state"
              data-round-state={room.roundState}
              data-round-number={room.roundNumber}
              data-max-rounds={room.maxRounds ?? 10}
              className="text-[9px] font-display tracking-[0.22em] text-cyan-300 uppercase"
            >
              {room.roundState === 'FREE_PLAY'
                ? 'FREE PLAY • ALL 8 WEAPONS UNLOCKED'
                : `ROUND ${room.roundNumber}/${room.maxRounds ?? 10} • ${room.roundState.replace('_', ' ')}`}
            </div>
            <div
              id="hud-match-timer"
              className={`font-display text-3xl font-black tracking-wider ${
                practiceMode || room.roundState === 'FREE_PLAY'
                  ? 'text-emerald-300'
                  : lowTime
                    ? 'text-rose-400'
                    : 'text-white'
              }`}
            >
              {practiceMode || room.roundState === 'FREE_PLAY' ? 'FREE' : formatTimer(timeLeftMs)}
            </div>
            {room.phase === 'playing' && room.roundState !== 'FREE_PLAY' && (
              <div
                id="hud-round-timer"
                className="text-[10px] font-mono text-amber-300 tracking-wider mt-0.5"
              >
                {room.roundState === 'COMBAT_ACTIVE'
                  ? `MATH CHALLENGE IN ${roundLeftSec}s`
                  : `PHASE TIMER: ${roundLeftSec}s`}
              </div>
            )}
          </div>

          <div className="hud-panel hud-cut-sm border border-rose-500/50 px-4 py-1.5 text-left min-w-[96px]">
            <div className="text-[9px] font-display tracking-[0.2em] text-rose-400 uppercase">RED</div>
            <div className="font-display text-xl font-black text-white">{redTotal}</div>
          </div>
        </div>

        {/* Active Buffs & Skill Cast Banner */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {overdriveLeft && (
            <span className="px-2.5 py-0.5 bg-cyan-500/25 border border-cyan-400 text-cyan-200 font-display text-[11px] font-bold flex items-center gap-1">
              <Zap className="w-3.5 h-3.5" /> OVERDRIVE {overdriveLeft}s
            </span>
          )}
          {overshieldLeft && (
            <span className="px-2.5 py-0.5 bg-emerald-500/25 border border-emerald-400 text-emerald-200 font-display text-[11px] font-bold flex items-center gap-1">
              <Shield className="w-3.5 h-3.5" /> TITAN SHIELD {overshieldLeft}s
            </span>
          )}
          {anyEnemyRevealed && (
            <span className="px-2.5 py-0.5 bg-orange-500/25 border border-orange-400 text-orange-200 font-display text-[11px] font-bold flex items-center gap-1">
              <Eye className="w-3.5 h-3.5" /> ENEMY REVEALED
            </span>
          )}
          {showSkillToast && (
            <span
              id="hud-skill-toast"
              className="px-3 py-0.5 bg-slate-950/85 border border-slate-600 text-xs font-display tracking-wider text-white uppercase"
            >
              <strong style={{ color: AGENTS[lastSkillBanner.agent].accentColor }}>
                {lastSkillBanner.playerName}
              </strong>{' '}
              USED {lastSkillBanner.skillName}
            </span>
          )}
        </div>
      </div>

      {/* TOP LEFT — Room Info, Pointer Lock Status Badge & Live Kill Feed */}
      <div className="fixed top-4 left-4 space-y-1.5 max-w-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span
            id="hud-agent-badge"
            data-agent={me.agent}
            className="text-[10px] font-display tracking-[0.2em] text-slate-300 uppercase px-2 py-0.5 bg-slate-950/80 border border-slate-700/80"
          >
            {practiceMode ? 'TRAINING RANGE' : `ROOM ${room.roomCode}`} • {agentSpec.name}
          </span>
          {practiceMode && (
            <button
              id="btn-practice-toggle-free"
              type="button"
              onClick={() => multiplayerClient.setPracticeFreePlay(room.roundState !== 'FREE_PLAY')}
              className={`pointer-events-auto text-[10px] font-display font-bold tracking-wider uppercase px-2 py-0.5 border transition cursor-pointer ${
                room.roundState === 'FREE_PLAY'
                  ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200 hover:bg-emerald-500/35'
                  : 'bg-amber-500/20 border-amber-400/70 text-amber-200 hover:bg-amber-500/30'
              }`}
            >
              {room.roundState === 'FREE_PLAY' ? 'FREE PRACTICE • SWITCH TO MATH DRILL' : 'SWITCH TO FREE WEAPONS'}
            </button>
          )}
          {!mobileControlsEnabled && (
            <span
              id="hud-pointer-lock-status"
              data-mouse-look-active={String(pointerLocked)}
              className={`inline-flex items-center gap-1 text-[10px] font-display tracking-wider uppercase px-2 py-0.5 border ${
                pointerLocked
                  ? 'bg-emerald-950/80 border-emerald-400/70 text-emerald-300'
                  : 'bg-slate-950/85 border-cyan-500/45 text-cyan-300'
              }`}
            >
              {pointerLocked ? <Lock className="w-2.5 h-2.5" /> : <Unlock className="w-2.5 h-2.5" />}
              {pointerLocked ? 'MOUSE LOOK ON [TAB: EXIT]' : 'PRESS [TAB] / CLICK TO LOOK'}
            </span>
          )}
        </div>
        {recentKills.slice(0, 4).map((k) => (
          <div
            key={k.id}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-950/85 border-l-2 border-cyan-400 text-xs backdrop-blur-sm"
          >
            <span className={k.killerTeam === 'blue' ? 'text-cyan-300 font-bold' : 'text-rose-400 font-bold'}>
              {k.killerName}
            </span>
            <span className="text-[10px] font-display text-amber-300 uppercase px-1">
              [
              {k.weapon === 'skill'
                ? (k.skillLabel ?? 'SKILL')
                : k.weapon === 'melee'
                  ? 'CYBER FISTS'
                  : WEAPONS[k.weapon].name.split(' ')[0]}
              ]
            </span>
            {k.headshot && <Target className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
            <span className={k.victimTeam === 'blue' ? 'text-cyan-300' : 'text-rose-400'}>
              {k.victimName}
            </span>
            <span className="text-[10px] font-display text-emerald-400 ml-1">+{k.pointsAwarded}</span>
          </div>
        ))}
      </div>

      {/* TOP RIGHT — Compact Live Leaderboard + Fullscreen + [H] In-Game Controls Reference */}
      <div className="fixed top-4 right-4 w-60 space-y-1.5 hidden sm:block">
        <div className="flex items-center justify-between gap-1 px-1 text-[10px] font-display tracking-[0.16em] text-slate-400 uppercase">
          <span className="truncate">{practiceMode ? 'TRAINING' : 'RANKING'}</span>
          <div className="flex items-center gap-1">
            <FullscreenButton id="btn-hud-fullscreen" compact />
            <button
              id="btn-hud-controls-ref"
              type="button"
              onClick={toggleControlsRef}
              className="pointer-events-auto inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-950/85 hover:bg-slate-800 border border-slate-700 text-cyan-300 cursor-pointer"
            >
              <Keyboard className="w-3 h-3" /> [H]
            </button>
          </div>
        </div>
        {room.scoreboard.slice(0, 5).map((entry) => {
          const isMe = entry.playerId === me.id
          return (
            <div
              key={entry.playerId}
              className={`flex items-center justify-between px-2.5 py-1.5 text-xs border-r-2 backdrop-blur-sm ${
                entry.team === 'blue' ? 'border-cyan-400' : 'border-rose-500'
              } ${isMe ? 'bg-slate-800/90 text-white' : 'bg-slate-950/80 text-slate-300'}`}
            >
              <div className="flex items-center gap-2 truncate">
                <span className="font-display font-bold text-amber-300 w-4">#{entry.rank}</span>
                <span className="truncate font-semibold">{entry.name}</span>
              </div>
              <span className="font-display font-bold text-white">{entry.totalScore}</span>
            </div>
          )
        })}

        {/* Toggleable In-Game Control Reference Card */}
        {showControlsRef && (
          <div
            id="hud-controls-ref"
            className="hud-panel hud-cut-sm border border-cyan-500/45 p-2.5 text-[11px] space-y-1 text-slate-200 mt-2"
          >
            <div className="font-display text-[10px] tracking-widest text-cyan-300 border-b border-slate-800 pb-1 uppercase">
              CONTROLS REFERENCE
            </div>
            <div className="flex justify-between"><span className="font-mono text-cyan-300">WASD</span><span>Move</span></div>
            <div className="flex justify-between"><span className="font-mono text-cyan-300">SHIFT</span><span>Sprint (Hold)</span></div>
            <div className="flex justify-between"><span className="font-mono text-cyan-300">CTRL</span><span>Aim Mode (Hold)</span></div>
            <div className="flex justify-between"><span className="font-mono text-cyan-300">LMB</span><span>Shoot</span></div>
            <div className="flex justify-between"><span className="font-mono text-cyan-300">R</span><span>Reload</span></div>
            <div className="flex justify-between"><span className="font-mono text-amber-300">Q C X</span><span>Agent Skills</span></div>
            <div className="flex justify-between"><span className="font-mono text-cyan-300">SPACE</span><span>Jump</span></div>
            <div className="flex justify-between"><span className="font-mono text-cyan-300">ESC / TAB</span><span>Pause / Score</span></div>
          </div>
        )}
      </div>

      {/* CENTER — Pre-Match 3-2-1 Countdown Overlay */}
      {room.phase === 'countdown' && countdownSec !== null && (
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-slate-950/35">
          <div className="font-display text-xs tracking-[0.35em] text-cyan-300 uppercase mb-2">
            AGENT {agentSpec.name} DEPLOYING • COMBAT ROUND → MATH CHALLENGE
          </div>
          <div
            id="hud-countdown-number"
            className="font-display text-8xl sm:text-9xl font-black text-white drop-shadow-[0_0_40px_rgba(0,229,255,0.85)]"
          >
            {countdownSec}
          </div>
          <div className="mt-4 px-4 py-2 bg-slate-950/85 border border-cyan-500/50 font-thai text-sm text-slate-200 text-center">
            ต่อสู้ให้จบแต่ละ Combat Round เพื่อเข้าสู่ช่วง Math Challenge ชิงอาวุธใหม่ (ตอบผิดถูกยึดอาวุธ &amp; -300 คะแนน!)
          </div>
        </div>
      )}

      {/* CENTER — Round Transition Banner (ROUND_START / ROUND_END / NEXT_ROUND) */}
      {room.phase === 'playing' &&
        !mathModalOpen &&
        (room.roundState === 'ROUND_START' ||
          room.roundState === 'ROUND_END' ||
          room.roundState === 'NEXT_ROUND') && (
          <div
            id="hud-round-transition-banner"
            className="fixed top-28 left-1/2 -translate-x-1/2 px-6 py-3 bg-slate-950/90 border-2 border-cyan-400 text-center shadow-[0_0_32px_rgba(0,229,255,0.45)]"
          >
            <div className="font-display text-xl font-black tracking-widest text-white uppercase">
              {room.roundState === 'ROUND_START'
                ? `ROUND ${room.roundNumber} — COMBAT STARTING`
                : room.roundState === 'ROUND_END'
                  ? `ROUND ${room.roundNumber} COMPLETE — MATH CHALLENGE INCOMING`
                  : `PREPARING ROUND ${room.roundNumber + 1}...`}
            </div>
            <div className="font-thai text-xs text-cyan-200 mt-0.5">
              {room.roundState === 'ROUND_END'
                ? 'ระบบหยุดการต่อสู้ชั่วคราว เตรียมตอบโจทย์คณิตศาสตร์พร้อมกันทุกคน!'
                : 'เตรียมพร้อมเข้าปะทะในสนามประลอง!'}
            </div>
          </div>
        )}

      {/* CENTER — Crosshair (Dynamic Firing Bloom + Precision Ctrl Aim Mode Reticle) + Hitmarker */}
      {room.phase === 'playing' && me.alive && !mathModalOpen && !pauseOpen && !(isAdsZoom && me.weapon === 'sniper') && (
        <div
          id="hud-crosshair"
          data-aim-mode={isAdsZoom ? 'true' : 'false'}
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
        >
          {me.weapon === 'shotgun' ? (
            <div
              className={`rounded-full border-2 flex items-center justify-center transition-all duration-75 ${
                isAdsZoom ? 'border-cyan-300' : 'border-amber-400/85'
              }`}
              style={{
                width: `${(isAdsZoom ? 28 : 36) + shotBloomPx * 2}px`,
                height: `${(isAdsZoom ? 28 : 36) + shotBloomPx * 2}px`,
              }}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-amber-300" />
            </div>
          ) : (
            <div
              className="relative flex items-center justify-center transition-all duration-75"
              style={{
                width: `${(isAdsZoom ? 20 : 28) + shotBloomPx * 2}px`,
                height: `${(isAdsZoom ? 20 : 28) + shotBloomPx * 2}px`,
              }}
            >
              {/* Ctrl Aim Mode Precision Outer Brackets */}
              {isAdsZoom && (
                <div
                  id="hud-aim-reticle"
                  className="absolute -inset-2.5 rounded-full border border-cyan-400/75 shadow-[0_0_12px_rgba(34,211,238,0.45)]"
                />
              )}
              <div
                className={`w-1.5 h-1.5 rounded-full ${
                  isAdsZoom
                    ? 'bg-emerald-300 shadow-[0_0_8px_#34d399]'
                    : 'bg-cyan-300 shadow-[0_0_6px_#00f0ff]'
                }`}
              />
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[2px] h-2 bg-white/95" />
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[2px] h-2 bg-white/95" />
              <div className="absolute left-0 top-1/2 -translate-y-1/2 h-[2px] w-2 bg-white/95" />
              <div className="absolute right-0 top-1/2 -translate-y-1/2 h-[2px] w-2 bg-white/95" />
            </div>
          )}

          {/* Center Reload Progress Bar right under Crosshair */}
          {isReloading && (
            <div className="mt-5 w-24 space-y-0.5 text-center">
              <div className="font-display text-[9px] font-bold tracking-widest text-amber-300 uppercase">
                RELOADING
              </div>
              <div className="h-1.5 bg-slate-950/90 border border-slate-700 overflow-hidden">
                <div className="h-full bg-amber-400" style={{ width: `${reloadProgress}%` }} />
              </div>
            </div>
          )}

          {/* Empty Magazine Clear Warning */}
          {!isReloading && me.weapon && me.ammo === 0 && (
            <div className="mt-5 px-2.5 py-0.5 bg-rose-950/90 border border-rose-400/80 font-display text-[10px] font-black tracking-wider text-rose-200 uppercase whitespace-nowrap">
              EMPTY • PRESS [R] TO RELOAD
            </div>
          )}

          {showHitMarker && (
            <div
              key={hitMarker.id}
              className="animate-hitmarker absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            >
              <div
                className={`w-6 h-6 relative ${
                  hitMarker.headshot || hitMarker.killed ? 'text-rose-500' : 'text-white'
                }`}
              >
                <span className="absolute inset-x-0 top-1/2 h-[2.5px] bg-current rotate-45" />
                <span className="absolute inset-x-0 top-1/2 h-[2.5px] bg-current -rotate-45" />
              </div>
              <div
                className={`absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap font-display text-xs font-black tracking-wider drop-shadow ${
                  hitMarker.killed
                    ? 'text-amber-300'
                    : hitMarker.headshot
                      ? 'text-rose-400'
                      : 'text-cyan-200'
                }`}
              >
                {hitMarker.killed
                  ? `${hitMarker.headshot ? 'HEADSHOT KILL' : 'ELIMINATED'} +${hitMarker.pointsAwarded}`
                  : `${hitMarker.headshot ? 'HEADSHOT ' : ''}-${hitMarker.damage}`}
              </div>
            </div>
          )}
        </div>
      )}

      {/* CENTER — Eliminated Respawn Overlay */}
      {room.phase === 'playing' && !me.alive && (
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-rose-950/35">
          <Skull className="w-12 h-12 text-rose-400 mb-2" />
          <div className="font-display text-3xl font-black text-white tracking-wider">
            ELIMINATED
          </div>
          {respawnSec && (
            <div className="font-display text-lg text-rose-300 mt-1">
              RESPAWNING IN {respawnSec}s
            </div>
          )}
        </div>
      )}

      {/* CENTER PROMPT — Weapon Confiscation Penalty Banner / Unarmed Notice (NO manual random weapon button!) */}
      {room.phase === 'playing' && me.alive && !mathModalOpen && !pauseOpen && (
        <div className="fixed bottom-32 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
          {showPenaltyBanner && weaponPenalty && (
            <div
              id="hud-weapon-penalty-banner"
              className="px-5 py-2.5 bg-rose-950/90 border-2 border-rose-500 text-rose-100 text-center shadow-[0_0_28px_rgba(244,63,94,0.6)] animate-bounce"
            >
              <div className="font-display text-sm font-black tracking-wider uppercase text-rose-300">
                WEAPON CONFISCATED • -{weaponPenalty.pointsDeducted} PTS
              </div>
              <div className="font-thai text-xs text-rose-100">
                ตอบคำถามผิด! อาวุธถูกยึด รอจบ Combat Round นี้เพื่อแก้ตัวใน Math Challenge รอบถัดไป
              </div>
            </div>
          )}
          {!me.weapon && !showPenaltyBanner && (
            <div
              id="hud-unarmed-notice"
              className="px-4 py-1.5 bg-rose-950/85 border border-rose-500/70 text-xs font-thai text-rose-200 flex items-center gap-2"
            >
              <Brain className="w-4 h-4 text-rose-400" />
              สถานะมือเปล่า (UNARMED) — รอจบ Combat Round ({roundLeftSec}s) เพื่อตอบคณิตรับอาวุธใหม่
            </div>
          )}
          {!pointerLocked && (
            <div className="px-4 py-1 bg-slate-950/85 border border-cyan-500/45 text-[11px] font-thai tracking-wide text-cyan-200">
              กด <strong className="font-display text-amber-300">[TAB]</strong> หรือคลิกสนามเพื่อเปิดโหมดหันด้วยเมาส์ (กด <strong className="font-display text-amber-300">[TAB]</strong> อีกครั้งเพื่อออก) • <strong className="font-display text-emerald-300">[CTRL]</strong> เล็ง • <strong className="font-display text-cyan-300">[SHIFT]</strong> วิ่ง
            </div>
          )}
        </div>
      )}

      {/* BOTTOM LEFT — Per-Round In-Game Style Switcher, HP, Personal Stats & Movement/Aim State Indicators */}
      <div className="fixed bottom-4 left-4 flex flex-col items-start gap-1.5">
        {/* Per-Round Style / Agent Switcher Dock (Available in EVERY Round & Practice Mode) */}
        {room.phase === 'playing' && !pauseOpen && !mathModalOpen && (
          <div
            id="hud-style-switcher"
            data-ui-interactive="true"
            className="pointer-events-auto hud-panel hud-cut-sm border border-slate-700/80 px-2 py-1.5 flex items-center gap-1"
          >
            <span className="text-[9px] font-display font-bold tracking-wider text-amber-300 uppercase mr-1">
              STYLE:
            </span>
            {AGENT_IDS.map((aid) => {
              const a = AGENTS[aid]
              const active = me.agent === aid
              return (
                <button
                  key={aid}
                  id={`btn-hud-style-${aid}`}
                  type="button"
                  onClick={() => multiplayerClient.selectAgent(aid)}
                  className={`px-1.5 py-0.5 text-[9px] font-display font-bold uppercase border transition cursor-pointer ${
                    active
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                  style={active ? { borderColor: a.accentColor, color: a.accentColor } : undefined}
                >
                  {a.name}
                </button>
              )
            })}
          </div>
        )}

        {/* Live Sprint & Ctrl Aim Mode Indicators */}
        <div className="flex items-center gap-1.5 min-h-[22px]">
          {isSprinting && (
            <span
              id="hud-sprint-indicator"
              className="px-2 py-0.5 bg-emerald-500/25 border border-emerald-400 text-emerald-200 font-display text-[10px] font-black tracking-widest uppercase"
            >
              SPRINT [SHIFT]
            </span>
          )}
          {isSliding && (
            <span
              id="hud-slide-indicator"
              className="px-2 py-0.5 bg-amber-500/30 border border-amber-400 text-amber-200 font-display text-[10px] font-black tracking-widest uppercase"
            >
              SLIDING [V]
            </span>
          )}
          {isAdsZoom && (
            <span
              id="hud-aim-indicator"
              className="px-2 py-0.5 bg-cyan-500/25 border border-cyan-400 text-cyan-200 font-display text-[10px] font-black tracking-widest uppercase"
            >
              AIM MODE [CTRL]
            </span>
          )}
        </div>

        <div className="hud-panel hud-cut border border-slate-700/80 p-3.5 min-w-[224px] space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Heart className="w-4 h-4 text-rose-500 fill-rose-500" />
              <span className="font-display text-2xl font-black text-white" id="hud-hp-value">
                {me.hp}
              </span>
              <span className="text-xs font-display text-slate-400">/ {me.maxHp}</span>
            </div>
            <span
              className={`px-2 py-0.5 text-[10px] font-display font-bold uppercase ${
                me.team === 'blue' ? 'bg-cyan-500/20 text-cyan-300' : 'bg-rose-500/20 text-rose-300'
              }`}
            >
              {me.team}
            </span>
          </div>

          <div className="h-2.5 w-full bg-slate-950 border border-slate-800 overflow-hidden">
            <div
              className={`h-full transition-all duration-150 ${
                me.maxHp > 100
                  ? 'bg-emerald-400'
                  : me.hp > 50
                    ? 'bg-cyan-400'
                    : me.hp > 25
                      ? 'bg-amber-400'
                      : 'bg-rose-500'
              }`}
              style={{ width: `${Math.max(0, Math.min(100, (me.hp / me.maxHp) * 100))}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs pt-0.5 border-t border-slate-800">
            <span className="text-slate-400">
              SCORE <strong className="font-display text-white ml-1" id="hud-my-score">{me.totalScore}</strong>
            </span>
            <span className="text-emerald-400 font-semibold">✓ {me.correctAnswers}</span>
            <span className="text-cyan-300 font-semibold">
              K/D {me.kills}/{me.deaths}
            </span>
          </div>
        </div>
      </div>

      {/* POST-10-ROUNDS & PRACTICE FREE PLAY WEAPON SELECTOR BAR (only visible in FREE_PLAY!) */}
      {room.phase === 'playing' && room.roundState === 'FREE_PLAY' && !pauseOpen && (
        <div
          id="hud-free-weapon-bar"
          data-ui-interactive="true"
          className="pointer-events-auto fixed bottom-24 left-1/2 -translate-x-1/2 hud-panel hud-cut-sm border border-emerald-400/70 px-3 py-2 flex flex-wrap items-center justify-center gap-1.5 max-w-[94vw] shadow-[0_0_30px_rgba(16,185,129,0.28)]"
        >
          <span className="text-[10px] font-display font-black tracking-wider text-emerald-300 uppercase mr-1">
            FREE WEAPONS:
          </span>
          {WEAPON_IDS.map((wid) => {
            const w = WEAPONS[wid]
            const active = me.weapon === wid
            return (
              <button
                key={wid}
                id={`btn-free-weapon-${wid}`}
                type="button"
                onClick={() => multiplayerClient.selectFreeWeapon(wid)}
                className={`px-2 py-1 text-[10px] font-display font-bold uppercase border transition cursor-pointer ${
                  active
                    ? 'bg-slate-900 text-white scale-105'
                    : 'bg-slate-950/85 border-slate-700 text-slate-300 hover:border-cyan-400'
                }`}
                style={active ? { borderColor: w.accentColor, color: w.accentColor } : undefined}
              >
                {wid.toUpperCase()}
              </button>
            )
          })}
          <button
            id="btn-free-weapon-fists"
            type="button"
            onClick={() => multiplayerClient.selectFreeWeapon(null)}
            className={`px-2 py-1 text-[10px] font-display font-bold uppercase border transition cursor-pointer ${
              me.weapon === null
                ? 'bg-rose-950 border-rose-400 text-rose-200 scale-105'
                : 'bg-slate-950/85 border-slate-700 text-rose-300 hover:border-rose-400'
            }`}
          >
            FISTS
          </button>
          {!practiceMode && me.isHost && (
            <button
              id="btn-free-play-lobby"
              type="button"
              onClick={() => multiplayerClient.returnToLobby()}
              className="ml-1 px-2.5 py-1 text-[10px] font-display font-black uppercase bg-cyan-500 hover:bg-cyan-400 text-slate-950 cursor-pointer"
            >
              LOBBY
            </button>
          )}
        </div>
      )}

      {/* BOTTOM CENTER — VALORANT-STYLE AGENT ABILITY DOCK (Q / C / X) */}
      {room.phase === 'playing' && !mobileControlsEnabled && (
        <div
          id="hud-ability-dock"
          className="pointer-events-auto fixed bottom-4 left-1/2 -translate-x-1/2 flex items-end gap-2"
        >
          {/* [Q] Skill */}
          <button
            id="btn-hud-skill-Q"
            type="button"
            disabled={
              !me.alive ||
              qCdSec > 0 ||
              (room.roundState !== 'COMBAT_ACTIVE' && room.roundState !== 'FREE_PLAY')
            }
            onClick={() => triggerSkillFromHud('Q')}
            className={`hud-panel hud-cut-sm border px-3 py-2 min-w-[106px] text-left transition cursor-pointer disabled:cursor-not-allowed ${
              qCdSec === 0
                ? 'border-slate-500 hover:border-cyan-300'
                : 'border-slate-800 opacity-65'
            }`}
          >
            <div className="flex items-center justify-between">
              <span
                className="px-1.5 py-0.5 text-[10px] font-display font-black text-slate-950"
                style={{ backgroundColor: qCdSec === 0 ? agentSpec.skills.Q.accentColor : '#475569' }}
              >
                Q
              </span>
              <span className="font-display text-xs font-bold text-white" id="hud-skill-Q-status">
                {qCdSec > 0 ? `${qCdSec}s` : 'READY'}
              </span>
            </div>
            <div className="font-display text-[10px] font-bold text-slate-200 truncate mt-1.5 uppercase">
              {agentSpec.skills.Q.name}
            </div>
          </button>

          {/* [C] Skill */}
          <button
            id="btn-hud-skill-C"
            type="button"
            disabled={
              !me.alive ||
              cCdSec > 0 ||
              (room.roundState !== 'COMBAT_ACTIVE' && room.roundState !== 'FREE_PLAY')
            }
            onClick={() => triggerSkillFromHud('C')}
            className={`hud-panel hud-cut-sm border px-3 py-2 min-w-[106px] text-left transition cursor-pointer disabled:cursor-not-allowed ${
              cCdSec === 0
                ? 'border-slate-500 hover:border-cyan-300'
                : 'border-slate-800 opacity-65'
            }`}
          >
            <div className="flex items-center justify-between">
              <span
                className="px-1.5 py-0.5 text-[10px] font-display font-black text-slate-950"
                style={{ backgroundColor: cCdSec === 0 ? agentSpec.skills.C.accentColor : '#475569' }}
              >
                C
              </span>
              <span className="font-display text-xs font-bold text-white" id="hud-skill-C-status">
                {cCdSec > 0 ? `${cCdSec}s` : 'READY'}
              </span>
            </div>
            <div className="font-display text-[10px] font-bold text-slate-200 truncate mt-1.5 uppercase">
              {agentSpec.skills.C.name}
            </div>
          </button>

          {/* [X] ULTIMATE (4-Pip Charge Meter) */}
          <button
            id="btn-hud-skill-X"
            type="button"
            disabled={
              !me.alive ||
              !ultReady ||
              (room.roundState !== 'COMBAT_ACTIVE' && room.roundState !== 'FREE_PLAY')
            }
            onClick={() => triggerSkillFromHud('X')}
            className={`hud-panel hud-cut-sm border px-3.5 py-2 min-w-[132px] text-left transition cursor-pointer disabled:cursor-not-allowed ${
              ultReady
                ? 'border-amber-400 shadow-[0_0_24px_rgba(251,191,36,0.4)]'
                : 'border-slate-800 opacity-75'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className="px-1.5 py-0.5 text-[10px] font-display font-black text-slate-950"
                style={{ backgroundColor: ultReady ? '#fbbf24' : '#475569' }}
              >
                X
              </span>
              <div className="flex items-center gap-1" id="hud-ult-pips">
                {Array.from({ length: me.ultMax }).map((_, i) => (
                  <span
                    key={i}
                    className={`h-2.5 w-2.5 rotate-45 border ${
                      i < me.ultPoints
                        ? 'bg-amber-400 border-amber-200'
                        : 'bg-slate-900 border-slate-600'
                    }`}
                  />
                ))}
              </div>
            </div>
            <div className="font-display text-[10px] font-bold truncate mt-1.5 uppercase text-amber-200">
              {ultReady ? `ULT: ${agentSpec.skills.X.name}` : `ULT ${me.ultPoints}/${me.ultMax}`}
            </div>
          </button>
        </div>
      )}

      {/* BOTTOM RIGHT — Equipped Weapon & Ammo (NO Manual Random Weapon Button!) */}
      <div className="fixed bottom-4 right-4 flex flex-col items-end gap-2">
        <div className="hud-panel hud-cut border border-slate-700/80 p-3.5 min-w-[230px] space-y-1.5">
          {weaponSpec ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div
                    className="font-display text-sm font-black tracking-wide uppercase"
                    id="hud-weapon-name"
                    style={{ color: weaponSpec.accentColor }}
                  >
                    {weaponSpec.name}
                  </div>
                  <div className="text-[10px] font-display tracking-widest text-slate-400 uppercase">
                    {weaponSpec.category}
                  </div>
                </div>
                {me.streak >= 2 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/20 border border-amber-400/50 text-amber-300 text-[10px] font-display font-bold">
                    <Flame className="w-3 h-3" /> {me.streak}x
                  </span>
                )}
              </div>

              {isReloading ? (
                <div className="space-y-1">
                  <div className="font-display text-xs tracking-widest text-amber-300 uppercase">
                    RELOADING...
                  </div>
                  <div className="h-2 bg-slate-950 border border-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-amber-400 transition-all duration-75"
                      style={{ width: `${reloadProgress}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex items-baseline justify-between">
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-display text-3xl font-black text-white" id="hud-ammo-value">
                      {me.ammo}
                    </span>
                    <span className="font-display text-sm text-slate-400">/ {weaponSpec.magSize}</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">
                    [R] RELOAD
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-1 py-0.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-display text-sm font-bold text-rose-400 uppercase" id="hud-weapon-name">
                    NO WEAPON EQUIPPED
                  </div>
                  <div className="text-[10px] font-display tracking-widest text-amber-300 uppercase">
                    {getMeleeSpecForTier(me.meleeTier).name.toUpperCase()} • MELEE (DMG {getMeleeSpecForTier(me.meleeTier).damage} / HS {getMeleeSpecForTier(me.meleeTier).headshotDamage})
                  </div>
                </div>
                <Crosshair className="w-5 h-5 text-rose-400" />
              </div>
              <div className="flex items-baseline justify-between pt-0.5">
                <span className="font-display text-xl font-black text-rose-200" id="hud-ammo-value">
                  ∞ {me.meleeTier >= 3 ? 'KATANA LV.3' : me.meleeTier === 2 ? 'BLADE LV.2' : 'FISTS'}
                </span>
                <span className="font-thai text-[11px] text-rose-200">
                  คลิกซ้ายต่อยระยะ 3.4m
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <MobileControlsOverlay />
    </div>
  )
}
