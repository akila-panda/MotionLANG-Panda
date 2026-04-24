// Merges motion tokens from multiple motionSpec objects into a unified DTCG token file.
// Used by: motionlang merge spec1.json spec2.json --out ./tokens.json

import { canonicaliseDuration, canonicaliseEasing, DURATION_SCALE, EASING_FAMILIES } from './token-standards.js';

/**
 * Merges tokens from multiple motionSpec objects.
 * Deduplicates by canonical name. For conflicts, keeps the most common value
 * (highest occurrence count across all specs).
 *
 * @param {Array<object>} motionSpecs  Array of motionSpec objects
 * @returns {{ durations: Array, easings: Array, meta: object }}
 */
export function mergeTokens(motionSpecs) {
  // Track counts: canonicalName → Map<value, count>
  const durationCounts = new Map();
  const easingCounts   = new Map();

  for (const spec of motionSpecs) {
    const tokens = spec.tokens || {};

    for (const t of (tokens.durations || [])) {
      const ms = parseFloat(t.value);
      const canonical = canonicaliseDuration(ms);
      if (!durationCounts.has(canonical)) durationCounts.set(canonical, new Map());
      const valMap = durationCounts.get(canonical);
      valMap.set(t.value, (valMap.get(t.value) || 0) + 1);
    }

    for (const t of (tokens.easings || [])) {
      const canonical = canonicaliseEasing(t.value);
      if (!easingCounts.has(canonical)) easingCounts.set(canonical, new Map());
      const valMap = easingCounts.get(canonical);
      valMap.set(t.value, (valMap.get(t.value) || 0) + 1);
    }
  }

  // Pick the most common value for each canonical name
  const durations = [];
  for (const [canonical, valMap] of durationCounts) {
    const bestValue = [...valMap.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const bucket = DURATION_SCALE.find(b => b.name === canonical);
    durations.push({
      name:  canonical,
      value: bestValue,
      $type: 'duration',
      $description: bucket ? `${bucket.min}–${bucket.max === Infinity ? '∞' : bucket.max}ms range` : '',
    });
  }
  // Sort by duration scale order
  const scaleOrder = DURATION_SCALE.map(b => b.name);
  durations.sort((a, b) => scaleOrder.indexOf(a.name) - scaleOrder.indexOf(b.name));

  const easings = [];
  for (const [canonical, valMap] of easingCounts) {
    const bestValue = [...valMap.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const family = EASING_FAMILIES.find(f => f.name === canonical);
    easings.push({
      name:  canonical,
      value: bestValue,
      $type: 'cubicBezier',
      $description: family?.description ?? '',
    });
  }
  // Sort by easing family order
  const familyOrder = EASING_FAMILIES.map(f => f.name);
  easings.sort((a, b) => familyOrder.indexOf(a.name) - familyOrder.indexOf(b.name));

  return {
    durations,
    easings,
    meta: {
      sourceCount:  motionSpecs.length,
      mergedAt:     new Date().toISOString(),
      dtcgVersion:  '0.0.1',
      tokenCount:   durations.length + easings.length,
    },
  };
}

/**
 * Serialises merged tokens to the DTCG W3C token format.
 * Groups as: motion.duration.* and motion.easing.*
 *
 * @param {{ durations: Array, easings: Array, meta: object }} merged
 * @returns {string}  JSON string
 */
export function formatMergedTokensDtcg(merged) {
  const output = {
    $schema: 'https://tr.designtokens.org/format/',
    motion: {
      duration: {},
      easing: {},
    },
    $meta: merged.meta,
  };

  for (const t of merged.durations) {
    // 'motion/duration/md' → key 'md'
    const key = t.name.split('/').pop();
    output.motion.duration[key] = {
      $value: t.value,
      $type:  t.$type,
      ...(t.$description ? { $description: t.$description } : {}),
    };
  }

  for (const t of merged.easings) {
    const key = t.name.split('/').pop();
    output.motion.easing[key] = {
      $value: t.value,
      $type:  t.$type,
      ...(t.$description ? { $description: t.$description } : {}),
    };
  }

  return JSON.stringify(output, null, 2);
}