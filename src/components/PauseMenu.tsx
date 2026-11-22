import { GraduationCap, LogOut, Play } from 'lucide-react'
import { AGENT_IDS, AGENTS } from '../../shared/agents.ts'
import { inputManager } from '../game/inputManager.ts'
import { multiplayerClient } from '../multiplayer/client.ts'
import { selectMyPlayer, useGameStore } from '../store/useGameStore.ts'
import { SettingsControlsPanel } from './ControlsSettingsModal.tsx'

export function PauseMenu() {
  const open = useGameStore((s) => s.pauseOpen)
  const setPauseOpen = useGameStore((s) => s.setPauseOpen)
  const practiceMode = useGameStore((s) => s.practiceMode)
  const resetTutorial = useGameStore((s) => s.resetTutorial)
  const me = useGameStore(selectMyPlayer)

  if (!open) return null

  const handleResume = () => {
    setPauseOpen(false)
    inputManager.requestPointerLock()
  }

  return (
    <div
      id="pause-menu-modal"
      data-ui-interactive="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#040812]/78 backdrop-blur-sm"
    >
      <div className="w-full max-w-lg hud-panel hud-cut border border-slate-700 p-6 space-y-5 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <div className="font-display text-xs tracking-[0.24em] text-cyan-400 uppercase">
              {practiceMode ? 'PRACTICE RANGE • TRAINING' : 'MATCH IN PROGRESS'}
            </div>
            <h3 className="font-display text-2xl font-black text-white">PAUSED</h3>
          </div>
          <span className="text-[10px] font-thai px-2.5 py-1 bg-slate-900 border border-slate-700 text-slate-300">
            กด RESUME เพื่อกลับเข้าสู่เกม
          </span>
        </div>

        {/* Full Sensitivity, Aim Sensitivity, Invert Y, Audio & Reset Controls */}
        <SettingsControlsPanel />

        {/* Practice Mode Agent Quick Switcher */}
        {practiceMode && me && (
          <div className="space-y-2 border-t border-slate-800 pt-3">
            <div className="text-[11px] font-display tracking-widest text-amber-300 uppercase">
              SWITCH PRACTICE AGENT
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {AGENT_IDS.map((aid) => {
                const a = AGENTS[aid]
                const active = me.agent === aid
                return (
                  <button
                    key={aid}
                    type="button"
                    onClick={() => multiplayerClient.selectAgent(aid)}
                    className={`py-1.5 px-2 text-[11px] font-display font-bold border uppercase cursor-pointer ${
                      active
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-950/75 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                    style={active ? { borderColor: a.accentColor, color: a.accentColor } : undefined}
                  >
                    {a.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Controls Quick Reference */}
        <div className="p-3.5 bg-slate-950/85 border border-slate-800 text-xs grid grid-cols-2 gap-y-1.5 gap-x-3 text-slate-300">
          <div><strong className="text-cyan-300 font-mono">WASD</strong> Move</div>
          <div><strong className="text-cyan-300 font-mono">SHIFT (Hold)</strong> Sprint</div>
          <div><strong className="text-cyan-300 font-mono">CTRL (Hold)</strong> Aim Mode</div>
          <div><strong className="text-cyan-300 font-mono">LMB</strong> Shoot</div>
          <div><strong className="text-cyan-300 font-mono">R</strong> Reload Weapon</div>
          <div><strong className="text-cyan-300 font-mono">SPACE</strong> Jump</div>
          <div><strong className="text-amber-300 font-mono">Q / C / X</strong> Agent Skills</div>
          <div><strong className="text-cyan-300 font-mono">TAB / H</strong> Score / Help</div>
        </div>

        <div className="space-y-2.5 pt-1">
          <button
            id="btn-pause-resume"
            type="button"
            onClick={handleResume}
            className="w-full py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-display font-black text-sm tracking-wider uppercase hud-cut-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" /> RESUME MATCH
          </button>

          {practiceMode && (
            <button
              id="btn-pause-replay-tutorial"
              type="button"
              onClick={() => {
                resetTutorial()
                handleResume()
              }}
              className="w-full py-2.5 bg-emerald-950/60 hover:bg-emerald-900/70 border border-emerald-500/50 text-emerald-200 font-display font-bold text-xs tracking-wider uppercase hud-cut-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <GraduationCap className="w-4 h-4" /> SHOW 6-STEP TRAINING CHECKLIST
            </button>
          )}

          <button
            id="btn-pause-leave"
            type="button"
            onClick={() => multiplayerClient.leaveRoom()}
            className="w-full py-2.5 bg-rose-950/70 hover:bg-rose-900 border border-rose-500/60 text-rose-200 font-display font-bold text-xs tracking-wider uppercase hud-cut-sm flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogOut className="w-4 h-4" /> {practiceMode ? 'EXIT PRACTICE RANGE' : 'LEAVE ROOM'}
          </button>
        </div>
      </div>
    </div>
  )
}
