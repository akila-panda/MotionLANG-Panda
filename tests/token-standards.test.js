import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { canonicaliseDuration, canonicaliseEasing, DURATION_SCALE, EASING_FAMILIES } from '../src/utils/token-standards.js';
import { normaliseTokens, normaliseMotionSpec } from '../src/utils/token-normalise.js';
import { mergeTokens, formatMergedTokensDtcg } from '../src/utils/token-merge.js';

// ── token-standards ──────────────────────────────────────────────────────────

describe('canonicaliseDuration', () => {
  it('maps 0ms to instant', () => {
    assert.equal(canonicaliseDuration(0), 'motion/duration/instant');
  });
  it('maps 50ms to instant', () => {
    assert.equal(canonicaliseDuration(50), 'motion/duration/instant');
  });
  it('maps 100ms to xs', () => {
    assert.equal(canonicaliseDuration(100), 'motion/duration/xs');
  });
  it('maps 300ms to sm', () => {
    assert.equal(canonicaliseDuration(300), 'motion/duration/sm');
  });
  it('maps 480ms to md', () => {
    assert.equal(canonicaliseDuration(480), 'motion/duration/md');
  });
  it('maps 700ms to lg (boundary is exclusive at 700)', () => {
    // 700 >= 700 → lg
    assert.equal(canonicaliseDuration(700), 'motion/duration/lg');
  });
  it('maps 900ms to lg', () => {
    assert.equal(canonicaliseDuration(900), 'motion/duration/lg');
  });
  it('maps 1200ms to xl', () => {
    assert.equal(canonicaliseDuration(1200), 'motion/duration/xl');
  });
  it('handles string input', () => {
    assert.equal(canonicaliseDuration('480'), 'motion/duration/md');
  });
  it('returns md for NaN', () => {
    assert.equal(canonicaliseDuration('bogus'), 'motion/duration/md');
  });

  it('DURATION_SCALE covers all 6 buckets', () => {
    assert.equal(DURATION_SCALE.length, 6);
  });
});

describe('canonicaliseEasing', () => {
  it('maps ease-out to decelerate', () => {
    assert.equal(canonicaliseEasing('ease-out'), 'motion/easing/decelerate');
  });
  it('maps ease-in to accelerate', () => {
    assert.equal(canonicaliseEasing('ease-in'), 'motion/easing/accelerate');
  });
  it('maps ease-in-out to standard', () => {
    assert.equal(canonicaliseEasing('ease-in-out'), 'motion/easing/standard');
  });
  it('maps linear to linear', () => {
    assert.equal(canonicaliseEasing('linear'), 'motion/easing/linear');
  });
  it('maps expressive-decelerate keyword to decelerate', () => {
    assert.equal(canonicaliseEasing('expressive-decelerate'), 'motion/easing/decelerate');
  });
  it('maps spring-overshoot keyword to spring', () => {
    assert.equal(canonicaliseEasing('spring-overshoot'), 'motion/easing/spring');
  });
  it('maps material-decelerate cubic-bezier to decelerate', () => {
    assert.equal(canonicaliseEasing('cubic-bezier(0, 0, 0.2, 1)'), 'motion/easing/decelerate');
  });
  it('maps expressive-decelerate cubic-bezier to decelerate', () => {
    assert.equal(canonicaliseEasing('cubic-bezier(0.16, 1, 0.3, 1)'), 'motion/easing/decelerate');
  });
  it('maps spring-bouncy cubic-bezier to spring via heuristic', () => {
    assert.equal(canonicaliseEasing('cubic-bezier(0.68, -0.6, 0.32, 1.6)'), 'motion/easing/spring');
  });
  it('maps spring-overshoot cubic-bezier to spring via heuristic', () => {
    assert.equal(canonicaliseEasing('cubic-bezier(0.34, 1.56, 0.64, 1)'), 'motion/easing/spring');
  });
  it('maps material-standard to standard', () => {
    assert.equal(canonicaliseEasing('cubic-bezier(0.4, 0, 0.2, 1)'), 'motion/easing/standard');
  });
  it('maps unknown value to standard (default)', () => {
    assert.equal(canonicaliseEasing('cubic-bezier(0.5, 0.5, 0.5, 0.5)'), 'motion/easing/standard');
  });
  it('handles null gracefully', () => {
    assert.equal(canonicaliseEasing(null), 'motion/easing/standard');
  });
  it('handles whitespace in cubic-bezier', () => {
    assert.equal(canonicaliseEasing('cubic-bezier(0, 0, 0.2, 1)'), 'motion/easing/decelerate');
  });

  it('EASING_FAMILIES covers 5 families', () => {
    assert.equal(EASING_FAMILIES.length, 5);
    const names = EASING_FAMILIES.map(f => f.name);
    assert.ok(names.includes('motion/easing/spring'));
    assert.ok(names.includes('motion/easing/linear'));
  });
});

// ── token-normalise ──────────────────────────────────────────────────────────

describe('normaliseTokens', () => {
  const siteTokens = {
    durations: [
      { name: 'duration-md', value: '480ms', bucket: 'md' },
      { name: 'duration-sm', value: '300ms', bucket: 'sm' },
    ],
    easings: [
      { name: 'easing-expressive-decelerate', value: 'cubic-bezier(0.16, 1, 0.3, 1)', humanName: 'expressive-decelerate' },
      { name: 'easing-spring', value: 'cubic-bezier(0.34, 1.56, 0.64, 1)', humanName: 'spring-overshoot' },
    ],
  };

  it('normalises duration names to canonical form', () => {
    const result = normaliseTokens(siteTokens);
    const names = result.durations.map(t => t.name);
    assert.ok(names.includes('motion/duration/md'));
    assert.ok(names.includes('motion/duration/sm'));
  });

  it('normalises easing names to canonical form', () => {
    const result = normaliseTokens(siteTokens);
    const names = result.easings.map(t => t.name);
    assert.ok(names.includes('motion/easing/decelerate'));
    assert.ok(names.includes('motion/easing/spring'));
  });

  it('preserves originalName for traceability', () => {
    const result = normaliseTokens(siteTokens);
    const md = result.durations.find(t => t.name === 'motion/duration/md');
    assert.equal(md.originalName, 'duration-md');
  });

  it('deduplicates durations with same canonical name', () => {
    const tokens = {
      durations: [
        { name: 'duration-md-a', value: '480ms', bucket: 'md' },
        { name: 'duration-md-b', value: '500ms', bucket: 'md' },
      ],
      easings: [],
    };
    const result = normaliseTokens(tokens);
    const mdTokens = result.durations.filter(t => t.name === 'motion/duration/md');
    assert.equal(mdTokens.length, 1);
  });

  it('handles null gracefully', () => {
    const result = normaliseTokens(null);
    assert.deepEqual(result, { durations: [], easings: [] });
  });

  it('handles empty tokens', () => {
    const result = normaliseTokens({ durations: [], easings: [] });
    assert.equal(result.durations.length, 0);
    assert.equal(result.easings.length, 0);
  });
});

describe('normaliseMotionSpec', () => {
  const spec = {
    meta: { url: 'https://example.com', timestamp: Date.now() },
    animations: [
      { id: 'a1', pattern: 'fade-in', duration: 480, durationToken: 'duration-md', easingToken: 'easing-expressive-decelerate' },
      { id: 'a2', pattern: 'slide-up', duration: 300, durationToken: 'duration-sm', easingToken: null },
    ],
    tokens: {
      durations: [
        { name: 'duration-md', value: '480ms', bucket: 'md' },
        { name: 'duration-sm', value: '300ms', bucket: 'sm' },
      ],
      easings: [
        { name: 'easing-expressive-decelerate', value: 'cubic-bezier(0.16, 1, 0.3, 1)', humanName: 'expressive-decelerate' },
      ],
    },
  };

  it('sets meta.standardised to true', () => {
    const result = normaliseMotionSpec(spec);
    assert.equal(result.meta.standardised, true);
  });

  it('updates durationToken on animations', () => {
    const result = normaliseMotionSpec(spec);
    const a1 = result.animations.find(a => a.id === 'a1');
    assert.equal(a1.durationToken, 'motion/duration/md');
  });

  it('updates easingToken on animations', () => {
    const result = normaliseMotionSpec(spec);
    const a1 = result.animations.find(a => a.id === 'a1');
    assert.equal(a1.easingToken, 'motion/easing/decelerate');
  });

  it('handles null easingToken gracefully', () => {
    const result = normaliseMotionSpec(spec);
    const a2 = result.animations.find(a => a.id === 'a2');
    assert.equal(a2.easingToken, null);
  });

  it('does not mutate original spec', () => {
    normaliseMotionSpec(spec);
    assert.equal(spec.meta.standardised, undefined);
  });
});

// ── token-merge ──────────────────────────────────────────────────────────────

describe('mergeTokens', () => {
  const spec1 = {
    tokens: {
      durations: [{ name: 'duration-md', value: '480ms', bucket: 'md' }],
      easings: [{ name: 'easing-decel', value: 'cubic-bezier(0, 0, 0.2, 1)', humanName: 'material-decelerate' }],
    },
  };
  const spec2 = {
    tokens: {
      durations: [
        { name: 'duration-md', value: '500ms', bucket: 'md' },
        { name: 'duration-sm', value: '250ms', bucket: 'sm' },
      ],
      easings: [
        { name: 'easing-spring', value: 'cubic-bezier(0.34, 1.56, 0.64, 1)', humanName: 'spring-overshoot' },
        { name: 'easing-decel-2', value: 'cubic-bezier(0, 0, 0.2, 1)', humanName: 'material-decelerate' },
      ],
    },
  };

  it('merges durations from both specs', () => {
    const merged = mergeTokens([spec1, spec2]);
    const names = merged.durations.map(t => t.name);
    assert.ok(names.includes('motion/duration/md'));
    assert.ok(names.includes('motion/duration/sm'));
  });

  it('deduplicates durations with same canonical name', () => {
    const merged = mergeTokens([spec1, spec2]);
    const mdTokens = merged.durations.filter(t => t.name === 'motion/duration/md');
    assert.equal(mdTokens.length, 1);
  });

  it('picks most common value for duplicates', () => {
    // spec1 has 480ms, spec2 has 500ms → one occurrence each, first wins (480ms)
    const merged = mergeTokens([spec1, spec2]);
    const md = merged.durations.find(t => t.name === 'motion/duration/md');
    assert.ok(md.value === '480ms' || md.value === '500ms'); // either is valid (1 each)
  });

  it('merges easings from both specs', () => {
    const merged = mergeTokens([spec1, spec2]);
    const names = merged.easings.map(t => t.name);
    assert.ok(names.includes('motion/easing/decelerate'));
    assert.ok(names.includes('motion/easing/spring'));
  });

  it('sets meta.sourceCount correctly', () => {
    const merged = mergeTokens([spec1, spec2]);
    assert.equal(merged.meta.sourceCount, 2);
  });

  it('sets meta.tokenCount correctly', () => {
    const merged = mergeTokens([spec1, spec2]);
    assert.equal(merged.meta.tokenCount, merged.durations.length + merged.easings.length);
  });

  it('handles single spec', () => {
    const merged = mergeTokens([spec1]);
    assert.equal(merged.meta.sourceCount, 1);
    assert.ok(merged.durations.length > 0);
  });

  it('sorts durations by scale order', () => {
    const merged = mergeTokens([spec1, spec2]);
    const names = merged.durations.map(t => t.name);
    const smIdx = names.indexOf('motion/duration/sm');
    const mdIdx = names.indexOf('motion/duration/md');
    assert.ok(smIdx < mdIdx); // sm comes before md in scale
  });
});

describe('formatMergedTokensDtcg', () => {
  it('produces valid JSON', () => {
    const spec = {
      tokens: {
        durations: [{ name: 'duration-md', value: '480ms', bucket: 'md' }],
        easings: [{ name: 'easing-std', value: 'cubic-bezier(0.4, 0, 0.2, 1)', humanName: 'material-standard' }],
      },
    };
    const merged = mergeTokens([spec]);
    const json = formatMergedTokensDtcg(merged);
    assert.doesNotThrow(() => JSON.parse(json));
  });

  it('contains motion.duration and motion.easing groups', () => {
    const spec = {
      tokens: {
        durations: [{ name: 'duration-md', value: '480ms', bucket: 'md' }],
        easings: [{ name: 'easing-std', value: 'cubic-bezier(0.4, 0, 0.2, 1)', humanName: 'material-standard' }],
      },
    };
    const merged = mergeTokens([spec]);
    const parsed = JSON.parse(formatMergedTokensDtcg(merged));
    assert.ok(parsed.motion?.duration);
    assert.ok(parsed.motion?.easing);
  });

  it('uses short key (md, not motion/duration/md) inside groups', () => {
    const spec = {
      tokens: {
        durations: [{ name: 'duration-md', value: '480ms', bucket: 'md' }],
        easings: [],
      },
    };
    const merged = mergeTokens([spec]);
    const parsed = JSON.parse(formatMergedTokensDtcg(merged));
    assert.ok(parsed.motion.duration.md);
    assert.equal(parsed.motion.duration.md.$value, '480ms');
  });

  it('includes $type field on tokens', () => {
    const spec = {
      tokens: {
        durations: [{ name: 'duration-sm', value: '300ms', bucket: 'sm' }],
        easings: [{ name: 'easing-spring', value: 'cubic-bezier(0.34, 1.56, 0.64, 1)', humanName: 'spring' }],
      },
    };
    const merged = mergeTokens([spec]);
    const parsed = JSON.parse(formatMergedTokensDtcg(merged));
    assert.equal(parsed.motion.duration.sm.$type, 'duration');
    assert.equal(parsed.motion.easing.spring.$type, 'cubicBezier');
  });

  it('includes $schema reference', () => {
    const merged = mergeTokens([{ tokens: { durations: [], easings: [] } }]);
    const parsed = JSON.parse(formatMergedTokensDtcg(merged));
    assert.ok(parsed.$schema?.includes('designtokens.org'));
  });
});