// Maps motion token values to Figma Variables schema structure.
// Used by motion-figma.js formatter to produce importable JSON.
// Keeps the schema logic separate from the formatting loop.

import { bucketDuration, nameEasing } from './easing-names.js';

// Duration bucket → Figma token name
const DURATION_BUCKET_NAMES = {
  instant: 'duration/instant',
  xs:      'duration/xs',
  sm:      'duration/sm',
  md:      'duration/md',
  lg:      'duration/lg',
};

// Figma numeric scopes that apply to duration variables
const DURATION_SCOPES = ['ALL_SCOPES'];

// Figma string scopes that apply to easing variables
const EASING_SCOPES = ['ALL_SCOPES'];

/**
 * Build a Figma Variable object for a duration token.
 * @param {string} rawValue  - e.g. "640ms"
 * @param {string} [bucket]  - pre-computed bucket, or auto-computed
 * @returns {{ name, type, values, description, scopes }}
 */
export function buildDurationVariable(rawValue, bucket) {
  const ms = parseFloat(rawValue);
  const resolvedBucket = bucket || bucketDuration(ms);
  const tokenName = DURATION_BUCKET_NAMES[resolvedBucket] || `duration/${resolvedBucket}`;

  return {
    name: tokenName,
    type: 'NUMBER',
    values: { Default: isNaN(ms) ? 0 : ms },
    description: `${rawValue} — ${resolvedBucket} duration token`,
    scopes: DURATION_SCOPES,
  };
}

/**
 * Build a Figma Variable object for an easing token.
 * @param {string} rawValue   - cubic-bezier string or CSS keyword
 * @param {string} [humanName] - pre-computed human name, or auto-computed
 * @returns {{ name, type, values, description, scopes }}
 */
export function buildEasingVariable(rawValue, humanName) {
  const resolvedName = humanName || nameEasing(rawValue);
  const tokenName = `easing/${resolvedName}`;

  return {
    name: tokenName,
    type: 'STRING',
    values: { Default: rawValue },
    description: `${resolvedName} — ${rawValue}`,
    scopes: EASING_SCOPES,
  };
}

/**
 * Deduplicate variables by name, keeping the first occurrence.
 * Figma Variables require unique names within a collection.
 * @param {Array} variables
 * @returns {Array}
 */
export function deduplicateVariables(variables) {
  const seen = new Set();
  return variables.filter(v => {
    if (seen.has(v.name)) return false;
    seen.add(v.name);
    return true;
  });
}

/**
 * Build the full Figma Variables collection from a motionSpec tokens object.
 * @param {{ durations: Array, easings: Array }} tokens
 * @returns {{ name, modes, variables }}
 */
export function buildFigmaCollection(tokens) {
  const variables = [];

  for (const d of tokens.durations) {
    variables.push(buildDurationVariable(d.value, d.bucket));
  }

  for (const e of tokens.easings) {
    variables.push(buildEasingVariable(e.value, e.humanName));
  }

  return {
    name: 'Motion',
    modes: ['Default'],
    variables: deduplicateVariables(variables),
  };
}

/**
 * Returns the Figma token name for a given animation's duration.
 * Used by the markdown formatter to add a Figma token column.
 * @param {Object} anim - animation object with duration + durationBucket
 * @returns {string}
 */
export function figmaDurationTokenName(anim) {
  if (!anim.duration) return '—';
  const bucket = anim.durationBucket || bucketDuration(anim.duration);
  return DURATION_BUCKET_NAMES[bucket] || `duration/${bucket}`;
}

/**
 * Returns the Figma token name for a given animation's easing.
 * @param {Object} anim - animation object with easingName
 * @returns {string}
 */
export function figmaEasingTokenName(anim) {
  if (!anim.easingName || anim.easingName === 'unknown' || anim.easingName === 'custom') return '—';
  return `easing/${anim.easingName}`;
}