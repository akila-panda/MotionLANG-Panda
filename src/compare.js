// Compares two motionSpec objects and returns a structured diff.
// Used by the --compare flag to show what changed between two URLs.

export function compareMotionSpecs(specA, specB) {
  const diff = {
    urlA: specA.meta.url,
    urlB: specB.meta.url,
    timestamp: new Date().toISOString(),
    fingerprint: diffFingerprint(specA.fingerprint, specB.fingerprint),
    tokens: diffTokens(specA.tokens, specB.tokens),
    animations: diffAnimations(specA.animations, specB.animations),
    summary: null,
  };

  const changes =
    diff.fingerprint.changes.length +
    diff.tokens.added.length +
    diff.tokens.removed.length +
    diff.tokens.changed.length +
    diff.animations.added.length +
    diff.animations.removed.length;

  diff.summary = {
    totalChanges: changes,
    verdict: changes === 0
      ? 'identical'
      : changes <= 3
        ? 'minor-drift'
        : changes <= 8
          ? 'moderate-drift'
          : 'major-drift',
  };

  return diff;
}

function diffFingerprint(a, b) {
  const changes = [];
  for (const key of ['feel', 'dominantPattern', 'dominantLibrary', 'reducedMotionSupport']) {
    if (a[key] !== b[key]) {
      changes.push({ property: key, from: a[key], to: b[key] });
    }
  }
  if (a.animationCount !== b.animationCount) {
    changes.push({
      property: 'animationCount',
      from: a.animationCount,
      to: b.animationCount,
      delta: b.animationCount - a.animationCount,
    });
  }
  return { changes };
}

function diffTokens(tokA, tokB) {
  const added = [], removed = [], changed = [];

  const durA = new Map(tokA.durations.map(d => [d.name, d.value]));
  const durB = new Map(tokB.durations.map(d => [d.name, d.value]));
  for (const [k, v] of durB) {
    if (!durA.has(k)) added.push({ type: 'duration', name: k, value: v });
    else if (durA.get(k) !== v) changed.push({ type: 'duration', name: k, from: durA.get(k), to: v });
  }
  for (const [k] of durA) {
    if (!durB.has(k)) removed.push({ type: 'duration', name: k });
  }

  const easA = new Map(tokA.easings.map(e => [e.name, e.value]));
  const easB = new Map(tokB.easings.map(e => [e.name, e.value]));
  for (const [k, v] of easB) {
    if (!easA.has(k)) added.push({ type: 'easing', name: k, value: v });
    else if (easA.get(k) !== v) changed.push({ type: 'easing', name: k, from: easA.get(k), to: v });
  }
  for (const [k] of easA) {
    if (!easB.has(k)) removed.push({ type: 'easing', name: k });
  }

  return { added, removed, changed };
}

function diffAnimations(animsA, animsB) {
  const patternsA = animsA.map(a => a.pattern);
  const patternsB = animsB.map(a => a.pattern);

  const countA = countBy(patternsA);
  const countB = countBy(patternsB);

  const allPatterns = new Set([...Object.keys(countA), ...Object.keys(countB)]);
  const added = [], removed = [];

  for (const p of allPatterns) {
    const cA = countA[p] || 0;
    const cB = countB[p] || 0;
    if (cB > cA) added.push({ pattern: p, count: cB - cA });
    if (cA > cB) removed.push({ pattern: p, count: cA - cB });
  }

  return { added, removed };
}

function countBy(arr) {
  return arr.reduce((acc, v) => { acc[v] = (acc[v] || 0) + 1; return acc; }, {});
}