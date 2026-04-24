# motionlang

**Extract the complete motion language from any website — by component.**

motionlang crawls a live URL using Playwright, detects all animation patterns across CSS,
GSAP, Framer Motion, AOS, ScrollReveal, and cursor/parallax libraries, groups animations
into named components, and outputs structured specs in 7+ formats ready for designer
handoff, Figma import, AI agent consumption, or direct use in code.

> **Phase 1** was a motion documentation tool.
> **Phase 2** is a motion + component reverse-engineering system.

---

## Contents

- [Quick Start](#quick-start)
- [Installation](#installation)
- [All CLI Flags](#all-cli-flags)
- [All Subcommands](#all-subcommands)
- [Output Files](#output-files)
- [Figma Integration](#figma-integration)
- [MCP Integration](#mcp-integration)
- [Examples](#examples)
- [Health Score](#health-score)
- [Token Standardisation](#token-standardisation)
- [API Reference](#api-reference)

---

## Quick Start

```bash
npm install
npx playwright install chromium

# Basic scan — 7 output files written to ./motion-spec-output
node bin/motionlang.js https://linear.app

# Full simulation + explanation
node bin/motionlang.js https://linear.app --deep --explain

# List components on a page, then extract one
node bin/motionlang.js https://madewithgsap.com --components
node bin/motionlang.js https://madewithgsap.com --component hero --deep

# Site-wide consistency audit
node bin/motionlang.js https://stripe.com --crawl-site --pages 15 --scroll

# Deep component extraction with Figma export
node bin/motionlang.js https://site.com --component pricing --deep --figma-component
```

---

## Installation

**Requirements:** Node.js >= 20, npm

```bash
git clone <repo>
cd motionlang
npm install
npx playwright install chromium
```

**Global install (optional):**
```bash
npm link
motionlang https://linear.app
```

---

## All CLI Flags

### Crawl Flags

| Flag | Type | Description |
|---|---|---|
| `<url>` | Required | Any live public website. |
| `--scroll` | Boolean | Simulate full-page scroll to fire scroll-triggered animations. |
| `--mouse` | Boolean | Simulate mouse grid traversal to capture parallax, tilt, spotlight. |
| `--interactions` | Boolean | Simulate hover/focus/click on interactive elements. |
| `--deep` | Boolean | All simulation modes combined (scroll + mouse + interactions). |
| `--section <selector>` | CSS selector | Target a specific CSS selector. |
| `--width <px>` | Integer | Viewport width. Default: 1280. Use 375 for mobile. |
| `--wait <ms>` | Integer | Wait after page load before crawling. Useful for SPA hydration. |
| `--out <dir>` | Path | Output directory. Default: `./motion-spec-output`. |
| `--emit <format>` | String | Output format: `json \| md \| gsap \| framer \| css \| figma \| mcp \| all`. Default: `all`. |

### Component Flags

| Flag | Type | Description |
|---|---|---|
| `--components` | Boolean | List all detected components on the page. Does not extract. |
| `--component <id>` | String/Number | Extract a single component. All outputs scoped to that component. |

Run `--components` first to see the numbered list, then `--component <id>` with the
number or label from that list.

### Analysis Flags

| Flag | Type | Description |
|---|---|---|
| `--explain` | Boolean | Add motion explanation to output. Writes `*-motion-explain.md`. |
| `--fix` | Boolean | Add prescriptive fix suggestions with code. Writes `*-motion-fix.md`. |
| `--preview` | Boolean | Generate HTML animation preview. Writes `*-motion-preview.html`. |
| `--standardise` | Boolean | Use canonical DTCG token names in all outputs. |
| `--compare <url2>` | URL | Compare motion fingerprint against a second URL. |
| `--figma-component` | Boolean | Generate Figma plugin scripts. Use with `--component <id>`. |

### Site-wide Flags

| Flag | Type | Description |
|---|---|---|
| `--crawl-site` | Boolean | Crawl all internal links from the starting URL. |
| `--depth <n>` | Integer | Max link depth to follow. Default: 3. |
| `--pages <n>` | Integer | Max pages to crawl. Default: 20. |
| `--crawl-delay <ms>` | Integer | Delay between page requests. Default: 1000. |
| `--fail-on-drift <level>` | String | Exit code 1 if drift verdict >= level. For CI. |

`--fail-on-drift` levels: `minor-drift` / `moderate-drift` / `major-drift`

---

## All Subcommands

### `diff` — Deep spec diff

```bash
motionlang diff spec-v1.json spec-v2.json
motionlang diff spec-v1.json spec-v2.json --threshold moderate-drift
motionlang diff spec-v1.json spec-v2.json --out ./diffs
```

Compares two `*-motion-spec.json` files at the animation level — not just fingerprints.
Reports additions, removals, parameter changes, component changes, and token changes.
Exits with code 1 if `--threshold` is set and drift exceeds it (for GitHub Actions).

**Verdict levels:** `identical` / `minor-drift` / `moderate-drift` / `major-drift`

### `merge` — Merge motion tokens

```bash
motionlang merge spec-home.json spec-pricing.json --out ./tokens.json
motionlang merge spec-a.json spec-b.json spec-c.json
```

Merges motion tokens from multiple spec files into a single DTCG-compatible `tokens.json`.
Deduplicates by canonical name. For conflicts, keeps the most common value across specs.

### `annotate` — Annotate a spec

```bash
motionlang annotate spec.json --id hero-slide-001 --note "approved by client 2026-04-23"
motionlang annotate spec.json --id fade-in-004 --note "needs review" --author "Jane"
```

Adds structured notes to specific animations in a spec file. Annotations survive
re-extractions — they are merged by animation ID, not overwritten.

### `tag` — Tag a spec version

```bash
motionlang tag spec.json v1.2 --note "Post-rebrand motion system"
motionlang tag spec.json v2.0
```

Tags a spec file with a version string and timestamp. Stored in `spec.meta.tags[]`.

### `versions` — List version history

```bash
motionlang versions --dir ./output
motionlang versions --spec ./output/linear-app-motion-spec.json
```

Lists all version tags across all tagged specs in a directory, or for a single spec.

### `mcp` — Start MCP server

```bash
motionlang mcp --dir ./motion-spec-output
```

Starts an MCP stdio server so AI agents (Claude, Cursor, Copilot) can consume motion
specs as structured resources. See [MCP Integration](#mcp-integration).

---

## Output Files

Every crawl writes up to 7 standard files plus optional Phase 2 files.

### Standard outputs (always written)

| File | Description |
|---|---|
| `*-motion-spec.json` | Full structured spec — all animations, tokens, fingerprint, components |
| `*-motion-spec.md` | Designer/developer handoff markdown document |
| `*-motion-gsap.js` | Ready-to-paste GSAP ScrollTrigger code |
| `*-motion-framer.js` | Framer Motion variants + `useMotionVariants` hook |
| `*-motion.css` | Pure CSS with custom properties + IntersectionObserver setup |
| `*-motion-figma.json` | Figma Variables-compatible token package |
| `*-motion-mcp.json` | MCP resource for AI agent consumption |

### Optional Phase 2 outputs

| Flag | File | Description |
|---|---|---|
| `--explain` | `*-motion-explain.md` | Human-readable explanation: why this site feels the way it does |
| `--fix` | `*-motion-fix.md` | Prescriptive fix suggestions sorted by severity |
| `--preview` | `*-motion-preview.html` | Self-contained HTML animation preview, no server required |
| `--figma-component` | `*-motion-figma-component.js` | Figma Console script — creates animated component frame |
| `--figma-component` | `*-motion-figma-annotations.json` | Annotation card data for each animation |
| `--figma-component` | `*-motion-figma-annotations.js` | Figma Console script — creates annotation overlays |
| `--figma-component` | `*-motion-figma-devmode.js` | Figma Console script — attaches Dev Mode code snippets |
| `--crawl-site` | `*-site-consistency-report.md` | Cross-page consistency report with drift verdict |
| `--crawl-site` | `*-site-consistency-report.json` | Machine-readable consistency data for CI |

---

## Motion Fingerprint

Every crawl prints a fingerprint to the terminal:

```
Feel:       smooth          # springy / smooth / snappy / mechanical / mixed
Pattern:    stagger         # dominant animation pattern across 15 canonical types
Library:    gsap            # detected animation library
Animations: 14              # total animations detected
Reduced:    supported       # prefers-reduced-motion support
Health:     Grade A (100)   # motion health score (0-100)
```

---

## Health Score

The health score audits the motion spec against best practices:

| Finding Code | Condition | Deduction |
|---|---|---|
| `NO_REDUCED_MOTION` | No `prefers-reduced-motion` support detected | -20 pts |
| `DURATION_INCONSISTENCY` | More than 5 unique duration values | -10 pts |
| `EASING_INCONSISTENCY` | More than 4 unique easing values | -10 pts |
| `LONG_DURATIONS` | Any animation exceeds 1000ms | -5 pts |
| `UNNAMED_EASINGS` | Unrecognised `cubic-bezier` values | -5 pts |

**Grades:** A (90-100) / B (75-89) / C (60-74) / D (40-59) / F (0-39)

---

## Figma Integration

### Phase 1 — Motion Variables (complete)

The standard `*-motion-figma.json` output is Figma Variables-compatible. Import it
via the Figma Variables API or a plugin to get `duration/md`, `easing/expressive-decelerate`
etc. as Figma Variables in your file.

### Phase 2 — Component Export

When you run `--component <id> --figma-component`, motionlang generates three Figma
Console scripts. Open the Figma Console (Plugins > Development > Open Console) and
paste each script:

**1. Component frame script** (`*-motion-figma-component.js`)
Creates a named Frame with Auto Layout, colour-coded child layers per animation pattern,
and Smart Animate transitions configured with extracted duration and easing. The frame
is immediately converted to a Figma Component.

**2. Annotation overlay script** (`*-motion-figma-annotations.js`)
Creates sticky-note style annotation cards beside the component frame — one card per
animation with trigger, duration, easing, stagger interval, and reduced-motion status.

**3. Dev Mode snippets script** (`*-motion-figma-devmode.js`)
Attaches GSAP, Framer Motion, and CSS code snippets to each layer via Figma's
`setSharedPluginData` API. Developers click any layer in Dev Mode and see paste-ready
implementation code.

Note: The Figma write API requires running scripts in the Figma Plugin Console (desktop).
Each script is a self-contained IIFE — paste and press Enter.

```bash
# Generate all three scripts for the hero component
motionlang https://madewithgsap.com --component hero --deep --figma-component
```

---

## MCP Integration

motionlang includes an MCP (Model Context Protocol) stdio server. This lets AI coding
agents — Claude, Cursor, GitHub Copilot — read your motion specs as structured context
when generating components.

```bash
# Start the server
motionlang mcp --dir ./motion-spec-output
```

**Available MCP resources:**

| Resource | Description |
|---|---|
| `get_motion_spec` | Full motion spec for a URL |
| `get_motion_tokens` | Just the token values (durations, easings) |
| `get_motion_fingerprint` | Feel, pattern, library, health score |
| `get_motion_explanation` | Why the site feels the way it does (requires `--explain`) |

**Claude Desktop config** (`~/.claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "motionlang": {
      "command": "node",
      "args": ["/path/to/motionlang/bin/motionlang.js", "mcp", "--dir", "./output"]
    }
  }
}
```

Once connected, Claude can read your motion spec and generate components that match
your product's exact timing, easing, and animation patterns.

---

## Examples

### 1. Document the motion system of a reference site

```bash
motionlang https://linear.app --deep --out ./linear-motion
```

Produces 7 files covering every animation detected. Share `*-motion-spec.md` with
the team as a handoff document.

### 2. Extract a specific component with its motion

```bash
# Step 1 — see what components exist
motionlang https://madewithgsap.com --components

# Step 2 — extract the one you want
motionlang https://madewithgsap.com --component "showcase-grid" --deep
```

All 7 output files are scoped to that component. GSAP code is a component snippet,
not a full-page file.

### 3. Explain why a site feels premium

```bash
motionlang https://linear.app --scroll --explain
```

Output includes:
```
Explanation
  Headline: This site feels "smooth" by design
  Key signal: Consistent easing is the dominant reason
  Why:
    82% of animations use expressive-decelerate easing
    Duration range is tight: 400-640ms (+/-120ms variance)
    Stagger intervals are consistent at 120ms
    prefers-reduced-motion is supported (WCAG 2.1 AA)
```

### 4. Audit a product for motion debt and get fixes

```bash
motionlang https://your-product.com --deep --fix
```

Produces `*-motion-fix.md` with severity-sorted suggestions:
```
[HIGH] Add prefers-reduced-motion support — CSS block included
[WARN] Consolidate 8 easings to ease-out (68%) — custom property included
[WARN] 2 animations exceed 1200ms — suggested durations listed
```

### 5. Site-wide consistency audit for CI

```bash
# Run weekly in GitHub Actions
motionlang https://stripe.com --crawl-site --pages 20 --fail-on-drift moderate-drift
```

Exits with code 1 if motion drift worsens between runs. Add to a scheduled workflow
to catch regressions before they ship.

### 6. Track changes between sprints

```bash
# Week 1
motionlang https://product.com --deep
motionlang tag output/product-com-motion-spec.json v1.0 --note "Sprint 12 baseline"

# Week 3 — run again, then diff
motionlang diff output/product-com-motion-spec-v1.json output/product-com-motion-spec.json
```

```
Verdict: minor-drift (2 changes)
  ~ hero-slide-001: duration changed 640ms to 480ms
  + state-change-009: new animation added
```

### 7. Build a cross-product motion system

```bash
motionlang https://product-a.com --deep --standardise
motionlang https://product-b.com --deep --standardise
motionlang merge output/product-a-motion-spec.json output/product-b-motion-spec.json \
  --out ./design-system/motion-tokens.json
```

Produces one DTCG-aligned `tokens.json` covering both products.

### 8. Prototype motion in Figma from a live site

```bash
motionlang https://madewithgsap.com --components
motionlang https://madewithgsap.com --component 2 --deep --figma-component
# Open Figma Console
# Paste *-motion-figma-component.js    -> animated component frame appears
# Paste *-motion-figma-annotations.js  -> annotation cards appear
# Paste *-motion-figma-devmode.js      -> Dev Mode code snippets attached
```

### 9. Preview extracted animations without writing code

```bash
motionlang https://site.com --scroll --preview
open output/site-com-motion-preview.html
```

Self-contained HTML file. Replay button, timeline scrubber, reduced-motion toggle.
Best way to show a client what the extracted motion looks like before building.

### 10. Mobile viewport audit

```bash
motionlang https://site.com --deep --width 375 --out ./mobile-motion
```

Captures animations at 375px viewport. Some sites have mobile-specific motion.
Compare with desktop output using `motionlang diff`.

---

## Token Standardisation

The `--standardise` flag maps all extracted tokens to the canonical DTCG-aligned
naming convention. Outputs use `motion/duration/md` instead of site-derived names.

### Canonical Duration Scale

| Token | Range |
|---|---|
| `motion/duration/instant` | 0-80ms |
| `motion/duration/xs` | 80-200ms |
| `motion/duration/sm` | 200-400ms |
| `motion/duration/md` | 400-700ms |
| `motion/duration/lg` | 700-1100ms |
| `motion/duration/xl` | 1100ms+ |

### Canonical Easing Names

| Token | Description |
|---|---|
| `motion/easing/standard` | General-purpose easing |
| `motion/easing/decelerate` | Enter animations (elements coming in) |
| `motion/easing/accelerate` | Exit animations (elements going out) |
| `motion/easing/spring` | Spring-based natural physics |
| `motion/easing/linear` | Mechanical, scroll-scrub animations |

---

## API Reference

motionlang exports its core pipeline for programmatic use.

```js
import { extractMotionLanguage } from './src/index.js';
import { explainMotionSpec } from './src/explainer.js';
import { fixMotionSpec } from './src/fixer.js';
import { diffSpecs } from './src/diff.js';
import { normaliseMotionSpec } from './src/utils/token-normalise.js';

// Extract
const spec = await extractMotionLanguage('https://linear.app', {
  scroll: true,
  mouse: false,
  interactions: true,
  component: 'hero',
});

// Explain
const explanation = explainMotionSpec(spec);
// { headline, reasons[], keySignal, details }

// Fix
const fixes = fixMotionSpec(spec);
// [{ code, severity, message, suggestion, codeExample, affectedIds }]

// Diff
const diff = diffSpecs(specA, specB);
// { verdict, totalDelta, additions[], removals[], changes[], componentChanges[], tokenChanges[] }

// Standardise tokens
const standardised = normaliseMotionSpec(spec);
// Same shape as spec, token names mapped to canonical DTCG names
```

### `extractMotionLanguage(url, options)`

| Option | Type | Default | Description |
|---|---|---|---|
| `scroll` | Boolean | `false` | Simulate scroll |
| `mouse` | Boolean | `false` | Simulate mouse movement |
| `interactions` | Boolean | `false` | Simulate hover/focus/click |
| `section` | String | `null` | CSS selector to scope crawl |
| `component` | String | `null` | Component id/label to scope crawl |
| `width` | Number | `1280` | Viewport width in px |
| `wait` | Number | `0` | Ms to wait after page load |

Returns a `motionSpec` object.

### `motionSpec` shape

```js
{
  meta: { url, crawledAt, version, component, tags, annotations },
  fingerprint: { feel, dominantPattern, library, scrollLinked, reducedMotion },
  score: { grade, score, findings[] },
  animations: [
    {
      id, pattern, library, duration, easing, delay, trigger,
      selector, reducedMotion, componentId, confidence, raw
    }
  ],
  components: [
    { id, label, selector, elementCount, animationIds[], dominantPattern, feel }
  ],
  tokens: { durations: {}, easings: {} },
  explanation: { headline, reasons[], keySignal, details },
}
```

---

## Detected Animation Patterns

motionlang classifies every animation into one of 15 canonical patterns:

`fade` / `slide-up` / `slide-down` / `slide-left` / `slide-right` /
`scale` / `rotate` / `stagger` / `state-change` / `scroll-scrub` /
`parallax` / `spring` / `clip-reveal` / `counter` / `morph`

---

## Detected Libraries

`css` / `gsap` / `gsap-scrolltrigger` / `framer-motion` /
`intersection-observer` / `aos` / `scroll-reveal` /
`mouse-parallax` / `magnetic-cursor` / `tilt-3d` /
`cursor-follower` / `spotlight` / `cdp`

---

## Constraints & Known Limitations

| Constraint | Notes |
|---|---|
| Canvas/WebGL animations | Three.js, Spline, Pixi.js animations are on canvas elements — no DOM to read. Labelled as `canvas-only` in output. |
| Figma write API | Figma plugin scripts must be run in Figma Console (desktop). Not usable via REST API. |
| Multi-page crawl rate limiting | Some sites detect and block automated crawls. Use `--crawl-delay` and keep `--pages` low. |
| Preview mode accuracy | CSS animation reconstruction is approximate. GSAP spring physics and ScrollTrigger scrub cannot be perfectly recreated in vanilla CSS. Preview is illustrative. |
| Component segmentation accuracy | Heuristics-based. May mis-classify some components on sites with non-semantic HTML or deep CSS Grid nesting. Use `--section` as a fallback. |

---

## Tests

```bash
npm test
# 273 tests, 0 failures
```

Tests use Node.js built-in `node:test` + `assert/strict`. No external test framework.

---

## License

MIT