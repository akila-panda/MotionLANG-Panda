import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectGsap } from '../src/detectors/gsap.js';

describe('detectGsap', () => {
  it('returns null when no GSAP data', () => {
    assert.equal(detectGsap({}), null);
    assert.equal(detectGsap({ gsap: null }), null);
    assert.equal(detectGsap({ gsap: { detected: false } }), null);
  });

  it('detects GSAP with tweens', () => {
    const rawData = {
      gsap: {
        detected: true,
        version: '3.12.0',
        tweens: [{
          targets: [{ tag: 'div', id: 'hero', classes: 'hero-section' }],
          duration: 0.6,
          delay: 0.1,
          vars: { ease: 'power2.out', opacity: 0, y: 40 },
        }],
        scrollTriggers: [],
      },
    };
    const result = detectGsap(rawData);
    assert.ok(result.detected, 'detected should be true');
    assert.equal(result.version, '3.12.0');
    assert.equal(result.tweens.length, 1);
    assert.equal(result.tweens[0].durationMs, 600);
    assert.equal(result.tweens[0].delayMs, 100);
  });

  it('converts duration from seconds to ms', () => {
    const rawData = {
      gsap: {
        detected: true,
        tweens: [{ duration: 1.5, delay: 0.25, vars: { ease: 'expo.out' } }],
        scrollTriggers: [],
      },
    };
    const result = detectGsap(rawData);
    assert.equal(result.tweens[0].durationMs, 1500);
    assert.equal(result.tweens[0].delayMs, 250);
  });

  it('handles empty tweens gracefully', () => {
    const rawData = { gsap: { detected: true, tweens: [], scrollTriggers: [] } };
    const result = detectGsap(rawData);
    assert.ok(result.detected);
    assert.equal(result.counts.tweens, 0);
  });
});
