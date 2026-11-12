# Immoral Combat

> **3D Stress-Relief Arcade Fighter** powered by TypeScript, Three.js, GSAP, and Web Audio.

Immoral Combat is a Tekken-inspired 1v1 browser fighting game featuring a full-3D Fighter Select stage, Best-of-3 round progression, multi-tier CPU AI, custom GLB character & arena pipelines, cinematic signature finishers, aggression-driven blood effects, and a secret boss character.

---

## Key Features

- **Tekken-Style 3D Fighter Select Showcase (`CharacterSelectStage`)**
  - Dual red/blue rim lighting, camera parallax, bokeh particles, and a live 3D **`IMMORAL COMBAT`** backdrop emblem.
  - Per-side idle stance toggles (`IDLE 1` / `IDLE 2`), match difficulty selector (`EASY`, `MEDIUM`, `HARD`), stage picker, `RANDOM` roll, and mouse/keyboard slot navigation.
- **Best-of-3 Combat Loop (`GameManager`)**
  - 99-second round timer, smooth GSAP-animated HP bars with delayed damage trails, round win pips, center match announcements (`ROUND X`, `FIGHT!`, `K.O.`, `TIME OVER`, winner banners), slow-motion K.O. camera & ticker slowdown (`15 FPS`), and one-key rematch (`R`).
- **Tuned CPU AI (`CpuAiController`)**
  - **Easy / Medium / Hard** difficulty profiles scale reaction latency, strike cooldowns, combo chaining, dodge rate, damage multipliers, and Signature Meter usage (`F` / `G`, including defensive Chai Break healing at low HP).
- **Signature Moves & Counters (`src/signatures/`)**
  - Building the corner **Signature Meter** to `100%` (from taking hits, landing blows, or passive tick) unlocks character-specific finishers (`F`) and secondary signature moves (`G`), plus dramatic counter/clash strikes (`C`).
- **Aggression-Based Blood & Impact Feedback (`EffectsManager`)**
  - Repeated hits within a short aggression window (`>= 2` hits in `3.4s`) or heavy/signature impacts trigger directional 3D blood droplets, mist puffs, persistent arena floor decals, camera shake, and a crimson damage vignette pulse on heavy player hits.
- **Sacred Character Lock (`src/characters/chinuAccess.ts` & `vite.config.ts`)**
  - **Chinu** starts locked on boot (`priyanshu` vs `modiji` default matchup) and cannot be picked via hover, `RANDOM`, or controller APIs until unlocked with the secret key configured in `.env`.
  - Passwords are hashed with a salted SHA-256 digest at build/config time—plaintext credentials from `.env` are **never** embedded in client bundles (`dist/`).
- **On-Demand Asset Streaming & Loaders (`GameController`, `CharacterSelectStage`, `StageManager`)**
  - **Initial Setup Loader (`#initial-loader`):** Preloads UI styling, all 5 roster fighter avatar portraits, and the initial 2 showcase stances before revealing Fighter Select—keeping unselected `idle` animations, combat movesets, and all arena stage GLBs unloaded upfront.
  - **Lazy Select & Match Loaders (`#select-*-loading`, `#match-loader`):** Streams extra stance/showcase clips on hover dwell/selection and downloads only the chosen **2 fighters' combat animations** + **1 chosen arena stage GLB** on **FIGHT NOW** (with instant zero-download cache hits on rematches and only active combatants attached to the Three.js scene).
- **Procedural Web Audio & Interactive Controls Manual**
  - Synthesized punches, kicks, blocks, signature chimes, KO impacts, and crowd reactions via the Web Audio API (`SoundManager`), toggleable in the HUD (`🔊 SFX ON`), alongside an in-game Controls Guide modal (`H` / `F1`).

---

## Playable Roster & Signature Moves

| Fighter | Display Name | Epithet | Primary Signature (`F`) | Secondary Signature (`G`) | Notes |
| --- | --- | --- | --- | --- | --- |
| `priyanshu` | **Priyanshu** | Spirited Challenger (`100 HP`) | **Toxic Hack** — Opens cyberpunk laptop, types breach script & engulfs opponent in poison fog | — | Default Player 1 |
| `modiji` | **Modiji** | Vishwaguru (`100 HP`) | **Mitron! Sonic Boom** — Expanding AoE wave that stuns & freezes nearby foes | **Chai Break** — Drinks chai from right hand, glows saffron & heals **+20% HP** | Default Opponent |
| `trump` | **Pope Grump** | Supreme Pontiff of Pain (`100 HP`) | **You're Fired!** — Launches a glowing fiery decree projectile from the right hand bone | **Build the Wall** — Drops a giant bouncing brick wall smashing back nearby foes | Heavy knockback kit |
| `putin` | **царь Путин** | Iron Kremlin Strategist (`100 HP`) | **The Long Table** — Extends a 20x white banquet table battering ram knocking opponents away | **Matryoshka Munition** — Nesting doll grenade bouncing & exploding 3 times while halving in scale | Zoning & chain AoE |
| `chinu` | **Chinu** | Unstoppable Real Boss (`∞ HP`) | **Boss Spank** — Steps behind the opponent for 3 whipping open-palm slaps | — | **Locked by `.env` key** (`∞` Unbreakable Boss + **Kiss Heal**) |

---

## Arena Stages

Stages live under `models/stages/` and are automatically indexed by [`ModelAssetRegistry.ts`](src/characters/ModelAssetRegistry.ts) and calibrated in [`ArenaBuilder.ts`](src/core/ArenaBuilder.ts):

| Stage ID | Display Name | Model Asset |
| --- | --- | --- |
| `stage-1` | **Cyber Arena** | `models/stages/stage-1.glb` |
| `stage-2` | **Dojo Courtyard** | `models/stages/stage-2.glb` |
| `stage-3` | **Tournament Stage** | `models/stages/stage-3.glb` |

---

## Tech Stack

- **Language:** TypeScript `^5.6.3` (strict mode enabled)
- **3D Engine:** Three.js `^0.170.0` (`WebGLRenderer`, `GLTFLoader`, `AnimationMixer`, dynamic shadows & VFX particles)
- **Animation / Timeline:** GSAP `^3.12.5`
- **Build & Dev Server:** Vite `^6.0.0`
- **Audio:** Native Web Audio API (`SoundManager`)

---

## Getting Started

### Prerequisites

- **Node.js** `18+` (LTS recommended) and **npm**

### Installation

```bash
npm install
```

### Environment Configuration (`.env`)

Create a `.env` (or `.env.local`) file in the project root to set the unlock key for the sacred character **Chinu**:

```env
CHINU_KEY="your-secret-key"
```

> **Supported variable names & syntax:** [`vite.config.ts`](vite.config.ts) checks `CHINU_KEY`, `CHINU_PASSWORD`, `VITE_CHINU_PASSWORD`, and `PASSWORD` (plus `process.env` fallbacks), supporting both `KEY=value` and `KEY: "value"` formats. During `vite` / `vite build`, only a salted SHA-256 hash (`__CHINU_KEY_SALT__`, `__CHINU_KEY_HASH__`) is injected into the client—keep `.env` out of version control (`.gitignore` already excludes `.env` and `.env.*`).

### Running & Building

| Script | Command | Description |
| --- | --- | --- |
| Dev Server | `npm run dev` | Starts Vite with HMR (`tsc` types checked on build) |
| Production Build | `npm run build` | Runs `tsc --noEmit` followed by `vite build` into `dist/` |
| Preview Build | `npm run preview` | Serves the production `dist/` bundle locally |

---

## Controls

### Fighter Select Screen

| Input | Action |
| --- | --- |
| `←` / `→` or `A` / `D` | Navigate fighter roster grid |
| `Enter` / `Space` or Click Tile | Select fighter (or open unlock prompt on locked **Chinu**) |
| `Q` | Toggle `IDLE 1` / `IDLE 2` showcase stance |
| `Tab` | Switch between **Player 1** and **Opponent** slots |
| `T` | Cycle arena stage (`Cyber Arena`, `Dojo Courtyard`, `Tournament Stage`) |
| `F` or **FIGHT NOW** | Launch the selected matchup |
| `Esc` | Return to P1 slot / close Fighter Select / cancel unlock modal |

### In-Match Combat & HUD

| Input | Action |
| --- | --- |
| `W A S D` or `← ↑ ↓ →` | Move & sidestep around the ring |
| `Space` or **Click Opponent** | Quick Punch |
| `K` | Heavy Drop Kick |
| `C` | Counter / Clash Strike |
| `M` | Muay Thai 3-Hit Combo |
| `F` | **Primary Signature Move** (requires `100%` Signature Meter) |
| `G` | **Secondary Signature Move** (requires `100%` Signature Meter — e.g. Modiji **Chai Break** `+20% HP`, **Build the Wall**, **Matryoshka Munition**) |
| `U` or **`💕 Heal (U)`** button | **Heal Fighters** — triggers Chinu's **Kiss Heal** (full restore for Priyanshu) in `Chinu vs Priyanshu`, or refills active finite fighters' HP and clears blood decals in all other matchups |
| `P` / `L` / `V` / `E` | Fighter emotes (Taunt / Flex / Champ Pose / Arena Entry) |
| `R` | Rematch (after Match Over) |
| `H` / `F1` | Open / close the **Controls & Combat Guide** (pauses active combat) |

---

## Project Structure

```text
immoral-combat/
├── index.html                  # Arcade HUD, Fighter Select UI, Controls Guide & Sacred Unlock modal
├── package.json                # Dependencies (three, gsap, vite, typescript) & npm scripts
├── tsconfig.json               # Strict TypeScript compiler configuration
├── vite.config.ts              # Vite config + server-side .env salted SHA-256 key hashing
├── models/                     # Auto-discovered GLB 3D characters, animations & arena stages
│   ├── chinu/                  # Chinu avatar, body & animation GLBs
│   ├── modiji/                 # Modiji avatar, body & animation GLBs
│   ├── priyanshu/              # Priyanshu avatar, body & animation GLBs
│   ├── putin/                  # Putin avatar, body & animation GLBs
│   ├── trump/                  # Pope Grump avatar, body & animation GLBs
│   └── stages/                 # Arena stages (stage-1.glb .. stage-3.glb)
└── src/
    ├── main.ts                 # App entrypoint initializing GameController
    ├── style.css               # Arcade HUD, Select screen, Controls Guide & Unlock modal styles
    ├── vite-env.d.ts           # Type declarations for Vite & injected sacred-key constants
    ├── audio/
    │   └── SoundManager.ts     # Procedural Web Audio combat SFX synthesizer
    ├── characters/
    │   ├── AnimationController.ts
    │   ├── AnimationRetargeter.ts
    │   ├── CharacterFactory.ts
    │   ├── characterNames.ts   # Single source of truth for fighter IDs & display names
    │   ├── chinuAccess.ts      # Sacred Chinu lock state & pure-TS SHA-256 verification
    │   ├── GLBClipsBuilder.ts
    │   ├── ModelAssetRegistry.ts # Vite glob auto-discovery for models/*/*.glb
    │   ├── ProceduralClips.ts
    │   └── SharedAnimationManager.ts
    ├── combat/
    │   ├── CpuAiController.ts  # Difficulty-profiled CPU decision & signature AI
    │   └── PhysicsCombatSystem.ts
    ├── core/
    │   ├── ArenaBuilder.ts     # Stage loading, scaling & raycast floor grounding
    │   ├── GameController.ts   # Main loop, combat resolution, heal & signature orchestration
    │   ├── GameManager.ts      # Best-of-3 state machine, timer, KO slow-mo & HUD sync
    │   └── SceneManager.ts     # Three.js renderer, camera rig, lighting & stage management
    ├── effects/
    │   └── EffectsManager.ts   # Hit sparks, kiss hearts, camera/tint flash & 3D blood FX
    ├── signatures/
    │   ├── index.ts            # Unified per-character signature registry & executor
    │   ├── chinu/              # Boss Spank
    │   ├── priyanshu/          # Toxic Hack (Cyberpunk Laptop + Poison Fog)
    │   ├── modiji/             # Mitron! Sonic Boom & Chai Break
    │   ├── trump/              # You're Fired! & Build the Wall
    │   └── putin/              # The Long Table & Matryoshka Munition
    ├── types/
    │   └── game.ts             # Shared TypeScript interfaces & state unions
    └── ui/
        ├── CharacterSelectStage.ts # 3D Fighter Select stage, backdrop logo & showcase rigs
        └── UIManager.ts        # DOM bindings, keyboard routing, HUD sync & modals
```

---

## Adding Custom Models or Stages

[`ModelAssetRegistry.ts`](src/characters/ModelAssetRegistry.ts) uses `import.meta.glob('../../models/*/*.glb')` so newly dropped `.glb` assets are discovered automatically:

- **New Arena Stage:** Drop a `.glb` file into `models/stages/` (e.g., `models/stages/dojo-night.glb`), and optionally register custom scaling/atmosphere presets in `STAGE_PRESETS` inside [`src/core/ArenaBuilder.ts`](src/core/ArenaBuilder.ts).
- **Split or Character GLB Pipelines:** Supports both per-character animation GLBs (`models/<character>/<character>-<move>.glb`) and shared T-pose character + animation packs (`models/characters/<character>.glb` + `models/animations/<move>.glb`).

