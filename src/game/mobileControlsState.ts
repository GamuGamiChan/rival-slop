import type { SkillSlot } from '../../shared/types.ts'

export interface MobileInputState {
  moveX: number
  moveY: number
  lookDeltaYaw: number
  lookDeltaPitch: number
  firing: boolean
  aiming: boolean
  jumping: boolean
  sprinting: boolean
  pendingReload: boolean
  pendingSlide: boolean
  pendingSkill: SkillSlot | null
}

/**
 * Mutable 60fps bridge between MobileControlsOverlay touch gestures and PlayerController.
 * Avoids React re-renders during continuous joystick/touch-look movement.
 */
export const mobileInput: MobileInputState = {
  moveX: 0,
  moveY: 0,
  lookDeltaYaw: 0,
  lookDeltaPitch: 0,
  firing: false,
  aiming: false,
  jumping: false,
  sprinting: false,
  pendingReload: false,
  pendingSlide: false,
  pendingSkill: null,
}

export function resetMobileInput(): void {
  mobileInput.moveX = 0
  mobileInput.moveY = 0
  mobileInput.lookDeltaYaw = 0
  mobileInput.lookDeltaPitch = 0
  mobileInput.firing = false
  mobileInput.aiming = false
  mobileInput.jumping = false
  mobileInput.sprinting = false
  mobileInput.pendingReload = false
  mobileInput.pendingSlide = false
  mobileInput.pendingSkill = null
}
