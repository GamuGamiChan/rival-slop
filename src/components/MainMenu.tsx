import {
  BookOpen,
  Bot,
  Box,
  Crosshair,
  GraduationCap,
  Keyboard,
  Play,
  RotateCcw,
  Shield,
  Smartphone,
  Sparkles,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react'
import { useState } from 'react'
import { AGENT_IDS, AGENTS } from '../../shared/agents.ts'
import { REWARD_WEAPON_POOL, WEAPONS } from '../../shared/weapons.ts'
import {
  getAllQuestionSets,
  getQuestionSetById,
  loadSelectedQuestionSetId,
  saveSelectedQuestionSetId,
} from '../game/questionSetStore.ts'
import { multiplayerClient } from '../multiplayer/client.ts'
import type { AiDifficulty } from '../multiplayer/vsAiAdapter.ts'
import { loadSession, useGameStore } from '../store/useGameStore.ts'
import { FullscreenButton } from './FullscreenButton.tsx'

export function MainMenu() {
  const playerName = useGameStore((s) => s.playerName)
  const setPlayerName = useGameStore((s) => s.setPlayerName)
  const setScreen = useGameStore((s) => s.setScreen)
  const setControlsGuideOpen = useGameStore((s) => s.setControlsGuideOpen)
  const setCreditsModalOpen = useGameStore((s) => s.setCreditsModalOpen)
  const setQuestionEditorOpen = useGameStore((s) => s.setQuestionEditorOpen)
  const questionSetsVersion = useGameStore((s) => s.questionSetsVersion)
  const bumpQuestionSetsVersion = useGameStore((s) => s.bumpQuestionSetsVersion)
  const muted = useGameStore((s) => s.muted)
  const setMuted = useGameStore((s) => s.setMuted)
  const errorMessage = useGameStore((s) => s.errorMessage)
  const transportMode = useGameStore((s) => s.transportMode)
  const [savedSession] = useState(() => loadSession())
  const [reconnecting, setReconnecting] = useState(false)
  const [aiDifficulty, setAiDifficulty] = useState<AiDifficulty>('medium')
  const [aiTeamSize, setAiTeamSize] = useState<1 | 2>(1)

  const selectedSetId = questionSetsVersion >= 0 ? loadSelectedQuestionSetId() : loadSelectedQuestionSetId()
  const allQuestionSets = getAllQuestionSets()
  const activeQuestionSet = getQuestionSetById(selectedSetId)

  const handleQuickCreate = async () => {
    const name = playerName.trim() || `Rival_${Math.floor(100 + Math.random() * 900)}`
    setPlayerName(name)
    await multiplayerClient.createRoom(name, activeQuestionSet)
  }

  const handleStartVsAi = () => {
    const name = playerName.trim() || `Rival_${Math.floor(100 + Math.random() * 900)}`
    setPlayerName(name)
    multiplayerClient.startVsAiMode(name, aiDifficulty, activeQuestionSet, aiTeamSize)
  }

  const handleStartPractice = () => {
    const name = playerName.trim() || 'Trainee'
    setPlayerName(name)
    multiplayerClient.startPracticeMode(name, false)
  }

  const handleStartFreePractice = () => {
    const name = playerName.trim() || 'Trainee'
    setPlayerName(name)
    multiplayerClient.startPracticeMode(name, true)
  }

  const handleReconnect = async () => {
    setReconnecting(true)
    const ok = await multiplayerClient.tryReconnectSavedSession()
    if (!ok) {
      useGameStore.getState().setError('เชื่อมต่อห้องเดิมไม่สำเร็จ กรุณาลองกดอีกครั้ง')
    }
    setReconnecting(false)
  }

  return (
    <div className="relative z-10 flex flex-col justify-between h-full w-full p-5 md:p-8 bg-gradient-to-r from-[#060d1c]/88 via-[#060d1c]/52 to-[#060d1c]/80 overflow-y-auto">
      {/* Top Bar */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 hud-cut-sm bg-cyan-500/20 border border-cyan-400/60 flex items-center justify-center">
            <Crosshair className="w-5 h-5 text-cyan-300" />
          </div>
          <div>
            <div className="font-display text-xs tracking-[0.28em] text-cyan-400 uppercase">
              GRADE 10 TERM 2 • ค31102
            </div>
            <div className="font-thai text-xs text-slate-300">
              หลักการนับเบื้องต้น • Combat Round → Math Challenge → Weapon Reward
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold tracking-wider uppercase bg-slate-900/80 border border-slate-700/80 text-slate-300 hud-cut-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            {transportMode === 'supabase'
              ? 'Supabase Realtime'
              : transportMode === 'p2p'
                ? 'WebRTC P2P Online'
                : 'Authoritative WS'}
          </span>
          <FullscreenButton id="btn-menu-fullscreen" />
          <button
            id="btn-toggle-mobile-controls"
            type="button"
            onClick={() =>
              useGameStore
                .getState()
                .setMobileControlsEnabled(!useGameStore.getState().mobileControlsEnabled)
            }
            className={`px-3 py-2 border hud-cut-sm flex items-center gap-1.5 text-xs font-display tracking-wider uppercase transition cursor-pointer ${
              useGameStore((s) => s.mobileControlsEnabled)
                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                : 'bg-slate-900/85 hover:bg-slate-800 border-slate-700 text-slate-300'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            {useGameStore((s) => s.mobileControlsEnabled) ? 'MOBILE: ON' : 'MOBILE: OFF'}
          </button>
          <button
            id="btn-menu-credits"
            type="button"
            onClick={() => setCreditsModalOpen(true)}
            className="px-3 py-2 bg-slate-900/85 hover:bg-slate-800 border border-emerald-500/45 text-emerald-200 hud-cut-sm flex items-center gap-1.5 text-xs font-display tracking-wider uppercase transition cursor-pointer"
          >
            <Box className="w-4 h-4 text-emerald-300" /> 3D ASSETS &amp; CREDITS
          </button>
          <button
            id="btn-menu-controls"
            type="button"
            onClick={() => setControlsGuideOpen(true)}
            className="px-3 py-2 bg-slate-900/85 hover:bg-slate-800 border border-cyan-500/45 text-cyan-200 hud-cut-sm flex items-center gap-1.5 text-xs font-display tracking-wider uppercase transition cursor-pointer"
          >
            <Keyboard className="w-4 h-4 text-cyan-300" /> CONTROLS &amp; SETTINGS
          </button>
          <button
            id="btn-toggle-mute"
            type="button"
            onClick={() => setMuted(!muted)}
            className="p-2.5 bg-slate-900/85 hover:bg-slate-800 border border-slate-700/80 text-slate-200 hud-cut-sm transition cursor-pointer"
            aria-label={muted ? 'Unmute audio' : 'Mute audio'}
          >
            {muted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-cyan-300" />}
          </button>
        </div>
      </header>

      {/* Main Hero */}
      <main className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center my-auto max-w-6xl w-full mx-auto py-4">
        <section className="lg:col-span-6 space-y-5">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-cyan-500/15 border border-cyan-400/40 text-cyan-300 text-xs font-display tracking-[0.22em] uppercase">
              <Zap className="w-3.5 h-3.5" /> ROUND-SYNCHRONIZED TACTICAL MATH FPS
            </div>
            <h1 className="font-display text-5xl sm:text-6xl font-black tracking-tight text-white leading-[0.95] drop-shadow-[0_6px_28px_rgba(0,229,255,0.28)]">
              MATH <span className="text-cyan-400">RIVALS</span>{' '}
              <span className="text-rose-500">3D</span>
            </h1>
            <p className="font-thai text-slate-300 text-sm sm:text-base max-w-xl leading-relaxed">
              สู้กันครบ <strong className="text-cyan-300">10 ตา (10 Rounds)</strong> เมื่อจบแต่ละรอบจะเปิด{' '}
              <strong className="text-amber-300">Math Challenge</strong> พร้อมกันทั้งห้อง — ตอบถูกสุ่มรับปืนไซไฟ{' '}
              <strong className="text-emerald-300">8 ชนิด</strong> (Pistol / Revolver / SMG / Rifle / Burst / Shotgun /
              LMG / Sniper) ตอบผิด <strong className="text-rose-400">ยึดปืนเหลือหมัดมือเปล่า (Cyber Fists) และหัก 300 คะแนน!</strong>
            </p>
          </div>

          <div className="hud-panel hud-cut border border-slate-700/70 p-5 max-w-lg space-y-3.5">
            <div className="space-y-1.5">
              <label
                htmlFor="input-player-name"
                className="block text-xs font-display tracking-[0.2em] text-slate-400 uppercase"
              >
                PLAYER CALLSIGN
              </label>
              <input
                id="input-player-name"
                type="text"
                maxLength={18}
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="ใส่ชื่อผู้เล่น เช่น NeonMath01"
                className="w-full px-4 py-3 bg-slate-950/90 border border-slate-700 focus:border-cyan-400 focus:outline-none text-white font-semibold tracking-wide text-base placeholder:text-slate-500"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="select-question-set"
                  className="block text-xs font-display tracking-[0.18em] text-slate-400 uppercase"
                >
                  QUESTION SET (ชุดโจทย์ที่ใช้แข่ง)
                </label>
                <button
                  id="btn-menu-question-editor"
                  type="button"
                  onClick={() => setQuestionEditorOpen(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-cyan-500/50 text-cyan-300 text-[11px] font-thai font-bold transition cursor-pointer"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  ออกแบบ / แก้ไขชุดโจทย์
                </button>
              </div>
              <select
                id="select-question-set"
                value={activeQuestionSet.id}
                onChange={(e) => {
                  saveSelectedQuestionSetId(e.target.value)
                  bumpQuestionSetsVersion()
                }}
                className="w-full px-3.5 py-2.5 bg-slate-950/90 border border-slate-700 focus:border-cyan-400 focus:outline-none text-white font-thai text-sm"
              >
                {allQuestionSets.map((setItem) => (
                  <option key={setItem.id} value={setItem.id}>
                    {setItem.builtIn ? '[มาตรฐาน]' : '[กำหนดเอง]'} {setItem.name} ({setItem.questions.length} ข้อ)
                  </option>
                ))}
              </select>
            </div>

            {errorMessage && (
              <div className="px-3.5 py-2.5 bg-rose-950/80 border border-rose-500/60 text-rose-200 text-sm font-thai">
                {errorMessage}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                id="btn-menu-create"
                type="button"
                onClick={handleQuickCreate}
                className="flex items-center justify-center gap-2.5 py-3.5 px-5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-display font-extrabold tracking-wider text-sm uppercase hud-cut-sm transition cursor-pointer shadow-[0_0_24px_rgba(0,229,255,0.35)]"
              >
                <Play className="w-4 h-4 fill-slate-950" />
                CREATE ROOM
              </button>
              <button
                id="btn-menu-join"
                type="button"
                onClick={() => setScreen('room')}
                className="flex items-center justify-center gap-2.5 py-3.5 px-5 bg-rose-600/90 hover:bg-rose-500 text-white font-display font-extrabold tracking-wider text-sm uppercase hud-cut-sm transition cursor-pointer shadow-[0_0_24px_rgba(255,46,91,0.3)]"
              >
                <Users className="w-4 h-4" />
                JOIN ROOM
              </button>
            </div>

            {/* Dedicated Practice Mode Launchers: Free Weapon/Style Sandbox + Round Math Drill */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                id="btn-menu-free-practice"
                type="button"
                onClick={handleStartFreePractice}
                className="flex items-center justify-center gap-2 py-3 px-3 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/70 text-emerald-100 font-display font-bold tracking-wider text-[11px] uppercase hud-cut-sm transition cursor-pointer shadow-[0_0_18px_rgba(16,185,129,0.2)]"
              >
                <Crosshair className="w-4 h-4 text-emerald-300 shrink-0" />
                <span>โหมดซ้อมอิสระ (เลือกปืน &amp; สไตล์ฟรี)</span>
              </button>
              <button
                id="btn-menu-practice"
                type="button"
                onClick={handleStartPractice}
                className="flex items-center justify-center gap-2 py-3 px-3 bg-slate-900/85 hover:bg-slate-800 border border-cyan-400/50 text-cyan-200 font-display font-bold tracking-wider text-[11px] uppercase hud-cut-sm transition cursor-pointer"
              >
                <GraduationCap className="w-4 h-4 text-cyan-300 shrink-0" />
                <span>ซ้อมรอบคณิต + TUTORIAL</span>
              </button>
            </div>

            {/* VS AI Match (Full 10-Round Match vs AI Bots) */}
            <div className="p-2.5 bg-violet-950/35 border border-violet-500/45 flex flex-wrap items-center justify-between gap-2">
              <button
                id="btn-menu-vs-ai"
                type="button"
                onClick={handleStartVsAi}
                className="flex-1 min-w-[170px] flex items-center justify-center gap-2 py-2.5 px-3 bg-violet-500 hover:bg-violet-400 text-slate-950 font-display font-black tracking-wider text-xs uppercase hud-cut-sm transition cursor-pointer shadow-[0_0_20px_rgba(139,92,246,0.35)]"
              >
                <Bot className="w-4 h-4 shrink-0" />
                <span>เล่นกับ AI (10 ตา)</span>
              </button>
              <div className="flex items-center gap-1.5">
                <select
                  id="select-ai-difficulty"
                  value={aiDifficulty}
                  onChange={(e) => setAiDifficulty(e.target.value as AiDifficulty)}
                  className="px-2 py-2 bg-slate-950 border border-violet-500/40 text-violet-200 font-thai text-xs focus:outline-none"
                  aria-label="AI Difficulty"
                >
                  <option value="easy">AI: ง่าย</option>
                  <option value="medium">AI: ปานกลาง</option>
                  <option value="hard">AI: ยาก</option>
                </select>
                <select
                  id="select-ai-team-size"
                  value={aiTeamSize}
                  onChange={(e) => setAiTeamSize(Number(e.target.value) === 2 ? 2 : 1)}
                  className="px-2 py-2 bg-slate-950 border border-violet-500/40 text-violet-200 font-display text-xs focus:outline-none"
                  aria-label="AI Match Format"
                >
                  <option value={1}>1v1</option>
                  <option value={2}>2v2</option>
                </select>
              </div>
            </div>

            {savedSession && (
              <button
                id="btn-menu-reconnect"
                type="button"
                disabled={reconnecting}
                onClick={handleReconnect}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/50 text-amber-200 text-xs font-display tracking-wider uppercase transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {reconnecting
                  ? 'RECONNECTING...'
                  : `RECONNECT TO ROOM ${savedSession.roomCode} (${savedSession.playerName})`}
              </button>
            )}
          </div>
        </section>

        {/* Right Showcase: Official 4-Weapon Reward Pool + 4 Tactical Agents */}
        <aside className="lg:col-span-6 space-y-3">
          <div className="hud-panel hud-cut border border-slate-700/70 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="font-display text-xs tracking-[0.22em] text-cyan-300 uppercase">
                WEAPON REWARD POOL (AUDITED 3D GLB)
              </span>
              <span className="text-[11px] text-slate-400 font-thai">สุ่มโดยระบบกลางเมื่อจบ Combat Round</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {REWARD_WEAPON_POOL.map((id) => {
                const w = WEAPONS[id]
                return (
                  <div
                    key={id}
                    className="p-2.5 bg-slate-950/85 border border-slate-800/90 space-y-0.5"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-display text-xs font-black text-white uppercase">
                        {id.toUpperCase()}
                      </span>
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: w.accentColor }}
                      />
                    </div>
                    <div className="text-[10px] font-display text-slate-300 truncate">{w.name}</div>
                    <div className="text-[9px] font-display tracking-wider text-slate-400 uppercase">
                      DMG {w.damage}{w.pellets > 1 ? `×${w.pellets}` : ''} • {w.magSize}RD
                    </div>
                    <div className="text-[9px] font-mono uppercase" style={{ color: w.accentColor }}>
                      {w.badge}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* 4 Tactical Agents Strip */}
            <div className="pt-2 border-t border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-display text-[11px] tracking-[0.2em] text-amber-300 uppercase flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> 4 TACTICAL AGENTS (Q / C / X)
                </span>
                <span className="text-[10px] font-thai text-emerald-300">เปลี่ยนสไตล์ได้ทุกตาในเกม!</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {AGENT_IDS.map((aid) => {
                  const a = AGENTS[aid]
                  return (
                    <div key={aid} className="p-2 bg-slate-950/80 border border-slate-800">
                      <div className="font-display text-xs font-black" style={{ color: a.accentColor }}>
                        {a.name}
                      </div>
                      <div className="text-[9px] font-display text-slate-400">{a.role}</div>
                      <div className="text-[10px] font-thai text-slate-300 truncate mt-0.5">
                        {a.skills.Q.name.split(' ')[0]} • {a.skills.C.name.split(' ')[0]}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800">
              <div className="p-2 bg-emerald-950/40 border border-emerald-500/30 text-center">
                <div className="font-display text-base font-extrabold text-emerald-400">+100 &amp; ปืนใหม่</div>
                <div className="text-[10px] font-thai text-slate-300">ตอบถูกเมื่อจบรอบ</div>
              </div>
              <div className="p-2 bg-rose-950/50 border border-rose-500/50 text-center">
                <div className="font-display text-base font-extrabold text-rose-400">-300 &amp; ยึดปืน</div>
                <div className="text-[10px] font-thai text-rose-200">ตอบผิด / หมดเวลา</div>
              </div>
              <div className="p-2 bg-cyan-950/40 border border-cyan-500/30 text-center">
                <div className="font-display text-base font-extrabold text-cyan-300">+150 (+50 HS)</div>
                <div className="text-[10px] font-thai text-slate-300">Kill (+1 ULT)</div>
              </div>
            </div>
          </div>
        </aside>
      </main>

      {/* Bottom Controls Strip */}
      <footer className="flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400 border-t border-slate-800/70 pt-3">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-cyan-400" /> Blue vs Red Arena
          </span>
          <span className="flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5 text-amber-400" /> 48 Verified ม.4 เทอม 2 Questions
          </span>
        </div>
        <div className="font-mono text-[11px] text-slate-400">
          WASD Move • Shift Sprint • Ctrl Aim • LMB Shoot • R Reload • End-of-Round Math Challenge • Q/C/X Skills • Tab Score
        </div>
      </footer>
    </div>
  )
}
