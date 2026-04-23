# motionlang

**Extract the complete motion language from any website.**

motionlang crawls a live URL using Playwright, detects all animation patterns across CSS, GSAP, Framer Motion, AOS, and ScrollReveal, and outputs a structured motion spec in 7 formats — ready for designer handoff, AI agent consumption, or direct use in code.

---

## Installation

```bash
npm install
npx playwright install chromium
```

## Usage

```bash
# Basic scan
node bin/motionlang.js https://linear.app

# Full scan with scroll + mouse simulation
node bin/motionlang.js https://stripe.com --deep --out ./output

# Compare two sites
node bin/motionlang.js https://linear.app --compare https://vercel.com --scroll

# Start the MCP server for AI agent access
node bin/motionlang.js mcp --dir ./motion-spec-output
```

## CLI Options

| Option | Description |
|---|---|
| `--scroll` | Simulate full-page scroll to capture scroll-triggered animations |
| `--mouse` | Simulate mouse movement to detect parallax, tilt, cursor effects |
| `--interactions` | Simulate hover/focus for state-change animations |
| `--deep` | Enable all simulation modes (scroll + mouse + interactions) |
| `--compare <url2>` | Compare motion fingerprint against a second URL |
| `--out <dir>` | Output directory (default: `./motion-spec-output`) |
| `--emit <format>` | Output format: `json \| md \| gsap \| framer \| css \| figma \| mcp \| all` |
| `--section <selector>` | Target a specific section e.g. `.hero` |
| `--width <px>` | Viewport width (default: 1280) |
| `--wait <ms>` | Wait N ms after page load before scanning |

## Output Formats

For each crawl, motionlang writes up to 7 files:

| File | Use |
|---|---|
| `*-motion-spec.json` | Full structured spec — all animations, tokens, raw data |
| `*-motion-spec.md` | Designer/developer handoff markdown document |
| `*-motion-gsap.js` | Ready-to-paste GSAP ScrollTrigger code |
| `*-motion-framer.js` | Framer Motion variants + `useMotionVariants` hook |
| `*-motion.css` | Pure CSS with custom properties + IntersectionObserver setup |
| `*-motion-figma.json` | Figma Variables-compatible token package |
| `*-motion-mcp.json` | MCP resource for AI agent consumption |

## Motion Fingerprint

Every crawl produces a fingerprint:

```
Feel:       smooth          # springy / smooth / snappy / mechanical / mixed
Pattern:    state-change    # dominant animation pattern
Library:    css             # detected animation library
Animations: 11              # total animations detected
Reduced ♿: ✅ supported    # prefers-reduced-motion support
Health:     Grade A (100)   # motion health score
```

## Health Score

The health score (0–100) audits the motion spec against best practices:

- **NO_REDUCED_MOTION** — WCAG 2.1 AA violation, −20 pts
- **DURATION_INCONSISTENCY** — more than 5 unique durations, −10 pts
- **EASING_INCONSISTENCY** — more than 4 unique easings, −10 pts
- **UNNAMED_EASINGS** — unrecognised easing values, −5 pts
- **LONG_DURATIONS** — animations over 1000ms, −5 pts

## MCP Server

Start the MCP server to give AI coding agents access to your motion specs:

```bash
node bin/motionlang.js mcp --dir ./motion-spec-output
```

The server exposes three tools:

- **`get_motion_tokens`** — returns duration and easing tokens for a site
- **`get_animation_for_pattern`** — returns the canonical animation for a given pattern
- **`get_easing_for_component`** — returns the appropriate easing for a component type

Connect via any MCP-compatible client (Claude Code, Cursor, Windsurf).

## Detectors

| Detector | What it finds |
|---|---|
| `css-transitions` | CSS transition properties, easing, duration |
| `css-keyframes` | `@keyframes` definitions and usage |
| `gsap` | GSAP tweens, timelines, version |
| `gsap-scroll-trigger` | ScrollTrigger configs, scrub, pin |
| `framer-motion` | Framer Motion variants, springs, presence |
| `intersection-observer` | Custom IO scroll-reveal patterns |
| `aos` | Animate On Scroll library |
| `scroll-reveal` | ScrollReveal library |
| `cdp-animations` | CDP Animation domain — cross-library fallback |
| `mouse-parallax` | Transform changes driven by mouse position |
| `magnetic-cursor` | Elements that attract the cursor |
| `tilt-3d` | 3D perspective tilt effects |
| `cursor-follower` | Custom cursor follower elements |
| `spotlight` | Radial gradient spotlight on mouse move |

## Tests

```bash
npm test
```

## Project Structure

```
bin/
  motionlang.js          CLI entry point
src/
  index.js               Pipeline orchestrator
  crawler.js             Playwright crawler + simulation
  classifier.js          15-pattern taxonomy classifier
  fingerprint.js         Feel / library / pattern computation
  score.js               Motion health score (0–100)
  compare.js             Diff two motion specs
  detectors/             14 detector modules
  formatters/            7 output formatters
  mcp/                   MCP server (server.js, resources.js, tools.js)
  utils/                 easing-names.js, spring-to-css.js
tests/
  *.test.js              Node built-in test runner
```
