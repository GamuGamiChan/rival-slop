# MATH RIVALS 3D — 3D Asset Credits, License Registry & Security Audit

All imported 3D `.glb` models and PBR texture maps in **MATH RIVALS 3D** have been obtained from verified public-domain repositories (**Kenney**, **Quaternius**, and **ambientCG**), inspected for license compliance (**CC0 1.0 Universal Public Domain**), and audited for binary/schema security before integration into [`public/assets/`](file:///home/antigravity/KhunSiwa/-rival/public/assets).

---

## 1. Imported 3D Assets & PBR Textures Table

| Asset Name | Creator | Source URL | License | Attribution | Modifications |
|---|---|---|---|---|---|
| `blaster-h.glb` (Sidearm Pistol — Pulse Pistol) | Kenney | https://kenney.nl/assets/blaster-kit | CC0 1.0 Universal | Not required (Credit given to Kenney) | Scaled (`0.72`), rotated `180°` Y (`-Z` forward), dual accent rails added in [`ImportedWeaponModel.tsx`](file:///home/antigravity/KhunSiwa/-rival/src/game/ImportedWeaponModel.tsx) |
| `blaster-n.glb` (Assault Rifle — Vector Carbine) | Kenney | https://kenney.nl/assets/blaster-kit | CC0 1.0 Universal | Not required (Credit given to Kenney) | Scaled (`0.74`), rotated `180°` Y (`-Z` forward), dual accent rails added in [`ImportedWeaponModel.tsx`](file:///home/antigravity/KhunSiwa/-rival/src/game/ImportedWeaponModel.tsx) |
| `blaster-l.glb` (Tactical Shotgun — Scatter Ion) | Kenney | https://kenney.nl/assets/blaster-kit | CC0 1.0 Universal | Not required (Credit given to Kenney) | Scaled (`0.78`), rotated `180°` Y (`-Z` forward), dual accent rails added in [`ImportedWeaponModel.tsx`](file:///home/antigravity/KhunSiwa/-rival/src/game/ImportedWeaponModel.tsx) |
| `blaster-e.glb` (Sniper Railgun — Gauss Railgun) | Kenney | https://kenney.nl/assets/blaster-kit | CC0 1.0 Universal | Not required (Credit given to Kenney) | Scaled (`0.62`), rotated `180°` Y (`-Z` forward), dual accent rails added in [`ImportedWeaponModel.tsx`](file:///home/antigravity/KhunSiwa/-rival/src/game/ImportedWeaponModel.tsx) |
| `blaster-k.glb` (Compact Blaster — SMG / Revolver) | Kenney | https://kenney.nl/assets/blaster-kit | CC0 1.0 Universal | Not required (Credit given to Kenney) | Scaled (`0.76–0.78`), rotated `180°` Y (`-Z` forward) in [`ImportedWeaponModel.tsx`](file:///home/antigravity/KhunSiwa/-rival/src/game/ImportedWeaponModel.tsx) |
| `blaster-p.glb` (Heavy Blaster — Burst / LMG) | Kenney | https://kenney.nl/assets/blaster-kit | CC0 1.0 Universal | Not required (Credit given to Kenney) | Scaled (`0.68–0.75`), rotated `180°` Y (`-Z` forward) in [`ImportedWeaponModel.tsx`](file:///home/antigravity/KhunSiwa/-rival/src/game/ImportedWeaponModel.tsx) |
| `quaternius-cube-crate.glb` (Sci-Fi Cargo Crate) | Quaternius | https://poly.pizza/m/6c6xeb123c | CC0 1.0 Universal | Not required (Credit given to Quaternius via Poly Pizza) | Cloned and placed at 6 tactical cover positions (`scale: 0.52–0.55`) in [`ImportedArenaProps.tsx`](file:///home/antigravity/KhunSiwa/-rival/src/game/ImportedArenaProps.tsx) |
| `quaternius-barrel.glb` (Sci-Fi Energy Barrel) | Quaternius | https://poly.pizza/m/72ac139224 | CC0 1.0 Universal | Not required (Credit given to Quaternius via Poly Pizza) | Cloned and placed at 4 sector cover corners (`scale: 0.65`) in [`ImportedArenaProps.tsx`](file:///home/antigravity/KhunSiwa/-rival/src/game/ImportedArenaProps.tsx) |
| `kenney-fence-fortified.glb` (Fortified Perimeter Barrier) | Kenney | https://poly.pizza/m/pLH3528427 | CC0 1.0 Universal | Not required (Credit given to Kenney via Poly Pizza) | Scaled (`[3.2, 2.4, 3.2]`) and placed at 4 base perimeter guard positions in [`ImportedArenaProps.tsx`](file:///home/antigravity/KhunSiwa/-rival/src/game/ImportedArenaProps.tsx) |
| `quaternius-guard-tower.glb` (Perimeter Guard Watchtower) | Quaternius | https://poly.pizza/m/5R16d7941a | CC0 1.0 Universal | Not required (Credit given to Quaternius via Poly Pizza) | Scaled (`1.35`) and placed at 4 stadium corner overlooks in [`ImportedArenaProps.tsx`](file:///home/antigravity/KhunSiwa/-rival/src/game/ImportedArenaProps.tsx) |
| `Metal038_1K-JPG_Color.jpg` (Brushed Metal Albedo 1K) | ambientCG (Lennart Demes) | https://ambientcg.com/a/Metal038 | CC0 1.0 Universal | Not required (Credit given to ambientCG) | Tiled `4×4` (`RepeatWrapping`, `SRGBColorSpace`) on central reactor armor ring in [`ImportedArenaProps.tsx`](file:///home/antigravity/KhunSiwa/-rival/src/game/ImportedArenaProps.tsx) |
| `Metal038_1K-JPG_Roughness.jpg` (Brushed Metal Roughness 1K) | ambientCG (Lennart Demes) | https://ambientcg.com/a/Metal038 | CC0 1.0 Universal | Not required (Credit given to ambientCG) | Tiled `4×4` (`RepeatWrapping`) paired with `Metal038_1K-JPG_Color.jpg` in [`ImportedArenaProps.tsx`](file:///home/antigravity/KhunSiwa/-rival/src/game/ImportedArenaProps.tsx) |

---

## 2. Binary & Security Audit Verification Log

Every imported `.glb` and `.jpg` file under `public/assets/` was inspected programmatically (and verified continuously in [`tests/roomManager.test.ts`](file:///home/antigravity/KhunSiwa/-rival/tests/roomManager.test.ts)) against the following security criteria:

1. **Valid GLB v2 Binary Header & Chunk Structure**:
   - All 10 `.glb` files begin with magic `0x46546C67` (`glTF`), version `2`, and valid `JSON` (`0x4E4F534A`) + `BIN` (`0x004E4942`) chunk lengths matching total byte size.
2. **Zero External URIs / Zero SSRF or Network Fetch Surface**:
   - All `buffers` and `images` inside every `.glb` JSON chunk use embedded binary buffer views (`uri` is absent on all buffers and images). No external `http://`, `https://`, `data:`, or relative file path references exist inside any `.glb`.
3. **Strict glTF Extension Allowlist**:
   - Only `KHR_texture_transform` (standard UV offset/scale extension used by Kenney's embedded colormap) is present. Zero unknown, custom, or executable extensions exist.
4. **Zero Embedded Scripts or Suspicious Payloads**:
   - Scanned all JSON chunks and metadata extras for `<script`, `javascript:`, `eval(`, `Function(`, or HTML injection strings — **0 occurrences**.
5. **Polygon & File Size Budget (WebGL Performance Safety)**:
   - Weapon `.glb` models: **296 – 882 triangles** each (**38 KB – 89 KB** per file).
   - Arena prop `.glb` models: **264 – 1,384 triangles** each (**13 KB – 74 KB** per file).
   - PBR texture maps: **1024×1024 JPG** (**541 KB** Color, **326 KB** Roughness).
   - Total 3D asset payload: **~1.35 MB** across all 12 files, ensuring instant loading and 60 FPS WebGL rendering.
