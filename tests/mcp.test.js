import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatMcp } from '../src/formatters/motion-mcp.js';

const mockSpec = {
  meta: { url: 'https://linear.app/', timestamp: '2026-04-23T10:00:00.000Z' },
  fingerprint: {
    feel: 'smooth',
    dominantLibrary: 'css',
    dominantPattern: 'state-change',
    animationCount: 11,
    reducedMotionSupport: true,
  },
  tokens: {
    durations: [{ bucket: 'sm', name: 'duration-sm', value: '400ms' }],
    easings:   [{ humanName: 'ease-out', name: 'easing-ease-out', value: 'ease-out' }],
  },
  animations: [
    { id: 'state-change-001', pattern: 'state-change', duration: 400, easing: 'ease-out', easingName: 'ease-out', source: 'css-transitions' },
  ],
};

describe('formatMcp', () => {
  it('produces valid JSON', () => {
    const output = formatMcp(mockSpec);
    assert.doesNotThrow(() => JSON.parse(output));
  });

  it('includes schema field', () => {
    const parsed = JSON.parse(formatMcp(mockSpec));
    assert.equal(parsed.schema, 'motionlang/mcp@1.0');
  });

  it('includes source URL', () => {
    const parsed = JSON.parse(formatMcp(mockSpec));
    assert.equal(parsed.source, 'https://linear.app/');
  });

  it('includes token durations and easings', () => {
    const parsed = JSON.parse(formatMcp(mockSpec));
    assert.ok(parsed.tokens.durations.sm, 'should have sm duration');
    assert.ok(parsed.tokens.easings['ease-out'], 'should have ease-out easing');
  });

  it('includes patterns array', () => {
    const parsed = JSON.parse(formatMcp(mockSpec));
    assert.ok(Array.isArray(parsed.patterns));
    assert.equal(parsed.patterns[0].pattern, 'state-change');
  });

  it('warns about missing reduced motion', () => {
    const specNoA11y = {
      ...mockSpec,
      fingerprint: { ...mockSpec.fingerprint, reducedMotionSupport: false },
    };
    const parsed = JSON.parse(formatMcp(specNoA11y));
    assert.ok(parsed.summary.includes('WARNING'));
  });
});
