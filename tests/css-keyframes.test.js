import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectCssKeyframes } from '../src/detectors/css-keyframes.js';

describe('detectCssKeyframes', () => {
  it('returns null when no keyframes present', () => {
    const result = detectCssKeyframes({ keyframes: [], computedStyles: [] });
    assert.equal(result, null);
  });

  it('returns null when keyframes array is missing', () => {
    const result = detectCssKeyframes({ computedStyles: [] });
    assert.equal(result, null);
  });

  it('detects a basic keyframe animation', () => {
    const rawData = {
      keyframes: [{
        name: 'fadeIn',
        steps: [
          { offset: '0%', style: 'opacity: 0;' },
          { offset: '100%', style: 'opacity: 1;' },
        ],
      }],
      computedStyles: [{
        tag: 'div', id: null, classes: 'hero',
        animation: 'fadeIn 0.4s ease-out forwards',
        transition: 'none', transform: 'none', opacity: '0', willChange: 'auto',
      }],
    };
    const result = detectCssKeyframes(rawData);
    assert.ok(result, 'should return a result object');
    assert.ok(result.counts.keyframeRules >= 1, 'should count keyframe rules');
    assert.equal(result.counts.usedKeyframes, 1, 'fadeIn should be marked as used');
  });

  it('marks keyframes as used when referenced in computedStyles', () => {
    const rawData = {
      keyframes: [{ name: 'slideUp', steps: [] }],
      computedStyles: [{
        tag: 'h1', id: null, classes: '',
        animation: 'slideUp 0.6s ease forwards',
        transition: 'none', transform: 'none', opacity: '1', willChange: 'auto',
      }],
    };
    const result = detectCssKeyframes(rawData);
    assert.ok(result.counts.usedKeyframes >= 1, 'should mark slideUp as used');
  });
});