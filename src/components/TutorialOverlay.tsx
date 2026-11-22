import { CheckCircle2, Circle, GraduationCap, X } from 'lucide-react'
import { useGameStore, type TutorialProgress } from '../store/useGameStore.ts'

const TUTORIAL_STEPS: Array<{ key: keyof TutorialProgress; label: string; hint: string }> = [
  { key: 'moved', label: '1. เดินด้วยปุ่ม WASD', hint: 'กด W A S D เพื่อเคลื่อนที่รอบสนาม' },
  { key: 'looked', label: '2. กด [TAB] เปิด/ปิดหันด้วยเมาส์', hint: 'กด Tab (หรือคลิกสนาม) เพื่อหันเมาส์ กด Tab อีกครั้งเพื่อออก' },
  { key: 'aimed', label: '3. กด Ctrl ค้างเพื่อเล็ง (Aim Mode)', hint: 'กด Ctrl ซ้าย/ขวา ค้างเพื่อซูมเป้า' },
  { key: 'sprinted', label: '4. กด Shift ค้างขณะเดินเพื่อวิ่งเร็ว', hint: 'กด Shift + WASD วิ่งไวขึ้น' },
  { key: 'shot', label: '5. คลิกซ้ายเพื่อยิงเป้าจำลอง', hint: 'เล็งที่หุ่นเป้า Hologram แล้วคลิกซ้าย' },
  {
    key: 'solvedMath',
    label: '6. จบ Combat Round ตอบโจทย์คณิตชิงปืน',
    hint: 'เมื่อจบรอบต่อสู้ โจทย์จะขึ้นอัตโนมัติ (ตอบถูกได้ปืนใหม่ • ตอบผิดยึดปืน -300)',
  },
]

export function TutorialOverlay() {
  const open = useGameStore((s) => s.tutorialOpen)
  const progress = useGameStore((s) => s.tutorialProgress)
  const setTutorialOpen = useGameStore((s) => s.setTutorialOpen)
  const mathModalOpen = useGameStore((s) => s.mathModalOpen)
  const pauseOpen = useGameStore((s) => s.pauseOpen)

  if (!open || mathModalOpen || pauseOpen) return null

  const doneCount = Object.values(progress).filter(Boolean).length
  const allComplete = doneCount === TUTORIAL_STEPS.length

  return (
    <div
      id="beginner-tutorial-panel"
      data-ui-interactive="true"
      className="pointer-events-auto fixed top-24 left-4 z-30 w-72 hud-panel hud-cut-sm border border-cyan-500/55 p-3.5 space-y-2.5 shadow-[0_0_30px_rgba(0,229,255,0.18)]"
    >
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <GraduationCap className="w-4 h-4 text-emerald-400" />
          <span className="font-display text-[11px] font-bold tracking-wider text-cyan-300 uppercase">
            TRAINING CHECKLIST ({doneCount}/6)
          </span>
        </div>
        <button
          id="btn-close-tutorial"
          type="button"
          onClick={() => setTutorialOpen(false)}
          className="p-1 text-slate-400 hover:text-white cursor-pointer"
          title="ปิดคู่มือฝึกสอน"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-1.5">
        {TUTORIAL_STEPS.map((step) => {
          const done = progress[step.key]
          return (
            <div
              key={step.key}
              className={`flex items-start gap-2 px-2 py-1.5 border text-xs transition ${
                done
                  ? 'bg-emerald-950/50 border-emerald-500/45 text-emerald-200'
                  : 'bg-slate-950/70 border-slate-800 text-slate-200'
              }`}
            >
              {done ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <Circle className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <div className={`font-thai font-semibold leading-tight ${done ? 'line-through opacity-80' : ''}`}>
                  {step.label}
                </div>
                {!done && (
                  <div className="font-thai text-[10px] text-slate-400 mt-0.5">{step.hint}</div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {allComplete && (
        <div className="p-2 bg-emerald-500/20 border border-emerald-400/60 text-emerald-200 font-thai text-xs font-bold text-center">
          🎉 ผ่านครบ 6 ขั้นตอนแล้ว! พร้อมลุยศึก Multiplayer!
        </div>
      )}
    </div>
  )
}
