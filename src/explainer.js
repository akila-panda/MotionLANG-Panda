// Motion explanation engine.
// Takes a motionSpec and returns a human-readable explanation of
// WHY the site feels the way it does. Rules-based over existing data —
// no new detection required.
// src/explainer.js

/**
 * Analyse a motionSpec and return an explanation object.
 *
 * @param {object} motionSpec — assembled motionSpec from index.js
 * @returns {{ headline: string, reasons: string[], keySignal: string, detail: object }}
 */
export function explainMotionSpec(motionSpec) {
  const { fingerprint, animations, tokens } = motionSpec;
  const reasons = [];
  const detail = {};

  // Guard: nothing to explain
  if (!animations || animations.length === 0) {
    return {
      headline: 'No animations detected — nothing to explain.',
      reasons: ['Run with --scroll --mouse --interactions for a deeper scan.'],
      keySignal: 'none',
      detail: {},
    };
  }

  const total = animations.length;

  // ── Rule 1: Easing consistency ────────────────────────────────────
  const easingNames = animations.map(a => a.easingName).filter(Boolean);
  const easingCounts = countValues(easingNames);
  const topEasing = topEntry(easingCounts);
  const topEasingPct = topEasing ? Math.round((easingCounts[topEasing] / easingNames.length) * 100) : 0;

  detail.easingConsistency = { topEasing, topEasingPct, uniqueCount: Object.keys(easingCounts).length };

  if (topEasingPct >= 80) {
    reasons.push(
      `${topEasingPct}% of animations share the same easing (${topEasing}) — consistent easing is the primary signal of an intentional motion system.`
    );
  } else if (topEasingPct >= 50) {
    reasons.push(
      `${topEasingPct}% of animations use ${topEasing} easing — dominant but not fully consistent.`
    );
  } else if (Object.keys(easingCounts).length > 5) {
    reasons.push(
      `${Object.keys(easingCounts).length} different easing curves detected — inconsistent easing contributes to a fragmented feel.`
    );
  }

  // ── Rule 2: Duration range tightness ─────────────────────────────
  const durations = animations.map(a => a.duration).filter(d => d != null && d > 0);
  if (durations.length > 1) {
    const minD = Math.min(...durations);
    const maxD = Math.max(...durations);
    const variance = maxD - minD;
    detail.durationRange = { min: minD, max: maxD, variance };

    if (variance <= 200) {
      reasons.push(
        `Duration range is tight: ${Math.round(minD)}–${Math.round(maxD)}ms (±${Math.round(variance / 2)}ms variance). Consistent timing reinforces a designed system.`
      );
    } else if (variance > 800) {
      reasons.push(
        `Duration range is wide: ${Math.round(minD)}–${Math.round(maxD)}ms (${Math.round(variance)}ms spread). Large variation in timing makes the pacing feel inconsistent.`
      );
    }
  }

  // ── Rule 3: Stagger consistency ───────────────────────────────────
  const staggerAnims = animations.filter(a => a.pattern === 'stagger' || (a.stagger && a.stagger > 0));
  if (staggerAnims.length > 0) {
    const staggerValues = staggerAnims.map(a => a.stagger).filter(Boolean);
    const uniqueStaggers = new Set(staggerValues.map(s => Math.round(s / 20) * 20)); // bucket to nearest 20ms

    detail.stagger = { count: staggerAnims.length, uniqueBuckets: uniqueStaggers.size };

    if (uniqueStaggers.size === 1 && staggerValues.length > 1) {
      const sv = [...uniqueStaggers][0];
      reasons.push(
        `Stagger intervals are consistent at ~${sv}ms across ${staggerAnims.length} sequence${staggerAnims.length > 1 ? 's' : ''}. Rhythmic reveals feel intentional.`
      );
    } else if (staggerAnims.length >= 2) {
      reasons.push(
        `${staggerAnims.length} staggered animations detected — sequential reveals contribute to the ${fingerprint.feel} feel.`
      );
    }
  }

  // ── Rule 4: Spring presence ───────────────────────────────────────
  const springAnims = animations.filter(a =>
    a.easingName && (
      a.easingName.includes('spring') ||
      a.easingName === 'spring-like' ||
      a.easingName === 'spring-overshoot' ||
      a.easingName === 'spring-bouncy'
    )
  );
  const springPct = Math.round((springAnims.length / total) * 100);
  detail.springPresence = { count: springAnims.length, pct: springPct };

  if (springPct >= 40) {
    reasons.push(
      `Spring-based easings make up ${springPct}% of animations. Natural deceleration with slight overshoot produces an organic, physical feel.`
    );
  } else if (springPct > 0) {
    reasons.push(
      `${springAnims.length} spring easing${springAnims.length > 1 ? 's' : ''} detected — adds organic character to select interactions.`
    );
  }

  // ── Rule 5: Reduced motion support ───────────────────────────────
  detail.reducedMotion = fingerprint.reducedMotionSupport;
  if (fingerprint.reducedMotionSupport) {
    reasons.push('prefers-reduced-motion is supported — the site respects user accessibility preferences (WCAG 2.1 AA).');
  } else {
    reasons.push('prefers-reduced-motion is NOT supported — animations will play for all users regardless of system settings.');
  }

  // ── Rule 6: Long durations ────────────────────────────────────────
  const longAnims = animations.filter(a => a.duration && a.duration > 1000);
  detail.longAnimations = { count: longAnims.length };
  if (longAnims.length > 0) {
    reasons.push(
      `${longAnims.length} animation${longAnims.length > 1 ? 's' : ''} exceed 1000ms — longer durations slow perceived performance and contribute to a ${longAnims.length > 3 ? 'heavy' : 'deliberate'} pacing.`
    );
  } else if (durations.length > 0 && Math.max(...durations) <= 600) {
    reasons.push(
      `All animations complete in ≤600ms — short durations keep the interface feeling responsive.`
    );
  }

  // ── Rule 7: Scroll-linked animations ─────────────────────────────
  if (fingerprint.scrollLinked) {
    const scrollAnims = animations.filter(a => a.pattern === 'scroll-linked' || a.scrollTrigger);
    detail.scrollLinked = { count: scrollAnims.length };
    reasons.push(
      `Scroll-linked animations detected (${scrollAnims.length > 0 ? scrollAnims.length + ' animation' + (scrollAnims.length > 1 ? 's' : '') : 'ScrollTrigger present'}) — content reveals are tied to scroll position, creating a guided narrative.`
    );
  }

  // ── Rule 8: Mouse-interactive effects ────────────────────────────
  if (fingerprint.mouseInteractive) {
    reasons.push(
      'Mouse-interactive effects detected (parallax, magnetic cursor, or tilt). These create depth and responsiveness that reward cursor exploration.'
    );
  }

  // ── Rule 9: No abrupt transitions ────────────────────────────────
  const abrupt = animations.filter(a => a.duration && a.duration < 100);
  detail.abruptTransitions = { count: abrupt.length };
  if (abrupt.length === 0 && animations.length > 0) {
    reasons.push(
      'No abrupt transitions detected — all animations have sufficient duration to register consciously.'
    );
  } else if (abrupt.length > 2) {
    reasons.push(
      `${abrupt.length} animations have very short durations (<100ms). Abrupt transitions can feel jarring on slower hardware.`
    );
  }

  // ── Rule 10: Library signal ───────────────────────────────────────
  if (fingerprint.dominantLibrary && fingerprint.dominantLibrary !== 'css') {
    const libLabel = {
      'gsap': 'GSAP',
      'framer-motion': 'Framer Motion',
      'aos': 'AOS',
      'scroll-reveal': 'ScrollReveal',
    }[fingerprint.dominantLibrary] || fingerprint.dominantLibrary;
    detail.library = fingerprint.dominantLibrary;
    reasons.push(
      `${libLabel} is the dominant animation library. ${libraryNote(fingerprint.dominantLibrary)}`
    );
  }

  // ── Determine key signal ─────────────────────────────────────────
  const keySignal = pickKeySignal(detail, fingerprint);

  // ── Build headline ───────────────────────────────────────────────
  const headline = buildHeadline(fingerprint.feel, keySignal, detail);

  return {
    headline,
    reasons,
    keySignal,
    detail,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function countValues(arr) {
  const counts = {};
  for (const v of arr) counts[v] = (counts[v] || 0) + 1;
  return counts;
}

function topEntry(counts) {
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

function pickKeySignal(detail, fingerprint) {
  if (detail.easingConsistency?.topEasingPct >= 80) return 'consistent easing';
  if (detail.springPresence?.pct >= 40) return 'spring physics';
  if (detail.durationRange?.variance <= 200 && detail.durationRange?.variance != null) return 'tight duration range';
  if (fingerprint.scrollLinked) return 'scroll-linked animation';
  if (fingerprint.mouseInteractive) return 'mouse-interactive effects';
  if (detail.stagger?.count >= 2) return 'stagger rhythm';
  if (detail.easingConsistency?.uniqueCount > 5) return 'easing inconsistency';
  if (detail.longAnimations?.count > 3) return 'long durations';
  return 'animation presence';
}

function buildHeadline(feel, keySignal, detail) {
  const feelLabel = feel || 'mixed';

  if (keySignal === 'consistent easing') {
    return `This interface feels "${feelLabel}" — consistent easing is the dominant signal.`;
  }
  if (keySignal === 'spring physics') {
    return `This interface feels "${feelLabel}" — spring physics give it an organic, physical quality.`;
  }
  if (keySignal === 'tight duration range') {
    return `This interface feels "${feelLabel}" — a tight duration range creates rhythmic consistency.`;
  }
  if (keySignal === 'scroll-linked animation') {
    return `This interface feels "${feelLabel}" — scroll-linked animation creates a guided narrative.`;
  }
  if (keySignal === 'mouse-interactive effects') {
    return `This interface feels "${feelLabel}" — mouse-responsive effects add depth and engagement.`;
  }
  if (keySignal === 'stagger rhythm') {
    return `This interface feels "${feelLabel}" — rhythmic stagger sequences drive the motion character.`;
  }
  if (keySignal === 'easing inconsistency') {
    const n = detail.easingConsistency?.uniqueCount || '?';
    return `This interface feels "${feelLabel}" — ${n} different easing curves create a fragmented motion system.`;
  }
  if (keySignal === 'long durations') {
    return `This interface feels "${feelLabel}" — long animation durations create a deliberate, weighty pacing.`;
  }
  return `This interface feels "${feelLabel}".`;
}

function libraryNote(lib) {
  const notes = {
    'gsap': 'GSAP provides precise timeline control and ScrollTrigger integration.',
    'framer-motion': 'Framer Motion enables declarative spring-based animation with React.',
    'aos': 'AOS (Animate On Scroll) drives scroll-reveal effects with data attributes.',
    'scroll-reveal': 'ScrollReveal handles entrance animations on scroll with minimal setup.',
  };
  return notes[lib] || '';
}

/**
 * Format an explanation object as a terminal-ready string block.
 *
 * @param {object} explanation — from explainMotionSpec()
 * @param {string} url — site URL for the header
 * @returns {string}
 */
export function formatExplanationTerminal(explanation, url) {
  const lines = [];
  lines.push('');
  lines.push('  Motion Explanation' + (url ? ` — ${url}` : ''));
  lines.push('');
  lines.push('  ' + explanation.headline);
  lines.push('');
  lines.push('  Why:');
  for (const reason of explanation.reasons) {
    lines.push('  → ' + reason);
  }
  lines.push('');
  lines.push('  Key signal: ' + explanation.keySignal);
  lines.push('');
  return lines.join('\n');
}

/**
 * Format an explanation object as a markdown section string.
 * Inserted into the markdown spec before the animation inventory.
 *
 * @param {object} explanation
 * @returns {string}
 */
export function formatExplanationMarkdown(explanation) {
  const lines = [];
  lines.push('## Motion Explanation');
  lines.push('');
  lines.push('> ' + explanation.headline);
  lines.push('');
  lines.push('**Why this site feels this way:**');
  lines.push('');
  for (const reason of explanation.reasons) {
    lines.push('- ' + reason);
  }
  lines.push('');
  lines.push(`**Key signal:** ${explanation.keySignal}`);
  lines.push('');
  return lines.join('\n');
}