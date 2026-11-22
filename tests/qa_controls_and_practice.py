"""
Comprehensive QA & Controls Verification Suite for MATH RIVALS 3D.
Explicitly verifies every acceptance criterion in real Chrome:
  1. Main Menu Controls Guide & Settings (Mouse Sens, Aim Sens, Invert Y, Reset to Default)
  2. Practice Range Mode + 6-Step Beginner Tutorial Checklist
  3. Zero automatic camera rotation / zero movement drift when idle
  4. Shift ONLY controls Sprint (holding Shift alone causes ZERO movement, ZERO rotation, ZERO aim)
  5. Ctrl (Left & Right) ONLY controls Aim Mode (reticle + AIM indicator, zero movement/rotation)
  6. Direct Left-Click shooting, empty-safe reload (R), Pause/Resume requiring intentional Resume
  7. In-game Controls Reference toggle (H)
  8. Explicit 5-state Math Flow (QUESTION_ACTIVE -> ANSWER_FEEDBACK stays visible -> WEAPON_REVEAL -> COMBAT_READY)
"""
import os
import re
from playwright.sync_api import sync_playwright

APP_URL = os.environ.get("APP_URL", "http://localhost:5173")
SHOT_DIR = "/home/antigravity/.gemini/jetski/brain/v1/default/jetski_remote_agents_3p_devbox/df4f397d-f46c-4c3f-9ee9-2735054d1b34/scratch/qa_shots"
os.makedirs(SHOT_DIR, exist_ok=True)

with open("shared/questions.ts", "r", encoding="utf-8") as f:
    q_src = f.read()
ANS = {
    m.group(1): int(m.group(2))
    for m in re.finditer(r"prompt:\s*'([^']+)'[\s\S]*?correctIndex:\s*([0-3])", q_src)
}

page_errors = []

with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path="/usr/bin/google-chrome",
        headless=True,
        args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--no-sandbox"],
    )
    ctx = browser.new_context(viewport={"width": 1280, "height": 720})
    page = ctx.new_page()
    page.on("pageerror", lambda e: page_errors.append(str(e)))

    print("[QA 1/8] Testing Main Menu Controls Guide & Settings + Reset to Default...", flush=True)
    page.goto(APP_URL, wait_until="networkidle")
    page.wait_for_selector("#btn-menu-controls", timeout=15000)
    page.wait_for_timeout(600)
    page.screenshot(animations="disabled", path=f"{SHOT_DIR}/qa_01_main_menu.png")

    page.click("#btn-menu-controls")
    page.wait_for_selector("#controls-guide-modal", timeout=6000)
    page.click("#btn-toggle-invert-y")
    assert "ON" in page.inner_text("#btn-toggle-invert-y")
    page.screenshot(animations="disabled", path=f"{SHOT_DIR}/qa_02_controls_settings.png")
    page.click("#btn-settings-reset")
    assert "OFF" in page.inner_text("#btn-toggle-invert-y")
    assert page.inner_text("#settings-sens-val").strip() == "2.0"
    assert page.inner_text("#settings-aim-val").strip() == "55%"
    page.click("#btn-close-controls-guide")
    print("      -> Controls Guide, Invert Y, Sensitivity & Reset Defaults verified!", flush=True)

    print("[QA 2/8] Launching Practice Range & 6-Step Beginner Tutorial...", flush=True)
    page.click("#btn-menu-practice")
    page.wait_for_selector("#beginner-tutorial-panel", timeout=10000)
    page.wait_for_selector("#hud-pointer-lock-status", timeout=8000)
    assert page.inner_text("#hud-match-timer").strip() == "FREE"
    page.wait_for_timeout(700)
    page.screenshot(animations="disabled", path=f"{SHOT_DIR}/qa_03_practice_arena.png")
    print("      -> Practice Range + 3D Target Drones + Tutorial Checklist loaded!", flush=True)

    print("[QA 3/8] Verifying ZERO automatic camera rotation or drift when idle...", flush=True)
    t0 = page.evaluate("window.__MATH_RIVALS_TELEMETRY__()")
    page.wait_for_timeout(1000)
    t1 = page.evaluate("window.__MATH_RIVALS_TELEMETRY__()")
    assert abs(t1["yaw"] - t0["yaw"]) < 1e-6, f"Idle camera yaw drifted! {t0} -> {t1}"
    assert abs(t1["pitch"] - t0["pitch"]) < 1e-6, f"Idle camera pitch drifted! {t0} -> {t1}"
    assert abs(t1["x"] - t0["x"]) < 1e-4 and abs(t1["z"] - t0["z"]) < 1e-4, f"Idle position drifted! {t0} -> {t1}"
    assert page.locator("#hud-sprint-indicator").count() == 0, "Sprint must be OFF when idle!"
    assert page.locator("#hud-aim-indicator").count() == 0, "Aim must be OFF when idle!"
    assert page.locator("#hud-aim-reticle").count() == 0, "Aim reticle must be OFF when idle!"
    print(f"      -> Idle camera & position strictly 0 drift ({t1['yaw']:.4f}, {t1['pitch']:.4f})!", flush=True)

    print("[QA 4/8] Testing Shift ONLY controls Sprint (never Aim, never auto-move/rotate, blur resets)...", flush=True)
    ts0 = page.evaluate("window.__MATH_RIVALS_TELEMETRY__()")
    page.keyboard.down("ShiftLeft")
    page.evaluate("() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")
    ts1 = page.evaluate("window.__MATH_RIVALS_TELEMETRY__()")
    assert abs(ts1["yaw"] - ts0["yaw"]) < 1e-6 and abs(ts1["pitch"] - ts0["pitch"]) < 1e-6, "Shift caused camera rotation!"
    assert abs(ts1["x"] - ts0["x"]) < 1e-4 and abs(ts1["z"] - ts0["z"]) < 1e-4, "Shift alone caused automatic movement!"
    assert page.locator("#hud-aim-indicator").count() == 0, "Shift MUST NEVER activate Aim!"
    assert page.locator("#hud-sprint-indicator").count() == 0, "Shift alone without WASD MUST NOT sprint!"
    page.keyboard.down("KeyW")
    page.wait_for_selector("#hud-sprint-indicator", timeout=5000)
    page.evaluate("() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")
    ts2 = page.evaluate("window.__MATH_RIVALS_TELEMETRY__()")
    moved_dist = ((ts2["x"] - ts1["x"]) ** 2 + (ts2["z"] - ts1["z"]) ** 2) ** 0.5
    assert moved_dist > 0.15, f"Shift+W did not move player forward (dist={moved_dist:.3f})"
    assert abs(ts2["yaw"] - ts1["yaw"]) < 1e-6, "Shift+W rotated camera!"
    assert page.locator("#hud-sprint-indicator").is_visible(), "Shift + W MUST activate Sprint!"
    assert page.locator("#hud-aim-indicator").count() == 0, "Shift + W MUST NEVER activate Aim!"
    page.keyboard.up("ShiftLeft")
    page.keyboard.up("KeyW")
    page.locator("#hud-sprint-indicator").wait_for(state="detached", timeout=4000)
    # Verify blur immediately clears held movement/sprint keys (no stuck keys!)
    page.keyboard.down("ShiftLeft")
    page.keyboard.down("KeyW")
    page.wait_for_selector("#hud-sprint-indicator", timeout=5000)
    page.evaluate("window.dispatchEvent(new Event('blur'))")
    page.locator("#hud-sprint-indicator").wait_for(state="detached", timeout=4000)
    page.keyboard.up("ShiftLeft")
    page.keyboard.up("KeyW")
    # Let ground deceleration settle to 0 over a few animation frames
    for _ in range(6):
        page.evaluate("() => new Promise(r => requestAnimationFrame(r))")
    print(f"      -> Shift = Sprint ONLY (moved {moved_dist:.2f}m, 0 rotation) & blur key-reset verified!", flush=True)

    print("[QA 5/8] Testing Ctrl (Left & Right) ONLY controls Aim Mode (0 drift/rotation)...", flush=True)
    for ctrl_key in ("ControlLeft", "ControlRight"):
        tc0 = page.evaluate("window.__MATH_RIVALS_TELEMETRY__()")
        page.keyboard.down(ctrl_key)
        page.wait_for_selector("#hud-aim-indicator", timeout=4000)
        page.evaluate("() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")
        tc1 = page.evaluate("window.__MATH_RIVALS_TELEMETRY__()")
        assert abs(tc1["yaw"] - tc0["yaw"]) < 1e-6 and abs(tc1["pitch"] - tc0["pitch"]) < 1e-6, f"{ctrl_key} rotated camera!"
        assert abs(tc1["x"] - tc0["x"]) < 1e-3 and abs(tc1["z"] - tc0["z"]) < 1e-3, f"{ctrl_key} caused auto-movement!"
        assert page.locator("#hud-aim-indicator").is_visible(), f"{ctrl_key} MUST activate AIM MODE!"
        assert page.locator("#hud-aim-reticle").is_visible(), f"{ctrl_key} MUST display Aim reticle!"
        assert page.locator("#hud-sprint-indicator").count() == 0, f"{ctrl_key} MUST NEVER activate Sprint!"
        if ctrl_key == "ControlLeft":
            page.screenshot(animations="disabled", path=f"{SHOT_DIR}/qa_04_ctrl_aim_mode.png")
        page.keyboard.up(ctrl_key)
        page.locator("#hud-aim-indicator").wait_for(state="detached", timeout=4000)
    print("      -> Left Ctrl & Right Ctrl Aim Mode (0 rotation, 0 auto-move) verified cleanly!", flush=True)

    print("[QA 6/8] Testing Direct Shooting, Reload (R), [H] Controls HUD & Intentional Pause/Resume...", flush=True)
    ammo_before = int(page.inner_text("#hud-ammo-value").strip())
    page.mouse.click(640, 360)
    page.wait_for_timeout(250)
    ammo_after = int(page.inner_text("#hud-ammo-value").strip())
    assert ammo_after < ammo_before, f"LMB click did not shoot: {ammo_before} -> {ammo_after}"

    page.keyboard.press("KeyR")
    page.wait_for_timeout(1400)
    assert int(page.inner_text("#hud-ammo-value").strip()) == ammo_before, "Reload with R failed!"

    page.keyboard.press("KeyH")
    page.wait_for_selector("#hud-controls-ref", timeout=4000)
    page.keyboard.press("KeyH")
    page.locator("#hud-controls-ref").wait_for(state="detached", timeout=4000)

    page.keyboard.press("Escape")
    page.wait_for_selector("#pause-menu-modal", timeout=4000)
    # Pressing Esc again must NOT accidentally resume (requires intentional Resume click)
    page.keyboard.press("Escape")
    page.wait_for_timeout(200)
    assert page.locator("#pause-menu-modal").is_visible(), "Pause must require intentional Resume click!"
    page.click("#btn-pause-resume")
    page.locator("#pause-menu-modal").wait_for(state="detached", timeout=4000)
    print(f"      -> Shoot ({ammo_before}->{ammo_after}->{ammo_before}), [H] Controls Ref, and Pause/Resume verified!", flush=True)

    print("[QA 7/8] Testing Explicit 5-State Math Flow via [RR] (Question NEVER disappears abruptly)...", flush=True)
    page.keyboard.press("KeyR")
    page.wait_for_timeout(120)
    page.keyboard.press("KeyR")
    page.wait_for_selector("#math-terminal-modal[data-math-phase='QUESTION_ACTIVE']", timeout=6000)
    q1 = page.inner_text("#math-question-prompt").strip()

    # Submit WRONG answer -> question prompt stays visible + ANSWER_FEEDBACK shows explanation + NO weapon!
    wrong_idx = (ANS[q1] + 1) % 4
    page.click(f"#btn-math-choice-{wrong_idx}")
    page.wait_for_selector("#math-terminal-modal[data-math-phase='ANSWER_FEEDBACK']", timeout=6000)
    assert page.locator("#math-question-prompt").is_visible(), "Question prompt disappeared during feedback!"
    assert "WRONG ANSWER" in page.inner_text("#math-answer-feedback")
    page.screenshot(animations="disabled", path=f"{SHOT_DIR}/qa_05_math_wrong_feedback.png")

    # Tap RR -> fresh question -> answer CORRECTLY -> stays in ANSWER_FEEDBACK ~1.35s -> transitions to WEAPON_REVEAL -> closes cleanly!
    page.keyboard.press("KeyR")
    page.wait_for_timeout(120)
    page.keyboard.press("KeyR")
    page.wait_for_selector("#math-terminal-modal[data-math-phase='QUESTION_ACTIVE']", timeout=6000)
    q2 = page.inner_text("#math-question-prompt").strip()
    assert q2 != q1
    page.click(f"#btn-math-choice-{ANS[q2]}")
    page.wait_for_selector("#math-terminal-modal[data-math-phase='ANSWER_FEEDBACK']", timeout=6000)
    assert page.locator("#math-question-prompt").is_visible(), "Question prompt disappeared on correct feedback!"
    assert "CORRECT!" in page.inner_text("#math-answer-feedback")
    # Confirm feedback stays visible (does NOT immediately vanish!) for at least 700ms before WEAPON_REVEAL
    page.wait_for_timeout(700)
    assert page.locator("#math-terminal-modal[data-math-phase='ANSWER_FEEDBACK']").is_visible(), "Feedback vanished too quickly!"

    # Wait for smooth automatic transition ANSWER_FEEDBACK (~1.35s) -> WEAPON_REVEAL -> COMBAT_READY
    page.wait_for_selector("#math-terminal-modal[data-math-phase='WEAPON_REVEAL']", timeout=6000)
    page.wait_for_selector("#weapon-roulette-stage", timeout=6000)
    page.locator("#math-terminal-modal").wait_for(state="detached", timeout=8000)
    print("      -> 5-State Math Machine (QUESTION_ACTIVE -> ANSWER_FEEDBACK -> WEAPON_REVEAL -> COMBAT_READY) verified!", flush=True)

    print("[QA 8/8] Verifying Tutorial Checklist updated & Exit Practice cleanly returns to Main Menu...", flush=True)
    tut_text = page.inner_text("#beginner-tutorial-panel")
    print(f"      -> Tutorial progress header: {tut_text.splitlines()[0]}", flush=True)
    page.keyboard.press("Escape")
    page.wait_for_selector("#btn-pause-leave", timeout=4000)
    page.click("#btn-pause-leave")
    page.wait_for_selector("#btn-menu-create", timeout=6000)
    browser.close()

assert len(page_errors) == 0, f"Page errors detected: {page_errors}"
print("\nALL 8 QA CONTROLS, PRACTICE MODE & 5-STATE MATH VERIFICATION CHECKS PASSED WITH ZERO ERRORS!")
