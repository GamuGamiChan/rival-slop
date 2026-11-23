import type { SkillSlot } from '../../shared/types.ts'

export interface InputSnapshot {
  forward: boolean
  backward: boolean
  left: boolean
  right: boolean
  sprint: boolean
  aim: boolean
  shooting: boolean
  pointerLocked: boolean
  arrowLeft: boolean
  arrowRight: boolean
  arrowUp: boolean
  arrowDown: boolean
}

export interface InputCallbacks {
  isArenaActive: () => boolean
  isCombatPlayable: () => boolean
  isMathModalOpen: () => boolean
  isPauseOpen: () => boolean
  canDismissMath: () => boolean
  hasWeapon: () => boolean
  onPointerLockChange: (locked: boolean, wasExpectedUnlock: boolean) => void
  onPointerLockError: () => void
  onShootPress: () => void
  onJumpPress: () => void
  onReloadPress: () => void
  onDoubleRPress: () => void
  onSingleRHint: () => void
  onOpenOrToggleMath: () => void
  onSkillPress: (slot: SkillSlot) => void
  onEscapePress: () => void
  onScoreboardChange: (open: boolean) => void
  onAimChange: (aiming: boolean) => void
  onSprintChange: (sprinting: boolean) => void
  onToggleControlsRef: () => void
  onMathDigitKey?: (choiceIndex: number) => void
  onMathContinueKey?: () => void
  onMathDoubleRKey?: () => void
}

const RR_DOUBLE_TAP_MS = 480
const MAX_SINGLE_MOUSE_DELTA = 140

const ARENA_CTRL_PREVENT_CODES = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyR',
  'KeyF',
  'KeyE',
  'KeyQ',
  'KeyC',
  'KeyX',
  'KeyV',
  'Space',
  'Tab',
])

/**
 * Single centralized FPS Input & Pointer Lock Manager.
 * Prevents duplicate event listeners, clears all held inputs on blur / tab switch / modal open,
 * enforces strict separation between Shift (Sprint only) and Ctrl (Aim Mode only),
 * and accumulates mouse movement strictly on intentional mousemove events so camera can NEVER drift.
 */
class CentralizedInputManager {
  private canvas: HTMLCanvasElement | null = null
  private attached = false
  private callbacks: InputCallbacks | null = null
  private mathHandlers: {
    onDigit?: (idx: number) => void
    onContinue?: () => void
    onDoubleR?: () => void
  } = {}

  private heldCodes = new Set<string>()
  private mouseLeftDown = false
  private mouseRightDown = false
  private dragAimActive = false
  private pointerLocked = false
  private slideQueued = false
  private tabMouseLookActive = false
  private lastMouseClientX: number | null = null
  private lastMouseClientY: number | null = null
  private expectingProgrammaticUnlock = false

  private pendingMouseDx = 0
  private pendingMouseDy = 0
  private lastMathRPressAt = 0

  attach(canvas: HTMLCanvasElement, callbacks: InputCallbacks): void {
    // Guarantee idempotent single registration (safe under React 19 StrictMode)
    if (this.attached) {
      this.detach()
    }
    this.canvas = canvas
    this.callbacks = callbacks
    this.attached = true
    this.pointerLocked = document.pointerLockElement === canvas
    this.resetAllInputs()

    document.addEventListener('pointerlockchange', this.handlePointerLockChange)
    document.addEventListener('pointerlockerror', this.handlePointerLockError)
    document.addEventListener('visibilitychange', this.handleVisibilityChange)
    window.addEventListener('keydown', this.handleKeyDown)
    window.addEventListener('keyup', this.handleKeyUp)
    window.addEventListener('mousemove', this.handleMouseMove)
    window.addEventListener('mousedown', this.handleMouseDown)
    window.addEventListener('mouseup', this.handleMouseUp)
    window.addEventListener('contextmenu', this.handleContextMenu)
    window.addEventListener('blur', this.handleBlur)
  }

  detach(): void {
    if (!this.attached) return
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange)
    document.removeEventListener('pointerlockerror', this.handlePointerLockError)
    document.removeEventListener('visibilitychange', this.handleVisibilityChange)
    window.removeEventListener('keydown', this.handleKeyDown)
    window.removeEventListener('keyup', this.handleKeyUp)
    window.removeEventListener('mousemove', this.handleMouseMove)
    window.removeEventListener('mousedown', this.handleMouseDown)
    window.removeEventListener('mouseup', this.handleMouseUp)
    window.removeEventListener('contextmenu', this.handleContextMenu)
    window.removeEventListener('blur', this.handleBlur)

    this.resetAllInputs()
    this.attached = false
    this.canvas = null
    this.callbacks = null
  }

  registerMathHandlers(handlers: {
    onDigit?: (idx: number) => void
    onContinue?: () => void
    onDoubleR?: () => void
  }): () => void {
    this.mathHandlers = handlers
    return () => {
      this.mathHandlers = {}
    }
  }

  requestPointerLock(): void {
    this.tabMouseLookActive = true
    this.lastMouseClientX = null
    this.lastMouseClientY = null
    this.callbacks?.onPointerLockChange(true, false)
    if (!this.canvas) return
    if (document.pointerLockElement === this.canvas) return
    try {
      const result = this.canvas.requestPointerLock?.() as unknown as Promise<void> | undefined
      if (result && typeof result.catch === 'function') {
        result.catch(() => {
          // Even if browser blocks Pointer Lock (e.g. from keyboard Tab press), tabMouseLookActive remains true!
          this.callbacks?.onPointerLockChange(true, false)
        })
      }
    } catch {
      this.callbacks?.onPointerLockChange(true, false)
    }
  }

  releasePointerLockProgrammatically(): void {
    this.tabMouseLookActive = false
    this.lastMouseClientX = null
    this.lastMouseClientY = null
    if (document.pointerLockElement) {
      this.expectingProgrammaticUnlock = true
      try {
        document.exitPointerLock()
      } catch {
        this.expectingProgrammaticUnlock = false
      }
    }
    this.pointerLocked = false
    this.callbacks?.onPointerLockChange(false, true)
  }

  toggleMouseLookWithTab(): void {
    if (this.pointerLocked || this.tabMouseLookActive) {
      this.releasePointerLockProgrammatically()
    } else {
      this.requestPointerLock()
    }
  }

  resetAllInputs(): void {
    const wasAiming = this.isAiming()
    const wasSprinting = this.isSprinting()
    this.heldCodes.clear()
    this.mouseLeftDown = false
    this.mouseRightDown = false
    this.dragAimActive = false
    this.lastMouseClientX = null
    this.lastMouseClientY = null
    this.pendingMouseDx = 0
    this.pendingMouseDy = 0
    this.lastMathRPressAt = 0
    if (wasAiming) {
      this.callbacks?.onAimChange(false)
    }
    if (wasSprinting) {
      this.callbacks?.onSprintChange(false)
    }
    this.callbacks?.onScoreboardChange(false)
  }

  private isCtrlHeld(): boolean {
    return this.heldCodes.has('ControlLeft') || this.heldCodes.has('ControlRight')
  }

  isAiming(): boolean {
    // Ctrl (Left or Right) is the primary Aim Mode key; RMB is optional secondary mouse aim.
    // Shift NEVER activates Aim.
    return this.isCtrlHeld() || this.mouseRightDown
  }

  consumeSlide(): boolean {
    if (!this.slideQueued) return false
    this.slideQueued = false
    return true
  }

  isSprinting(): boolean {
    // Shift ONLY controls sprint (never triggers rotation, aim, or automatic movement).
    return this.heldCodes.has('ShiftLeft') || this.heldCodes.has('ShiftRight')
  }

  getSnapshot(): InputSnapshot {
    return {
      forward: this.heldCodes.has('KeyW'),
      backward: this.heldCodes.has('KeyS'),
      left: this.heldCodes.has('KeyA'),
      right: this.heldCodes.has('KeyD'),
      sprint: this.isSprinting(),
      aim: this.isAiming(),
      shooting: this.mouseLeftDown,
      pointerLocked: this.pointerLocked || this.tabMouseLookActive,
      arrowLeft: this.heldCodes.has('ArrowLeft'),
      arrowRight: this.heldCodes.has('ArrowRight'),
      arrowUp: this.heldCodes.has('ArrowUp'),
      arrowDown: this.heldCodes.has('ArrowDown'),
    }
  }

  /**
   * Consumes accumulated intentional mouse deltas once per frame and immediately zeroes them.
   * Guarantees zero camera movement whenever the mouse is stationary.
   */
  consumeMouseDelta(): { dx: number; dy: number } {
    const dx = this.pendingMouseDx
    const dy = this.pendingMouseDy
    this.pendingMouseDx = 0
    this.pendingMouseDy = 0
    return { dx, dy }
  }

  private handlePointerLockChange = (): void => {
    const locked = Boolean(this.canvas && document.pointerLockElement === this.canvas)
    const wasExpected = this.expectingProgrammaticUnlock
    this.pointerLocked = locked
    if (locked) {
      this.tabMouseLookActive = true
    } else if (wasExpected) {
      this.tabMouseLookActive = false
    }
    this.expectingProgrammaticUnlock = false

    // Discard any queued mouse delta across pointer-lock state transitions to avoid sudden snap
    this.pendingMouseDx = 0
    this.pendingMouseDy = 0
    this.lastMouseClientX = null
    this.lastMouseClientY = null
    if (!locked && !this.tabMouseLookActive) {
      this.mouseLeftDown = false
      this.dragAimActive = false
    }

    this.callbacks?.onPointerLockChange(locked || this.tabMouseLookActive, wasExpected)
  }

  private handlePointerLockError = (): void => {
    this.pointerLocked = false
    this.expectingProgrammaticUnlock = false
    this.callbacks?.onPointerLockChange(this.tabMouseLookActive, true)
  }

  private handleBlur = (): void => {
    this.resetAllInputs()
  }

  private handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.resetAllInputs()
    }
  }

  private handleContextMenu = (e: MouseEvent): void => {
    if (this.callbacks?.isArenaActive()) {
      e.preventDefault()
    }
  }

  private handleMouseMove = (e: MouseEvent): void => {
    const cb = this.callbacks
    if (!cb || !cb.isArenaActive() || cb.isMathModalOpen() || cb.isPauseOpen()) {
      this.pendingMouseDx = 0
      this.pendingMouseDy = 0
      this.lastMouseClientX = null
      this.lastMouseClientY = null
      return
    }

    // Rotate camera ONLY when Pointer Lock / Tab Mouse Look is active or user is intentionally drag-aiming
    if (!this.pointerLocked && !this.tabMouseLookActive && !this.dragAimActive) {
      this.lastMouseClientX = null
      this.lastMouseClientY = null
      return
    }

    let dx = Number.isFinite(e.movementX) ? e.movementX : 0
    let dy = Number.isFinite(e.movementY) ? e.movementY : 0

    // Fallback delta computation from clientX/clientY when Tab Mouse Look is active without native pointerLock
    if (!this.pointerLocked && this.tabMouseLookActive && dx === 0 && dy === 0) {
      if (this.lastMouseClientX !== null && this.lastMouseClientY !== null) {
        dx = e.clientX - this.lastMouseClientX
        dy = e.clientY - this.lastMouseClientY
      }
      this.lastMouseClientX = e.clientX
      this.lastMouseClientY = e.clientY
    } else {
      this.lastMouseClientX = e.clientX
      this.lastMouseClientY = e.clientY
    }

    // Reject spurious browser pointer-lock spike events (>140px in a single tick)
    if (Math.abs(dx) > MAX_SINGLE_MOUSE_DELTA || Math.abs(dy) > MAX_SINGLE_MOUSE_DELTA) {
      return
    }

    this.pendingMouseDx += dx
    this.pendingMouseDy += dy
  }

  private handleMouseDown = (e: MouseEvent): void => {
    const cb = this.callbacks
    if (!cb || !cb.isArenaActive()) return
    if (cb.isMathModalOpen() || cb.isPauseOpen()) return

    // Do not intercept clicks on interactive HUD UI controls
    if (e.target instanceof HTMLElement && e.target.closest('button, input, a, label, [data-ui-interactive]')) {
      return
    }

    // Clicking the game canvas requests Pointer Lock / Mouse Look cleanly
    if (!this.pointerLocked && e.target === this.canvas) {
      this.requestPointerLock()
    }

    if (e.button === 0) {
      this.mouseLeftDown = true
      cb.onShootPress()
    } else if (e.button === 2) {
      const prevAim = this.isAiming()
      this.mouseRightDown = true
      if (!this.pointerLocked) {
        this.dragAimActive = true
      }
      if (!prevAim) {
        cb.onAimChange(true)
      }
    }
  }

  private handleMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) {
      this.mouseLeftDown = false
    } else if (e.button === 2) {
      const prevAim = this.isAiming()
      this.mouseRightDown = false
      this.dragAimActive = false
      if (prevAim && !this.isAiming()) {
        this.callbacks?.onAimChange(false)
      }
    }
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    const cb = this.callbacks
    if (!cb || !cb.isArenaActive()) return

    // Never hijack typing inside text inputs
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement
    ) {
      return
    }

    // Prevent browser shortcut conflicts while holding Ctrl in Arena (without breaking F12/etc.)
    if ((e.ctrlKey || e.code === 'ControlLeft' || e.code === 'ControlRight') && ARENA_CTRL_PREVENT_CODES.has(e.code)) {
      e.preventDefault()
    }

    if (e.code === 'Tab') {
      e.preventDefault()
      if (!cb.isPauseOpen()) {
        if (!e.repeat && !cb.isMathModalOpen()) {
          // Toggle Mouse Look Mode on Tab press, and exit Mouse Look Mode on second Tab press!
          this.toggleMouseLookWithTab()
        }
        cb.onScoreboardChange(true)
      }
      return
    }

    if (e.code === 'Escape') {
      e.preventDefault()
      cb.onEscapePress()
      return
    }

    // Route keyboard inputs cleanly to Math Modal when it is open (single centralized listener!)
    if (cb.isMathModalOpen()) {
      const digitMap: Record<string, number> = {
        Digit1: 0,
        Numpad1: 0,
        Digit2: 1,
        Numpad2: 1,
        Digit3: 2,
        Numpad3: 2,
        Digit4: 3,
        Numpad4: 3,
      }
      const digit = digitMap[e.code]
      if (digit !== undefined && !e.repeat) {
        e.preventDefault()
        this.mathHandlers.onDigit?.(digit)
        return
      }
      if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) {
        e.preventDefault()
        this.mathHandlers.onContinue?.()
        return
      }
      if (e.code === 'KeyR' && !e.repeat) {
        const now = performance.now()
        if (now - this.lastMathRPressAt <= RR_DOUBLE_TAP_MS) {
          e.preventDefault()
          this.lastMathRPressAt = 0
          this.mathHandlers.onDoubleR?.()
        } else {
          this.lastMathRPressAt = now
        }
        return
      }
      if (e.code === 'KeyE' && !e.repeat && cb.canDismissMath()) {
        e.preventDefault()
        cb.onOpenOrToggleMath()
      }
      return
    }

    if (cb.isPauseOpen()) return

    // Toggle compact in-game Controls Reference card with H
    if (e.code === 'KeyH' && !e.repeat) {
      e.preventDefault()
      cb.onToggleControlsRef()
      return
    }

    // Ctrl (Left or Right) activates Aim Mode ONLY
    if (e.code === 'ControlLeft' || e.code === 'ControlRight') {
      e.preventDefault()
      const prevAim = this.isAiming()
      this.heldCodes.add(e.code)
      if (!prevAim) {
        cb.onAimChange(true)
      }
      return
    }

    // Shift (Left or Right) activates Sprint ONLY
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      this.heldCodes.add(e.code)
      return
    }

    // R reloads the equipped weapon (Section 1: NO manual random weapon roll shortcut allowed!)
    if (e.code === 'KeyR' && !e.repeat && cb.isCombatPlayable()) {
      e.preventDefault()
      cb.onReloadPress()
      return
    }

    // Agent Tactical Skills (Q / C / X)
    if (cb.isCombatPlayable() && !e.repeat) {
      if (e.code === 'KeyQ') {
        e.preventDefault()
        cb.onSkillPress('Q')
        return
      }
      if (e.code === 'KeyC') {
        e.preventDefault()
        cb.onSkillPress('C')
        return
      }
      if (e.code === 'KeyX') {
        e.preventDefault()
        cb.onSkillPress('X')
        return
      }
    }

    // Movement & Action keys
    this.heldCodes.add(e.code)

    if (e.code === 'KeyV' && !e.repeat && cb.isCombatPlayable()) {
      this.slideQueued = true
    }

    if (e.code === 'Space' && !e.repeat && cb.isCombatPlayable()) {
      e.preventDefault()
      cb.onJumpPress()
    }

    if (e.code === 'KeyF' && !e.repeat && cb.isCombatPlayable()) {
      cb.onShootPress()
    }
  }

  private handleKeyUp = (e: KeyboardEvent): void => {
    const prevAim = this.isAiming()
    const hadMove =
      this.heldCodes.has('KeyW') ||
      this.heldCodes.has('KeyS') ||
      this.heldCodes.has('KeyA') ||
      this.heldCodes.has('KeyD')
    const prevSprintActive = this.isSprinting() && hadMove && !prevAim

    this.heldCodes.delete(e.code)

    if (e.code === 'Tab') {
      this.callbacks?.onScoreboardChange(false)
    }

    if ((e.code === 'ControlLeft' || e.code === 'ControlRight') && prevAim && !this.isAiming()) {
      this.callbacks?.onAimChange(false)
    }

    const stillHasMove =
      this.heldCodes.has('KeyW') ||
      this.heldCodes.has('KeyS') ||
      this.heldCodes.has('KeyA') ||
      this.heldCodes.has('KeyD')
    const nextSprintActive = this.isSprinting() && stillHasMove && !this.isAiming()
    if (prevSprintActive && !nextSprintActive) {
      this.callbacks?.onSprintChange(false)
    }
  }
}

export const inputManager = new CentralizedInputManager()
