import { Keyboard, RotateCcw, Sliders, Volume2, VolumeX, X } from 'lucide-react'
import { useGameStore } from '../store/useGameStore.ts'

const CONTROL_BINDINGS: Array<{ key: string; action: string; detail: string }> = [
  { key: 'W A S D', action: 'Move', detail: 'เดินหน้า / ซ้าย / ถอยหลัง / ขวา' },
  { key: 'Tab / Mouse', action: 'Mouse Look Toggle', detail: 'กด Tab เปิดหันกล้องด้วยเมาส์ (กด Tab อีกครั้งเพื่อออก)' },
  { key: 'Left Click', action: 'Shoot / Punch', detail: 'ยิงปืน หรือต่อยด้วยหมัดไซเบอร์เมื่อไม่มีปืน' },
  { key: 'Shift (Hold)', action: 'Sprint', detail: 'กดค้างเพื่อวิ่งเร็วขณะเดินเท่านั้น' },
  { key: 'Ctrl (Hold)', action: 'Aim Mode', detail: 'กดค้าง (ซ้าย/ขวา) ซูมเป้าและลดแรงดีด' },
  { key: 'R', action: 'Reload', detail: 'รีโหลดกระสุนเมื่อกระสุนไม่เต็ม' },
  { key: '1 - 4', action: 'Math Answer (60s)', detail: 'เลือกคำตอบโจทย์คณิตเมื่อจบแต่ละ Combat Round (เวลา 1 นาที)' },
  { key: 'Space', action: 'Jump', detail: 'กระโดด / ใช้ Jump Pad' },
  { key: 'Q / C / X', action: 'Agent Skills', detail: 'สกิล Tactical / Utility / Ultimate (4 แต้ม)' },
  { key: 'Tab (Hold)', action: 'Scoreboard', detail: 'กดค้างดูตารางคะแนนสด + สลับล็อกเมาส์' },
  { key: 'Esc', action: 'Pause / Unlock', detail: 'ปลดล็อกเมาส์และเปิดเมนูหยุดเกม' },
  { key: 'H', action: 'Controls HUD', detail: 'เปิด/ปิดตารางปุ่มควบคุมมุมจอขณะเล่น' },
]

export function SettingsControlsPanel() {
  const sensitivity = useGameStore((s) => s.mouseSensitivity)
  const setSensitivity = useGameStore((s) => s.setMouseSensitivity)
  const aimMult = useGameStore((s) => s.aimSensitivityMultiplier)
  const setAimMult = useGameStore((s) => s.setAimSensitivityMultiplier)
  const invertY = useGameStore((s) => s.invertY)
  const setInvertY = useGameStore((s) => s.setInvertY)
  const muted = useGameStore((s) => s.muted)
  const setMuted = useGameStore((s) => s.setMuted)
  const resetDefaults = useGameStore((s) => s.resetSettingsToDefault)

  return (
    <div className="space-y-3.5">
      {/* Mouse Sensitivity */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs font-display text-slate-300 uppercase">
          <span className="flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-cyan-400" /> MOUSE SENSITIVITY
          </span>
          <span className="text-cyan-300 font-bold" id="settings-sens-val">
            {(sensitivity * 1000).toFixed(1)}
          </span>
        </div>
        <input
          id="input-mouse-sensitivity"
          type="range"
          min={0.0006}
          max={0.0055}
          step={0.0001}
          value={sensitivity}
          onChange={(e) => setSensitivity(Number(e.target.value))}
          className="w-full accent-cyan-400 cursor-pointer"
        />
      </div>

      {/* Aim Sensitivity Multiplier */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs font-display text-slate-300 uppercase">
          <span>CTRL AIM SENSITIVITY</span>
          <span className="text-amber-300 font-bold" id="settings-aim-val">
            {Math.round(aimMult * 100)}%
          </span>
        </div>
        <input
          id="input-aim-sensitivity"
          type="range"
          min={0.25}
          max={1.0}
          step={0.05}
          value={aimMult}
          onChange={(e) => setAimMult(Number(e.target.value))}
          className="w-full accent-amber-400 cursor-pointer"
        />
      </div>

      {/* Invert Y & Mute */}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          id="btn-toggle-invert-y"
          type="button"
          onClick={() => setInvertY(!invertY)}
          className="flex items-center justify-between px-3.5 py-2.5 bg-slate-950/85 border border-slate-700 hover:border-cyan-400 text-xs font-display uppercase cursor-pointer"
        >
          <span className="text-slate-300">INVERT Y</span>
          <span className={invertY ? 'text-amber-300 font-bold' : 'text-slate-400'}>
            {invertY ? 'ON' : 'OFF'}
          </span>
        </button>

        <button
          id="btn-settings-mute"
          type="button"
          onClick={() => setMuted(!muted)}
          className="flex items-center justify-between px-3.5 py-2.5 bg-slate-950/85 border border-slate-700 hover:border-cyan-400 text-xs font-display uppercase cursor-pointer"
        >
          <span className="text-slate-300">AUDIO</span>
          {muted ? (
            <span className="inline-flex items-center gap-1 text-rose-400 font-bold">
              <VolumeX className="w-3.5 h-3.5" /> OFF
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-emerald-400 font-bold">
              <Volume2 className="w-3.5 h-3.5" /> ON
            </span>
          )}
        </button>
      </div>

      {/* Reset to Default */}
      <button
        id="btn-settings-reset"
        type="button"
        onClick={resetDefaults}
        className="w-full py-2 px-3 bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-[11px] font-display tracking-wider uppercase flex items-center justify-center gap-1.5 cursor-pointer"
      >
        <RotateCcw className="w-3.5 h-3.5" /> RESET TO DEFAULT SETTINGS
      </button>
    </div>
  )
}

export function ControlsSettingsModal() {
  const open = useGameStore((s) => s.controlsGuideOpen)
  const setOpen = useGameStore((s) => s.setControlsGuideOpen)

  if (!open) return null

  return (
    <div
      id="controls-guide-modal"
      data-ui-interactive="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#040812]/80 backdrop-blur-sm"
    >
      <div className="w-full max-w-3xl hud-panel hud-cut border border-cyan-500/60 p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <Keyboard className="w-5 h-5 text-cyan-400" />
            <div>
              <div className="font-display text-xs tracking-[0.22em] text-cyan-400 uppercase">
                CONTROLS GUIDE &amp; SETTINGS
              </div>
              <h2 className="font-display text-xl font-black text-white">
                คู่มือปุ่มควบคุมและการตั้งค่าเมาส์
              </h2>
            </div>
          </div>
          <button
            id="btn-close-controls-guide"
            type="button"
            onClick={() => setOpen(false)}
            className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          {/* Controls Table */}
          <div className="md:col-span-7 space-y-2">
            <div className="text-xs font-display tracking-[0.2em] text-slate-400 uppercase">
              DEFAULT CONTROLS
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {CONTROL_BINDINGS.map((b) => (
                <div
                  key={b.key}
                  className="p-2 bg-slate-950/85 border border-slate-800/90 flex flex-col gap-0.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-1.5 py-0.5 bg-cyan-500/15 border border-cyan-400/40 text-cyan-300 font-mono text-[11px] font-bold">
                      {b.key}
                    </span>
                    <span className="font-display text-[11px] font-bold text-white uppercase">
                      {b.action}
                    </span>
                  </div>
                  <span className="font-thai text-[11px] text-slate-400 leading-snug">
                    {b.detail}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Settings Column */}
          <div className="md:col-span-5 space-y-3">
            <div className="text-xs font-display tracking-[0.2em] text-slate-400 uppercase">
              AIM &amp; AUDIO SETTINGS
            </div>
            <div className="p-4 bg-slate-950/75 border border-slate-800">
              <SettingsControlsPanel />
            </div>
            <div className="p-3 bg-cyan-950/35 border border-cyan-500/35 font-thai text-xs text-slate-300 leading-relaxed">
              <strong className="text-cyan-300">มือใหม่หัดเล่น FPS?</strong> กดเข้า{' '}
              <strong className="text-emerald-300">PRACTICE RANGE</strong> จากหน้าหลักเพื่อฝึกเดิน
              หันเมาส์ กด <strong>Ctrl</strong> เล็ง กด <strong>Shift</strong> วิ่ง ยิงเป้าจำลอง
              และลองตอบโจทย์คณิตสุ่มปืนได้แบบไม่จับเวลา!
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
