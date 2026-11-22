import { QUESTION_BANK } from './questions.ts'
import type { Difficulty, MathQuestion, QuestionSet } from './types.ts'

const COUNTING_IDS = new Set([
  ...Array.from({ length: 14 }, (_, i) => `E${String(i + 1).padStart(2, '0')}`),
  ...Array.from({ length: 20 }, (_, i) => `M${String(i + 1).padStart(2, '0')}`),
  ...Array.from({ length: 14 }, (_, i) => `H${String(i + 1).padStart(2, '0')}`),
])

export const BUILTIN_QUESTION_SETS: readonly QuestionSet[] = [
  {
    id: 'builtin-all-84',
    name: 'คลังโจทย์ทั้งหมด (84 ข้อ)',
    description: 'รวมโจทย์ครบทุกบท ทั้งหลักการนับ ม.4 และคณิต ม.ปลายหลากหลาย (ความน่าจะเป็น เซต ลอการิทึม ตรีโกณฯ แคลคูลัส)',
    builtIn: true,
    questions: QUESTION_BANK,
  },
  {
    id: 'builtin-counting-48',
    name: 'หลักการนับเบื้องต้น ม.4 (48 ข้อ)',
    description: 'เน้นเฉพาะบทที่ 1 ค31102: หลักการคูณ แฟกทอเรียล เรียงสับเปลี่ยน P(n,r) และจัดหมู่ C(n,r)',
    builtIn: true,
    questions: QUESTION_BANK.filter((q) => COUNTING_IDS.has(q.id)),
  },
  {
    id: 'builtin-diverse-36',
    name: 'คณิตหลากหลาย ม.ปลาย (36 ข้อ)',
    description: 'ความน่าจะเป็น เซต ตรรกศาสตร์ เลขยกกำลัง ลอการิทึม ลำดับอนุกรม ตรีโกณฯ สถิติ เมทริกซ์ และอนุพันธ์',
    builtIn: true,
    questions: QUESTION_BANK.filter((q) => !COUNTING_IDS.has(q.id)),
  },
  {
    id: 'builtin-easy-26',
    name: 'ชุดฝึกพื้นฐาน Easy (26 ข้อ)',
    description: 'โจทย์ระดับเริ่มต้น คิดไว เหมาะสำหรับผู้เล่นใหม่หรือวอร์มอัปก่อนลงแข่ง',
    builtIn: true,
    questions: QUESTION_BANK.filter((q) => q.difficulty === 'easy'),
  },
]

export const DEFAULT_QUESTION_SET: QuestionSet = BUILTIN_QUESTION_SETS[0]

export function getBuiltInQuestionSetById(id: string): QuestionSet | undefined {
  return BUILTIN_QUESTION_SETS.find((s) => s.id === id)
}

function normalizeDifficulty(val: unknown): Difficulty {
  if (val === 'easy' || val === 'medium' || val === 'hard') return val
  return 'medium'
}

/**
 * Validates and sanitizes an incoming QuestionSet (from custom editor or network).
 * Guarantees every question has a unique id, non-empty prompt, 4 choices, and valid correctIndex.
 */
export function sanitizeQuestionSet(
  rawInput: unknown,
): { ok: true; set: QuestionSet } | { ok: false; message: string } {
  const raw = rawInput as QuestionSet | undefined | null
  if (!raw || typeof raw !== 'object') {
    return { ok: true, set: DEFAULT_QUESTION_SET }
  }

  // Fast path: known built-in set ID with no custom edits
  const builtIn = typeof raw.id === 'string' ? getBuiltInQuestionSetById(raw.id) : undefined
  if (builtIn && raw.builtIn) {
    return { ok: true, set: builtIn }
  }

  if (!Array.isArray(raw.questions) || raw.questions.length === 0) {
    return { ok: false, message: 'ชุดโจทย์ต้องมีอย่างน้อย 1 ข้อ' }
  }

  const sanitizedQuestions: MathQuestion[] = []
  const seenIds = new Set<string>()
  const maxQuestions = 150

  for (let i = 0; i < Math.min(raw.questions.length, maxQuestions); i++) {
    const q = raw.questions[i]
    if (!q || typeof q !== 'object') continue
    const prompt = String(q.prompt ?? '').trim().slice(0, 600)
    if (prompt.length < 3) continue
    if (!Array.isArray(q.choices) || q.choices.length !== 4) continue
    const choices = q.choices.map((c, idx) => String(c ?? '').trim().slice(0, 160) || `ตัวเลือก ${idx + 1}`) as [
      string,
      string,
      string,
      string,
    ]
    const rawIdx = Number(q.correctIndex)
    const correctIndex: 0 | 1 | 2 | 3 =
      rawIdx === 0 || rawIdx === 1 || rawIdx === 2 || rawIdx === 3 ? rawIdx : 0

    let id = String(q.id ?? '').trim().slice(0, 40) || `CQ-${i + 1}`
    while (seenIds.has(id)) {
      id = `${id}_${i + 1}`
    }
    seenIds.add(id)

    sanitizedQuestions.push({
      id,
      difficulty: normalizeDifficulty(q.difficulty),
      topic: String(q.topic ?? '').trim().slice(0, 80) || 'โจทย์กำหนดเอง',
      formulaHint: String(q.formulaHint ?? '').trim().slice(0, 300) || 'วิเคราะห์เงื่อนไขจากโจทย์ทีละขั้น',
      stepHint: String(q.stepHint ?? '').trim().slice(0, 400) || undefined,
      prompt,
      choices,
      correctIndex,
      explanation:
        String(q.explanation ?? '').trim().slice(0, 800) || `คำตอบที่ถูกต้องคือ "${choices[correctIndex]}"`,
      sourceRef: String(q.sourceRef ?? '').trim() || 'Custom Set',
    })
  }

  if (sanitizedQuestions.length === 0) {
    return { ok: false, message: 'ไม่พบโจทย์ที่สมบูรณ์ในชุดที่เลือก (ต้องมีโจทย์และตัวเลือก 4 ข้อ)' }
  }

  const cleanName = String(raw.name ?? '').trim().slice(0, 60) || 'ชุดโจทย์กำหนดเอง'
  const cleanDesc = String(raw.description ?? '').trim().slice(0, 180)
  const cleanId = String(raw.id ?? '').trim().slice(0, 60) || `custom-${Date.now()}`

  return {
    ok: true,
    set: {
      id: cleanId,
      name: cleanName,
      description: cleanDesc,
      builtIn: false,
      questions: sanitizedQuestions,
    },
  }
}
