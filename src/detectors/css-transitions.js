// Detects CSS transition declarations from computed styles.
// Extracts per-property transition data, easing, duration, and delay.

import { nameEasing, parseDurationMs, bucketDuration } from '../utils/easing-names.js';

const IGNORE_TRANSITIONS = new Set([
  'none',
  'all 0s ease 0s',
  'all 0s ease 0s 0s',
  'all 0s',
]);

export function detectCssTransitions(rawData) {
  const { computedStyles = [] } = rawData;

  const transitionMap = new Map(); // property → best sample
  const easingCounts = {};
  const durationCounts = {};

  for (const el of computedStyles) {
    if (!el.transition) continue;
    const raw = el.transition.trim();
    if (IGNORE_TRANSITIONS.has(raw)) continue;

    // Split compound transitions (comma-separated)
    const parts = raw.split(/,(?![^(]*\))/).map(s => s.trim());

    for (const part of parts) {
      const tokens = part.split(/\s+/);
      const property = tokens[0] || 'all';
      if (property === 'none') continue;

      // Extract duration and delay (first and second time values)
      const timeValues = part.match(/(\d+\.?\d*m?s)/g) || [];
      const durationRaw = timeValues[0] || null;
      const delayRaw    = timeValues[1] || null;
      const durationMs  = parseDurationMs(durationRaw);
      const delayMs     = parseDurationMs(delayRaw);

      // Extract easing
      const easingMatch = part.match(
        /(ease-in-out|ease-in|ease-out|ease|linear|cubic-bezier\([^)]+\)|step-start|step-end|steps\([^)]+\))/
      );
      const easing     = easingMatch ? easingMatch[1] : 'ease';
      const easingName = nameEasing(easing);

      // Track counts
      easingCounts[easingName] = (easingCounts[easingName] || 0) + 1;
      if (durationMs !== null) {
        const bucket = bucketDuration(durationMs);
        durationCounts[bucket] = (durationCounts[bucket] || 0) + 1;
      }

      // Keep the richest sample per property (longest duration wins)
      const existing = transitionMap.get(property);
      if (!existing || (durationMs !== null && durationMs > (existing.durationMs || 0))) {
        transitionMap.set(property, {
          property,
          raw: part.trim(),
          durationRaw,
          durationMs,
          durationBucket: bucketDuration(durationMs),
          delayRaw,
          delayMs,
          easing,
          easingName,
          element: {
            tag: el.tag,
            id: el.id,
            classes: el.classes,
          },
        });
      }
    }
  }

  if (transitionMap.size === 0) return null;

  // Sort by duration descending
  const transitions = [...transitionMap.values()]
    .sort((a, b) => (b.durationMs || 0) - (a.durationMs || 0));

  // Dominant easing
  const dominantEasing = Object.entries(easingCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  return {
    transitions,
    dominantEasing,
    easingCounts,
    durationCounts,
    counts: {
      uniqueProperties: transitions.length,
      totalDeclarations: computedStyles.filter(el =>
        el.transition && !IGNORE_TRANSITIONS.has(el.transition.trim())
      ).length,
    },
  };
}