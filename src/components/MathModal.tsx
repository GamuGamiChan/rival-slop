import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Clock,
  Compass,
  Dices,
  History,
  Lightbulb,
  Loader2,
  Scissors,
  ShieldAlert,
  Sparkles,
  XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { AGENT_IDS, AGENTS } from '../../shared/agents.ts'
import type { AnswerResultPayload, Difficulty, WeaponId } from '../../shared/types.ts'
import { REWARD_WEAPON_POOL, WEAPONS } from '../../shared/weapons.ts'
import { inputManager } from '../game/inputManager.ts'
import { soundEngine } from '../game/sound.ts'
import { multiplayerClient } from '../multiplayer/client.ts'
import { selectMyPlayer, useGameStore } from '../store/useGameStore.ts'

const DIFF_META: Record<Difficulty, { label: string; badgeClass: string; oddsNote: string }> = {
  easy: {
    label: 'EASY',
    badgeClass: 'bg-emerald-500/20 border-emerald-400/60 text-emerald-300',
    oddsNote: 'สุ่มอาวุธจาก Weapon Pool (Pistol / Rifle / Shotgun / Sniper)',
  },
  medium: {
    label: 'MEDIUM',
    badgeClass: 'bg-amber-500/20 border-amber-400/60 text-amber-300',
    oddsNote: 'สมดุล • โอกาสได้ Rifle / Shotgun / Sniper สูงขึ้น',
  },
  hard: {
    label: 'HARD',
    badgeClass: 'bg-rose-500/20 border-rose-400/60 text-rose-300',
    oddsNote: 'ระดับท้าทาย • โอกาสได้ Sniper / Shotgun / Rifle สูงสุด!',
  },
}

const ROULETTE_MARKS_MS = [0, 65, 135, 210, 295, 390, 495, 615, 750, 900, 1060]
const TOTAL_STEPS = ROULETTE_MARKS_MS.length - 1

function WeaponRouletteStage({
  awardedWeapon,
  pointsAwarded,
  roundLeftSec,
}: {
  awardedWeapon: WeaponId
  pointsAwarded: number
  roundLeftSec: number
}) {
  const pool = REWARD_WEAPON_POOL
  const targetIdx = Math.max(0, pool.indexOf(awardedWeapon))
  const startIdx = (targetIdx - TOTAL_STEPS + pool.length * 6) % pool.length
  const [step, setStep] = useState(0)

  const locked = step >= TOTAL_STEPS
  const activeIdx = (startIdx + Math.min(step, TOTAL_STEPS)) % pool.length
  const activeSpec = WEAPONS[pool[activeIdx]]
  const wonSpec = WEAPONS[awardedWeapon]

  useEffect(() => {
    const startedAt = performance.now()
    let lastStep = 0

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
      if (nextStep >= TOTAL_STEPS) {
        window.clearInterval(id)
      }
    }, 55)

    return () => {
      window.clearInterval(id)
    }
  }, [])

  return (
    <div id="weapon-roulette-stage" className="space-y-4">
      <div className="p-3.5 border bg-emerald-950/65 border-emerald-400/70 text-emerald-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="w-7 h-7 text-emerald-400 shrink-0" />
          <div>
            <div className="font-display text-lg font-extrabold tracking-wide">
              CORRECT! WEAPON REWARD • +{pointsAwarded} PTS • +1 ULT
            </div>
            <div className="font-thai text-xs text-emerald-200/90">
              {locked
                ? `ได้รับอาวุธใหม่: ${wonSpec.name.toUpperCase()} — เตรียมเริ่ม Combat Round ถัดไป!`
                : 'ระบบกลางกำลังสุ่มอาวุธจาก Weapon Pool (Pistol / Rifle / Shotgun / Sniper)...'}
            </div>
          </div>
        </div>
        <Dices className={`w-6 h-6 text-cyan-300 shrink-0 ${locked ? '' : 'animate-spin'}`} />
      </div>

      {/* 4 Official Weapon Pool Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {pool.map((wid, idx) => {
          const w = WEAPONS[wid]
          const isActive = idx === activeIdx
          const isWinner = locked && wid === awardedWeapon
          return (
            <div
              key={wid}
              data-weapon-pool-item={wid}
              className={`p-3 border transition-all duration-75 ${
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
                <span className="font-display text-xs font-black text-white uppercase tracking-wider">
                  {wid.toUpperCase()}
                </span>
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: w.accentColor }}
                />
              </div>
              <div className="font-display text-[11px] text-slate-200 font-bold mt-0.5 truncate">
                {w.name}
              </div>
              <div className="text-[10px] font-mono mt-0.5 truncate" style={{ color: w.accentColor }}>
                {w.badge}
              </div>
              <div className="text-[10px] font-display text-slate-400 mt-1">
                DMG {w.damage}
                {w.pellets > 1 ? `×${w.pellets}` : ''} • {w.magSize}RD
              </div>
            </div>
          )
        })}
      </div>

      <div
        className="p-4 bg-slate-950/90 border flex flex-wrap items-center justify-between gap-3"
        style={{ borderColor: locked ? wonSpec.accentColor : activeSpec.accentColor }}
      >
        <div>
          <div className="text-[10px] font-display tracking-[0.2em] uppercase text-slate-400">
            {locked ? 'AUTHORITATIVE WEAPON REWARD EQUIPPED' : 'SERVER ROLLING WEAPON POOL...'}
          </div>
          <div
            id="math-awarded-weapon-name"
            data-awarded-weapon={awardedWeapon}
            className="font-display text-2xl font-black uppercase tracking-wide"
            style={{ color: locked ? wonSpec.accentColor : activeSpec.accentColor }}
          >
            {locked ? `${awardedWeapon.toUpperCase()} — ${wonSpec.name}` : activeSpec.name}
          </div>
          <div className="font-thai text-xs text-slate-300 mt-0.5">
            {locked ? wonSpec.tagline : 'กำลังสุ่มจากคลังอาวุธหลัก 4 ชนิด...'}
          </div>
        </div>

        <div className="px-4 py-2 bg-cyan-950/80 border border-cyan-400/60 text-cyan-200 font-thai text-xs font-bold flex items-center gap-2">
          <Clock className="w-4 h-4 text-cyan-300 animate-pulse" />
          <span>เริ่ม Combat Round ถัดไปใน {roundLeftSec}s</span>
        </div>
      </div>
    </div>
  )
}

function WeaponPenaltyStage({
  result,
  roundLeftSec,
}: {
  result: AnswerResultPayload
  roundLeftSec: number
}) {
  const lostSpec = result.confiscatedWeapon ? WEAPONS[result.confiscatedWeapon] : null

  return (
    <div
      id="weapon-penalty-stage"
      data-penalty-points={result.pointsAwarded}
      data-weapon-confiscated={String(result.weaponConfiscated)}
      className="space-y-3 p-4 bg-rose-950/80 border-2 border-rose-500/90 text-rose-100 shadow-[0_0_40px_rgba(244,63,94,0.32)] animate-pulse"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rose-500/40 pb-3">
        <div className="flex items-center gap-3">
          <ShieldAlert className="w-8 h-8 text-rose-400 shrink-0" />
          <div>
            <div className="font-display text-lg sm:text-xl font-black tracking-wider text-rose-200 uppercase">
              WRONG ANSWER! • WEAPON CONFISCATED • {result.pointsAwarded} PTS
            </div>
            <div className="font-thai text-xs sm:text-sm text-rose-200/95 font-semibold">
              ตอบผิด! ระบบยึดอาวุธที่ถืออยู่ทันที และหักคะแนน 300 คะแนน (ไม่ได้รับอาวุธใหม่ในรอบนี้)
            </div>
          </div>
        </div>
        <span className="px-3 py-1 bg-rose-500/30 border border-rose-400 text-rose-100 font-display font-black text-sm">
          {result.pointsAwarded} PTS
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div className="p-3 bg-slate-950/85 border border-rose-500/50 space-y-1">
          <div className="font-display text-[10px] tracking-[0.18em] text-rose-300 uppercase">
            WEAPON PENALTY STATUS
          </div>
          <div className="font-thai text-sm font-bold text-white">
            {lostSpec
              ? `ถูกยึดอาวุธ: ${lostSpec.name} → เข้าสู่สถานะหมัดมือเปล่า (CYBER FISTS)`
              : 'สถานะ: หมัดมือเปล่า (CYBER FISTS — ไม่มีปืนในรอบถัดไป)'}
          </div>
          <div className="font-thai text-[11px] text-rose-300/90">
            คลิกซ้ายใช้หมัดต่อยระยะประชิด (3.4m / DMG 35) ได้ และรอจบรอบเพื่อตอบคำถามชิงปืนใหม่
          </div>
        </div>

        <div className="p-3 bg-slate-950/85 border border-amber-400/50 space-y-1">
          <div className="font-display text-[10px] tracking-[0.18em] text-amber-300 uppercase">
            CORRECT SOLUTION &amp; EXPLANATION
          </div>
          <div className="font-thai text-sm font-bold text-amber-200">
            คำตอบที่ถูกต้อง: {result.correctChoiceText}
          </div>
          <div className="font-thai text-[11px] text-slate-200 leading-relaxed">
            วิธีคิด: {result.explanation}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end text-xs font-thai text-rose-200 pt-1">
        <Clock className="w-3.5 h-3.5 mr-1.5 text-rose-300" />
        กำลังเข้าสู่ Combat Round ถัดไปในอีก {roundLeftSec} วินาที...
      </div>
    </div>
  )
}

export function MathModal() {
  const open = useGameStore((s) => s.mathModalOpen)
  const phase = useGameStore((s) => s.mathFlowPhase)
  const room = useGameStore((s) => s.room)
  const activeQuestion = useGameStore((s) => s.activeQuestion)
  const submittedQuestion = useGameStore((s) => s.submittedQuestion)
  const selectedChoiceIndex = useGameStore((s) => s.selectedChoiceIndex)
  const lastAnswer = useGameStore((s) => s.lastAnswerResult)
  const mathHistory = useGameStore((s) => s.mathHistory)
  const mathHelperState = useGameStore((s) => s.mathHelperState)
  const beginMathSubmission = useGameStore((s) => s.beginMathSubmission)
  const advanceMathToWeaponReveal = useGameStore((s) => s.advanceMathToWeaponReveal)
  const errorMessage = useGameStore((s) => s.errorMessage)
  const clockOffsetMs = useGameStore((s) => s.clockOffsetMs)
  const me = useGameStore(selectMyPlayer)

  const [hintQuestionId, setHintQuestionId] = useState<string | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (!open) return
    const id = window.setInterval(() => setNowMs(Date.now()), 200)
    return () => window.clearInterval(id)
  }, [open])

  const visibleQuestion = activeQuestion ?? submittedQuestion
  const helperForCurrent =
    visibleQuestion && mathHelperState.questionId === visibleQuestion.id ? mathHelperState : null
  const eliminatedIndices = helperForCurrent?.eliminatedIndices ?? []
  const stepHintText = helperForCurrent?.stepHint ?? null
  const showFormulaHint = Boolean(
    visibleQuestion &&
      (hintQuestionId === visibleQuestion.id || Boolean(helperForCurrent?.formulaHint)),
  )

  const serverNow = Math.max(nowMs + clockOffsetMs, room?.serverNow ?? 0)
  const roundLeftSec =
    room && room.roundPhaseEndsAt !== null
      ? Math.max(0, Math.ceil((room.roundPhaseEndsAt - serverNow) / 1000))
      : 0
  const roundNumber = room?.roundNumber ?? 1
  const roundState = room?.roundState ?? 'MATH_CHALLENGE'
  const connectedCount = room ? room.players.filter((p) => p.connected).length : 1
  const answeredCount = room?.answeredPlayerIds.length ?? 0

  const handleChoice = useCallback(
    (idx: number) => {
      const state = useGameStore.getState()
      if (state.mathFlowPhase !== 'QUESTION_ACTIVE' || !state.activeQuestion) return
      if (
        state.room &&
        state.room.roundState !== 'MATH_CHALLENGE' &&
        state.room.roundState !== 'ANSWER_SUBMITTED'
      ) {
        return
      }
      const q = state.activeQuestion
      if (
        state.mathHelperState.questionId === q.id &&
        state.mathHelperState.eliminatedIndices.includes(idx)
      ) {
        return
      }
      // Lock choice immediately in state machine to prevent duplicate submissions
      beginMathSubmission(q, idx)
      multiplayerClient.submitAnswer(q.id, idx)
    },
    [beginMathSubmission],
  )

  // Subscribe cleanly to centralized InputManager for 1-4 answer hotkeys
  useEffect(() => {
    if (!open) return
    return inputManager.registerMathHandlers({
      onDigit: (choiceIndex) => {
        handleChoice(choiceIndex)
      },
      onContinue: () => {
        const s = useGameStore.getState()
        if (
          s.mathFlowPhase === 'ANSWER_FEEDBACK' &&
          s.lastAnswerResult?.correct &&
          s.lastAnswerResult.awardedWeapon
        ) {
          advanceMathToWeaponReveal()
        }
      },
    })
  }, [open, handleChoice, advanceMathToWeaponReveal])

  if (!open) return null

  const triggerFormulaHint = () => {
    if (!visibleQuestion) return
    setHintQuestionId(visibleQuestion.id)
    multiplayerClient.useMathHelper(visibleQuestion.id, 'formula')
  }

  const triggerFiftyFifty = () => {
    if (!visibleQuestion || phase !== 'QUESTION_ACTIVE') return
    if (eliminatedIndices.length > 0 || mathHelperState.remainingUses.fifty_fifty <= 0) return
    multiplayerClient.useMathHelper(visibleQuestion.id, 'fifty_fifty')
  }

  const triggerStepHint = () => {
    if (!visibleQuestion || phase !== 'QUESTION_ACTIVE') return
    if (stepHintText || mathHelperState.remainingUses.step_hint <= 0) return
    multiplayerClient.useMathHelper(visibleQuestion.id, 'step_hint')
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
      data-round-state={roundState}
      data-round-number={roundNumber}
      data-ui-interactive="true"
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-[#040812]/80 backdrop-blur-sm"
    >
      <div className="w-full max-w-2xl hud-panel hud-cut border border-cyan-500/70 p-5 sm:p-6 space-y-4 shadow-[0_0_60px_rgba(0,229,255,0.25)] max-h-[92vh] overflow-y-auto">
        {/* Top Bar: Round-Synchronized Math Challenge Header (No skip / No manual close) */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-xs tracking-[0.2em] text-cyan-300 uppercase flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" /> ROUND {roundNumber}/{room?.maxRounds ?? 10} MATH CHALLENGE
            </span>
            <span
              id="math-mandatory-badge"
              className="inline-flex items-center gap-1 text-[11px] font-thai font-bold px-2.5 py-0.5 bg-amber-500/20 border border-amber-400/70 text-amber-200"
            >
              จบ Combat Round • บังคับตอบคำถามพร้อมกันทั้งห้อง (ห้ามข้าม)
            </span>
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

          <div className="flex items-center gap-2">
            <span
              id="math-answered-counter"
              className="px-2.5 py-1 bg-slate-900 border border-slate-700 text-[11px] font-mono text-slate-300"
            >
              ตอบแล้ว {answeredCount}/{connectedCount}
            </span>
            <span
              id="math-challenge-timer"
              className={`px-2.5 py-1 border font-mono text-xs font-bold flex items-center gap-1 ${
                roundLeftSec <= 5
                  ? 'bg-rose-950/90 border-rose-500 text-rose-200 animate-pulse'
                  : 'bg-cyan-950/80 border-cyan-400/60 text-cyan-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              {roundLeftSec}s
            </span>
          </div>
        </div>

        {/* Visual 4-Stage State Machine Stepper */}
        <div className="grid grid-cols-4 gap-1.5 text-[10px] font-thai">
          {[
            '1. โจทย์ประจำรอบ',
            '2. ล็อกคำตอบ',
            '3. ตรวจผล & เฉลย',
            '4. รับปืน / บทลงโทษ',
          ].map((label, idx) => (
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

        {/* Between-Round Style / Agent Switcher */}
        {me && (
          <div
            id="math-style-switcher"
            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-950/85 border border-slate-800"
          >
            <span className="text-[10px] font-display tracking-[0.16em] text-amber-300 uppercase">
              STYLE รอบถัดไป:
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {AGENT_IDS.map((aid) => {
                const a = AGENTS[aid]
                const active = me.agent === aid
                return (
                  <button
                    key={aid}
                    id={`btn-math-style-${aid}`}
                    type="button"
                    onClick={() => multiplayerClient.selectAgent(aid)}
                    className={`px-2.5 py-1 text-[10px] font-display font-bold uppercase border transition cursor-pointer ${
                      active
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
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

        {/* STAGE 1, 2 & 3: QUESTION_ACTIVE / ANSWER_SUBMITTED / ANSWER_FEEDBACK */}
        {visibleQuestion && phase !== 'WEAPON_REVEAL' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-thai text-cyan-200 bg-cyan-950/60 border border-cyan-500/30 px-2.5 py-1">
                หัวข้อ: {visibleQuestion.topic}
              </span>
              {me && (
                <span className="font-thai text-xs text-slate-300">
                  อาวุธที่ถืออยู่ปัจจุบัน:{' '}
                  <strong className="text-cyan-300">
                    {me.weapon ? WEAPONS[me.weapon].name : 'UNARMED (มือเปล่า)'}
                  </strong>
                </span>
              )}
              {phase === 'ANSWER_SUBMITTED' && (
                <span className="inline-flex items-center gap-1.5 text-cyan-300 font-thai font-semibold">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> ส่งคำตอบแล้ว • รอระบบกลางประมวลผล...
                </span>
              )}
            </div>

            {/* 3 Tactical Math Helpers Bar (ตัวช่วยตอบคำถาม) */}
            {phase === 'QUESTION_ACTIVE' && (
              <div
                id="math-helpers-bar"
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-950/90 border border-amber-500/35"
              >
                <span className="text-[11px] font-thai font-bold text-amber-300 flex items-center gap-1.5">
                  <Lightbulb className="w-3.5 h-3.5" /> ตัวช่วย (LIFELINES):
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    id="btn-helper-formula"
                    type="button"
                    disabled={showFormulaHint}
                    onClick={triggerFormulaHint}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-thai font-bold border transition ${
                      showFormulaHint
                        ? 'bg-amber-500/20 border-amber-400/60 text-amber-200 cursor-default'
                        : 'bg-slate-900 hover:bg-amber-500/20 border-amber-400/50 text-amber-200 cursor-pointer'
                    }`}
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    {showFormulaHint ? 'แสดงสูตรแล้ว' : 'ใบ้สูตร (ฟรี)'}
                  </button>

                  <button
                    id="btn-helper-5050"
                    type="button"
                    disabled={
                      eliminatedIndices.length > 0 || mathHelperState.remainingUses.fifty_fifty <= 0
                    }
                    onClick={triggerFiftyFifty}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-thai font-bold border transition ${
                      eliminatedIndices.length > 0 || mathHelperState.remainingUses.fifty_fifty <= 0
                        ? 'bg-slate-950 border-slate-800 text-slate-500 cursor-not-allowed'
                        : 'bg-slate-900 hover:bg-cyan-500/20 border-cyan-400/60 text-cyan-200 cursor-pointer'
                    }`}
                  >
                    <Scissors className="w-3.5 h-3.5" />
                    ตัดช้อยส์ 50:50 ({mathHelperState.remainingUses.fifty_fifty})
                  </button>

                  <button
                    id="btn-helper-step"
                    type="button"
                    disabled={Boolean(stepHintText) || mathHelperState.remainingUses.step_hint <= 0}
                    onClick={triggerStepHint}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-thai font-bold border transition ${
                      stepHintText || mathHelperState.remainingUses.step_hint <= 0
                        ? 'bg-slate-950 border-slate-800 text-slate-500 cursor-not-allowed'
                        : 'bg-slate-900 hover:bg-emerald-500/20 border-emerald-400/60 text-emerald-200 cursor-pointer'
                    }`}
                  >
                    <Compass className="w-3.5 h-3.5" />
                    แนวคิดเริ่มต้น ({mathHelperState.remainingUses.step_hint})
                  </button>
                </div>
              </div>
            )}

            {/* Question prompt ALWAYS stays visible during selection AND feedback */}
            <div
              id="math-question-prompt"
              className="p-4 bg-slate-950/90 border border-slate-800 text-white font-thai text-base sm:text-lg leading-relaxed font-medium"
            >
              {visibleQuestion.prompt}
            </div>

            {/* Active Helper Clues */}
            {(showFormulaHint || stepHintText) && (
              <div className="space-y-2">
                {showFormulaHint && (
                  <div
                    id="math-formula-hint-box"
                    className="px-3.5 py-2 bg-amber-950/55 border border-amber-400/60 text-amber-100 font-thai text-xs sm:text-sm flex items-start gap-2"
                  >
                    <BookOpen className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-amber-300">สูตรสำคัญ:</strong> {visibleQuestion.formulaHint}
                    </span>
                  </div>
                )}
                {stepHintText && (
                  <div
                    id="math-step-hint-box"
                    className="px-3.5 py-2 bg-emerald-950/55 border border-emerald-400/60 text-emerald-100 font-thai text-xs sm:text-sm flex items-start gap-2"
                  >
                    <Compass className="w-4 h-4 text-emerald-300 shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-emerald-300">แนวคิดเริ่มต้น:</strong> {stepHintText}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Choice Grid (locked cleanly after submission; 50:50 eliminates 2 wrong choices) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {visibleQuestion.choices.map((choice, idx) => {
                const isSelected = selectedChoiceIndex === idx
                const isEliminated = eliminatedIndices.includes(idx)
                const isCorrectChoice = phase === 'ANSWER_FEEDBACK' && lastAnswer?.correctIndex === idx
                const isWrongSelected =
                  phase === 'ANSWER_FEEDBACK' && isSelected && lastAnswer && !lastAnswer.correct

                let btnStyle =
                  'bg-slate-900/90 hover:bg-cyan-500/20 border-slate-700 hover:border-cyan-400 text-slate-100'
                if (isEliminated && phase === 'QUESTION_ACTIVE') {
                  btnStyle = 'bg-slate-950/50 border-slate-800/70 text-slate-600 opacity-40 line-through'
                } else if (phase === 'ANSWER_SUBMITTED') {
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
                    data-eliminated={String(isEliminated)}
                    type="button"
                    disabled={phase !== 'QUESTION_ACTIVE' || isEliminated}
                    onClick={() => handleChoice(idx)}
                    className={`group flex items-center gap-3 p-3 text-left border transition hud-cut-sm ${btnStyle} ${
                      phase === 'QUESTION_ACTIVE' && !isEliminated
                        ? 'cursor-pointer'
                        : 'cursor-default'
                    }`}
                  >
                    <span className="h-7 w-7 shrink-0 flex items-center justify-center font-display font-bold text-xs bg-slate-950 border border-slate-700 text-cyan-300">
                      {idx + 1}
                    </span>
                    <span className="font-thai text-sm sm:text-base font-semibold flex-1">
                      {choice}
                    </span>
                    {isEliminated && phase === 'QUESTION_ACTIVE' && (
                      <span className="text-[10px] font-mono text-rose-400 uppercase shrink-0">ตัดออก</span>
                    )}
                    {isCorrectChoice && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                    {isWrongSelected && <XCircle className="w-4 h-4 text-rose-400 shrink-0" />}
                  </button>
                )
              })}
            </div>

            {/* Rules strip during active question */}
            {phase === 'QUESTION_ACTIVE' && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-950/85 border border-slate-800 text-[11px]">
                <span className="font-thai text-emerald-300 font-semibold">
                  ✓ ตอบถูก: สุ่มปืนไซไฟ 1 ใน 8 กระบอก +100 PTS (+1 ULT)
                </span>
                <span className="font-thai text-rose-400 font-bold flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> ✕ ตอบผิด / หมดเวลา: ยึดปืน (เหลือหมัดมือเปล่า) &amp; -300 PTS
                </span>
                <span className="font-mono text-cyan-300">กดปุ่ม 1–4 ตอบด่วน</span>
              </div>
            )}

            {/* STAGE 3: EXPLICIT ANSWER_FEEDBACK PANEL */}
            {phase === 'ANSWER_FEEDBACK' && lastAnswer && (
              <div className="space-y-3">
                {lastAnswer.correct ? (
                  <div
                    id="math-answer-feedback"
                    data-answer-correct="true"
                    className="p-4 border bg-emerald-950/75 border-emerald-400/80 text-emerald-100 flex items-start gap-3"
                  >
                    <CheckCircle2 className="w-7 h-7 text-emerald-400 shrink-0 mt-0.5" />
                    <div className="space-y-1 flex-1">
                      <div className="font-display text-base sm:text-lg font-black tracking-wide">
                        CORRECT! +{lastAnswer.pointsAwarded} PTS • +1 ULT
                      </div>
                      <div className="font-thai text-sm text-amber-200 font-semibold">
                        คำตอบที่ถูกต้อง: {lastAnswer.correctChoiceText}
                      </div>
                      <p className="font-thai text-xs sm:text-sm text-slate-200 leading-relaxed">
                        คำอธิบาย: {lastAnswer.explanation}
                      </p>
                      <div className="pt-1.5 flex items-center justify-between gap-2">
                        <span className="font-thai text-xs text-cyan-300 font-semibold">
                          กำลังเปิดระบบสุ่มอาวุธประจำรอบ (Weapon Reveal)...
                        </span>
                        <button
                          id="btn-math-skip-to-roll"
                          type="button"
                          onClick={advanceMathToWeaponReveal}
                          className="px-3 py-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-display font-black text-[11px] uppercase hud-cut-sm cursor-pointer"
                        >
                          เปิดผลสุ่มอาวุธ (SPACE)
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div id="math-answer-feedback" data-answer-correct="false">
                    <WeaponPenaltyStage result={lastAnswer} roundLeftSec={roundLeftSec} />
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

        {/* STAGE 4: WEAPON_REVEAL (Either 4-Weapon Pool Roulette on Correct OR Weapon Confiscation Card on Wrong) */}
        {phase === 'WEAPON_REVEAL' && lastAnswer && (
          <>
            {lastAnswer.correct && lastAnswer.awardedWeapon ? (
              <WeaponRouletteStage
                key={`${lastAnswer.roundNumber}-${lastAnswer.questionId}`}
                awardedWeapon={lastAnswer.awardedWeapon}
                pointsAwarded={lastAnswer.pointsAwarded}
                roundLeftSec={roundLeftSec}
              />
            ) : (
              <WeaponPenaltyStage result={lastAnswer} roundLeftSec={roundLeftSec} />
            )}
          </>
        )}

        {/* Question & Reward / Penalty History Log */}
        {mathHistory.length > 0 && (
          <div
            id="math-history-list"
            className="pt-2 border-t border-slate-800/90 space-y-1.5"
          >
            <div className="flex items-center gap-1.5 text-[10px] font-display tracking-[0.18em] text-slate-400 uppercase">
              <History className="w-3.5 h-3.5 text-cyan-400" />
              <span>ROUND QUESTION &amp; WEAPON REWARD HISTORY</span>
            </div>
            <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
              {mathHistory.slice(0, 4).map((h, i) => (
                <div
                  key={`${h.roundNumber}-${h.questionId}-${i}`}
                  className={`px-2.5 py-1 border text-[11px] font-thai flex flex-wrap items-center justify-between gap-2 ${
                    h.correct
                      ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                      : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                  }`}
                >
                  <span className="truncate max-w-[55%]">
                    <strong>R{h.roundNumber}</strong> • {h.topic}
                  </span>
                  <span className="font-mono text-[10px] font-bold">
                    {h.correct
                      ? `CORRECT (+${h.pointsDelta} PTS • ${h.awardedWeapon?.toUpperCase()})`
                      : `WRONG (${h.pointsDelta} PTS • ${
                          h.weaponConfiscated ? 'WEAPON CONFISCATED' : 'UNARMED'
                        })`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
