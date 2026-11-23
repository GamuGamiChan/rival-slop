import {
  BookOpen,
  Check,
  Copy,
  Download,
  FolderPlus,
  ImagePlus,
  Plus,
  Save,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { BUILTIN_QUESTION_SETS, sanitizeQuestionSet } from '../../shared/questionSets.ts'
import type { Difficulty, MathQuestion, QuestionSet } from '../../shared/types.ts'
import {
  compressImageFileToDataUrl,
  createBlankCustomQuestion,
  loadCustomQuestionSets,
  loadSelectedQuestionSetId,
  saveCustomQuestionSets,
  saveSelectedQuestionSetId,
} from '../game/questionSetStore.ts'
import { multiplayerClient } from '../multiplayer/client.ts'
import { selectMyPlayer, useGameStore } from '../store/useGameStore.ts'

export function QuestionSetEditor() {
  const open = useGameStore((s) => s.questionEditorOpen)
  if (!open) return null
  return <QuestionSetEditorInner />
}

function QuestionSetEditorInner() {
  const setOpen = useGameStore((s) => s.setQuestionEditorOpen)
  const bumpQuestionSetsVersion = useGameStore((s) => s.bumpQuestionSetsVersion)
  const room = useGameStore((s) => s.room)
  const me = useGameStore(selectMyPlayer)
  const screen = useGameStore((s) => s.screen)

  const [customSets, setCustomSets] = useState<QuestionSet[]>(() => loadCustomQuestionSets())
  const [activeSetId, setActiveSetId] = useState<string>(() => loadSelectedQuestionSetId())
  const [draft, setDraft] = useState<QuestionSet | null>(() => {
    const loaded = loadCustomQuestionSets()
    const selectedId = loadSelectedQuestionSetId()
    const foundCustom = loaded.find((s) => s.id === selectedId)
    const foundBuiltIn = BUILTIN_QUESTION_SETS.find((s) => s.id === selectedId)
    return structuredClone(foundCustom ?? foundBuiltIn ?? BUILTIN_QUESTION_SETS[0])
  })
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)

  const allSets: QuestionSet[] = [...BUILTIN_QUESTION_SETS, ...customSets]
  const isReadOnly = Boolean(draft?.builtIn)

  const selectSet = (setItem: QuestionSet) => {
    setActiveSetId(setItem.id)
    setDraft(structuredClone(setItem))
    setFeedback(null)
  }

  const handleCreateNewSet = () => {
    const newId = `custom-${Date.now()}`
    const newSet: QuestionSet = {
      id: newId,
      name: `ชุดโจทย์ของฉัน #${customSets.length + 1}`,
      description: 'ชุดโจทย์คณิตศาสตร์ที่ออกแบบเอง',
      builtIn: false,
      questions: [createBlankCustomQuestion(1)],
    }
    const nextCustom = [...customSets, newSet]
    setCustomSets(nextCustom)
    saveCustomQuestionSets(nextCustom)
    saveSelectedQuestionSetId(newId)
    bumpQuestionSetsVersion()
    setActiveSetId(newId)
    setDraft(structuredClone(newSet))
    setFeedback({ ok: true, text: 'สร้างชุดโจทย์ใหม่แล้ว สามารถเพิ่มและแก้ไขโจทย์ได้ทันที' })
  }

  const handleDuplicateSet = (source: QuestionSet) => {
    const newId = `custom-${Date.now()}`
    const cloned: QuestionSet = {
      id: newId,
      name: `${source.name} (สำเนา)`.slice(0, 60),
      description: source.description,
      builtIn: false,
      questions: source.questions.slice(0, 150).map((q, idx) => ({
        ...structuredClone(q),
        id: `CQ-${Date.now()}-${idx + 1}`,
      })),
    }
    const nextCustom = [...customSets, cloned]
    setCustomSets(nextCustom)
    saveCustomQuestionSets(nextCustom)
    saveSelectedQuestionSetId(newId)
    bumpQuestionSetsVersion()
    setActiveSetId(newId)
    setDraft(structuredClone(cloned))
    setFeedback({ ok: true, text: `คัดลอกชุดโจทย์ "${source.name}" เป็นชุดใหม่เรียบร้อย` })
  }

  const handleDeleteCustomSet = (id: string) => {
    const nextCustom = customSets.filter((s) => s.id !== id)
    setCustomSets(nextCustom)
    saveCustomQuestionSets(nextCustom)
    const fallback = nextCustom[0] ?? BUILTIN_QUESTION_SETS[0]
    saveSelectedQuestionSetId(fallback.id)
    bumpQuestionSetsVersion()
    setActiveSetId(fallback.id)
    setDraft(structuredClone(fallback))
    setFeedback({ ok: true, text: 'ลบชุดโจทย์เรียบร้อย' })
  }

  const updateQuestion = (index: number, patch: Partial<MathQuestion>) => {
    if (!draft || isReadOnly) return
    const nextQuestions = draft.questions.map((q, i) => (i === index ? { ...q, ...patch } : q))
    setDraft({ ...draft, questions: nextQuestions })
  }

  const updateChoice = (qIndex: number, choiceIndex: 0 | 1 | 2 | 3, value: string) => {
    if (!draft || isReadOnly) return
    const q = draft.questions[qIndex]
    if (!q) return
    const nextChoices = [...q.choices] as [string, string, string, string]
    nextChoices[choiceIndex] = value
    updateQuestion(qIndex, { choices: nextChoices })
  }

  const handleAddQuestion = () => {
    if (!draft || isReadOnly) return
    if (draft.questions.length >= 150) {
      setFeedback({ ok: false, text: 'จำกัดสูงสุด 150 ข้อต่อ 1 ชุดโจทย์' })
      return
    }
    const nextQ = createBlankCustomQuestion(draft.questions.length + 1)
    setDraft({ ...draft, questions: [...draft.questions, nextQ] })
    setFeedback(null)
  }

  const handleUploadImageForQuestion = async (qIndex: number, file: File | undefined) => {
    if (!file || !draft || isReadOnly) return
    try {
      const dataUrl = await compressImageFileToDataUrl(file)
      updateQuestion(qIndex, { imageDataUrl: dataUrl })
      setFeedback({ ok: true, text: `อัปโหลดรูปประกอบโจทย์ข้อที่ ${qIndex + 1} เรียบร้อย` })
    } catch (err) {
      setFeedback({ ok: false, text: err instanceof Error ? err.message : 'อัปโหลดรูปไม่สำเร็จ' })
    }
  }

  const handleAddQuestionFromImage = async (file: File | undefined) => {
    if (!file || !draft || isReadOnly) return
    if (draft.questions.length >= 150) {
      setFeedback({ ok: false, text: 'จำกัดสูงสุด 150 ข้อต่อ 1 ชุดโจทย์' })
      return
    }
    try {
      const dataUrl = await compressImageFileToDataUrl(file)
      const nextQ = {
        ...createBlankCustomQuestion(draft.questions.length + 1),
        prompt: 'ดูโจทย์จากรูปภาพด้านล่างแล้วเลือกคำตอบที่ถูกต้อง',
        imageDataUrl: dataUrl,
        choices: ['A', 'B', 'C', 'D'] as [string, string, string, string],
        correctIndex: 0 as const,
        explanation: 'เฉลยตามรูปภาพโจทย์ที่อัปโหลด',
      }
      setDraft({ ...draft, questions: [...draft.questions, nextQ] })
      setFeedback({ ok: true, text: 'สร้างโจทย์ข้อใหม่จากรูปภาพแล้ว กรุณาระบุตัวเลือกและคำตอบที่ถูกต้อง' })
    } catch (err) {
      setFeedback({ ok: false, text: err instanceof Error ? err.message : 'อัปโหลดรูปไม่สำเร็จ' })
    }
  }

  const handleRemoveQuestion = (index: number) => {
    if (!draft || isReadOnly) return
    if (draft.questions.length <= 1) {
      setFeedback({ ok: false, text: 'ชุดโจทย์ต้องมีอย่างน้อย 1 ข้อ' })
      return
    }
    setDraft({
      ...draft,
      questions: draft.questions.filter((_, i) => i !== index),
    })
  }

  const handleSaveAndSelect = () => {
    if (!draft) return
    if (draft.builtIn) {
      saveSelectedQuestionSetId(draft.id)
      bumpQuestionSetsVersion()
      if (screen === 'lobby' && room?.phase === 'lobby' && me?.isHost) {
        multiplayerClient.setQuestionSet(draft)
      }
      setFeedback({ ok: true, text: `เลือกใช้ชุดโจทย์ "${draft.name}" แล้ว` })
      return
    }

    const res = sanitizeQuestionSet(draft)
    if (!res.ok) {
      setFeedback({ ok: false, text: res.message })
      return
    }

    const exists = customSets.some((s) => s.id === res.set.id)
    const nextCustom = exists
      ? customSets.map((s) => (s.id === res.set.id ? res.set : s))
      : [...customSets, res.set]
    setCustomSets(nextCustom)
    saveCustomQuestionSets(nextCustom)
    saveSelectedQuestionSetId(res.set.id)
    bumpQuestionSetsVersion()
    setDraft(structuredClone(res.set))

    if (screen === 'lobby' && room?.phase === 'lobby' && me?.isHost) {
      multiplayerClient.setQuestionSet(res.set)
    }

    setFeedback({
      ok: true,
      text: `บันทึกชุดโจทย์ "${res.set.name}" (${res.set.questions.length} ข้อ) และตั้งเป็นชุดที่ใช้งานแล้ว!`,
    })
  }

  const handleExportJson = () => {
    if (!draft) return
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${draft.id || 'question-set'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportJson = (file: File | undefined) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result ?? '')) as QuestionSet
        const res = sanitizeQuestionSet({ ...parsed, builtIn: false, id: `custom-${Date.now()}` })
        if (!res.ok) {
          setFeedback({ ok: false, text: `นำเข้าไม่สำเร็จ: ${res.message}` })
          return
        }
        const nextCustom = [...customSets, res.set]
        setCustomSets(nextCustom)
        saveCustomQuestionSets(nextCustom)
        saveSelectedQuestionSetId(res.set.id)
        bumpQuestionSetsVersion()
        setActiveSetId(res.set.id)
        setDraft(structuredClone(res.set))
        setFeedback({ ok: true, text: `นำเข้าชุดโจทย์ "${res.set.name}" (${res.set.questions.length} ข้อ) สำเร็จ` })
      } catch {
        setFeedback({ ok: false, text: 'ไฟล์ JSON ไม่ถูกต้อง' })
      }
    }
    reader.readAsText(file)
  }

  return (
    <div
      id="question-set-editor-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-3 md:p-6"
    >
      <div className="hud-panel hud-cut border border-cyan-500/50 bg-[#070f20] w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden shadow-[0_0_50px_rgba(0,229,255,0.2)]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-3">
            <BookOpen className="w-5 h-5 text-cyan-400" />
            <div>
              <h2 className="font-display text-base sm:text-lg font-black text-white tracking-wider uppercase">
                QUESTION SET DESIGNER &amp; EDITOR
              </h2>
              <p className="font-thai text-xs text-slate-400">
                ออกแบบโจทย์เอง แยกชุดโจทย์ แก้ไขโจทย์/คำตอบ/คำอธิบาย แล้วเลือกใช้ตอนสร้างห้องได้ทันที
              </p>
            </div>
          </div>

          <button
            id="btn-close-question-editor"
            type="button"
            onClick={() => setOpen(false)}
            className="p-2 bg-slate-900 hover:bg-rose-950/80 border border-slate-700 hover:border-rose-500/60 text-slate-300 hover:text-rose-200 cursor-pointer"
            aria-label="Close question editor"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main 2-Column Body */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 overflow-hidden">
          {/* Left Sidebar: Question Sets List */}
          <aside className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-slate-800 bg-slate-950/50 p-4 flex flex-col gap-3 overflow-y-auto">
            <div className="flex items-center justify-between gap-2">
              <span className="font-display text-xs tracking-[0.18em] text-cyan-300 uppercase">
                ชุดโจทย์ทั้งหมด ({allSets.length})
              </span>
              <div className="flex items-center gap-1.5">
                <label className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-[11px] font-thai flex items-center gap-1 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  <span>นำเข้า JSON</span>
                  <input
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={(e) => handleImportJson(e.target.files?.[0])}
                  />
                </label>
                <button
                  id="btn-new-question-set"
                  type="button"
                  onClick={handleCreateNewSet}
                  className="px-2.5 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-display font-bold text-[11px] tracking-wider uppercase flex items-center gap-1 cursor-pointer"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  <span>สร้างชุดใหม่</span>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {allSets.map((item) => {
                const selected = item.id === activeSetId
                return (
                  <div
                    key={item.id}
                    className={`p-3 border transition ${
                      selected
                        ? 'bg-cyan-950/40 border-cyan-400/80'
                        : 'bg-slate-900/70 border-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => selectSet(item)}
                      className="w-full text-left cursor-pointer space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-thai font-bold text-sm text-white truncate">
                          {item.name}
                        </span>
                        <span
                          className={`text-[10px] font-display px-1.5 py-0.5 uppercase shrink-0 ${
                            item.builtIn
                              ? 'bg-slate-800 text-slate-300'
                              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          }`}
                        >
                          {item.builtIn ? 'BUILT-IN' : 'CUSTOM'} • {item.questions.length} ข้อ
                        </span>
                      </div>
                      {item.description && (
                        <p className="font-thai text-[11px] text-slate-400 line-clamp-2">
                          {item.description}
                        </p>
                      )}
                    </button>

                    <div className="flex items-center justify-end gap-1.5 mt-2 pt-2 border-t border-slate-800/80">
                      <button
                        type="button"
                        onClick={() => handleDuplicateSet(item)}
                        className="px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-300 text-[11px] font-thai flex items-center gap-1 cursor-pointer"
                        title="คัดลอกชุดนี้ไปแก้ไข"
                      >
                        <Copy className="w-3 h-3" /> คัดลอกไปแก้ไข
                      </button>
                      {!item.builtIn && (
                        <button
                          type="button"
                          onClick={() => handleDeleteCustomSet(item.id)}
                          className="px-2 py-1 bg-rose-950/60 hover:bg-rose-900/80 border border-rose-500/40 text-rose-300 text-[11px] font-thai flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" /> ลบชุด
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </aside>

          {/* Right Panel: Set Details & Question Editor */}
          <section className="lg:col-span-8 flex flex-col min-h-0 overflow-hidden">
            {draft && (
              <>
                {/* Set Metadata Bar */}
                <div className="p-4 border-b border-slate-800 bg-slate-950/40 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="input-set-name"
                        className="block text-[11px] font-display tracking-wider text-slate-400 uppercase mb-1"
                      >
                        ชื่อชุดโจทย์
                      </label>
                      <input
                        id="input-set-name"
                        type="text"
                        maxLength={60}
                        disabled={isReadOnly}
                        value={draft.name}
                        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 focus:border-cyan-400 focus:outline-none text-white font-thai text-sm disabled:opacity-65"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="input-set-desc"
                        className="block text-[11px] font-display tracking-wider text-slate-400 uppercase mb-1"
                      >
                        คำอธิบายชุดโจทย์
                      </label>
                      <input
                        id="input-set-desc"
                        type="text"
                        maxLength={180}
                        disabled={isReadOnly}
                        value={draft.description}
                        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 focus:border-cyan-400 focus:outline-none text-white font-thai text-sm disabled:opacity-65"
                      />
                    </div>
                  </div>

                  {isReadOnly && (
                    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-amber-500/10 border border-amber-400/40 text-amber-200 text-xs font-thai">
                      <span>
                        ชุดโจทย์มาตรฐานเป็นแบบอ่านอย่างเดียว — กด <strong>&ldquo;คัดลอกไปแก้ไข&rdquo;</strong>{' '}
                        เพื่อนำไปเพิ่ม/แก้โจทย์และคำตอบได้ตามต้องการ
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDuplicateSet(draft)}
                        className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer"
                      >
                        คัดลอกไปแก้ไข
                      </button>
                    </div>
                  )}

                  {feedback && (
                    <div
                      className={`px-3 py-2 border text-xs font-thai ${
                        feedback.ok
                          ? 'bg-emerald-950/70 border-emerald-500/50 text-emerald-200'
                          : 'bg-rose-950/70 border-rose-500/50 text-rose-200'
                      }`}
                    >
                      {feedback.text}
                    </div>
                  )}
                </div>

                {/* Questions List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {draft.questions.map((q, qIdx) => (
                    <div
                      key={q.id}
                      className="p-4 bg-slate-950/75 border border-slate-800 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 font-display text-xs font-bold">
                            ข้อที่ {qIdx + 1}
                          </span>
                          <select
                            disabled={isReadOnly}
                            value={q.difficulty}
                            onChange={(e) =>
                              updateQuestion(qIdx, { difficulty: e.target.value as Difficulty })
                            }
                            className="px-2 py-1 bg-slate-900 border border-slate-700 text-xs font-display text-slate-200 uppercase disabled:opacity-65"
                          >
                            <option value="easy">EASY</option>
                            <option value="medium">MEDIUM</option>
                            <option value="hard">HARD</option>
                          </select>
                          <input
                            type="text"
                            disabled={isReadOnly}
                            value={q.topic}
                            onChange={(e) => updateQuestion(qIdx, { topic: e.target.value })}
                            placeholder="หัวข้อ เช่น ตรีโกณมิติ"
                            className="px-2.5 py-1 bg-slate-900 border border-slate-700 text-xs font-thai text-slate-200 w-44 disabled:opacity-65"
                          />
                        </div>

                        {!isReadOnly && (
                          <button
                            type="button"
                            onClick={() => handleRemoveQuestion(qIdx)}
                            className="px-2 py-1 bg-rose-950/60 hover:bg-rose-900 border border-rose-500/40 text-rose-300 text-xs font-thai flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> ลบข้อนี้
                          </button>
                        )}
                      </div>

                      {/* Prompt + Optional Image Upload */}
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label
                            htmlFor={`input-q-prompt-${qIdx}`}
                            className="block text-[11px] font-thai text-slate-400"
                          >
                            คำถาม / โจทย์คณิตศาสตร์ (พิมพ์ข้อความ หรืออัปโหลดรูปภาพโจทย์)
                          </label>
                          {!isReadOnly && (
                            <div className="flex items-center gap-1.5">
                              <label className="px-2.5 py-1 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/60 text-cyan-200 text-[11px] font-thai font-bold flex items-center gap-1 cursor-pointer">
                                <ImagePlus className="w-3.5 h-3.5" />
                                <span>{q.imageDataUrl ? 'เปลี่ยนรูปโจทย์' : 'อัปโหลดรูปโจทย์'}</span>
                                <input
                                  id={`input-q-image-${qIdx}`}
                                  type="file"
                                  accept="image/png,image/jpeg,image/webp,image/gif"
                                  className="hidden"
                                  onChange={(e) => {
                                    void handleUploadImageForQuestion(qIdx, e.target.files?.[0])
                                    e.target.value = ''
                                  }}
                                />
                              </label>
                              {q.imageDataUrl && (
                                <button
                                  id={`btn-remove-q-image-${qIdx}`}
                                  type="button"
                                  onClick={() => updateQuestion(qIdx, { imageDataUrl: undefined })}
                                  className="px-2 py-1 bg-rose-950/60 hover:bg-rose-900 border border-rose-500/40 text-rose-300 text-[11px] font-thai cursor-pointer"
                                >
                                  ลบรูป
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        <textarea
                          id={`input-q-prompt-${qIdx}`}
                          rows={2}
                          disabled={isReadOnly}
                          value={q.prompt}
                          onChange={(e) => updateQuestion(qIdx, { prompt: e.target.value })}
                          placeholder="พิมพ์โจทย์ที่นี่ (หรือเว้นสั้นๆ แล้วอัปโหลดรูปโจทย์)..."
                          className="w-full px-3 py-2 bg-slate-900/90 border border-slate-700 focus:border-cyan-400 focus:outline-none text-white font-thai text-sm disabled:opacity-65"
                        />
                        {q.imageDataUrl && (
                          <div className="p-2 bg-slate-900/90 border border-cyan-500/35 flex justify-center">
                            <img
                              id={`preview-q-image-${qIdx}`}
                              src={q.imageDataUrl}
                              alt={`ภาพโจทย์ข้อที่ ${qIdx + 1}`}
                              className="max-h-44 w-auto object-contain rounded"
                            />
                          </div>
                        )}
                      </div>

                      {/* 4 Choices + Correct Answer Radio */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {([0, 1, 2, 3] as const).map((cIdx) => {
                          const isCorrect = q.correctIndex === cIdx
                          return (
                            <div
                              key={cIdx}
                              className={`flex items-center gap-2 p-2 border ${
                                isCorrect
                                  ? 'bg-emerald-950/40 border-emerald-500/60'
                                  : 'bg-slate-900/60 border-slate-800'
                              }`}
                            >
                              <input
                                id={`radio-q-correct-${qIdx}-${cIdx}`}
                                type="radio"
                                name={`correct-${q.id}-${qIdx}`}
                                disabled={isReadOnly}
                                checked={isCorrect}
                                onChange={() => updateQuestion(qIdx, { correctIndex: cIdx })}
                                className="accent-emerald-400 cursor-pointer"
                                title="เลือกเป็นคำตอบที่ถูกต้อง"
                              />
                              <span className="font-display text-xs font-bold text-slate-400 w-5">
                                {['A', 'B', 'C', 'D'][cIdx]}
                              </span>
                              <input
                                id={`input-q-choice-${qIdx}-${cIdx}`}
                                type="text"
                                disabled={isReadOnly}
                                value={q.choices[cIdx]}
                                onChange={(e) => updateChoice(qIdx, cIdx, e.target.value)}
                                placeholder={`ตัวเลือก ${['A', 'B', 'C', 'D'][cIdx]}`}
                                className="flex-1 bg-transparent border-b border-slate-700 focus:border-cyan-400 focus:outline-none text-white font-thai text-sm py-0.5 disabled:opacity-65"
                              />
                            </div>
                          )
                        })}
                      </div>

                      {/* Hints & Explanation */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                        <div>
                          <label className="block text-[11px] font-thai text-slate-400 mb-1">
                            คำอธิบายเฉลย (Explanation)
                          </label>
                          <input
                            type="text"
                            disabled={isReadOnly}
                            value={q.explanation}
                            onChange={(e) => updateQuestion(qIdx, { explanation: e.target.value })}
                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 text-xs font-thai text-slate-200 disabled:opacity-65"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-thai text-slate-400 mb-1">
                            ตัวช่วย: สูตร/แนวคิด (Formula Hint)
                          </label>
                          <input
                            type="text"
                            disabled={isReadOnly}
                            value={q.formulaHint}
                            onChange={(e) => updateQuestion(qIdx, { formulaHint: e.target.value })}
                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 text-xs font-thai text-slate-200 disabled:opacity-65"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-thai text-slate-400 mb-1">
                            ตัวช่วย: ไกด์ทีละขั้น (Step Hint)
                          </label>
                          <input
                            type="text"
                            disabled={isReadOnly}
                            value={q.stepHint ?? ''}
                            onChange={(e) => updateQuestion(qIdx, { stepHint: e.target.value })}
                            className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 text-xs font-thai text-slate-200 disabled:opacity-65"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Footer Actions */}
                <div className="px-4 py-3 border-t border-slate-800 bg-slate-950/80 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {!isReadOnly && (
                      <>
                        <button
                          id="btn-add-question"
                          type="button"
                          onClick={handleAddQuestion}
                          className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-cyan-500/50 text-cyan-200 font-thai font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                        >
                          <Plus className="w-4 h-4" /> เพิ่มโจทย์ใหม่
                        </button>
                        <label className="px-3.5 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/70 text-cyan-100 font-thai font-bold text-xs flex items-center gap-1.5 cursor-pointer">
                          <ImagePlus className="w-4 h-4" />
                          <span>สร้างข้อใหม่จากรูปภาพ</span>
                          <input
                            id="input-add-question-from-image"
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif"
                            className="hidden"
                            onChange={(e) => {
                              void handleAddQuestionFromImage(e.target.files?.[0])
                              e.target.value = ''
                            }}
                          />
                        </label>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={handleExportJson}
                      className="px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-thai text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" /> ส่งออก JSON
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-display text-xs uppercase cursor-pointer"
                    >
                      ปิด
                    </button>
                    <button
                      id="btn-save-question-set"
                      type="button"
                      onClick={handleSaveAndSelect}
                      className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-black text-xs tracking-wider uppercase flex items-center gap-1.5 cursor-pointer"
                    >
                      {isReadOnly ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                      {isReadOnly ? 'เลือกใช้ชุดโจทย์นี้' : 'บันทึก & เลือกใช้ชุดนี้'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
