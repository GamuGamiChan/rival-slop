import {
  BUILTIN_QUESTION_SETS,
  DEFAULT_QUESTION_SET,
  sanitizeQuestionSet,
} from '../../shared/questionSets.ts'
import type { MathQuestion, QuestionSet } from '../../shared/types.ts'

const CUSTOM_SETS_KEY = 'math_rivals_custom_question_sets_v1'
const SELECTED_SET_KEY = 'math_rivals_selected_question_set_v1'

export function loadCustomQuestionSets(): QuestionSet[] {
  try {
    const raw = localStorage.getItem(CUSTOM_SETS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const valid: QuestionSet[] = []
    for (const item of parsed) {
      const res = sanitizeQuestionSet(item as QuestionSet)
      if (res.ok && !res.set.builtIn) {
        valid.push(res.set)
      }
    }
    return valid
  } catch {
    return []
  }
}

export function saveCustomQuestionSets(sets: QuestionSet[]): void {
  try {
    const customOnly = sets.filter((s) => !s.builtIn)
    localStorage.setItem(CUSTOM_SETS_KEY, JSON.stringify(customOnly))
  } catch {
    // Ignore storage quota errors
  }
}

export function loadSelectedQuestionSetId(): string {
  try {
    const id = localStorage.getItem(SELECTED_SET_KEY)
    return id && id.trim().length > 0 ? id : DEFAULT_QUESTION_SET.id
  } catch {
    return DEFAULT_QUESTION_SET.id
  }
}

export function saveSelectedQuestionSetId(id: string): void {
  try {
    localStorage.setItem(SELECTED_SET_KEY, id)
  } catch {
    // Ignore storage errors
  }
}

export function getAllQuestionSets(): QuestionSet[] {
  return [...BUILTIN_QUESTION_SETS, ...loadCustomQuestionSets()]
}

export function getQuestionSetById(id: string): QuestionSet {
  const all = getAllQuestionSets()
  return all.find((s) => s.id === id) ?? DEFAULT_QUESTION_SET
}

export function getSelectedQuestionSet(): QuestionSet {
  return getQuestionSetById(loadSelectedQuestionSetId())
}

export function createBlankCustomQuestion(index: number): MathQuestion {
  return {
    id: `CQ-${Date.now()}-${index}`,
    difficulty: 'easy',
    topic: 'โจทย์กำหนดเอง',
    formulaHint: 'วิเคราะห์โจทย์แล้วเลือกคำตอบที่ถูกต้อง',
    stepHint: 'อ่านเงื่อนไขให้ครบก่อนคำนวณทีละขั้น',
    prompt: 'ตัวอย่างโจทย์ใหม่: 7 × 8 เท่ากับเท่าใด?',
    choices: ['48', '54', '56', '64'],
    correctIndex: 2,
    explanation: '7 × 8 = 56',
    sourceRef: 'Custom Question',
  }
}
