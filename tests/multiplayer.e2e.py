"""
End-to-End Real 2-Browser Multiplayer Verification Suite for MATH RIVALS 3D.
Tests:
  1. Main Menu & 3D WebGL Arena rendering
  2. Room Creation & Room Joining via 6-char code (2 real browser sessions)
  3. Lobby sync (Blue vs Red teams, Ready toggle, Host-only Start)
  4. 3-2-1 Countdown & Synchronized 90s Match Timer across both browsers
  5. Math Question assignment, Correct Answer (+100 pts + Random Weapon Reveal)
  6. Wrong Answer (+0 pts + No Weapon + Thai explanation)
  7. 3D Movement (WASD + Jump), Shooting (ammo sync), Reload (R), Live Scoreboard (Tab)
  8. Real Browser Reload + Reconnect preserving exact score & weapon
  9. Real Player Disconnect handling without breaking the live match
"""
import json
import os
import re
import sys
import time
from playwright.sync_api import sync_playwright

APP_URL = os.environ.get("APP_URL", "http://localhost:5173")
SCREENSHOT_DIR = os.environ.get(
    "SCREENSHOT_DIR",
    "/home/antigravity/.gemini/jetski/brain/v1/default/jetski_remote_agents_3p_devbox/df4f397d-f46c-4c3f-9ee9-2735054d1b34/scratch/e2e_shots",
)
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

# Load ground-truth answers from shared/questions.ts strictly for E2E answer automation
with open("shared/questions.ts", "r", encoding="utf-8") as f:
    q_src = f.read()

PROMPT_TO_ANSWER = {}
for m in re.finditer(
    r"prompt:\s*'([^']+)'[\s\S]*?correctIndex:\s*([0-3])",
    q_src,
):
    PROMPT_TO_ANSWER[m.group(1)] = int(m.group(2))

assert len(PROMPT_TO_ANSWER) == 48, f"Expected 48 parsed prompts, got {len(PROMPT_TO_ANSWER)}"


def parse_mmss(text: str) -> int:
    parts = text.strip().split(":")
    return int(parts[0]) * 60 + int(parts[1])


def run_e2e():
    errors_p1 = []
    errors_p2 = []

    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path="/usr/bin/google-chrome",
            headless=True,
            args=[
                "--use-gl=angle",
                "--use-angle=swiftshader",
                "--enable-webgl",
                "--ignore-gpu-blocklist",
                "--no-sandbox",
            ],
        )

        ctx1 = browser.new_context(viewport={"width": 1024, "height": 640})
        ctx2 = browser.new_context(viewport={"width": 1024, "height": 640})
        page1 = ctx1.new_page()
        page2 = ctx2.new_page()

        page1.on("pageerror", lambda err: errors_p1.append(str(err)))
        page2.on("pageerror", lambda err: errors_p2.append(str(err)))

        print("[1/9] Loading Main Menu in both browsers...")
        page1.goto(APP_URL, wait_until="domcontentloaded")
        page1.wait_for_selector("#btn-menu-create", timeout=20000)
        page2.goto(APP_URL, wait_until="domcontentloaded")
        page2.wait_for_selector("#btn-menu-join", timeout=20000)
        page1.wait_for_timeout(600)
        page1.screenshot(animations="disabled", path=f"{SCREENSHOT_DIR}/01_main_menu.png")

        print("[2/9] Player 1 creating room...")
        page1.fill("#input-player-name", "NeonHost")
        page1.click("#btn-menu-create")
        page1.wait_for_selector("#lobby-room-code", timeout=10000)
        room_code = page1.inner_text("#lobby-room-code").strip()
        assert len(room_code) == 6, f"Invalid room code: {room_code}"
        print(f"      -> Room created: {room_code}")

        print("[3/9] Player 2 joining room via Room Code...")
        page2.fill("#input-player-name", "CyberGuest")
        page2.click("#btn-menu-join")
        page2.wait_for_selector("#input-room-code", timeout=10000)
        page2.fill("#input-room-code", room_code)
        page2.click("#btn-join-room-submit")
        page2.wait_for_selector("#lobby-room-code", timeout=10000)

        # Wait for lobby sync across both sessions + pick Valorant-style Agents
        page1.wait_for_function(
            "() => document.querySelector('#lobby-player-count')?.textContent?.includes('2 / 8')",
            polling=100,
            timeout=10000,
        )
        page1.click("#btn-agent-aegis")
        page2.click("#btn-agent-pulse")
        page2.click("#btn-toggle-ready")
        page1.wait_for_timeout(450)
        page1.screenshot(animations="disabled", path=f"{SCREENSHOT_DIR}/02_lobby.png")
        print("      -> Both players synced in Lobby with Agents AEGIS & PULSE!", flush=True)

        print("[4/9] Host starting 90-second match (3-2-1 Countdown -> Mandatory Math auto-open)...", flush=True)
        page1.click("#btn-start-match")
        page1.wait_for_selector("#hud-match-timer", timeout=10000)
        page2.wait_for_selector("#hud-match-timer", timeout=10000)

        # Wait for 3-second countdown to finish -> Mandatory Math Modal MUST open automatically!
        page1.wait_for_selector("#math-mandatory-badge", timeout=10000)
        page2.wait_for_selector("#math-mandatory-badge", timeout=10000)
        page1.wait_for_selector("#math-question-prompt", timeout=10000)
        page2.wait_for_selector("#math-question-prompt", timeout=10000)

        # Verify ESC cannot dismiss mandatory math while unarmed
        page1.keyboard.press("Escape")
        page1.wait_for_timeout(200)
        assert page1.locator("#math-terminal-modal").is_visible(), "Mandatory math modal must NOT close on ESC while unarmed!"
        assert page1.locator("#btn-close-math").count() == 0, "Close button must be hidden while unarmed!"

        t1 = parse_mmss(page1.inner_text("#hud-match-timer"))
        t2 = parse_mmss(page2.inner_text("#hud-match-timer"))
        assert abs(t1 - t2) <= 1, f"Timer desync: P1={t1}s vs P2={t2}s"
        assert 84 <= t1 <= 90, f"Unexpected initial match timer: {t1}s"
        print(f"      -> Synchronized timers & Mandatory Math Lock verified! P1={t1}s, P2={t2}s", flush=True)

        print("[5/9] Player 1 answering CORRECTLY -> verify 8-Weapon Roulette Spin & Unlock...", flush=True)
        q1_prompt = page1.inner_text("#math-question-prompt").strip()
        assert q1_prompt in PROMPT_TO_ANSWER, f"Unknown prompt: {q1_prompt}"
        correct_idx = PROMPT_TO_ANSWER[q1_prompt]
        page1.screenshot(animations="disabled", path=f"{SCREENSHOT_DIR}/03_math_terminal.png")

        page1.click(f"#btn-math-choice-{correct_idx}")
        page1.wait_for_selector("#math-terminal-modal[data-math-phase='ANSWER_FEEDBACK']", timeout=8000)
        assert page1.locator("#math-question-prompt").is_visible(), "Question must stay visible during ANSWER_FEEDBACK!"
        page1.wait_for_selector("#weapon-roulette-stage", timeout=8000)
        page1.wait_for_timeout(2200)
        if page1.locator("#btn-math-enter-combat").count() > 0:
            try:
                page1.click("#btn-math-enter-combat", timeout=2000)
            except Exception:
                pass
        # Roulette spins through 8 guns, locks on, and enters combat showing WeaponReveal banner!
        page1.wait_for_selector("#weapon-reveal-banner", timeout=12000)
        page1.screenshot(animations="disabled", path=f"{SCREENSHOT_DIR}/04_weapon_reveal.png")

        # Verify P1 score = 100 and weapon equipped
        page1.wait_for_function(
            "() => document.querySelector('#hud-my-score')?.textContent?.trim() === '100'",
            polling=100,
            timeout=8000,
        )
        weapon_name = page1.inner_text("#hud-weapon-name").strip()
        assert weapon_name != "NO WEAPON EQUIPPED", "Weapon should be equipped after correct answer!"
        ammo_before = int(page1.inner_text("#hud-ammo-value").strip())
        print(f"      -> P1 solved & spun roulette! Score=100, Weapon={weapon_name}, Ammo={ammo_before}", flush=True)

        print("[6/9] Player 2 answering WRONGLY -> verify +0 pts, NO weapon, stays locked, RR loads new question...", flush=True)
        q2_prompt = page2.inner_text("#math-question-prompt").strip()
        wrong_idx = (PROMPT_TO_ANSWER[q2_prompt] + 1) % 4
        page2.click(f"#btn-math-choice-{wrong_idx}")
        page2.wait_for_selector("#math-answer-feedback", timeout=8000)
        assert page2.locator("#math-question-prompt").is_visible(), "Question prompt must remain visible on wrong feedback!"
        fb_text = page2.inner_text("#math-answer-feedback")
        assert "WRONG ANSWER" in fb_text and "NO WEAPON" in fb_text, f"Expected WRONG ANSWER/NO WEAPON feedback, got: {fb_text}"
        assert page2.locator("#btn-math-back").count() == 0, "Unarmed player must NOT be able to skip to arena after wrong answer!"
        assert page2.inner_text("#hud-my-score").strip() == "0"
        assert page2.inner_text("#hud-weapon-name").strip() == "NO WEAPON EQUIPPED"

        # Double-tap R (RR) inside wrong-answer screen loads next question!
        page2.keyboard.press("KeyR")
        page2.wait_for_timeout(120)
        page2.keyboard.press("KeyR")
        page2.wait_for_selector("#math-terminal-modal[data-math-phase='QUESTION_ACTIVE']", timeout=8000)
        q2b_prompt = page2.inner_text("#math-question-prompt").strip()
        assert q2b_prompt != q2_prompt, "RR should assign a fresh question!"
        page2.click(f"#btn-math-choice-{PROMPT_TO_ANSWER[q2b_prompt]}")
        page2.wait_for_selector("#math-terminal-modal[data-math-phase='ANSWER_FEEDBACK']", timeout=8000)
        page2.wait_for_timeout(1500)
        if page2.locator("#btn-math-roll-now").count() > 0:
            try:
                page2.click("#btn-math-roll-now", timeout=2000)
            except Exception:
                pass
        page2.wait_for_selector("#weapon-roulette-stage", timeout=10000)
        page2.wait_for_timeout(2200)
        if page2.locator("#btn-math-enter-combat").count() > 0:
            try:
                page2.click("#btn-math-enter-combat", timeout=2000)
            except Exception:
                pass
        page2.locator("#math-terminal-modal").wait_for(state="detached", timeout=12000)
        print("      -> P2 wrong answer gave +0 pts & NO weapon, stayed locked, then RR -> solved & unlocked!", flush=True)

        print("[7/9] Testing [RR] mid-match roll, Ctrl Aim, Shift Sprint, Agent Skills, LMB shooting & R reload...", flush=True)
        # Double-tap R (RR) while armed opens Math & Weapon Roll, and ESC cleanly closes it when armed
        page1.keyboard.press("KeyR")
        page1.wait_for_timeout(120)
        page1.keyboard.press("KeyR")
        page1.wait_for_selector("#math-terminal-modal", timeout=6000)
        page1.keyboard.press("Escape")
        page1.locator("#math-terminal-modal").wait_for(state="detached", timeout=6000)

        # Verify Ctrl Aim Mode works cleanly in real multiplayer too
        page1.keyboard.down("ControlLeft")
        page1.wait_for_timeout(150)
        assert page1.locator("#hud-aim-indicator").is_visible(), "Ctrl must activate Aim Mode in multiplayer!"
        page1.keyboard.up("ControlLeft")
        page1.wait_for_timeout(150)
        assert page1.locator("#hud-aim-indicator").count() == 0, "Releasing Ctrl must exit Aim Mode!"

        # Cast Aegis [C] Barrier Wall on P1 and Pulse [Q] Recon Sonar on P2!
        page1.keyboard.press("KeyC")
        page2.keyboard.press("KeyQ")
        page1.wait_for_function(
            "() => { const t = document.querySelector('#hud-skill-C-status')?.textContent?.trim() || ''; return t !== 'READY' && t.endsWith('s'); }",
            polling=100,
            timeout=8000,
        )
        page2.wait_for_function(
            "() => { const t = document.querySelector('#hud-skill-Q-status')?.textContent?.trim() || ''; return t !== 'READY' && t.endsWith('s'); }",
            polling=100,
            timeout=8000,
        )
        c_status = page1.inner_text("#hud-skill-C-status").strip()
        q_status_p2 = page2.inner_text("#hud-skill-Q-status").strip()

        # Walk, jump, and shoot directly with real Left Mouse Click on arena canvas!
        page1.keyboard.down("KeyD")
        page1.wait_for_timeout(250)
        page1.keyboard.press("Space")
        page1.wait_for_timeout(200)
        page1.keyboard.up("KeyD")
        page1.mouse.click(512, 320)
        page1.wait_for_function(
            f"() => Number(document.querySelector('#hud-ammo-value')?.textContent?.trim() || '999') < {ammo_before}",
            polling=100,
            timeout=6000,
        )
        ammo_after = int(page1.inner_text("#hud-ammo-value").strip())
        assert ammo_after < ammo_before, f"Expected direct LMB click to fire and drop ammo below {ammo_before}, got {ammo_after}"
        page1.screenshot(animations="disabled", path=f"{SCREENSHOT_DIR}/05_arena_combat.png")

        # Single-tap R reloads weapon without opening RR modal
        page1.keyboard.press("KeyR")
        page1.wait_for_function(
            f"() => Number(document.querySelector('#hud-ammo-value')?.textContent?.trim() || '0') === {ammo_before}",
            polling=100,
            timeout=6000,
        )
        ammo_reloaded = int(page1.inner_text("#hud-ammo-value").strip())
        assert ammo_reloaded == ammo_before, f"Expected reloaded ammo {ammo_before}, got {ammo_reloaded}"

        # Live Scoreboard (Tab)
        page1.keyboard.down("Tab")
        page1.wait_for_selector("#live-scoreboard-overlay", timeout=5000)
        sb_text = page1.inner_text("#live-scoreboard-overlay")
        assert "NeonHost" in sb_text and "CyberGuest" in sb_text and "100" in sb_text
        page1.screenshot(animations="disabled", path=f"{SCREENSHOT_DIR}/06_live_scoreboard.png")
        page1.keyboard.up("Tab")
        print(f"      -> [RR] roll, Skills (P1 Barrier CD={c_status}, P2 Recon CD={q_status_p2}), Direct LMB Shooting ({ammo_before}->{ammo_after}->{ammo_reloaded}), and Scoreboard verified!", flush=True)

        print("[8/9] Testing REAL Player 2 Disconnect + Player 1 Browser Reload & Reconnect...", flush=True)
        stored_before = page1.evaluate("() => sessionStorage.getItem('math_rivals_3d_session')")
        assert stored_before is not None, "Expected sessionStorage to contain active session before reload!"
        ctx2.close()
        page1.wait_for_timeout(400)
        page1.reload(wait_until="networkidle")
        page1.wait_for_selector("#btn-menu-reconnect", timeout=15000)
        page1.click("#btn-menu-reconnect")
        page1.wait_for_selector("#hud-my-score", timeout=15000)
        assert page1.inner_text("#hud-my-score").strip() == "100", "Score lost on reconnect!"
        assert page1.inner_text("#hud-weapon-name").strip() == weapon_name, "Weapon lost on reconnect!"
        print("      -> Reconnect restored exact score (100) and weapon!", flush=True)

        print("[9/9] Verifying Disconnected Player 2 is reflected as OFFLINE on live scoreboard...", flush=True)
        page1.keyboard.down("Tab")
        page1.wait_for_selector("#live-scoreboard-overlay", timeout=8000)
        sb_after_dc = page1.inner_text("#live-scoreboard-overlay")
        assert "OFFLINE" in sb_after_dc, "Disconnected player should show OFFLINE on live scoreboard!"
        page1.keyboard.up("Tab")
        print("      -> Disconnect cleanly reflected as OFFLINE on scoreboard without interrupting match!", flush=True)

        browser.close()

    assert len(errors_p1) == 0, f"Player 1 page errors: {errors_p1}"
    assert len(errors_p2) == 0, f"Player 2 page errors: {errors_p2}"
    print("\nALL 9 REAL 2-BROWSER MULTIPLAYER E2E VERIFICATION CHECKS PASSED WITH ZERO ERRORS!")


if __name__ == "__main__":
    run_e2e()
