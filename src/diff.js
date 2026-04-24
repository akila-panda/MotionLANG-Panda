// Deep spec diff for two *-motion-spec.json files.
// Goes beyond fingerprint comparison — diffs individual animation parameters,
// token values, component presence, and produces a CI-ready verdict.
// Used by: motionlang diff spec-v1.json spec-v2.json

import { readFileSync } from 'fs';

// Drift threshold ordering (worst to best)
const DRIFT_ORDER = ['major-drift', 'moderate-drift', 'minor-drift', 'identical'];

/**
 * Returns true if verdictA is worse than (exceeds) verdictB.
 * @param {string} verdictA
 * @param {string} verdictB
 * @returns {boolean}
 */
export function isDriftExceeded(verdict, threshold) {
  return DRIFT_ORDER.indexOf(verdict) < DRIFT_ORDER.indexOf(threshold);
}

/**
 * Loads and parses a motion spec JSON file.
 * @param {string} path
 * @returns {object}
 */
export function loadSpec(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`Cannot load spec at "${path}": ${e.message}`);
  }
}

/**
 * Deep diff two motionSpec objects.
 * Returns a structured diff object with verdict, changes, additions, removals,
 * componentChanges, tokenChanges.
 *
 * @param {object} specA  Older / baseline spec
 * @param {object} specB  Newer / current spec
 * @returns {object}
 */
export function diffSpecs(specA, specB) {
  const changes         = diffAnimationParams(specA.animations || [], specB.animations || []);
  const additions       = findAddedAnimations(specA.animations || [], specB.animations || []);
  const removals        = findRemovedAnimations(specA.animations || [], specB.animations || []);
  const componentChanges = diffComponents(specA.components || [], specB.components || []);
  const tokenChanges    = diffTokensDeep(specA.tokens || {}, specB.tokens || {});
  const fingerprintChanges = diffFingerprint(specA.fingerprint || {}, specB.fingerprint || {});

  const totalDelta =
    changes.length +
    additions.length +
    removals.length +
    componentChanges.length +
    tokenChanges.changed.length +
    tokenChanges.added.length +
    tokenChanges.removed.length +
    fingerprintChanges.length;

  const verdict =
    totalDelta === 0 ? 'identical' :
    totalDelta <= 3  ? 'minor-drift' :
    totalDelta <= 8  ? 'moderate-drift' :
                       'major-drift';

  return {
    meta: {
      specA: specA.meta?.url ?? 'unknown',
      specB: specB.meta?.url ?? 'unknown',
      diffedAt: new Date().toISOString(),
    },
    verdict,
    totalDelta,
    fingerprintChanges,
    changes,
    additions,
    removals,
    componentChanges,
    tokenChanges,
  };
}

// ── Fingerprint diff ─────────────────────────────────────────────────────────

function diffFingerprint(a, b) {
  const changes = [];
  for (const key of ['feel', 'dominantPattern', 'dominantLibrary', 'reducedMotionSupport']) {
    if ((a[key] ?? null) !== (b[key] ?? null)) {
      changes.push({ property: key, from: a[key] ?? null, to: b[key] ?? null });
    }
  }
  if ((a.animationCount ?? 0) !== (b.animationCount ?? 0)) {
    changes.push({
      property: 'animationCount',
      from: a.animationCount ?? 0,
      to: b.animationCount ?? 0,
      delta: (b.animationCount ?? 0) - (a.animationCount ?? 0),
    });
  }
  return changes;
}

// ── Animation parameter diff ─────────────────────────────────────────────────

/**
 * Diffs animations that exist in BOTH specs by matching on id.
 * Returns parameter-level changes for matched animations.
 */
function diffAnimationParams(animsA, animsB) {
  const mapA = new Map(animsA.map(a => [a.id, a]));
  const mapB = new Map(animsB.map(a => [a.id, a]));
  const changes = [];

  for (const [id, animB] of mapB) {
    const animA = mapA.get(id);
    if (!animA) continue; // new — captured in additions

    const paramChanges = [];
    for (const key of ['duration', 'delay', 'easing', 'pattern', 'componentId']) {
      const vA = animA[key] ?? null;
      const vB = animB[key] ?? null;
      if (JSON.stringify(vA) !== JSON.stringify(vB)) {
        paramChanges.push({ param: key, from: vA, to: vB });
      }
    }
    if (paramChanges.length > 0) {
      changes.push({ id, element: animB.element ?? animA.element, paramChanges });
    }
  }

  return changes;
}

function findAddedAnimations(animsA, animsB) {
  const idsA = new Set(animsA.map(a => a.id));
  return animsB
    .filter(a => !idsA.has(a.id))
    .map(a => ({ id: a.id, pattern: a.pattern, element: a.element, componentId: a.componentId ?? null }));
}

function findRemovedAnimations(animsA, animsB) {
  const idsB = new Set(animsB.map(a => a.id));
  return animsA
    .filter(a => !idsB.has(a.id))
    .map(a => ({ id: a.id, pattern: a.pattern, element: a.element, componentId: a.componentId ?? null }));
}

// ── Component diff ───────────────────────────────────────────────────────────

function diffComponents(compsA, compsB) {
  const mapA = new Map(compsA.map(c => [c.id, c]));
  const mapB = new Map(compsB.map(c => [c.id, c]));
  const changes = [];

  for (const [id, compB] of mapB) {
    const compA = mapA.get(id);
    if (!compA) {
      changes.push({ id, label: compB.label, change: 'added' });
      continue;
    }
    const animCountA = compA.animationIds?.length ?? 0;
    const animCountB = compB.animationIds?.length ?? 0;
    if (animCountA !== animCountB) {
      changes.push({
        id,
        label: compB.label,
        change: 'animation-count-changed',
        from: animCountA,
        to: animCountB,
        delta: animCountB - animCountA,
      });
    }
    if ((compA.dominantPattern ?? null) !== (compB.dominantPattern ?? null)) {
      changes.push({
        id,
        label: compB.label,
        change: 'dominant-pattern-changed',
        from: compA.dominantPattern ?? null,
        to: compB.dominantPattern ?? null,
      });
    }
  }

  for (const [id, compA] of mapA) {
    if (!mapB.has(id)) {
      changes.push({ id, label: compA.label, change: 'removed' });
    }
  }

  return changes;
}

// ── Token deep diff ──────────────────────────────────────────────────────────

function diffTokensDeep(tokA, tokB) {
  const added = [], removed = [], changed = [];

  const durA = new Map((tokA.durations || []).map(d => [d.name, d.value]));
  const durB = new Map((tokB.durations || []).map(d => [d.name, d.value]));
  for (const [k, v] of durB) {
    if (!durA.has(k)) added.push({ type: 'duration', name: k, value: v });
    else if (durA.get(k) !== v) changed.push({ type: 'duration', name: k, from: durA.get(k), to: v });
  }
  for (const [k] of durA) {
    if (!durB.has(k)) removed.push({ type: 'duration', name: k });
  }

  const easA = new Map((tokA.easings || []).map(e => [e.name, e.value]));
  const easB = new Map((tokB.easings || []).map(e => [e.name, e.value]));
  for (const [k, v] of easB) {
    if (!easA.has(k)) added.push({ type: 'easing', name: k, value: v });
    else if (easA.get(k) !== v) changed.push({ type: 'easing', name: k, from: easA.get(k), to: v });
  }
  for (const [k] of easA) {
    if (!easB.has(k)) removed.push({ type: 'easing', name: k });
  }

  return { added, removed, changed };
}

// ── Markdown report formatter ─────────────────────────────────────────────────

/**
 * Formats a diff result as a human-readable markdown report.
 * @param {object} diff  Result of diffSpecs()
 * @returns {string}
 */
export function formatDiffMarkdown(diff) {
  const lines = [];
  const ts = new Date(diff.meta.diffedAt).toISOString();

  lines.push('# Motion Spec Diff Report');
  lines.push('');
  lines.push(`| | |`);
  lines.push(`|---|---|`);
  lines.push(`| **Spec A** | ${diff.meta.specA} |`);
  lines.push(`| **Spec B** | ${diff.meta.specB} |`);
  lines.push(`| **Verdict** | ${verdictEmoji(diff.verdict)} ${diff.verdict} |`);
  lines.push(`| **Total changes** | ${diff.totalDelta} |`);
  lines.push(`| **Generated** | ${ts} |`);
  lines.push('');

  // Fingerprint
  if (diff.fingerprintChanges.length > 0) {
    lines.push('## Fingerprint Changes');
    lines.push('');
    for (const c of diff.fingerprintChanges) {
      lines.push(`- **${c.property}**: \`${c.from}\` → \`${c.to}\``);
    }
    lines.push('');
  }

  // Animation additions
  if (diff.additions.length > 0) {
    lines.push('## Animations Added');
    lines.push('');
    for (const a of diff.additions) {
      const comp = a.componentId ? ` (${a.componentId})` : '';
      lines.push(`- \`${a.id}\` — ${a.pattern}${comp}`);
    }
    lines.push('');
  }

  // Animation removals
  if (diff.removals.length > 0) {
    lines.push('## Animations Removed');
    lines.push('');
    for (const r of diff.removals) {
      const comp = r.componentId ? ` (${r.componentId})` : '';
      lines.push(`- \`${r.id}\` — ${r.pattern}${comp}`);
    }
    lines.push('');
  }

  // Parameter changes
  if (diff.changes.length > 0) {
    lines.push('## Animation Parameter Changes');
    lines.push('');
    for (const c of diff.changes) {
      lines.push(`### \`${c.id}\``);
      if (c.element) lines.push(`Element: \`${c.element}\``);
      lines.push('');
      for (const p of c.paramChanges) {
        lines.push(`- **${p.param}**: \`${p.from}\` → \`${p.to}\``);
      }
      lines.push('');
    }
  }

  // Component changes
  if (diff.componentChanges.length > 0) {
    lines.push('## Component Changes');
    lines.push('');
    for (const c of diff.componentChanges) {
      if (c.change === 'added') {
        lines.push(`- ✅ Added: **${c.label}** (\`${c.id}\`)`);
      } else if (c.change === 'removed') {
        lines.push(`- ❌ Removed: **${c.label}** (\`${c.id}\`)`);
      } else if (c.change === 'animation-count-changed') {
        const arrow = c.delta > 0 ? `+${c.delta}` : `${c.delta}`;
        lines.push(`- ~ **${c.label}**: animation count ${c.from} → ${c.to} (${arrow})`);
      } else if (c.change === 'dominant-pattern-changed') {
        lines.push(`- ~ **${c.label}**: dominant pattern \`${c.from}\` → \`${c.to}\``);
      }
    }
    lines.push('');
  }

  // Token changes
  const tc = diff.tokenChanges;
  if (tc.added.length + tc.removed.length + tc.changed.length > 0) {
    lines.push('## Token Changes');
    lines.push('');
    for (const t of tc.added)   lines.push(`- ✅ Added \`${t.name}\`: \`${t.value}\``);
    for (const t of tc.removed) lines.push(`- ❌ Removed \`${t.name}\``);
    for (const t of tc.changed) lines.push(`- ~ \`${t.name}\`: \`${t.from}\` → \`${t.to}\``);
    lines.push('');
  }

  if (diff.totalDelta === 0) {
    lines.push('> ✅ No changes detected between the two specs.');
    lines.push('');
  }

  lines.push(`---`);
  lines.push(`*motionlang diff — ${ts}*`);

  return lines.join('\n');
}

function verdictEmoji(verdict) {
  return { identical: '✅', 'minor-drift': '🟡', 'moderate-drift': '🟠', 'major-drift': '🔴' }[verdict] ?? '⚪';
}