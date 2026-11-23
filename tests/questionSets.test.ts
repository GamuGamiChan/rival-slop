import { describe, expect, it } from 'vitest'
import { BUILTIN_QUESTION_SETS, DEFAULT_QUESTION_SET, sanitizeQuestionSet } from '../shared/questionSets.ts'
import { RoomManager } from '../shared/roomManager.ts'
import type { QuestionSet } from '../shared/types.ts'

describe('Question Sets & Custom Room Question Selection', () => {
  it('provides 4 built-in sets with valid questions and resolves canonical built-ins in sanitizeQuestionSet', () => {
    expect(BUILTIN_QUESTION_SETS.length).toBe(4)
    expect(DEFAULT_QUESTION_SET.questions.length).toBe(84)

    const canonical = sanitizeQuestionSet({
      id: 'builtin-diverse-36',
      name: 'tampered',
      description: '',
      builtIn: true,
      questions: [],
    })
    expect(canonical.ok).toBe(true)
    if (canonical.ok) {
      expect(canonical.set.id).toBe('builtin-diverse-36')
      expect(canonical.set.questions.length).toBe(36)
      expect(canonical.set.name).toBe(BUILTIN_QUESTION_SETS[2].name)
    }
  })

  it('rejects empty custom question sets and sanitizes valid custom questions', () => {
    const emptyRes = sanitizeQuestionSet({
      id: 'c1',
      name: 'Empty',
      description: '',
      questions: [],
    })
    expect(emptyRes.ok).toBe(false)

    const validRes = sanitizeQuestionSet({
      id: 'custom-algebra',
      name: '  พีชคณิตพื้นฐาน  ',
      description: 'ทดสอบสมการ',
      questions: [
        {
          id: 'ALG-1',
          difficulty: 'easy',
          topic: 'สมการเชิงเส้น',
          formulaHint: 'ย้ายข้างสมการ',
          stepHint: '2x = 10 -> x = 5',
          prompt: 'ถ้า 2x + 4 = 14 แล้ว x มีค่าเท่าใด?',
          choices: ['3', '4', '5', '6'],
          correctIndex: 2,
          explanation: '2x = 10 ดังนั้น x = 5',
          sourceRef: 'Custom',
        },
      ],
    })
    expect(validRes.ok).toBe(true)
    if (validRes.ok) {
      expect(validRes.set.builtIn).toBe(false)
      expect(validRes.set.name).toBe('พีชคณิตพื้นฐาน')
      expect(validRes.set.questions[0].correctIndex).toBe(2)
    }
  })

  it('creates a room with a custom question set, uses it in MATH_CHALLENGE, and enforces host/lobby rules on setQuestionSet', () => {
    let now = 1_000_000
    const mgr = new RoomManager(
      () => now,
      () => 0.25,
    )

    const customSet: QuestionSet = {
      id: 'custom-room-test',
      name: 'ชุดโจทย์ห้องทดสอบ',
      description: '1 ข้อทดสอบ',
      builtIn: false,
      questions: [
        {
          id: 'CUSTOM-Q1',
          difficulty: 'medium',
          topic: 'เรขาคณิต',
          formulaHint: 'พื้นที่สามเหลี่ยม = 1/2 × ฐาน × สูง',
          stepHint: '1/2 × 10 × 6',
          prompt: 'สามเหลี่ยมฐาน 10 ซม. สูง 6 ซม. มีพื้นที่กี่ ตร.ซม.?',
          choices: ['16', '30', '60', '20'],
          correctIndex: 1,
          explanation: '1/2 × 10 × 6 = 30 ตร.ซม.',
          sourceRef: 'Custom',
        },
      ],
    }

    const host = mgr.createRoom('HostPlayer', customSet)
    expect(host.snapshot.questionSetId).toBe('custom-room-test')
    expect(host.snapshot.questionSetName).toBe('ชุดโจทย์ห้องทดสอบ')
    expect(host.snapshot.questionSetCount).toBe(1)

    const guest = mgr.joinRoom(host.roomCode, 'GuestPlayer')
    expect(guest.ok).toBe(true)
    if (!guest.ok) return

    // Non-host cannot change question set
    const nonHostAttempt = mgr.setQuestionSet(host.roomCode, guest.playerId, DEFAULT_QUESTION_SET)
    expect(nonHostAttempt.ok).toBe(false)
    if (!nonHostAttempt.ok) expect(nonHostAttempt.code).toBe('NOT_HOST')

    // Host can change question set in lobby, and back to customSet
    const switchToBuiltIn = mgr.setQuestionSet(host.roomCode, host.playerId, BUILTIN_QUESTION_SETS[3])
    expect(switchToBuiltIn.ok).toBe(true)
    if (switchToBuiltIn.ok) {
      expect(switchToBuiltIn.snapshot.questionSetId).toBe('builtin-easy-26')
      expect(switchToBuiltIn.snapshot.questionSetCount).toBe(26)
    }

    const switchBack = mgr.setQuestionSet(host.roomCode, host.playerId, customSet)
    expect(switchBack.ok).toBe(true)

    // Start match and advance into MATH_CHALLENGE
    const started = mgr.startMatch(host.roomCode, host.playerId)
    expect(started.ok).toBe(true)
    now += 4000
    mgr.tick() // countdown -> playing (ROUND_START)
    const room = mgr.getRoom(host.roomCode)!
    expect(room.phase).toBe('playing')

    // Cannot change question set once match has started
    const inGameAttempt = mgr.setQuestionSet(host.roomCode, host.playerId, DEFAULT_QUESTION_SET)
    expect(inGameAttempt.ok).toBe(false)
    if (!inGameAttempt.ok) expect(inGameAttempt.code).toBe('MATCH_IN_PROGRESS')

    // Advance ROUND_START -> COMBAT_ACTIVE -> ROUND_END -> MATH_CHALLENGE
    now = (room.roundPhaseEndsAt ?? now) + 50
    mgr.tick()
    now = (room.roundPhaseEndsAt ?? now) + 50
    mgr.tick()
    now = (room.roundPhaseEndsAt ?? now) + 50
    mgr.tick()

    expect(room.roundState).toBe('MATH_CHALLENGE')
    expect(room.activeRoundQuestionId).toBe('CUSTOM-Q1')

    // Verify answer validation uses the custom set's correctIndex (1)
    const ans = mgr.submitAnswer(host.roomCode, host.playerId, 'CUSTOM-Q1', 1)
    expect(ans.ok).toBe(true)
    if (ans.ok) {
      expect(ans.result.correct).toBe(true)
      expect(ans.result.correctIndex).toBe(1)
      expect(ans.result.explanation).toContain('30')
    }
  })

  it('preserves safe PNG/JPEG base64 imageDataUrl and strips unsafe SVG/URL image payloads', () => {
    const safePng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
    const unsafeSvg = 'data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+'

    const res = sanitizeQuestionSet({
      id: 'custom-img-test',
      name: 'ชุดโจทย์รูปภาพ',
      description: 'ทดสอบอัปโหลดรูป',
      questions: [
        {
          id: 'IMG-1',
          difficulty: 'easy',
          topic: 'เรขาคณิต',
          formulaHint: '',
          prompt: '',
          imageDataUrl: safePng,
          choices: ['10', '20', '30', '40'],
          correctIndex: 1,
          explanation: '20',
          sourceRef: 'Custom',
        },
        {
          id: 'IMG-2',
          difficulty: 'easy',
          topic: 'XSS',
          formulaHint: '',
          prompt: 'คำถามปลอดภัย',
          imageDataUrl: unsafeSvg,
          choices: ['1', '2', '3', '4'],
          correctIndex: 0,
          explanation: '1',
          sourceRef: 'Custom',
        },
      ],
    })

    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.set.questions[0].imageDataUrl).toBe(safePng)
      expect(res.set.questions[0].prompt).toContain('รูปภาพ')
      expect(res.set.questions[1].imageDataUrl).toBeUndefined()
    }
  })
})
