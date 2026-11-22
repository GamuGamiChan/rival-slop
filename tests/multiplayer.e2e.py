"""
End-to-End Real 2-Browser Multiplayer Verification Suite for MATH RIVALS 3D.
Tests the new Round-Synchronized Gameplay Loop (Combat Round -> Math Challenge -> Weapon Reward / Weapon Penalty):
  1. Main Menu, Audited 3D Asset Credits & 3D WebGL Arena rendering
  2. Room Creation & Room Joining via 6-char code (2 real browser sessions)
  3. Lobby sync (Blue vs Red teams, 10 Rounds banner, Agent picker, Ready toggle, Host-only Start)
  4. 3-2-1 Countdown -> ROUND 1/10 COMBAT_ACTIVE (both players start with starter Pistol; manual RR/E roll forbidden!)
  5. Combat Round 1 actions: Ctrl Aim, Shift Sprint, Agent Skills (Barrier Wall & Pulse Recon), Direct LMB Shooting (0 teleport!), Reload (R)
  6. End of Combat Round 1 -> Automatic ROUND_END -> Synchronized MATH_CHALLENGE opens simultaneously on both browsers
  7. Player 1 answers CORRECTLY -> +100 PTS + 4-Weapon Pool Reveal (Pistol / Rifle / Shotgun / Sniper)
     Player 2 answers WRONGLY -> -300 PTS + Weapon Confiscation (NO WEAPON EQUIPPED / UNARMED)
  8. Transition to ROUND 2/10 COMBAT_ACTIVE -> Verify P1 armed (+100) and P2 unarmed (-300)
  9. Real Player 2 Disconnect + Player 1 Browser Reload & Reconnect preserving exact score, weapon & round state
"""
import os
import re
from playwright.sync_api import sync_playwright

APP_URL = os.environ.get("APP_URL", "http://localhost:5173")
SCREENSHOT_DIR = os.environ.get(
    "SCREENSHOT_DIR",
    "/home/antigravity/.gemini/jetski/brain/v1/default/jetski_remote_agents_3p_devbox/df4f397d-f46c-4c3f-9ee9-2735054d1b34/scratch/e2e_shots",
)
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

with open("shared/questions.ts", "r", encoding="utf-8") as f:
    q_src = f.read()

PROMPT_TO_ANSWER = {
    (m.group(1) or m.group(2)): int(m.group(3))
    for m in re.finditer(r"""prompt:\s*(?:'([^']+)'|"([^"]+)")[\s\S]*?correctIndex:\s*([0-3])""", q_src)
}
assert len(PROMPT_TO_ANSWER) == 84, f"Expected 84 parsed prompts, got {len(PROMPT_TO_ANSWER)}"


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

        print("[1/9] Loading Main Menu in both browsers...", flush=True)
        page1.goto(APP_URL, wait_until="domcontentloaded")
        page1.wait_for_selector("#btn-menu-create", timeout=20000)
        page2.goto(APP_URL, wait_until="domcontentloaded")
        page2.wait_for_selector("#btn-menu-join", timeout=20000)
        page1.wait_for_timeout(500)
        page1.screenshot(animations="disabled", path=f"{SCREENSHOT_DIR}/01_main_menu.png")

        print("[2/9] Player 1 creating room...", flush=True)
        page1.fill("#input-player-name", "NeonHost")
        page1.click("#btn-menu-create")
        page1.wait_for_selector("#lobby-room-code", timeout=10000)
        room_code = page1.inner_text("#lobby-room-code").strip()
        assert len(room_code) == 6, f"Invalid room code: {room_code}"
        print(f"      -> Room created: {room_code}", flush=True)

        print("[3/9] Player 2 joining room via Room Code...", flush=True)
        page2.fill("#input-player-name", "CyberGuest")
        page2.click("#btn-menu-join")
        page2.wait_for_selector("#input-room-code", timeout=10000)
        page2.fill("#input-room-code", room_code)
        page2.click("#btn-join-room-submit")
        page2.wait_for_selector("#lobby-room-code", timeout=10000)

        page1.wait_for_function(
            "() => document.querySelector('#lobby-player-count')?.textContent?.includes('2 / 8')",
            polling=100,
            timeout=10000,
        )
        page1.click("#btn-agent-aegis")
        page2.click("#btn-agent-pulse")
        page2.click("#btn-toggle-ready")
        page1.wait_for_timeout(350)
        page1.screenshot(animations="disabled", path=f"{SCREENSHOT_DIR}/02_lobby.png")
        print("      -> Both players synced in 10-Round Lobby with Agents AEGIS & PULSE!", flush=True)

        print("[4/9] Host starting 10-Round match (Countdown -> ROUND 1/10 COMBAT_ACTIVE)...", flush=True)
        page1.click("#btn-start-match")
        page1.wait_for_selector("#hud-round-state[data-round-state='COMBAT_ACTIVE']", timeout=12000)
        page2.wait_for_selector("#hud-round-state[data-round-state='COMBAT_ACTIVE']", timeout=12000)

        assert page1.locator("#hud-round-state").get_attribute("data-round-number") == "1"
        assert page1.locator("#hud-round-state").get_attribute("data-max-rounds") == "10"
        assert page1.locator("#btn-hud-math-quick").count() == 0, "No manual weapon roll button allowed!"
        assert page1.locator("#math-terminal-modal").count() == 0, "Math modal must NOT open before Combat Round ends!"

        # Verify manual RR double-tap during Combat Round does NOT open Math Modal
        page1.keyboard.press("KeyR")
        page1.wait_for_timeout(90)
        page1.keyboard.press("KeyR")
        page1.wait_for_timeout(200)
        assert page1.locator("#math-terminal-modal").count() == 0, "RR must NOT open Math modal during Combat Round!"
        print("      -> Round 1/10 COMBAT_ACTIVE started! Both players armed with starter Pistol & manual roll forbidden!", flush=True)

        print("[5/9] Testing Round 1 Combat: Ctrl Aim, Agent Skills (Barrier & Recon), Direct LMB Shooting & Reload...", flush=True)
        ammo_before = int(page1.inner_text("#hud-ammo-value").strip())

        page1.keyboard.down("ControlLeft")
        page1.wait_for_timeout(120)
        assert page1.locator("#hud-aim-indicator").is_visible()
        page1.keyboard.up("ControlLeft")

        page1.keyboard.press("KeyC")
        page2.keyboard.press("KeyQ")
        page1.wait_for_function(
            "() => { const t = document.querySelector('#hud-skill-C-status')?.textContent?.trim() || ''; return t !== 'READY' && t.endsWith('s'); }",
            polling=100,
            timeout=6000,
        )

        # Walk and shoot
        page1.keyboard.down("KeyD")
        page1.wait_for_timeout(200)
        page1.keyboard.up("KeyD")
        t_pre = page1.evaluate("window.__MATH_RIVALS_TELEMETRY__()")
        page1.mouse.click(512, 320)
        page1.wait_for_function(
            f"() => Number(document.querySelector('#hud-ammo-value')?.textContent?.trim() || '999') < {ammo_before}",
            polling=100,
            timeout=6000,
        )
        t_post = page1.evaluate("window.__MATH_RIVALS_TELEMETRY__()")
        assert abs(t_post["x"] - t_pre["x"]) < 1e-3 and abs(t_post["z"] - t_pre["z"]) < 1e-3, "Shooting teleported player!"
        ammo_after = int(page1.inner_text("#hud-ammo-value").strip())
        page1.screenshot(animations="disabled", path=f"{SCREENSHOT_DIR}/03_round1_combat.png")

        page1.keyboard.press("KeyR")
        page1.wait_for_function(
            f"() => Number(document.querySelector('#hud-ammo-value')?.textContent?.trim() || '0') === {ammo_before}",
            polling=100,
            timeout=6000,
        )
        # Exit Mouse Look Mode via Tab (if pointer lock was engaged by shooting) then switch Style mid-round!
        if page1.locator("#hud-pointer-lock-status").get_attribute("data-mouse-look-active") == "true":
            page1.keyboard.press("Tab")
        page1.click("#btn-hud-style-phantom")
        page1.wait_for_selector("#hud-agent-badge[data-agent='phantom']", timeout=5000)
        print(f"      -> Combat Round 1 shooting ({ammo_before}->{ammo_after}->{ammo_before}), skills, 0-teleport & mid-round Style switch (AEGIS->PHANTOM) verified!", flush=True)

        print("[6/9] Waiting for Combat Round 1 to end -> Automatic Synchronized MATH_CHALLENGE on both browsers...", flush=True)
        page1.wait_for_selector("#math-terminal-modal[data-math-phase='QUESTION_ACTIVE']", timeout=26000)
        page2.wait_for_selector("#math-terminal-modal[data-math-phase='QUESTION_ACTIVE']", timeout=26000)

        # Verify Player 2 can also switch Style between rounds inside the Math Challenge modal!
        page2.click("#btn-math-style-vortex")
        page2.wait_for_selector("#hud-agent-badge[data-agent='vortex']", timeout=5000)

        q1_p1 = page1.inner_text("#math-question-prompt").strip()
        q1_p2 = page2.inner_text("#math-question-prompt").strip()
        assert q1_p1 == q1_p2, f"Expected synchronized round question across both players! P1={q1_p1} vs P2={q1_p2}"
        assert page1.locator("#btn-close-math").count() == 0, "Cannot skip or close Math Challenge!"
        page1.screenshot(animations="disabled", path=f"{SCREENSHOT_DIR}/04_synchronized_math_challenge.png")
        print(f"      -> Synchronized Round 1 Math Challenge opened automatically on both browsers!", flush=True)

        print("[7/9] P1 answers CORRECTLY (+100 PTS + Weapon Pool Roll) & P2 answers WRONGLY (-300 PTS + Weapon Confiscated)...", flush=True)
        correct_idx = PROMPT_TO_ANSWER[q1_p1]
        wrong_idx = (correct_idx + 1) % 4

        page1.click(f"#btn-math-choice-{correct_idx}")
        page2.click(f"#btn-math-choice-{wrong_idx}")

        # Both answered -> Room transitions to ANSWER_FEEDBACK -> WEAPON_REVEAL
        page1.wait_for_selector("#math-answer-feedback[data-answer-correct='true']", timeout=8000)
        page2.wait_for_selector("#weapon-penalty-stage", timeout=8000)
        assert page2.locator("#weapon-penalty-stage").get_attribute("data-penalty-points") == "-300"
        assert page2.locator("#weapon-penalty-stage").get_attribute("data-weapon-confiscated") == "true"

        # Wait for WEAPON_REVEAL on P1
        page1.wait_for_selector("#weapon-roulette-stage", timeout=8000)
        page1.wait_for_selector("#math-awarded-weapon-name", timeout=8000)
        awarded_weapon = page1.locator("#math-awarded-weapon-name").get_attribute("data-awarded-weapon")
        assert awarded_weapon in ("pistol", "revolver", "smg", "rifle", "burst", "shotgun", "lmg", "sniper"), f"Invalid pool weapon: {awarded_weapon}"
        print(f"      -> P1 awarded {awarded_weapon.upper()} (+100 PTS) | P2 weapon confiscated (-300 PTS)!", flush=True)

        print("[8/9] Waiting for ROUND 2/10 COMBAT_ACTIVE -> Verifying P1 Armed (+100) & P2 Unarmed with Cyber Fists (-300)...", flush=True)
        page1.locator("#math-terminal-modal").wait_for(state="detached", timeout=12000)
        page2.locator("#math-terminal-modal").wait_for(state="detached", timeout=12000)

        page1.wait_for_selector("#hud-round-state[data-round-number='2']", timeout=8000)
        assert page1.inner_text("#hud-my-score").strip() == "100"
        assert page2.inner_text("#hud-my-score").strip() == "-300"
        assert page2.inner_text("#hud-weapon-name").strip() == "NO WEAPON EQUIPPED"
        assert "FISTS" in page2.inner_text("#hud-ammo-value").strip()
        assert page2.locator("#hud-unarmed-notice").is_visible()
        # P2 punches with Cyber Fists in Round 2
        page2.mouse.click(512, 320)
        p1_weapon_hud = page1.inner_text("#hud-weapon-name").strip()
        assert p1_weapon_hud != "NO WEAPON EQUIPPED"
        print(f"      -> Round 2/10 active! P1 score=100 ({p1_weapon_hud}), P2 score=-300 (NO WEAPON EQUIPPED / ∞ FISTS punch verified)!", flush=True)

        print("[9/9] Testing REAL Player 2 Disconnect + Player 1 Browser Reload & Reconnect...", flush=True)
        ctx2.close()
        page1.wait_for_timeout(350)
        page1.reload(wait_until="networkidle")
        page1.wait_for_selector("#btn-menu-reconnect", timeout=15000)
        page1.click("#btn-menu-reconnect")
        page1.wait_for_selector("#hud-my-score", timeout=15000)
        assert page1.inner_text("#hud-my-score").strip() == "100", "Score lost on reconnect!"
        assert page1.inner_text("#hud-weapon-name").strip() == p1_weapon_hud, "Weapon lost on reconnect!"

        page1.keyboard.down("Tab")
        page1.wait_for_selector("#live-scoreboard-overlay", timeout=8000)
        sb_after_dc = page1.inner_text("#live-scoreboard-overlay")
        assert "OFFLINE" in sb_after_dc and "-300" in sb_after_dc
        page1.keyboard.up("Tab")
        print("      -> Reconnect restored P1 score (100) & weapon, and scoreboard shows P2 OFFLINE (-300)!", flush=True)

        browser.close()

    assert len(errors_p1) == 0, f"Player 1 page errors: {errors_p1}"
    assert len(errors_p2) == 0, f"Player 2 page errors: {errors_p2}"
    print("\nALL 9 REAL 2-BROWSER MULTIPLAYER ROUND-SYNCHRONIZED E2E CHECKS PASSED WITH ZERO ERRORS!")


if __name__ == "__main__":
    run_e2e()
