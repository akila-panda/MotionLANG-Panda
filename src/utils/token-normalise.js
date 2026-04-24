// Maps extracted motionSpec tokens to canonical DTCG-aligned names.
// Called when --standardise flag is used.

import { canonicaliseDuration, canonicaliseEasing } from './token-standards.js';

/**
 * Normalises a tokens object (from motionSpec.tokens) to use canonical DTCG names.
 * Duration tokens → motion/duration/<bucket>
 * Easing tokens   → motion/easing/<family>
 *
 * Deduplicates by canonical name: if two site tokens map to the same canonical name,
 * the most common one (first encountered, which is highest usage) wins.
 *
 * @param {{ durations: Array, easings: Array }} tokens
 * @returns {{ durations: Array, easings: Array }}
 */
export function normaliseTokens(tokens) {
  if (!tokens) return { durations: [], easings: [] };

  const normDurations = new Map();
  for (const token of (tokens.durations || [])) {
    const ms = parseFloat(token.value);
    const canonicalName = canonicaliseDuration(ms);
    if (!normDurations.has(canonicalName)) {
      normDurations.set(canonicalName, {
        name:         canonicalName,
        value:        token.value,
        bucket:       token.bucket,
        originalName: token.name,   // preserve for traceability
      });
    }
  }

  const normEasings = new Map();
  for (const token of (tokens.easings || [])) {
    const canonicalName = canonicaliseEasing(token.value);
    if (!normEasings.has(canonicalName)) {
      normEasings.set(canonicalName, {
        name:         canonicalName,
        value:        token.value,
        humanName:    token.humanName,
        originalName: token.name,
      });
    }
  }

  return {
    durations: [...normDurations.values()],
    easings:   [...normEasings.values()],
  };
}

/**
 * Returns a normalised copy of the full motionSpec.
 * All token references in animations are updated to use canonical names.
 *
 * @param {object} motionSpec
 * @returns {object} new motionSpec with normalised tokens and updated animation refs
 */
export function normaliseMotionSpec(motionSpec) {
  const normTokens = normaliseTokens(motionSpec.tokens);

  // Build lookup: original token name → canonical name
  const durationMap = new Map(
    (motionSpec.tokens?.durations || []).map(t => [
      t.name,
      normTokens.durations.find(n => n.originalName === t.name)?.name ?? t.name,
    ])
  );
  const easingMap = new Map(
    (motionSpec.tokens?.easings || []).map(t => [
      t.name,
      normTokens.easings.find(n => n.originalName === t.name)?.name ?? t.name,
    ])
  );

  // Update animations with canonical token references
  const normAnimations = (motionSpec.animations || []).map(anim => {
    const updated = { ...anim };
    if (anim.durationToken) {
      updated.durationToken = durationMap.get(anim.durationToken) ?? anim.durationToken;
    }
    if (anim.easingToken) {
      updated.easingToken = easingMap.get(anim.easingToken) ?? anim.easingToken;
    }
    return updated;
  });

  return {
    ...motionSpec,
    tokens:     normTokens,
    animations: normAnimations,
    meta: {
      ...motionSpec.meta,
      standardised: true,
    },
  };
}