// Fix Mode — Motion Optimizer.
// Reads scoreMotionSpec() findings and returns prescriptive suggestions
// with code examples. One fix rule per score finding code.
// src/fixer.js

/**
 * Generate fix suggestions from a motionSpec and its score findings.
 *
 * @param {object} motionSpec — assembled motionSpec from index.js
 * @param {object} scoreResult — result of scoreMotionSpec(motionSpec)
 * @returns {{ fixes: FixSuggestion[], quickWins: FixSuggestion[], summary: string }}
 *
 * @typedef {{ code: string, severity: 'high'|'warn'|'info', message: string,
 *             suggestion: string, codeExample: string, affectedIds: string[] }} FixSuggestion
 */
export function fixMotionSpec(motionSpec, scoreResult) {
  const { animations, tokens, fingerprint } = motionSpec;
  const { findings } = scoreResult;
  const fixes = [];

  for (const finding of findings) {
    const fix = buildFix(finding, animations, tokens, fingerprint);
    if (fix) fixes.push(fix);
  }

  // Sort: high → warn → info
  const order = { high: 0, warn: 1, info: 2 };
  fixes.sort((a, b) => order[a.severity] - order[b.severity]);

  // Quick wins = items fixable in < 30 minutes (info-level or single-line fixes)
  const quickWins = fixes.filter(f => f.severity === 'info' || f.isQuickWin);

  const summary = fixes.length === 0
    ? 'No fixes needed — motion system looks healthy.'
    : `${fixes.length} improvement${fixes.length === 1 ? '' : 's'} found (${fixes.filter(f => f.severity === 'high').length} high, ${fixes.filter(f => f.severity === 'warn').length} warnings, ${fixes.filter(f => f.severity === 'info').length} info).`;

  return { fixes, quickWins, summary };
}

// ── Fix rule builders ──────────────────────────────────────────────────────

function buildFix(finding, animations, tokens, fingerprint) {
  switch (finding.code) {

    case 'NO_REDUCED_MOTION': {
      return {
        code: 'NO_REDUCED_MOTION',
        severity: 'high',
        message: finding.message,
        suggestion: 'Add a global prefers-reduced-motion block to your CSS. This is required for WCAG 2.1 AA compliance and takes less than 5 minutes to add.',
        codeExample: `/* Add to your global stylesheet */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}`,
        affectedIds: [],
        isQuickWin: false,
      };
    }

    case 'EASING_INCONSISTENCY': {
      const easings = animations.map(a => a.easing).filter(Boolean);
      const easingCounts = {};
      for (const e of easings) easingCounts[e] = (easingCounts[e] || 0) + 1;
      const sorted = Object.entries(easingCounts).sort((a, b) => b[1] - a[1]);
      const dominant = sorted[0];
      const dominantEasing = dominant ? dominant[0] : 'ease-out';
      const dominantPercent = dominant
        ? Math.round((dominant[1] / easings.length) * 100)
        : 0;
      const uniqueCount = new Set(easings).size;
      const affectedIds = animations
        .filter(a => a.easing && a.easing !== dominantEasing)
        .map(a => a.id)
        .filter(Boolean);

      return {
        code: 'EASING_INCONSISTENCY',
        severity: 'warn',
        message: finding.message,
        suggestion: `Consolidate to the dominant easing "${dominantEasing}" (used by ${dominantPercent}% of animations). Replace the other ${uniqueCount - 1} easing value(s) with a single CSS custom property.`,
        codeExample: `/* Define a single primary easing token */
:root {
  --easing-primary: ${dominantEasing};
  --easing-enter:   ${dominantEasing};   /* elements coming in */
  --easing-exit:    ease-in;             /* elements going out  */
}

/* Replace hardcoded easings in your animations */
.animated-element {
  transition-timing-function: var(--easing-primary);
}`,
        affectedIds,
        isQuickWin: false,
      };
    }

    case 'DURATION_INCONSISTENCY': {
      const durations = animations.map(a => a.duration).filter(Boolean);
      const durationCounts = {};
      for (const d of durations) {
        const bucket = durationBucket(d);
        durationCounts[bucket] = (durationCounts[bucket] || 0) + 1;
      }
      const dominantBucket = Object.entries(durationCounts).sort((a, b) => b[1] - a[1])[0];
      const bucketName = dominantBucket ? dominantBucket[0] : 'md';
      const bucketMs = BUCKET_CANONICAL[bucketName] || 480;

      return {
        code: 'DURATION_INCONSISTENCY',
        severity: 'warn',
        message: finding.message,
        suggestion: `Normalise durations to a 3–5 step token scale. The dominant bucket is "${bucketName}" (~${bucketMs}ms). Consolidate outliers to the nearest bucket.`,
        codeExample: `/* Motion duration token scale */
:root {
  --duration-xs:  100ms;   /* instant feedback, micro-interactions  */
  --duration-sm:  200ms;   /* quick transitions, tooltips           */
  --duration-md:  ${bucketMs}ms;   /* standard animations (your dominant)   */
  --duration-lg:  700ms;   /* emphasis, page transitions            */
  --duration-xl:  1000ms;  /* hero sequences, complex reveals       */
}

/* Replace hardcoded durations */
.animated-element {
  transition-duration: var(--duration-md);
}`,
        affectedIds: [],
        isQuickWin: false,
      };
    }

    case 'LONG_DURATIONS': {
      const longAnims = animations.filter(a => a.duration && a.duration > 1000);
      const affectedIds = longAnims.map(a => a.id).filter(Boolean);
      const withIds = longAnims.filter(a => a.id);
      const idList = withIds.map(a => `  /* ${a.id}: currently ${a.duration}ms → suggest ${suggestShorter(a.duration)}ms */`).join('\n');

      return {
        code: 'LONG_DURATIONS',
        severity: 'warn',
        message: finding.message,
        suggestion: `Reduce the ${longAnims.length} animation(s) exceeding 1000ms to the "lg" bucket (700ms) or shorter. Long animations slow perceived performance and feel heavy.`,
        codeExample: `/* Affected animations and suggested durations: */
${idList || `  /* ${longAnims.length} animation(s) > 1000ms — reduce to 700ms or below */`}

/* General rule: */
.slow-animation {
  animation-duration: 700ms; /* down from 1000ms+ */
}`,
        affectedIds,
        isQuickWin: false,
      };
    }

    case 'UNNAMED_EASINGS': {
      const customEasings = tokens.easings.filter(e => e.humanName === 'custom');
      const exampleEasing = customEasings[0];
      const exampleValue = exampleEasing ? exampleEasing.value : 'cubic-bezier(0.4, 0, 0.2, 1)';

      return {
        code: 'UNNAMED_EASINGS',
        severity: 'info',
        message: finding.message,
        suggestion: `Name the ${customEasings.length} unrecognised easing curve(s) and add them to your token scale. This makes them intentional and reusable.`,
        codeExample: `/* Name your custom easing curves */
:root {
  --easing-custom-01: ${exampleValue};
  /* Description: [describe what this curve is used for] */
}

/* Use semantic names instead of inline cubic-bezier */
.animated-element {
  transition-timing-function: var(--easing-custom-01);
}`,
        affectedIds: customEasings.map(e => e.name).filter(Boolean),
        isQuickWin: true,
      };
    }

    default:
      return null;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

const BUCKET_CANONICAL = {
  instant: 40,
  xs:      100,
  sm:      200,
  md:      480,
  lg:      700,
  xl:      1000,
};

function durationBucket(ms) {
  if (ms <= 80)   return 'instant';
  if (ms <= 200)  return 'xs';
  if (ms <= 400)  return 'sm';
  if (ms <= 700)  return 'md';
  if (ms <= 1100) return 'lg';
  return 'xl';
}

function suggestShorter(ms) {
  if (ms > 1500) return 700;
  if (ms > 1200) return 700;
  if (ms > 1000) return 700;
  return 700;
}

// ── Markdown formatter ─────────────────────────────────────────────────────

/**
 * Format fix suggestions as a markdown string for *-motion-fix.md
 *
 * @param {object} fixResult — result of fixMotionSpec()
 * @param {string} url — source URL
 * @returns {string}
 */
export function formatFixMarkdown(fixResult, url = '') {
  const { fixes, quickWins, summary } = fixResult;
  const lines = [];

  lines.push(`# Motion Fix Report${url ? ': ' + url : ''}`);
  lines.push('');
  lines.push(`> ${summary}`);
  lines.push('');

  if (fixes.length === 0) {
    lines.push('✅ No improvements needed. Your motion system is healthy.');
    return lines.join('\n');
  }

  // Quick wins summary
  if (quickWins.length > 0) {
    lines.push('## ⚡ Quick Wins');
    lines.push('');
    lines.push('These can be fixed in under 30 minutes:');
    lines.push('');
    for (const f of quickWins) {
      lines.push(`- **${f.code}** — ${f.suggestion}`);
    }
    lines.push('');
  }

  lines.push('## Improvements');
  lines.push('');

  for (const fix of fixes) {
    const badge = fix.severity === 'high' ? '🔴 HIGH' : fix.severity === 'warn' ? '🟡 WARN' : '🔵 INFO';
    lines.push(`### ${badge} — ${fix.code}`);
    lines.push('');
    lines.push(fix.message);
    lines.push('');
    lines.push(`**Suggestion:** ${fix.suggestion}`);
    lines.push('');
    if (fix.affectedIds.length > 0) {
      lines.push(`**Affected:** ${fix.affectedIds.join(', ')}`);
      lines.push('');
    }
    lines.push('```css');
    lines.push(fix.codeExample);
    lines.push('```');
    lines.push('');
  }

  lines.push('---');
  lines.push(`*motionlang --fix — ${url} — ${new Date().toISOString()}*`);

  return lines.join('\n');
}

/**
 * Format fix suggestions for terminal output.
 *
 * @param {object} fixResult — result of fixMotionSpec()
 * @param {string} url — source URL
 * @returns {string}
 */
export function formatFixTerminal(fixResult, url = '') {
  const { fixes, summary } = fixResult;
  const lines = [];

  lines.push('');
  lines.push('  \x1b[1mFix Suggestions\x1b[0m');
  lines.push('');
  lines.push(`  ${summary}`);
  lines.push('');

  for (const fix of fixes) {
    const badge =
      fix.severity === 'high'
        ? '\x1b[31m[HIGH]\x1b[0m'
        : fix.severity === 'warn'
          ? '\x1b[33m[WARN]\x1b[0m'
          : '\x1b[34m[INFO]\x1b[0m';
    lines.push(`  ${badge} ${fix.suggestion}`);
    if (fix.affectedIds.length > 0) {
      lines.push(`  \x1b[2m  Affected: ${fix.affectedIds.slice(0, 5).join(', ')}${fix.affectedIds.length > 5 ? ` +${fix.affectedIds.length - 5} more` : ''}\x1b[0m`);
    }
  }

  lines.push('');
  return lines.join('\n');
}