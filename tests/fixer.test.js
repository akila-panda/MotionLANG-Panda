// tests/fixer.test.js
// Unit tests for src/fixer.js — fix suggestion rules engine.
// Uses node:test + assert/strict. No external test libs.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fixMotionSpec, formatFixMarkdown, formatFixTerminal } from '../src/fixer.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeSpec(overrides = {}) {
  return {
    meta: { url: 'https://example.com', title: 'Example', timestamp: Date.now() },
    animations: [],
    tokens: { durations: [], easings: [] },
    fingerprint: {
      feel: 'neutral',
      dominantPattern: null,
      dominantLibrary: 'css',
      animationCount: 0,
      reducedMotionSupport: true,
    },
    ...overrides,
  };
}

function makeFindings(codes = []) {
  const map = {
    NO_REDUCED_MOTION: {
      severity: 'error',
      code: 'NO_REDUCED_MOTION',
      message: 'prefers-reduced-motion not detected.',
      deduction: 20,
      deductionDetails: { affectedAnimationIds: [] },
    },
    EASING_INCONSISTENCY: {
      severity: 'warning',
      code: 'EASING_INCONSISTENCY',
      message: '6 unique easing values detected.',
      deduction: 10,
      deductionDetails: {
        dominantEasing: 'ease-out',
        affectedAnimationIds: ['anim-002', 'anim-003'],
        uniqueValues: ['ease-out', 'ease-in', 'linear', 'ease', 'ease-in-out', 'cubic-bezier(0.4,0,0.2,1)'],
      },
    },
    DURATION_INCONSISTENCY: {
      severity: 'warning',
      code: 'DURATION_INCONSISTENCY',
      message: '8 unique duration values detected.',
      deduction: 10,
      deductionDetails: {
        affectedAnimationIds: ['anim-001', 'anim-005'],
        uniqueValues: [100, 200, 300, 400, 500, 600, 700, 800],
      },
    },
    LONG_DURATIONS: {
      severity: 'warning',
      code: 'LONG_DURATIONS',
      message: '2 animation(s) exceed 1000ms.',
      deduction: 5,
      deductionDetails: {
        affectedAnimationIds: ['anim-007', 'anim-008'],
        affectedDurations: [
          { id: 'anim-007', duration: 1200 },
          { id: 'anim-008', duration: 1500 },
        ],
      },
    },
    UNNAMED_EASINGS: {
      severity: 'info',
      code: 'UNNAMED_EASINGS',
      message: '2 easing value(s) could not be named.',
      deduction: 5,
      deductionDetails: {
        affectedAnimationIds: ['easing-custom-01'],
        easingValues: ['cubic-bezier(0.68,-0.55,0.27,1.55)'],
      },
    },
  };
  return codes.map(c => map[c]);
}

function scoreResultWith(codes = []) {
  return { findings: makeFindings(codes) };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('fixMotionSpec', () => {

  it('returns empty fixes when no findings', () => {
    const spec = makeSpec();
    const result = fixMotionSpec(spec, scoreResultWith([]));
    assert.equal(result.fixes.length, 0);
    assert.equal(result.quickWins.length, 0);
    assert.match(result.summary, /healthy/i);
  });

  it('NO_REDUCED_MOTION produces high-severity fix with CSS block', () => {
    const spec = makeSpec({
      fingerprint: { reducedMotionSupport: false, feel: 'neutral', dominantLibrary: 'css', animationCount: 0 },
    });
    const result = fixMotionSpec(spec, scoreResultWith(['NO_REDUCED_MOTION']));
    assert.equal(result.fixes.length, 1);
    const fix = result.fixes[0];
    assert.equal(fix.code, 'NO_REDUCED_MOTION');
    assert.equal(fix.severity, 'high');
    assert.match(fix.codeExample, /prefers-reduced-motion/);
    assert.match(fix.codeExample, /animation-duration/);
  });

  it('EASING_INCONSISTENCY produces warn fix with dominant easing in code example', () => {
    const spec = makeSpec({
      animations: [
        { id: 'a1', easing: 'ease-out', duration: 400, reducedMotion: 'no-preference' },
        { id: 'a2', easing: 'ease-out', duration: 400, reducedMotion: 'no-preference' },
        { id: 'a3', easing: 'ease-in', duration: 300, reducedMotion: 'no-preference' },
        { id: 'a4', easing: 'linear', duration: 300, reducedMotion: 'no-preference' },
        { id: 'a5', easing: 'ease', duration: 200, reducedMotion: 'no-preference' },
        { id: 'a6', easing: 'ease-in-out', duration: 200, reducedMotion: 'no-preference' },
      ],
      tokens: { durations: [], easings: [] },
    });
    const result = fixMotionSpec(spec, scoreResultWith(['EASING_INCONSISTENCY']));
    assert.equal(result.fixes.length, 1);
    const fix = result.fixes[0];
    assert.equal(fix.code, 'EASING_INCONSISTENCY');
    assert.equal(fix.severity, 'warn');
    assert.match(fix.codeExample, /--easing-primary/);
    assert.match(fix.suggestion, /Consolidate/i);
  });

  it('EASING_INCONSISTENCY lists affected animation IDs', () => {
    const spec = makeSpec({
      animations: [
        { id: 'hero-in', easing: 'ease-out', duration: 400, reducedMotion: 'no-preference' },
        { id: 'hero-in', easing: 'ease-out', duration: 400, reducedMotion: 'no-preference' },
        { id: 'card-flip', easing: 'ease-in', duration: 300, reducedMotion: 'no-preference' },
        { id: 'modal-show', easing: 'linear', duration: 300, reducedMotion: 'no-preference' },
        { id: 'tooltip', easing: 'ease', duration: 200, reducedMotion: 'no-preference' },
        { id: 'sidebar', easing: 'ease-in-out', duration: 200, reducedMotion: 'no-preference' },
      ],
      tokens: { durations: [], easings: [] },
    });
    const result = fixMotionSpec(spec, scoreResultWith(['EASING_INCONSISTENCY']));
    const fix = result.fixes[0];
    // affectedIds should be non-dominant animations
    assert.ok(Array.isArray(fix.affectedIds));
    // dominant is ease-out (2 uses), so affected = 4 non-ease-out animations
    assert.ok(fix.affectedIds.length >= 1);
  });

  it('DURATION_INCONSISTENCY produces warn fix with token scale code example', () => {
    const spec = makeSpec({
      animations: [
        { id: 'a1', duration: 100, easing: 'ease', reducedMotion: 'no-preference' },
        { id: 'a2', duration: 480, easing: 'ease', reducedMotion: 'no-preference' },
        { id: 'a3', duration: 480, easing: 'ease', reducedMotion: 'no-preference' },
        { id: 'a4', duration: 480, easing: 'ease', reducedMotion: 'no-preference' },
        { id: 'a5', duration: 200, easing: 'ease', reducedMotion: 'no-preference' },
        { id: 'a6', duration: 700, easing: 'ease', reducedMotion: 'no-preference' },
        { id: 'a7', duration: 1000, easing: 'ease', reducedMotion: 'no-preference' },
        { id: 'a8', duration: 350, easing: 'ease', reducedMotion: 'no-preference' },
      ],
      tokens: { durations: [], easings: [] },
    });
    const result = fixMotionSpec(spec, scoreResultWith(['DURATION_INCONSISTENCY']));
    assert.equal(result.fixes.length, 1);
    const fix = result.fixes[0];
    assert.equal(fix.code, 'DURATION_INCONSISTENCY');
    assert.equal(fix.severity, 'warn');
    assert.match(fix.codeExample, /--duration-md/);
    assert.match(fix.codeExample, /--duration-xs/);
  });

  it('LONG_DURATIONS names specific animation IDs in suggestion', () => {
    const spec = makeSpec({
      animations: [
        { id: 'state-change-009', duration: 1200, easing: 'ease', reducedMotion: 'no-preference' },
        { id: 'fade-in-014', duration: 1500, easing: 'ease', reducedMotion: 'no-preference' },
      ],
      tokens: { durations: [], easings: [] },
    });
    const result = fixMotionSpec(spec, scoreResultWith(['LONG_DURATIONS']));
    assert.equal(result.fixes.length, 1);
    const fix = result.fixes[0];
    assert.equal(fix.code, 'LONG_DURATIONS');
    assert.equal(fix.severity, 'warn');
    assert.ok(fix.affectedIds.includes('state-change-009'));
    assert.ok(fix.affectedIds.includes('fade-in-014'));
    assert.match(fix.codeExample, /state-change-009|fade-in-014/);
  });

  it('LONG_DURATIONS suggests reduced duration', () => {
    const spec = makeSpec({
      animations: [
        { id: 'hero-slide', duration: 1800, easing: 'ease', reducedMotion: 'no-preference' },
      ],
      tokens: { durations: [], easings: [] },
    });
    const result = fixMotionSpec(spec, scoreResultWith(['LONG_DURATIONS']));
    const fix = result.fixes[0];
    assert.match(fix.codeExample, /700ms/);
  });

  it('UNNAMED_EASINGS produces info fix with custom property example', () => {
    const spec = makeSpec({
      animations: [],
      tokens: {
        durations: [],
        easings: [
          { name: 'custom-01', value: 'cubic-bezier(0.68,-0.55,0.27,1.55)', humanName: 'custom' },
        ],
      },
    });
    const result = fixMotionSpec(spec, scoreResultWith(['UNNAMED_EASINGS']));
    assert.equal(result.fixes.length, 1);
    const fix = result.fixes[0];
    assert.equal(fix.code, 'UNNAMED_EASINGS');
    assert.equal(fix.severity, 'info');
    assert.match(fix.codeExample, /--easing-custom-01/);
    assert.match(fix.codeExample, /cubic-bezier/);
  });

  it('UNNAMED_EASINGS is included in quickWins', () => {
    const spec = makeSpec({
      animations: [],
      tokens: {
        durations: [],
        easings: [{ name: 'c', value: 'cubic-bezier(0,0,1,1)', humanName: 'custom' }],
      },
    });
    const result = fixMotionSpec(spec, scoreResultWith(['UNNAMED_EASINGS']));
    assert.ok(result.quickWins.some(f => f.code === 'UNNAMED_EASINGS'));
  });

  it('fixes are sorted high → warn → info', () => {
    const spec = makeSpec({
      animations: [
        { id: 'a1', duration: 1200, easing: 'ease', reducedMotion: 'no-preference' },
      ],
      tokens: {
        durations: [],
        easings: [{ name: 'c', value: 'cubic-bezier(0,0,1,1)', humanName: 'custom' }],
      },
      fingerprint: { reducedMotionSupport: false, feel: 'neutral', dominantLibrary: 'css', animationCount: 1 },
    });
    const result = fixMotionSpec(spec, scoreResultWith(['NO_REDUCED_MOTION', 'LONG_DURATIONS', 'UNNAMED_EASINGS']));
    assert.equal(result.fixes[0].severity, 'high');
    assert.equal(result.fixes[result.fixes.length - 1].severity, 'info');
  });

  it('summary counts are correct', () => {
    const spec = makeSpec({
      animations: [
        { id: 'a1', duration: 1200, easing: 'ease', reducedMotion: 'no-preference' },
      ],
      tokens: {
        durations: [],
        easings: [{ name: 'c', value: 'cubic-bezier(0,0,1,1)', humanName: 'custom' }],
      },
      fingerprint: { reducedMotionSupport: false, feel: 'neutral', dominantLibrary: 'css', animationCount: 1 },
    });
    const result = fixMotionSpec(spec, scoreResultWith(['NO_REDUCED_MOTION', 'LONG_DURATIONS', 'UNNAMED_EASINGS']));
    assert.match(result.summary, /3 improvements/i);
    assert.match(result.summary, /1 high/i);
  });

});

describe('formatFixMarkdown', () => {

  it('returns a string with markdown structure', () => {
    const spec = makeSpec({
      fingerprint: { reducedMotionSupport: false, feel: 'neutral', dominantLibrary: 'css', animationCount: 0 },
    });
    const result = fixMotionSpec(spec, scoreResultWith(['NO_REDUCED_MOTION']));
    const md = formatFixMarkdown(result, 'https://example.com');
    assert.equal(typeof md, 'string');
    assert.match(md, /# Motion Fix Report/);
    assert.match(md, /HIGH/);
    assert.match(md, /prefers-reduced-motion/);
  });

  it('returns healthy message when no fixes', () => {
    const spec = makeSpec();
    const result = fixMotionSpec(spec, scoreResultWith([]));
    const md = formatFixMarkdown(result, 'https://example.com');
    assert.match(md, /healthy/i);
  });

  it('includes quick wins section when present', () => {
    const spec = makeSpec({
      animations: [],
      tokens: {
        durations: [],
        easings: [{ name: 'c', value: 'cubic-bezier(0,0,1,1)', humanName: 'custom' }],
      },
    });
    const result = fixMotionSpec(spec, scoreResultWith(['UNNAMED_EASINGS']));
    const md = formatFixMarkdown(result, 'https://example.com');
    assert.match(md, /Quick Wins/i);
  });

  it('includes code blocks in markdown output', () => {
    const spec = makeSpec({
      fingerprint: { reducedMotionSupport: false, feel: 'neutral', dominantLibrary: 'css', animationCount: 0 },
    });
    const result = fixMotionSpec(spec, scoreResultWith(['NO_REDUCED_MOTION']));
    const md = formatFixMarkdown(result, 'https://example.com');
    assert.match(md, /```css/);
  });

});

describe('formatFixTerminal', () => {

  it('returns a string', () => {
    const spec = makeSpec({
      fingerprint: { reducedMotionSupport: false, feel: 'neutral', dominantLibrary: 'css', animationCount: 0 },
    });
    const result = fixMotionSpec(spec, scoreResultWith(['NO_REDUCED_MOTION']));
    const out = formatFixTerminal(result, 'https://example.com');
    assert.equal(typeof out, 'string');
  });

  it('includes HIGH label for NO_REDUCED_MOTION', () => {
    const spec = makeSpec({
      fingerprint: { reducedMotionSupport: false, feel: 'neutral', dominantLibrary: 'css', animationCount: 0 },
    });
    const result = fixMotionSpec(spec, scoreResultWith(['NO_REDUCED_MOTION']));
    const out = formatFixTerminal(result, 'https://example.com');
    assert.match(out, /HIGH/);
  });

  it('includes summary line', () => {
    const spec = makeSpec();
    const result = fixMotionSpec(spec, scoreResultWith([]));
    const out = formatFixTerminal(result, 'https://example.com');
    assert.match(out, /healthy/i);
  });

});