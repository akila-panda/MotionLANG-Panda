import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectFramerMotion } from '../src/detectors/framer-motion.js';

describe('detectFramerMotion', () => {
  it('returns null when no Framer data', () => {
    assert.equal(detectFramerMotion({}), null);
    assert.equal(detectFramerMotion({ framer: null }), null);
    assert.equal(detectFramerMotion({ framer: { detected: false } }), null);
  });

  it('detects Framer Motion presence', () => {
    const rawData = { framer: { detected: true, method: 'data-projection-id', count: 12 } };
    const result = detectFramerMotion(rawData);
    assert.ok(result.detected, 'detected should be true');
  });

  it('handles empty variants gracefully', () => {
    const rawData = { framer: { detected: true, variants: [], springs: [] } };
    const result = detectFramerMotion(rawData);
    assert.ok(result.detected);
    assert.equal(result.counts.variants, 0);
    assert.equal(result.counts.springs, 0);
  });

  it('counts variants when present', () => {
    const rawData = {
      framer: {
        detected: true,
        method: 'window-global',
        variants: [
          { name: 'fadeIn', transition: { ease: 'easeOut', duration: 0.4 } },
          { name: 'slideUp', transition: { ease: 'easeInOut', duration: 0.6 } },
        ],
        springs: [],
      },
    };
    const result = detectFramerMotion(rawData);
    assert.ok(result.detected);
    assert.equal(result.counts.variants, 2);
  });
});
