import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectIntersectionObserver } from '../src/detectors/intersection-observer.js';

describe('detectIntersectionObserver', () => {
  it('returns null when no IO signals', () => {
    const result = detectIntersectionObserver({ computedStyles: [] });
    assert.equal(result, null);
  });

  it('detects will-change opacity as IO-like', () => {
    const rawData = {
      computedStyles: [
        { tag: 'section', classes: 'hero', willChange: 'opacity', transition: 'none', animation: 'none' },
        { tag: 'div', classes: 'card', willChange: 'transform, opacity', transition: 'none', animation: 'none' },
      ],
    };
    const result = detectIntersectionObserver(rawData);
    assert.ok(result, 'should detect IO-like elements');
    assert.ok(result.detected);
    assert.ok(result.counts.ioLike >= 2);
  });

  it('ignores elements with will-change: auto', () => {
    const rawData = {
      computedStyles: [
        { tag: 'p', willChange: 'auto', transition: 'none', animation: 'none' },
      ],
    };
    const result = detectIntersectionObserver(rawData);
    assert.equal(result, null);
  });

  it('detects AOS elements from rawData.aosElements', () => {
    const rawData = {
      computedStyles: [],
      aosElements: [{ selector: 'div.card', animation: 'fade-up', duration: '400', delay: '100' }],
    };
    const result = detectIntersectionObserver(rawData);
    assert.ok(result.detected);
    assert.equal(result.animations[0].source, 'aos');
  });
});
