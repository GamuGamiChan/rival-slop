import { describe, expect, it } from 'vitest'
import {
  getQuestionStepHint,
  pickNextQuestion,
  QUESTION_BANK,
  toPublicQuestion,
} from '../shared/questions.ts'

describe('Expanded Diverse High-School Math Question Bank (84 Questions)', () => {
  it('contains 84 unique, well-formed questions across easy, medium, and hard with diverse topics', () => {
    expect(QUESTION_BANK.length).toBe(84)

    const ids = new Set<string>()
    const topics = new Set<string>()
    const counts = { easy: 0, medium: 0, hard: 0 }

    for (const q of QUESTION_BANK) {
      expect(ids.has(q.id)).toBe(false)
      ids.add(q.id)
      topics.add(q.topic)

      counts[q.difficulty]++
      expect(q.prompt.trim().length).toBeGreaterThan(10)
      expect(q.explanation.trim().length).toBeGreaterThan(10)
      expect(q.formulaHint.trim().length).toBeGreaterThan(3)
      expect(getQuestionStepHint(q).trim().length).toBeGreaterThan(10)
      expect(q.sourceRef.trim().length).toBeGreaterThan(3)
      expect(q.choices).toHaveLength(4)
      expect(new Set(q.choices).size).toBe(4) // All 4 choices distinct
      expect([0, 1, 2, 3]).toContain(q.correctIndex)
    }

    expect(counts.easy).toBe(26)
    expect(counts.medium).toBe(32)
    expect(counts.hard).toBe(26)
    expect(topics.size).toBeGreaterThanOrEqual(14)
  })

  it('sanitizes questions before sending to clients (never leaks correctIndex, explanation, or stepHint)', () => {
    const pub = toPublicQuestion(QUESTION_BANK[0])
    expect('correctIndex' in pub).toBe(false)
    expect('explanation' in pub).toBe(false)
    expect('stepHint' in pub).toBe(false)
    expect(pub.id).toBe(QUESTION_BANK[0].id)
    expect(pub.choices).toHaveLength(4)
  })

  it('never repeats previously attempted questions until bank is exhausted', () => {
    const used = new Set<string>()
    for (let i = 0; i < QUESTION_BANK.length; i++) {
      const next = pickNextQuestion(used)
      expect(next).not.toBeNull()
      expect(used.has(next!.id)).toBe(false)
      used.add(next!.id)
    }
    expect(pickNextQuestion(used)).toBeNull()
  })
})
