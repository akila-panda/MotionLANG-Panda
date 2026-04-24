# Changelog

All notable changes to motionlang are documented here.

---

## [2.0.0] — 2026-04-26

### Summary

motionlang 2.0.0 is a full Phase 2 expansion. Phase 1 produced a motion documentation
tool. Phase 2 produces a motion + component reverse-engineering system. All Phase 1
behaviour is preserved unchanged. Phase 2 is entirely additive.

**273 tests passing. 0 failures.**

---

### New: Component Segmentation Engine (Phase 10)

Adds automatic component boundary detection. Every crawled page is segmented into
named regions using five heuristics: semantic landmarks, heading anchors, viewport-sized
blocks, class/ID name patterns, and repeated DOM patterns.

- `src/segmenter.js` — component boundary detection module
- `src/index.js` — wired segmentation into the pipeline; `componentId` on every animation
- `motionSpec.components[]` — new top-level array in the JSON output
- `--components` flag — list all detected components before extracting
- `--component <id>` flag — scope all 7 outputs to a single named component

```bash
motionlang https://madewithgsap.com --components
motionlang https://madewithgsap.com --component hero --deep
```

---

### New: Motion Explanation Engine (Phase 11)

Adds `--explain` mode. A rules engine over data already in `motionSpec` — no new
detection. Explains WHY a site feels the way it does in human language.

- `src/explainer.js` — 10-rule explanation engine
- `src/formatters/motion-markdown.js` — explanation section added to markdown output
- `src/formatters/motion-spec-json.js` — `explanation` field added to JSON when `--explain` is used
- `src/mcp/resources.js` — `get_motion_explanation` MCP resource exposed
- `--explain` flag — prints explanation after fingerprint, writes `*-motion-explain.md`

```bash
motionlang https://linear.app --scroll --explain
```

---

### New: Fix Mode — Motion Optimizer (Phase 12)

Adds `--fix` mode. Reads `score.js` findings and outputs prescriptive suggestions with
exact code examples. Turns motionlang from a reporter into an optimizer.

- `src/fixer.js` — fix rules engine (one rule per score finding code)
- `src/formatters/motion-fix.js` — `*-motion-fix.md` formatter
- `src/score.js` — extended with `deductionDetails` (affected animation IDs) per finding
- `--fix` flag — prints fix suggestions, writes `*-motion-fix.md`

Fix rules: `EASING_INCONSISTENCY`, `DURATION_INCONSISTENCY`, `NO_REDUCED_MOTION`,
`LONG_DURATIONS`, `UNNAMED_EASINGS`.

```bash
motionlang https://stripe.com --fix
```

---

### New: Multi-page / Site-wide Crawl (Phase 13)

Adds `--crawl-site` mode. Wraps the single-page pipeline in a loop over internal links.
Produces a cross-page motion consistency report with drift detection and CI exit codes.

- `src/site-crawler.js` — crawl orchestrator with depth + page limits
- `src/site-consistency.js` — cross-page consistency analyser
- `src/formatters/site-report.js` — site consistency markdown report formatter
- `--crawl-site`, `--depth <n>`, `--pages <n>`, `--crawl-delay <ms>` flags
- `--fail-on-drift <level>` flag — exits with code 1 when drift exceeds threshold (CI use)

Drift verdicts: `consistent` / `minor-drift` / `moderate-drift` / `major-drift`.

```bash
motionlang https://stripe.com --crawl-site --pages 10 --scroll
motionlang https://stripe.com --crawl-site --fail-on-drift moderate-drift
```

---

### New: Timeline View + HTML Preview (Phase 14)

Adds ASCII timeline rendering in markdown output (automatic when stagger is detected)
and a self-contained HTML animation preview file.

- `src/utils/timeline-ascii.js` — ASCII bar chart timeline generator (40-char width)
- `src/formatters/motion-markdown.js` — timeline injected after stagger pattern sections
- `src/formatters/motion-preview.js` — self-contained HTML preview generator
- `--preview` flag — writes `*-motion-preview.html`

The HTML preview uses only CSS `@keyframes` and vanilla JS — no framework required.
Features: mock element blocks, replay button, timeline scrubber, reduced-motion toggle,
component filter dropdown.

```bash
motionlang https://site.com --scroll --preview
```

---

### New: Token Standardisation (Phase 15)

Adds canonical DTCG-aligned token naming so tokens are consistent across projects and
align with the W3C Design Token Community Group format.

- `src/utils/token-standards.js` — canonical DTCG token naming convention
- `src/utils/token-normalise.js` — maps site-extracted tokens to canonical names
- `src/utils/token-merge.js` — merges tokens from multiple specs into a unified file
- `--standardise` flag — outputs use canonical names (`motion/duration/md` etc.)
- `merge` subcommand — merges multiple spec files into one `tokens.json`

Canonical duration scale: `instant / xs / sm / md / lg / xl`.
Canonical easing names: `standard / decelerate / accelerate / spring / linear`.

```bash
motionlang https://site.com --standardise
motionlang merge spec-home.json spec-pricing.json --out tokens.json
```

---

### New: Collaboration & Spec Versioning (Phase 16)

Adds deep spec diff, spec annotations, version tagging, and CI-ready exit codes.

- `src/diff.js` — animation-level diff between two `*-motion-spec.json` files
- `src/utils/annotate.js` — structured annotation system for animation objects
- `src/utils/version.js` — version tagging and history for spec files
- `diff` subcommand — deep diff with human-readable output and CI exit codes
- `annotate` subcommand — add structured notes to specific animations in a spec
- `tag` subcommand — tag a spec with a version string and timestamp
- `versions` subcommand — list all tagged versions in an output directory

```bash
motionlang diff spec-v1.json spec-v2.json --threshold moderate-drift
motionlang annotate spec.json --id hero-001 --note "approved by client"
motionlang tag spec.json v1.2 --note "Post-rebrand motion system"
motionlang versions --dir ./output
```

---

### New: Figma Component Export (Phase 17)

Adds component-level Figma export. Generates three Figma Plugin Console scripts
from a single `--component` + `--figma-component` invocation.

- `src/formatters/motion-figma-component.js` — Figma Plugin API script for component frames
- `src/formatters/motion-figma-annotations.js` — annotation overlay JSON + script
- `src/formatters/motion-figma-devmode.js` — Dev Mode code snippet plugin script
- `--figma-component` flag — generates all four Figma output files when combined with `--component <id>`

Output files:
- `*-motion-figma-component.js` — paste into Figma Console → animated component frame appears
- `*-motion-figma-annotations.json` — annotation data for each animated element
- `*-motion-figma-annotations.js` — paste into Figma Console → annotation cards appear
- `*-motion-figma-devmode.js` — paste into Figma Console → Dev Mode code snippets attached

```bash
motionlang https://madewithgsap.com --component hero --deep --figma-component
```

---

### Breaking Changes

None. All Phase 1 behaviour is unchanged. All Phase 1 tests continue to pass.

---

## [1.0.0] — 2026-01-15

Initial release. Phase 1 complete.

- CSS `@keyframes` + transition detection
- GSAP + ScrollTrigger detection
- Framer Motion detection
- CDP + IntersectionObserver + AOS + ScrollReveal detection
- CSS output + accessibility audit (`prefers-reduced-motion`)
- Figma Variables integration
- MCP server (stdio)
- Mouse / parallax / cursor detection (5 detectors)
- Motion fingerprint, compare, health score
- 7 output formats from single JSON source of truth
- 22/22 tests passing