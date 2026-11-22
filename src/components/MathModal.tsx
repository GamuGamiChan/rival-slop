import { BookOpen, CheckCircle2, Dices, Loader2, Lock, Sparkles, X, XCircle } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Difficulty, WeaponId } from '../../shared/types.ts'
import { WEAPON_IDS, WEAPONS } from '../../shared/weapons.ts'
import { inputManager } from '../game/inputManager.ts'
import { soundEngine } from '../game/sound.ts'
import { multiplayerClient } from '../multiplayer/client.ts'
import { selectMyPlayer, useGameStore } from '../store/useGameStore.ts'

const DIFF_META: Record<Difficulty, { label: string; badgeClass: string; oddsNote: string }> = {
  easy: {
    label: 'EASY',
    badgeClass: 'bg-emerald-500/20 border-emerald-400/60 text-emerald-300',
    oddsNote: 'สุ่มเร็ว • โอกาสได้ Pistol / SMG / Rifle สูง',
  },
  medium: {
    label: 'MEDIUM',
    badgeClass: 'bg-amber-500/20 border-amber-400/60 text-amber-300',
    oddsNote: 'สมดุล • โอกาสได้ Rifle / Burst / Revolver / Shotgun',
  },
  hard: {
    label: 'HARD',
    badgeClass: 'bg-rose-500/20 border-rose-400/60 text-rose-300',
    oddsNote: 'ระดับท้าทาย • โอกาสได้ Sniper / LMG / Revolver สูงสุด!',
  },
}

// Explicit timing constants: Feedback visible ~1.35s, then 8-weapon roulette ~1.15s + lock 0.9s
const CORRECT_FEEDBACK_HOLD_MS = 1350
const ROULETTE_MARKS_MS = [0, 55, 110, 170, 235, 305, 385, 475, 580, 700, 840, 1000, 1150]
const TOTAL_STEPS = ROULETTE_MARKS_MS.length - 1
const AUTO_CLOSE_AFTER_LOCK_MS = 900

function WeaponRouletteStage({
  awardedWeapon,
  pointsAwarded,
  onEnterCombat,
}: {
  awardedWeapon: WeaponId
  pointsAwarded: number
  onEnterCombat: () => void
}) {
  const targetIdx = WEAPON_IDS.indexOf(awardedWeapon)
  const startIdx = (targetIdx - TOTAL_STEPS + WEAPON_IDS.length * 4) % WEAPON_IDS.length
  const [step, setStep] = useState(0)
  const onEnterCombatRef = useRef(onEnterCombat)

  useEffect(() => {
    onEnterCombatRef.current = onEnterCombat
  }, [onEnterCombat])

  const locked = step >= TOTAL_STEPS
  const activeIdx = (startIdx + Math.min(step, TOTAL_STEPS)) % WEAPON_IDS.length
  const activeSpec = WEAPONS[WEAPON_IDS[activeIdx]]
  const wonSpec = WEAPONS[awardedWeapon]

  useEffect(() => {
    const startedAt = performance.now()
    let lastStep = 0
    let finished = false
    const totalMs = ROULETTE_MARKS_MS[TOTAL_STEPS] + AUTO_CLOSE_AFTER_LOCK_MS

    const id = window.setInterval(() => {
      const elapsed = performance.now() - startedAt
      let nextStep = lastStep
      while (nextStep < TOTAL_STEPS && elapsed >= ROULETTE_MARKS_MS[nextStep + 1]) {
        nextStep += 1
      }
      if (nextStep !== lastStep) {
        lastStep = nextStep
        setStep(nextStep)
        if (nextStep >= TOTAL_STEPS) {
          soundEngine.playWeaponReveal()
        } else {
          soundEngine.playRollTick(nextStep)
        }
      }
      if (!finished && elapsed >= totalMs) {
        finished = true
        window.clearInterval(id)
        onEnterCombatRef.current()
      }
    }, 65)

    const fallbackId = window.setTimeout(() => {
      if (!finished) {
        finished = true
        window.clearInterval(id)
        onEnterCombatRef.current()
      }
    }, totalMs + 80)

    return () => {
      window.clearInterval(id)
      window.clearTimeout(fallbackId)
    }
  }, [])

  return (
    <div id="weapon-roulette-stage" className="space-y-4">
      <div className="p-3.5 border bg-emerald-950/65 border-emerald-400/70 text-emerald-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="w-7 h-7 text-emerald-400 shrink-0" />
          <div>
            <div className="font-display text-lg font-extrabold tracking-wide">
              WEAPON ROLL • +{pointsAwarded} PTS • +1 ULT
            </div>
            <div className="font-thai text-xs text-emerald-200/90">
              {locked
                ? `ปลดล็อกอาวุธ: ${wonSpec.name.toUpperCase()} — พร้อมเข้าสู่สนามรบ!`
                : 'กำลังสุ่มอาวุธไซไฟ 1 ใน 8 กระบอก...'}
            </div>
          </div>
        </div>
        <Dices className={`w-6 h-6 text-cyan-300 shrink-0 ${locked ? '' : 'animate-spin'}`} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {WEAPON_IDS.map((wid, idx) => {
          const w = WEAPONS[wid]
          const isActive = idx === activeIdx
          const isWinner = locked && wid === awardedWeapon
          return (
            <div
              key={wid}
              className={`p-2.5 border transition-all duration-75 ${
                isWinner
                  ? 'bg-slate-900 scale-[1.04] ring-2 ring-white/80'
                  : isActive
                    ? 'bg-slate-900/95 scale-[1.02]'
                    : 'bg-slate-950/80 border-slate-800 opacity-50'
              }`}
              style={{
                borderColor: isActive || isWinner ? w.accentColor : undefined,
                boxShadow: isWinner
                  ? `0 0 26px ${w.accentColor}88`
                  : isActive
                    ? `0 0 14px ${w.accentColor}55`
                    : undefined,
              }}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="font-display text-[11px] font-black text-white truncate">
                  {w.name.split(' ')[0]}
                </span>
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: w.accentColor }}
                />
              </div>
              <div className="text-[10px] font-mono mt-0.5 truncate" style={{ color: w.accentColor }}>
                {w.badge}
              </div>
              <div className="text-[9px] font-display text-slate-400 mt-0.5">
                DMG {w.damage}{w.pellets > 1 ? `×${w.pellets}` : ''} • {w.magSize}RD
              </div>
            </div>
          )
        })}
      </div>

      <div
        className="p-3.5 bg-slate-950/90 border flex flex-wrap items-center justify-between gap-3"
        style={{ borderColor: locked ? wonSpec.accentColor : activeSpec.accentColor }}
      >
        <div>
          <div className="text-[10px] font-display tracking-[0.2em] uppercase text-slate-400">
            {locked ? 'EQUIPPED WEAPON' : 'SPINNING ARSENAL...'}
          </div>
          <div
            className="font-display text-2xl font-black uppercase tracking-wide"
            style={{ color: locked ? wonSpec.accentColor : activeSpec.accentColor }}
          >
            {locked ? wonSpec.name : activeSpec.name}
          </div>
          <div className="font-thai text-xs text-slate-300 mt-0.5">
            {locked ? wonSpec.tagline : 'กำลังสุ่มอาวุธจากคลัง 8 กระบอก...'}
          </div>
        </div>

        <button
          id="btn-math-enter-combat"
          type="button"
          onClick={onEnterCombat}
          className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-display font-black text-xs tracking-wider uppercase hud-cut-sm cursor-pointer shadow-[0_0_24px_rgba(0,229,255,0.45)]"
        >
          {locked ? 'เข้าสู่สนามรบ! (SPACE)' : 'ข้ามอนิเมชันเข้าสนามรบ (SPACE)'}
        </button>
      </div>
    </div>
  )
}

export function MathModal() {
  const open = useGameStore((s) => s.mathModalOpen)
  const phase = useGameStore((s) => s.mathFlowPhase)
  const activeQuestion = useGameStore((s) => s.activeQuestion)
  const submittedQuestion = useGameStore((s) => s.submittedQuestion)
  const selectedChoiceIndex = useGameStore((s) => s.selectedChoiceIndex)
  const lastAnswer = useGameStore((s) => s.lastAnswerResult)
  const beginMathSubmission = useGameStore((s) => s.beginMathSubmission)
  const advanceMathToWeaponReveal = useGameStore((s) => s.advanceMathToWeaponReveal)
  const completeMathFlowToCombat = useGameStore((s) => s.completeMathFlowToCombat)
  const clearLastAnswer = useGameStore((s) => s.clearLastAnswer)
  const errorMessage = useGameStore((s) => s.errorMessage)
  const practiceMode = useGameStore((s) => s.practiceMode)
  const me = useGameStore(selectMyPlayer)

  const [preferredDiff, setPreferredDiff] = useState<Difficulty | undefined>(undefined)
  const [hintQuestionId, setHintQuestionId] = useState<string | null>(null)

  const visibleQuestion = activeQuestion ?? submittedQuestion
  const showHint = Boolean(visibleQuestion && hintQuestionId === visibleQuestion.id)
  const noMoreQuestions = Boolean(errorMessage && errorMessage.includes('ครบทั้งคลัง'))
  // In competitive matches, unarmed players MUST answer correctly before closing & fighting!
  const mandatoryLock = Boolean(!practiceMode && me && !me.weapon && !noMoreQuestions)

  const closeAndReturnToCombat = useCallback(() => {
    const state = useGameStore.getState()
    const currentMe = selectMyPlayer(state)
    const exhausted = Boolean(state.errorMessage && state.errorMessage.includes('ครบทั้งคลัง'))
    const hasEquippedOrAwardedWeapon = Boolean(
      currentMe?.weapon || (state.lastAnswerResult?.correct && state.lastAnswerResult.awardedWeapon),
    )
    if (!state.practiceMode && currentMe && !hasEquippedOrAwardedWeapon && !exhausted) {
      return
    }
    completeMathFlowToCombat()
    inputManager.requestPointerLock()
  }, [completeMathFlowToCombat])

  const handleNextQuestion = useCallback(() => {
    clearLastAnswer()
    multiplayerClient.requestQuestion(preferredDiff)
  }, [clearLastAnswer, preferredDiff])

  const handleChoice = useCallback(
    (idx: number) => {
      const state = useGameStore.getState()
      if (state.mathFlowPhase !== 'QUESTION_ACTIVE' || !state.activeQuestion) return
      const q = state.activeQuestion
      // Lock choice immediately in state machine to prevent duplicate submissions
      beginMathSubmission(q, idx)
      multiplayerClient.submitAnswer(q.id, idx)
    },
    [beginMathSubmission],
  )

  // Explicit transition: ANSWER_FEEDBACK (Correct) stays visible ~1.35s -> WEAPON_REVEAL
  useEffect(() => {
    if (!open || phase !== 'ANSWER_FEEDBACK') return
    const ans = useGameStore.getState().lastAnswerResult
    if (!ans?.correct || !ans.awardedWeapon) return
    const timer = window.setTimeout(() => {
      useGameStore.getState().advanceMathToWeaponReveal()
    }, CORRECT_FEEDBACK_HOLD_MS)
    return () => window.clearTimeout(timer)
  }, [open, phase])

  // Subscribe cleanly to the single centralized InputManager (zero duplicate keydown listeners!)
  useEffect(() => {
    if (!open) return
    return inputManager.registerMathHandlers({
      onDigit: (choiceIndex) => {
        handleChoice(choiceIndex)
      },
      onContinue: () => {
        const s = useGameStore.getState()
        if (s.mathFlowPhase === 'ANSWER_FEEDBACK') {
          if (s.lastAnswerResult?.correct && s.lastAnswerResult.awardedWeapon) {
            advanceMathToWeaponReveal()
          } else {
            handleNextQuestion()
          }
        } else if (s.mathFlowPhase === 'WEAPON_REVEAL') {
          closeAndReturnToCombat()
        }
      },
      onDoubleR: () => {
        const s = useGameStore.getState()
        if (s.mathFlowPhase === 'ANSWER_FEEDBACK' && s.lastAnswerResult && !s.lastAnswerResult.correct) {
          handleNextQuestion()
        }
      },
    })
  }, [open, handleChoice, handleNextQuestion, advanceMathToWeaponReveal, closeAndReturnToCombat])

  if (!open) return null

  const toggleHint = () => {
    if (!visibleQuestion) return
    setHintQuestionId((prev) => (prev === visibleQuestion.id ? null : visibleQuestion.id))
  }

  const stepIndex =
    phase === 'QUESTION_ACTIVE'
      ? 0
      : phase === 'ANSWER_SUBMITTED'
        ? 1
        : phase === 'ANSWER_FEEDBACK'
          ? 2
          : 3

  return (
    <div
      id="math-terminal-modal"
      data-math-phase={phase}
      data-ui-interactive="true"
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-[#040812]/72 backdrop-blur-sm"
    >
      <div className="w-full max-w-2xl hud-panel hud-cut border border-cyan-500/60 p-5 sm:p-6 space-y-4 shadow-[0_0_60px_rgba(0,229,255,0.22)] max-h-[92vh] overflow-y-auto">
        {/* Top Bar + Explicit Flow Phase Indicator */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-xs tracking-[0.2em] text-cyan-300 uppercase flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" /> MATH &amp; WEAPON ROLL [RR]
            </span>
            {mandatoryLock && (
              <span
                id="math-mandatory-badge"
                className="inline-flex items-center gap-1 text-[11px] font-thai font-bold px-2.5 py-0.5 bg-amber-500/20 border border-amber-400/70 text-amber-200"
              >
                <Lock className="w-3 h-3" /> บังคับตอบคณิตเพื่อสุ่มปืนก่อนเข้าสนาม!
              </span>
            )}
            {visibleQuestion && phase !== 'WEAPON_REVEAL' && (
              <span
                className={`text-[11px] font-display font-bold px-2.5 py-0.5 border ${
                  DIFF_META[visibleQuestion.difficulty].badgeClass
                }`}
              >
                {DIFF_META[visibleQuestion.difficulty].label}
              </span>
            )}
          </div>

          {!mandatoryLock && (
            <button
              id="btn-close-math"
              type="button"
              onClick={closeAndReturnToCombat}
              className="p-1.5 text-slate-400 hover:text-white bg-slate-900 border border-slate-700 cursor-pointer"
              title="ปิดหน้าต่าง (ESC)"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Visual 4-Stage State Machine Stepper (never disappears abruptly!) */}
        <div className="grid grid-cols-4 gap-1.5 text-[10px] font-thai">
          {['1. ทำโจทย์', '2. ส่งคำตอบ', '3. ผล & เฉลย', '4. สุ่มรับปืน'].map((label, idx) => (
            <div
              key={label}
              className={`px-2 py-1 text-center border transition ${
                idx === stepIndex
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 font-bold'
                  : idx < stepIndex
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : 'bg-slate-950/70 border-slate-800 text-slate-500'
              }`}
            >
              {label}
            </div>
          ))}
        </div>

        {/* STAGE 1, 2 & 3: QUESTION_ACTIVE / ANSWER_SUBMITTED / ANSWER_FEEDBACK */}
        {visibleQuestion && phase !== 'WEAPON_REVEAL' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-thai text-cyan-200 bg-cyan-950/60 border border-cyan-500/30 px-2.5 py-1">
                หัวข้อ: {visibleQuestion.topic}
              </span>
              {phase === 'QUESTION_ACTIVE' && (
                <button
                  type="button"
                  onClick={toggleHint}
                  className="inline-flex items-center gap-1.5 text-amber-300 hover:text-amber-200 font-thai cursor-pointer"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  {showHint ? `สูตร: ${visibleQuestion.formulaHint}` : 'ดูใบ้สูตร (Hint)'}
                </button>
              )}
              {phase === 'ANSWER_SUBMITTED' && (
                <span className="inline-flex items-center gap-1.5 text-cyan-300 font-thai font-semibold">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> กำลังตรวจสอบคำตอบ...
                </span>
              )}
            </div>

            {/* Question prompt ALWAYS stays visible during selection AND feedback */}
            <div
              id="math-question-prompt"
              className="p-4 bg-slate-950/90 border border-slate-800 text-white font-thai text-base sm:text-lg leading-relaxed font-medium"
            >
              {visibleQuestion.prompt}
            </div>

            {/* Choice Grid (locked cleanly after submission; highlights player pick + right answer in feedback) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {visibleQuestion.choices.map((choice, idx) => {
                const isSelected = selectedChoiceIndex === idx
                const isCorrectChoice = phase === 'ANSWER_FEEDBACK' && lastAnswer?.correctIndex === idx
                const isWrongSelected =
                  phase === 'ANSWER_FEEDBACK' && isSelected && lastAnswer && !lastAnswer.correct

                let btnStyle =
                  'bg-slate-900/90 hover:bg-cyan-500/20 border-slate-700 hover:border-cyan-400 text-slate-100'
                if (phase === 'ANSWER_SUBMITTED') {
                  btnStyle = isSelected
                    ? 'bg-cyan-500/25 border-cyan-400 text-white'
                    : 'bg-slate-950/70 border-slate-800 text-slate-500 opacity-60'
                } else if (phase === 'ANSWER_FEEDBACK') {
                  if (isCorrectChoice) {
                    btnStyle = 'bg-emerald-500/25 border-emerald-400 text-emerald-100 ring-1 ring-emerald-400/60'
                  } else if (isWrongSelected) {
                    btnStyle = 'bg-rose-500/25 border-rose-500 text-rose-100 ring-1 ring-rose-500/60'
                  } else {
                    btnStyle = 'bg-slate-950/60 border-slate-800 text-slate-500 opacity-55'
                  }
                }

                return (
                  <button
                    key={idx}
                    id={`btn-math-choice-${idx}`}
                    type="button"
                    disabled={phase !== 'QUESTION_ACTIVE'}
                    onClick={() => handleChoice(idx)}
                    className={`group flex items-center gap-3 p-3 text-left border transition hud-cut-sm ${btnStyle} ${
                      phase === 'QUESTION_ACTIVE' ? 'cursor-pointer' : 'cursor-default'
                    }`}
                  >
                    <span className="h-7 w-7 shrink-0 flex items-center justify-center font-display font-bold text-xs bg-slate-950 border border-slate-700 text-cyan-300">
                      {idx + 1}
                    </span>
                    <span className="font-thai text-sm sm:text-base font-semibold flex-1">
                      {choice}
                    </span>
                    {isCorrectChoice && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                    {isWrongSelected && <XCircle className="w-4 h-4 text-rose-400 shrink-0" />}
                  </button>
                )
              })}
            </div>

            {/* Rules strip during active question */}
            {phase === 'QUESTION_ACTIVE' && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-950/75 border border-slate-800 text-[11px]">
                <span className="font-thai text-emerald-300">
                  ✓ ตอบถูก: สุ่มปืน 1 ใน 8 กระบอก (+100 PTS +1 ULT)
                </span>
                <span className="font-thai text-rose-300 font-semibold">
                  ✕ ตอบผิด: ไม่ได้รับปืน (+0 PTS)
                </span>
                <span className="font-mono text-cyan-300">กดปุ่ม 1–4 ตอบด่วน</span>
              </div>
            )}

            {/* STAGE 3: EXPLICIT ANSWER_FEEDBACK PANEL (Visible ~1.35s on correct, persistent on wrong) */}
            {phase === 'ANSWER_FEEDBACK' && lastAnswer && (
              <div className="space-y-3">
                <div
                  id="math-answer-feedback"
                  className={`p-4 border flex items-start gap-3 ${
                    lastAnswer.correct
                      ? 'bg-emerald-950/70 border-emerald-400/80 text-emerald-100'
                      : 'bg-rose-950/70 border-rose-500/80 text-rose-100'
                  }`}
                >
                  {lastAnswer.correct ? (
                    <CheckCircle2 className="w-7 h-7 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-7 h-7 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1 flex-1">
                    <div className="font-display text-base sm:text-lg font-black tracking-wide">
                      {lastAnswer.correct
                        ? `CORRECT! +${lastAnswer.pointsAwarded} PTS • +1 ULT`
                        : 'WRONG ANSWER • ตอบผิดไม่ได้รับปืน (+0 PTS / NO WEAPON)'}
                    </div>
                    <div className="font-thai text-sm text-amber-200 font-semibold">
                      คำตอบที่ถูกต้อง: {lastAnswer.correctChoiceText}
                    </div>
                    <p className="font-thai text-xs sm:text-sm text-slate-200 leading-relaxed">
                      วิธีคิด: {lastAnswer.explanation}
                    </p>
                    {lastAnswer.correct && (
                      <div className="pt-1.5 flex items-center justify-between gap-2">
                        <span className="font-thai text-xs text-cyan-300 font-semibold">
                          กำลังเข้าสู่หน้าสุ่มอาวุธ 1 ใน 8 กระบอก...
                        </span>
                        <button
                          id="btn-math-skip-to-roll"
                          type="button"
                          onClick={advanceMathToWeaponReveal}
                          className="px-3 py-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-display font-black text-[11px] uppercase hud-cut-sm cursor-pointer"
                        >
                          สุ่มปืนเลย (SPACE)
                        </button>
                      </div>
                    )}
                    {!lastAnswer.correct && mandatoryLock && (
                      <p className="font-thai text-xs text-amber-300 font-semibold pt-1">
                        🔒 คุณยังไม่มีปืน — ต้องตอบโจทย์คณิตข้อใหม่ให้ถูกต้องก่อนจึงจะสุ่มปืนได้!
                      </p>
                    )}
                  </div>
                </div>

                {/* Wrong Answer Action Controls */}
                {!lastAnswer.correct && (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-thai text-slate-400 mr-1">ระดับข้อถัดไป:</span>
                      {([undefined, 'easy', 'medium', 'hard'] as Array<Difficulty | undefined>).map((d) => (
                        <button
                          key={d ?? 'any'}
                          type="button"
                          onClick={() => setPreferredDiff(d)}
                          className={`px-2.5 py-1 text-[11px] font-display uppercase border cursor-pointer ${
                            preferredDiff === d
                              ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200'
                              : 'bg-slate-900 border-slate-700 text-slate-400'
                          }`}
                        >
                          {d ?? 'MIX'}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        id="btn-math-next"
                        type="button"
                        onClick={handleNextQuestion}
                        className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-display font-black text-xs tracking-wider uppercase hud-cut-sm cursor-pointer shadow-[0_0_24px_rgba(0,229,255,0.4)]"
                      >
                        ทำโจทย์ข้อใหม่เพื่อสุ่มปืน ([RR] / SPACE)
                      </button>
                      {!mandatoryLock && (
                        <button
                          id="btn-math-back"
                          type="button"
                          onClick={closeAndReturnToCombat}
                          className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-display text-xs uppercase cursor-pointer"
                        >
                          BACK TO ARENA
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {errorMessage && (
              <div className="px-3.5 py-2 bg-rose-950/80 border border-rose-500/60 text-rose-200 text-xs font-thai">
                {errorMessage}
              </div>
            )}
          </div>
        )}

        {/* STAGE 4: WEAPON_REVEAL (Animated 8-Weapon Neon Roulette Spinner) */}
        {phase === 'WEAPON_REVEAL' && lastAnswer?.correct && lastAnswer.awardedWeapon && (
          <WeaponRouletteStage
            key={lastAnswer.questionId}
            awardedWeapon={lastAnswer.awardedWeapon}
            pointsAwarded={lastAnswer.pointsAwarded}
            onEnterCombat={closeAndReturnToCombat}
          />
        )}

        {/* Loading or Error Fallback */}
        {!visibleQuestion && phase !== 'WEAPON_REVEAL' && (
          <div className="py-8 text-center space-y-3">
            <div className="font-thai text-slate-300">
              {errorMessage || 'กำลังสุ่มโจทย์คณิตศาสตร์จากเซิร์ฟเวอร์...'}
            </div>
            <div className="flex items-center justify-center gap-2">
              {!noMoreQuestions && (
                <button
                  type="button"
                  onClick={() => multiplayerClient.requestQuestion(preferredDiff)}
                  className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-display font-bold text-xs uppercase cursor-pointer"
                >
                  RETRY QUESTION
                </button>
              )}
              {!mandatoryLock && (
                <button
                  type="button"
                  onClick={closeAndReturnToCombat}
                  className="px-4 py-2 bg-slate-800 text-slate-200 text-xs font-display uppercase cursor-pointer"
                >
                  RETURN TO ARENA
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
