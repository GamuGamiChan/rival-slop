import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useRef } from 'react'
import * as THREE from 'three'
import {
  PLAYER_DIMENSIONS,
  raycastArenaObstacles,
  raycastPlayerHitbox,
  resolvePlayerMovement,
  type ArenaBox,
} from '../../shared/arena.ts'
import type { SkillSlot, WeaponId } from '../../shared/types.ts'
import { UNARMED_MELEE_SPEC, WEAPONS } from '../../shared/weapons.ts'
import { multiplayerClient } from '../multiplayer/client.ts'
import { selectMyPlayer, useGameStore } from '../store/useGameStore.ts'
import { inputManager } from './inputManager.ts'
import { mobileInput } from './mobileControlsState.ts'
import { soundEngine } from './sound.ts'

const WALK_SPEED = 7.8
const SPRINT_SPEED = 11.4
const GROUND_ACCEL = 64.0
const GROUND_DECEL = 52.0
const AIR_ACCEL = 28.0
const AIR_DRAG = 4.0
const JUMP_VELOCITY = 8.6
const GRAVITY = 22.0
const COYOTE_TIME_SEC = 0.12
const JUMP_BUFFER_SEC = 0.12
const DEFAULT_FOV = 75

// Reusable scratch objects (zero per-frame / per-shot GC allocations)
const _scratchEuler = new THREE.Euler(0, 0, 0, 'YXZ')
const _scratchDir = new THREE.Vector3()
const _scratchOffset = new THREE.Vector3()

function weaponRecoilKick(weapon: WeaponId | 'melee'): number {
  switch (weapon) {
    case 'melee':
      return 0.008
    case 'sniper':
      return 0.042
    case 'shotgun':
      return 0.032
    case 'revolver':
      return 0.026
    case 'burst':
      return 0.015
    case 'lmg':
      return 0.011
    case 'rifle':
      return 0.01
    case 'pistol':
      return 0.01
    case 'smg':
      return 0.006
  }
}

function aimFovForWeapon(weapon: WeaponId | null): number {
  if (!weapon) return 60
  if (weapon === 'sniper') return 30
  if (weapon === 'shotgun') return 65
  return Math.max(54, Math.min(62, WEAPONS[weapon].adsFov))
}

export function PlayerController() {
  const gl = useThree((s) => s.gl)
  const velXRef = useRef(0)
  const velZRef = useRef(0)
  const velocityYRef = useRef(0)
  const groundedRef = useRef(true)
  const coyoteTimerRef = useRef(0)
  const jumpBufferRef = useRef(0)
  const posRef = useRef({ x: 0, y: 0, z: -26 })
  const yawRef = useRef(Math.PI)
  const pitchRef = useRef(0)
  const recoilPitchRef = useRef(0)
  const lastShotClientAtRef = useRef(0)
  const prevAliveRef = useRef(true)
  const prevPhaseRef = useRef<string>('lobby')
  const wasLockedRef = useRef(false)
  const autoMathRequestedRef = useRef(false)
  const cumulativeLookRef = useRef(0)
  const cumulativeMoveRef = useRef(0)
  const lastMoveSentAtRef = useRef(0)
  const lastSentPosRef = useRef({ x: 0, y: 0, z: -26, yaw: Math.PI, pitch: 0 })

  const computeAimDirection = useCallback(() => {
    const clampedPitch = Math.max(
      -Math.PI / 2 + 0.06,
      Math.min(Math.PI / 2 - 0.06, pitchRef.current + recoilPitchRef.current),
    )
    _scratchEuler.set(clampedPitch, yawRef.current, 0, 'YXZ')
    _scratchDir.set(0, 0, -1).applyEuler(_scratchEuler).normalize()
    return { x: _scratchDir.x, y: _scratchDir.y, z: _scratchDir.z }
  }, [])

  const castSkill = useCallback(
    (slot: SkillSlot) => {
      const state = useGameStore.getState()
      if (
        state.room?.phase !== 'playing' ||
        (state.room.roundState !== 'COMBAT_ACTIVE' && state.room.roundState !== 'FREE_PLAY')
      ) {
        return
      }
      if (state.mathModalOpen || state.pauseOpen) return
      const me = selectMyPlayer(state)
      if (!me || !me.alive) return

      if (prevPhaseRef.current !== 'playing') {
        posRef.current = { ...me.position }
        yawRef.current = me.yaw
        prevPhaseRef.current = 'playing'
      }
      const dir = computeAimDirection()
      const origin = {
        x: posRef.current.x,
        y: posRef.current.y + PLAYER_DIMENSIONS.eyeHeight,
        z: posRef.current.z,
      }
      multiplayerClient.sendMove(posRef.current, yawRef.current, pitchRef.current)
      multiplayerClient.useSkill(slot, origin, dir)
    },
    [computeAimDirection],
  )

  const attemptShoot = useCallback(() => {
    const state = useGameStore.getState()
    if (
      state.room?.phase !== 'playing' ||
      (state.room.roundState !== 'COMBAT_ACTIVE' && state.room.roundState !== 'FREE_PLAY')
    ) {
      return
    }
    if (state.mathModalOpen || state.pauseOpen) return
    const me = selectMyPlayer(state)
    if (!me || !me.alive) return

    const isMelee = me.weapon === null
    const weaponOrMelee: WeaponId | 'melee' = me.weapon ?? 'melee'
    const spec = me.weapon ? WEAPONS[me.weapon] : null
    const now = performance.now()
    const serverNow = Date.now() + state.clockOffsetMs
    if (!isMelee && me.reloadingUntil && serverNow < me.reloadingUntil) return

    // Strictly prevent firing when magazine is empty -> trigger clear reload feedback instead
    if (!isMelee && me.ammo <= 0) {
      if (now - lastShotClientAtRef.current >= 320) {
        lastShotClientAtRef.current = now
        multiplayerClient.reload()
        soundEngine.playReload()
      }
      return
    }

    const baseFireRate = spec ? spec.fireRateMs : UNARMED_MELEE_SPEC.fireRateMs
    const overdriveActive = Boolean(me.overdriveUntil && serverNow < me.overdriveUntil)
    const effectiveFireRate = overdriveActive ? Math.floor(baseFireRate * 0.65) : baseFireRate
    if (now - lastShotClientAtRef.current < effectiveFireRate) return
    lastShotClientAtRef.current = now

    if (prevPhaseRef.current !== 'playing') {
      posRef.current = { ...me.position }
      yawRef.current = me.yaw
      prevPhaseRef.current = 'playing'
    }
    const dir = computeAimDirection()
    const origin = {
      x: posRef.current.x,
      y: posRef.current.y + PLAYER_DIMENSIONS.eyeHeight,
      z: posRef.current.z,
    }
    multiplayerClient.sendMove(posRef.current, yawRef.current, pitchRef.current)

    const barriers: ArenaBox[] = []
    if (state.room) {
      for (const eff of state.room.worldEffects) {
        if (eff.kind === 'barrier' && eff.box && eff.expiresAt > serverNow) {
          barriers.push({
            id: eff.id,
            minX: eff.box.minX,
            maxX: eff.box.maxX,
            minY: eff.box.minY,
            maxY: eff.box.maxY,
            minZ: eff.box.minZ,
            maxZ: eff.box.maxZ,
            kind: 'glass',
            accent: eff.ownerTeam,
          })
        }
      }
    }

    const endpoints = []
    const localPellets = spec && spec.id === 'shotgun' ? spec.pellets : 1
    const maxRange = spec ? spec.range : UNARMED_MELEE_SPEC.range
    const spreadRad = spec ? spec.spreadRad : 0
    for (let p = 0; p < localPellets; p++) {
      let rayDir = dir
      if (localPellets > 1 && spreadRad > 0) {
        const angle = (p / localPellets) * Math.PI * 2 + 0.35
        const mag = 0.55 * spreadRad
        const rx = dir.x + Math.cos(angle) * mag
        const ry = dir.y + Math.sin(angle) * mag * 0.75
        const rz = dir.z + Math.sin(angle + 1.2) * mag
        const l = Math.hypot(rx, ry, rz) || 1
        rayDir = { x: rx / l, y: ry / l, z: rz / l }
      }
      let hitDist = raycastArenaObstacles(origin, rayDir, maxRange, barriers)
      if (state.room) {
        for (const candidate of state.room.players) {
          if (candidate.id === me.id || candidate.team === me.team || !candidate.alive || !candidate.connected) continue
          const live = state.liveTransforms.get(candidate.id)
          const cPos = live ? live.position : candidate.position
          const hit = raycastPlayerHitbox(origin, rayDir, cPos, hitDist)
          if (hit && hit.distance < hitDist) {
            hitDist = hit.distance
          }
        }
      }
      if (state.practiceMode) {
        for (const target of state.practiceTargets) {
          if (!target.alive) continue
          const hit = raycastPlayerHitbox(origin, rayDir, target.position, hitDist)
          if (hit && hit.distance < hitDist) {
            hitDist = hit.distance
          }
        }
      }
      endpoints.push({
        x: origin.x + rayDir.x * hitDist,
        y: origin.y + rayDir.y * hitDist,
        z: origin.z + rayDir.z * hitDist,
      })
    }

    // Offset visual muzzle/fist origin toward barrel or punching fist
    _scratchEuler.set(pitchRef.current, yawRef.current, 0, 'YXZ')
    _scratchOffset
      .set(state.isAdsZoom ? 0.0 : 0.16, state.isAdsZoom ? -0.07 : -0.13, isMelee ? -0.35 : -0.48)
      .applyEuler(_scratchEuler)

    const muzzleOrigin = {
      x: origin.x + _scratchOffset.x,
      y: origin.y + _scratchOffset.y,
      z: origin.z + _scratchOffset.z,
    }

    // Aim Mode provides better recoil stability (35% lower recoil kick)
    const recoilMult = state.isAdsZoom ? 0.65 : 1.0
    recoilPitchRef.current = Math.min(0.12, recoilPitchRef.current + weaponRecoilKick(weaponOrMelee) * recoilMult)
    state.triggerLocalShotVisual()
    state.addLocalTracer(me.team, weaponOrMelee, muzzleOrigin, endpoints)
    state.markTutorialStep('shot')
    soundEngine.playWeaponFire(weaponOrMelee, 1)
    multiplayerClient.shoot(origin, dir)
  }, [computeAimDirection])

  useEffect(() => {
    const domElement = gl.domElement

    inputManager.attach(domElement, {
      isArenaActive: () => useGameStore.getState().screen === 'arena',
      isCombatPlayable: () => {
        const s = useGameStore.getState()
        return (
          s.screen === 'arena' &&
          s.room?.phase === 'playing' &&
          (s.room.roundState === 'COMBAT_ACTIVE' || s.room.roundState === 'FREE_PLAY') &&
          !s.mathModalOpen &&
          !s.pauseOpen
        )
      },
      isMathModalOpen: () => useGameStore.getState().mathModalOpen,
      isPauseOpen: () => useGameStore.getState().pauseOpen,
      canDismissMath: () => false,
      hasWeapon: () => Boolean(selectMyPlayer(useGameStore.getState())?.weapon),
      onPointerLockChange: (locked, wasExpectedUnlock) => {
        const s = useGameStore.getState()
        s.setPointerLocked(locked)

        if (locked) {
          wasLockedRef.current = true
          s.setPauseOpen(false)
          return
        }

        // Pressing Esc while locked in combat releases Pointer Lock and opens Pause Menu cleanly.
        if (
          wasLockedRef.current &&
          !wasExpectedUnlock &&
          s.screen === 'arena' &&
          s.room?.phase === 'playing' &&
          (s.room.roundState === 'COMBAT_ACTIVE' || s.room.roundState === 'FREE_PLAY') &&
          !s.mathModalOpen
        ) {
          s.setPauseOpen(true)
        }
        wasLockedRef.current = false
      },
      onPointerLockError: () => {
        useGameStore.getState().setPointerLocked(false)
      },
      onShootPress: () => attemptShoot(),
      onJumpPress: () => {
        jumpBufferRef.current = JUMP_BUFFER_SEC
      },
      onReloadPress: () => {
        const s = useGameStore.getState()
        const me = selectMyPlayer(s)
        if (
          (s.room?.roundState === 'COMBAT_ACTIVE' || s.room?.roundState === 'FREE_PLAY') &&
          me?.weapon &&
          me.ammo < WEAPONS[me.weapon].magSize &&
          !me.reloadingUntil
        ) {
          multiplayerClient.reload()
          soundEngine.playReload()
        }
      },
      onDoubleRPress: () => {},
      onSingleRHint: () => {},
      onOpenOrToggleMath: () => {},
      onSkillPress: (slot) => castSkill(slot),
      onEscapePress: () => {
        const s = useGameStore.getState()
        if (s.mathModalOpen) {
          // Rule 2: Players CANNOT skip or close the Math Challenge early!
          return
        }
        // Requirement: Returning from Pause requires intentional Resume action (do not accidentally unpause)
        if (!s.pauseOpen && s.room?.phase === 'playing') {
          inputManager.resetAllInputs()
          inputManager.releasePointerLockProgrammatically()
          s.setPauseOpen(true)
        }
      },
      onScoreboardChange: (open) => {
        useGameStore.getState().setScoreboardOpen(open)
      },
      onAimChange: (aiming) => {
        const s = useGameStore.getState()
        s.setAdsZoom(aiming)
        if (aiming && s.room?.phase === 'playing' && !s.mathModalOpen && !s.pauseOpen) {
          s.markTutorialStep('aimed')
        }
      },
      onSprintChange: (sprinting) => {
        useGameStore.getState().setSprinting(sprinting)
      },
      onToggleControlsRef: () => {
        useGameStore.getState().toggleControlsRef()
      },
    })

    const onHudSkillEvent = (ev: Event) => {
      const slot = (ev as CustomEvent<SkillSlot>).detail
      if (slot === 'Q' || slot === 'C' || slot === 'X') {
        castSkill(slot)
      }
    }

    window.addEventListener('math-rivals-cast-skill', onHudSkillEvent)

    return () => {
      window.removeEventListener('math-rivals-cast-skill', onHudSkillEvent)
      inputManager.detach()
    }
  }, [gl.domElement, attemptShoot, castSkill])

  useFrame((frameState, rawDelta) => {
    const cam = frameState.camera
    const dt = Math.min(rawDelta, 0.05)
    const state = useGameStore.getState()

    if (state.screen !== 'arena' || !state.room) {
      autoMathRequestedRef.current = false
      const t = frameState.clock.elapsedTime * 0.14
      const radius = 26
      cam.position.set(Math.sin(t) * radius, 11.5 + Math.sin(t * 1.4) * 1.2, Math.cos(t) * radius)
      cam.lookAt(0, 2.2, 0)
      if (cam instanceof THREE.PerspectiveCamera && Math.abs(cam.fov - 65) > 0.2) {
        cam.fov = 65
        cam.updateProjectionMatrix()
      }
      return
    }

    const me = selectMyPlayer(state)
    if (!me) return

    // Automatically release pointer lock & reset held keys when the round transitions into MATH_CHALLENGE
    if (state.mathModalOpen) {
      if (document.pointerLockElement) {
        inputManager.resetAllInputs()
        inputManager.releasePointerLockProgrammatically()
      }
      if (state.isAdsZoom) state.setAdsZoom(false)
      if (state.isSprinting) state.setSprinting(false)
    }

    // Snap on phase change, respawn, or server-authorized Dash / Phase Blink
    const pendingSnap = state.consumePendingSnap()
    if (pendingSnap) {
      posRef.current = { ...pendingSnap }
      velXRef.current = 0
      velZRef.current = 0
      multiplayerClient.sendMove(posRef.current, yawRef.current, pitchRef.current)
    } else if (prevPhaseRef.current !== state.room.phase || (!prevAliveRef.current && me.alive)) {
      posRef.current = { ...me.position }
      yawRef.current = me.yaw
      pitchRef.current = 0
      recoilPitchRef.current = 0
      velXRef.current = 0
      velZRef.current = 0
      velocityYRef.current = 0
      groundedRef.current = true
      coyoteTimerRef.current = COYOTE_TIME_SEC
      jumpBufferRef.current = 0
      multiplayerClient.sendMove(posRef.current, yawRef.current, pitchRef.current)
    }
    prevPhaseRef.current = state.room.phase
    prevAliveRef.current = me.alive

    // Smooth recoil recovery (zero permanent camera drift!)
    if (recoilPitchRef.current > 0.0001) {
      recoilPitchRef.current = Math.max(0, recoilPitchRef.current - dt * 0.28)
    } else {
      recoilPitchRef.current = 0
    }

    const input = inputManager.getSnapshot()
    const { dx: mouseDx, dy: mouseDy } = inputManager.consumeMouseDelta()
    const combatRoundActive =
      state.room.phase === 'playing' &&
      (state.room.roundState === 'COMBAT_ACTIVE' || state.room.roundState === 'FREE_PLAY') &&
      !state.mathModalOpen &&
      !state.pauseOpen

    // Smooth controlled FOV transition for Ctrl Aim Mode
    if (cam instanceof THREE.PerspectiveCamera) {
      const targetFov =
        input.aim && me.alive && combatRoundActive
          ? aimFovForWeapon(me.weapon)
          : DEFAULT_FOV
      if (Math.abs(cam.fov - targetFov) > 0.08) {
        cam.fov = THREE.MathUtils.lerp(cam.fov, targetFov, Math.min(1, dt * 14))
        cam.updateProjectionMatrix()
      }
    }

    if (!combatRoundActive) {
      velXRef.current = 0
      velZRef.current = 0
      state.setSprinting(false)
    } else {
      // Camera rotates STRICTLY from intentional mouse movement (or optional arrow keys)
      if (mouseDx !== 0 || mouseDy !== 0) {
        const sens = state.mouseSensitivity * (input.aim ? state.aimSensitivityMultiplier : 1)
        const dYaw = mouseDx * sens
        const dPitch = (state.invertY ? mouseDy : -mouseDy) * sens
        yawRef.current -= dYaw
        pitchRef.current = Math.max(
          -Math.PI / 2 + 0.08,
          Math.min(Math.PI / 2 - 0.08, pitchRef.current + dPitch),
        )
        cumulativeLookRef.current += Math.abs(dYaw) + Math.abs(dPitch)
        if (cumulativeLookRef.current >= 0.14) {
          state.markTutorialStep('looked')
        }
      }
      if (input.arrowLeft) yawRef.current += 2.1 * dt
      if (input.arrowRight) yawRef.current -= 2.1 * dt
      if (input.arrowUp) pitchRef.current = Math.min(Math.PI / 2 - 0.08, pitchRef.current + 1.5 * dt)
      if (input.arrowDown) pitchRef.current = Math.max(-Math.PI / 2 + 0.08, pitchRef.current - 1.5 * dt)

      if (mobileInput.lookDeltaYaw !== 0 || mobileInput.lookDeltaPitch !== 0) {
        const ySign = state.invertY ? 1 : -1
        const adsFactor = state.isAdsZoom ? state.aimSensitivityMultiplier : 1
        const sens = state.mouseSensitivity * adsFactor
        yawRef.current += mobileInput.lookDeltaYaw * sens
        pitchRef.current = Math.max(
          -Math.PI / 2 + 0.08,
          Math.min(Math.PI / 2 - 0.08, pitchRef.current + mobileInput.lookDeltaPitch * sens * ySign),
        )
        mobileInput.lookDeltaYaw = 0
        mobileInput.lookDeltaPitch = 0
        state.markTutorialStep('aimed')
      }
    }

    // Apply rotation strictly inside this single stable frame loop
    cam.rotation.order = 'YXZ'
    cam.rotation.y = yawRef.current
    cam.rotation.x = Math.max(
      -Math.PI / 2 + 0.06,
      Math.min(Math.PI / 2 - 0.06, pitchRef.current + recoilPitchRef.current),
    )
    cam.rotation.z = 0

    if (!me.alive) {
      state.setSprinting(false)
      cam.position.set(posRef.current.x, posRef.current.y + 3.4, posRef.current.z + 2.5)
      cam.lookAt(posRef.current.x, posRef.current.y + 1, posRef.current.z)
      return
    }

    if (combatRoundActive) {
      let forwardInput = mobileInput.moveY
      let strafeInput = mobileInput.moveX
      if (input.forward) forwardInput += 1
      if (input.backward) forwardInput -= 1
      if (input.right) strafeInput += 1
      if (input.left) strafeInput -= 1

      const hasMoveInput = Math.abs(forwardInput) > 0.05 || Math.abs(strafeInput) > 0.05
      const serverNow = Date.now() + state.clockOffsetMs
      const overdriveMult = me.overdriveUntil && serverNow < me.overdriveUntil ? 1.3 : 1.0

      const isAiming = input.aim || mobileInput.aiming
      if (state.mobileControlsEnabled && state.isAdsZoom !== isAiming) {
        state.setAdsZoom(isAiming)
      }

      // Shift ONLY sprints while actively moving (never causes automatic movement or aim!)
      const joystickMag = Math.hypot(mobileInput.moveX, mobileInput.moveY)
      const activeSprint = (input.sprint || mobileInput.sprinting || joystickMag > 0.85) && hasMoveInput && !isAiming
      state.setSprinting(activeSprint)
      if (activeSprint) {
        state.markTutorialStep('sprinted')
      }

      const baseSpeed = activeSprint
        ? SPRINT_SPEED
        : isAiming
          ? WALK_SPEED * 0.65
          : WALK_SPEED
      const maxSpeed = baseSpeed * overdriveMult

      // Normalized input vector prevents accidental diagonal speed advantage
      let wishX = 0
      let wishZ = 0
      if (hasMoveInput) {
        const len = Math.hypot(forwardInput, strafeInput)
        const nf = forwardInput / len
        const ns = strafeInput / len
        const sinY = Math.sin(yawRef.current)
        const cosY = Math.cos(yawRef.current)
        wishX = (-sinY * nf + cosY * ns) * maxSpeed
        wishZ = (-cosY * nf - sinY * ns) * maxSpeed
      }

      if (groundedRef.current) {
        const rate = hasMoveInput ? GROUND_ACCEL : GROUND_DECEL
        const maxDelta = rate * dt
        const dvx = wishX - velXRef.current
        const dvz = wishZ - velZRef.current
        const dlen = Math.hypot(dvx, dvz)
        if (dlen <= maxDelta) {
          velXRef.current = wishX
          velZRef.current = wishZ
        } else {
          velXRef.current += (dvx / dlen) * maxDelta
          velZRef.current += (dvz / dlen) * maxDelta
        }
      } else if (hasMoveInput) {
        const maxDelta = AIR_ACCEL * dt
        const dvx = wishX - velXRef.current
        const dvz = wishZ - velZRef.current
        const dlen = Math.hypot(dvx, dvz)
        if (dlen <= maxDelta) {
          velXRef.current = wishX
          velZRef.current = wishZ
        } else {
          velXRef.current += (dvx / dlen) * maxDelta
          velZRef.current += (dvz / dlen) * maxDelta
        }
      } else {
        const damp = Math.max(0, 1 - AIR_DRAG * dt)
        velXRef.current *= damp
        velZRef.current *= damp
      }

      if (hasMoveInput) {
        cumulativeMoveRef.current += Math.hypot(velXRef.current, velZRef.current) * dt
        if (cumulativeMoveRef.current >= 1.5) {
          state.markTutorialStep('moved')
        }
      }

      if (groundedRef.current) {
        coyoteTimerRef.current = COYOTE_TIME_SEC
      } else {
        coyoteTimerRef.current = Math.max(0, coyoteTimerRef.current - dt)
      }
      if (mobileInput.jumping) {
        jumpBufferRef.current = JUMP_BUFFER_SEC
        mobileInput.jumping = false
      }
      if (mobileInput.pendingReload) {
        mobileInput.pendingReload = false
        multiplayerClient.reload()
        soundEngine.playReload()
      }
      if (mobileInput.pendingSkill) {
        const slot = mobileInput.pendingSkill
        mobileInput.pendingSkill = null
        castSkill(slot)
      }
      if (mobileInput.firing) {
        attemptShoot()
      }

      if (jumpBufferRef.current > 0) {
        jumpBufferRef.current = Math.max(0, jumpBufferRef.current - dt)
      }

      if (jumpBufferRef.current > 0 && coyoteTimerRef.current > 0) {
        velocityYRef.current = JUMP_VELOCITY
        groundedRef.current = false
        coyoteTimerRef.current = 0
        jumpBufferRef.current = 0
        soundEngine.playJump(false)
      }

      const dynamicBarriers: ArenaBox[] = []
      for (const eff of state.room.worldEffects) {
        if (eff.kind === 'barrier' && eff.box && eff.expiresAt > serverNow) {
          dynamicBarriers.push({
            id: eff.id,
            minX: eff.box.minX,
            maxX: eff.box.maxX,
            minY: eff.box.minY,
            maxY: eff.box.maxY,
            minZ: eff.box.minZ,
            maxZ: eff.box.maxZ,
            kind: 'glass',
            accent: eff.ownerTeam,
          })
        }
      }

      velocityYRef.current -= GRAVITY * dt
      const desired = {
        x: posRef.current.x + velXRef.current * dt,
        y: posRef.current.y + velocityYRef.current * dt,
        z: posRef.current.z + velZRef.current * dt,
      }

      const resolved = resolvePlayerMovement(
        posRef.current,
        desired,
        velocityYRef.current,
        dynamicBarriers,
      )
      posRef.current = resolved.position
      velocityYRef.current = resolved.velocityY
      groundedRef.current = resolved.grounded

      if (resolved.hitJumpPad) {
        soundEngine.playJump(true)
      }

      if (input.shooting && me.weapon) {
        attemptShoot()
      }
    }

    cam.position.set(
      posRef.current.x,
      posRef.current.y + PLAYER_DIMENSIONS.eyeHeight,
      posRef.current.z,
    )

    state.setLocalTransform(posRef.current, yawRef.current, pitchRef.current)
    const nowMs = performance.now()
    const prevSent = lastSentPosRef.current
    const movedDelta =
      Math.abs(posRef.current.x - prevSent.x) +
      Math.abs(posRef.current.y - prevSent.y) +
      Math.abs(posRef.current.z - prevSent.z) +
      Math.abs(yawRef.current - prevSent.yaw) +
      Math.abs(pitchRef.current - prevSent.pitch)
    if (
      (movedDelta > 0.001 && nowMs - lastMoveSentAtRef.current >= 45) ||
      nowMs - lastMoveSentAtRef.current >= 300
    ) {
      lastMoveSentAtRef.current = nowMs
      lastSentPosRef.current = {
        x: posRef.current.x,
        y: posRef.current.y,
        z: posRef.current.z,
        yaw: yawRef.current,
        pitch: pitchRef.current,
      }
      multiplayerClient.sendMove(posRef.current, yawRef.current, pitchRef.current)
    }
  })

  return null
}
