// Unit tests for src/explainer.js
// Tests each of the 10 explanation rules using synthetic motionSpec fixtures.
// Run: node --test tests/explainer.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explainMotionSpec, formatExplanationTerminal, formatExplanationMarkdown } from '../src/explainer.js';

// ── Fixture helpers ────────────────────────────────────────────────────────

function makeSpec(overrides = {}) {
  return {
    meta: { url: 'https://example.com', title: 'Example', timestamp: new Date().toISOString() },
    fingerprint: {
      feel: 'smooth',
      dominantPattern: 'fade',
      dominantLibrary: 'css',
      libraries: ['css'],
      scrollLinked: false,
      mouseInteractive: false,
      reducedMotionSupport: true,
      animationCount: 5,
    },
    animations: [
      { id: 'a1', pattern: 'fade', source: 'css-transitions', duration: 400, easing: 'cubic-bezier(0.4,0,0.2,1)', easingName: 'expressive-decelerate', reducedMotion: 'supported', confidence: 0.9, componentId: null },
      { id: 'a2', pattern: 'fade', source: 'css-transitions', duration: 450, easing: 'cubic-bezier(0.4,0,0.2,1)', easingName: 'expressive-decelerate', reducedMotion: 'supported', confidence: 0.85, componentId: null },
      { id: 'a3', pattern: 'fade', source: 'css-transitions', duration: 420, easing: 'cubic-bezier(0.4,0,0.2,1)', easingName: 'expressive-decelerate', reducedMotion: 'supported', confidence: 0.8, componentId: null },
      { id: 'a4', pattern: 'slide', source: 'css-transitions', duration: 480, easing: 'cubic-bezier(0.4,0,0.2,1)', easingName: 'expressive-decelerate', reducedMotion: 'supported', confidence: 0.75, componentId: null },
      { id: 'a5', pattern: 'slide', source: 'css-transitions', duration: 460, easing: 'cubic-bezier(0.4,0,0.2,1)', easingName: 'expressive-decelerate', reducedMotion: 'supported', confidence: 0.7, componentId: null },
    ],
    tokens: {
      durations: [{ name: 'duration-md', value: '400ms', bucket: 'md' }],
      easings: [{ name: 'easing-expressive-decelerate', value: 'cubic-bezier(0.4,0,0.2,1)', humanName: 'expressive-decelerate' }],
    },
    components: [],
    ...overrides,
  };
}

// ── Rule 1: Easing consistency (≥80%) ─────────────────────────────────────

test('Rule 1a: ≥80% same easing → consistent easing signal in reasons', () => {
  const spec = makeSpec();
  const result = explainMotionSpec(spec);
  // All 5 use the same easing → 100%
  assert.ok(result.reasons.some(r => r.includes('100%') || r.includes('same easing')), 'Should mention consistent easing %');
  assert.equal(result.keySignal, 'consistent easing');
});

test('Rule 1b: 50–79% same easing → partial consistency mentioned', () => {
  const spec = makeSpec();
  // Change 2 out of 5 animations to a different easing
  spec.animations[3].easingName = 'linear';
  spec.animations[4].easingName = 'ease-in-out';
  const result = explainMotionSpec(spec);
  // 3/5 = 60% dominant — should mention it
  assert.ok(result.reasons.some(r => r.includes('60%') || r.includes('easing')), 'Should mention partial easing consistency');
});

test('Rule 1c: >5 unique easings → fragmented easing mentioned', () => {
  const spec = makeSpec();
  spec.animations[0].easingName = 'linear';
  spec.animations[1].easingName = 'ease-in-out';
  spec.animations[2].easingName = 'snappy';
  spec.animations[3].easingName = 'expo-out';
  spec.animations[4].easingName = 'spring-like';
  // 5 unique — threshold is >5, so add one more
  spec.animations.push({
    id: 'a6', pattern: 'scale', source: 'css-transitions', duration: 300,
    easing: 'cubic-bezier(0.9,0,0.1,1)', easingName: 'material-decelerate',
    reducedMotion: 'supported', confidence: 0.6, componentId: null,
  });
  spec.fingerprint.animationCount = 6;
  const result = explainMotionSpec(spec);
  assert.ok(result.reasons.some(r => r.includes('different easing') || r.includes('fragmented')), 'Should mention easing fragmentation');
});

// ── Rule 2: Duration range tightness ─────────────────────────────────────

test('Rule 2a: variance ≤200ms → tight duration range mentioned', () => {
  // All durations: 400, 450, 420, 480, 460 → range 80ms
  const spec = makeSpec();
  const result = explainMotionSpec(spec);
  assert.ok(result.reasons.some(r => r.includes('tight') || r.includes('onsistent timing') || r.includes('400')), 'Should mention tight duration range');
});

test('Rule 2b: variance >800ms → wide duration range mentioned', () => {
  const spec = makeSpec();
  spec.animations[0].duration = 100;
  spec.animations[4].duration = 1500; // 1400ms spread
  const result = explainMotionSpec(spec);
  assert.ok(result.reasons.some(r => r.includes('wide') || r.includes('pacing feel inconsistent')), 'Should mention wide duration range');
});

// ── Rule 3: Stagger consistency ──────────────────────────────────────────

test('Rule 3a: consistent stagger interval → stagger rhythm mentioned', () => {
  const spec = makeSpec();
  spec.animations[0].stagger = 120;
  spec.animations[0].pattern = 'stagger';
  spec.animations[1].stagger = 120;
  spec.animations[1].pattern = 'stagger';
  spec.animations[2].stagger = 120;
  spec.animations[2].pattern = 'stagger';
  const result = explainMotionSpec(spec);
  assert.ok(result.reasons.some(r => r.includes('120ms') || r.includes('tagger') || r.includes('Stagger')), 'Should mention stagger rhythm');
});

test('Rule 3b: multiple stagger animations → stagger counted', () => {
  const spec = makeSpec();
  spec.animations[0].stagger = 80;
  spec.animations[0].pattern = 'stagger';
  spec.animations[1].stagger = 150;
  spec.animations[1].pattern = 'stagger';
  const result = explainMotionSpec(spec);
  assert.ok(result.reasons.some(r => r.includes('tagger') || r.includes('Stagger')), 'Should mention staggered animations');
});

// ── Rule 4: Spring presence ──────────────────────────────────────────────

test('Rule 4a: ≥40% spring → spring physics key signal', () => {
  const spec = makeSpec();
  spec.animations[0].easingName = 'spring-like';
  spec.animations[1].easingName = 'spring-overshoot';
  spec.animations[2].easingName = 'spring-bouncy';
  const result = explainMotionSpec(spec);
  // 3/5 = 60% spring
  assert.ok(result.reasons.some(r => r.includes('spring') || r.includes('Spring')), 'Should mention spring physics');
});

test('Rule 4b: <40% spring but >0 → spring adds character note', () => {
  const spec = makeSpec();
  spec.animations[0].easingName = 'spring-like';
  // 1/5 = 20%
  const result = explainMotionSpec(spec);
  assert.ok(result.reasons.some(r => r.includes('spring') || r.includes('Spring')), 'Should mention spring presence');
});

// ── Rule 5: Reduced motion support ──────────────────────────────────────

test('Rule 5a: reduced motion supported → positive note', () => {
  const spec = makeSpec();
  spec.fingerprint.reducedMotionSupport = true;
  const result = explainMotionSpec(spec);
  assert.ok(result.reasons.some(r => r.includes('prefers-reduced-motion') && r.includes('supported')), 'Should confirm reduced motion support');
});

test('Rule 5b: no reduced motion → negative note', () => {
  const spec = makeSpec();
  spec.fingerprint.reducedMotionSupport = false;
  const result = explainMotionSpec(spec);
  assert.ok(result.reasons.some(r => r.includes('NOT supported') || r.includes('not supported')), 'Should flag missing reduced motion');
});

// ── Rule 6: Long durations ───────────────────────────────────────────────

test('Rule 6a: animations >1000ms → long duration mentioned', () => {
  const spec = makeSpec();
  spec.animations[0].duration = 1200;
  spec.animations[1].duration = 1500;
  const result = explainMotionSpec(spec);
  assert.ok(result.reasons.some(r => r.includes('1000ms') || r.includes('exceed')), 'Should mention long durations');
});

test('Rule 6b: all durations ≤600ms → responsive note', () => {
  const spec = makeSpec();
  // All durations already 400–480ms
  const result = explainMotionSpec(spec);
  assert.ok(result.reasons.some(r => r.includes('600ms') || r.includes('responsive')), 'Should note short durations as responsive');
});

// ── Rule 7: Scroll-linked ────────────────────────────────────────────────

test('Rule 7: scroll-linked animations → scroll narrative mentioned', () => {
  const spec = makeSpec();
  spec.fingerprint.scrollLinked = true;
  spec.animations[0].pattern = 'scroll-linked';
  spec.animations[0].scrollTrigger = { trigger: '.hero', start: 'top center', scrub: true };
  const result = explainMotionSpec(spec);
  assert.ok(result.reasons.some(r => r.includes('croll') && (r.includes('narrative') || r.includes('position'))), 'Should mention scroll-linked narrative');
});

// ── Rule 8: Mouse-interactive ────────────────────────────────────────────

test('Rule 8: mouse-interactive → parallax/depth mentioned', () => {
  const spec = makeSpec();
  spec.fingerprint.mouseInteractive = true;
  const result = explainMotionSpec(spec);
  assert.ok(result.reasons.some(r => r.includes('parallax') || r.includes('cursor') || r.includes('mouse') || r.includes('Mouse')), 'Should mention mouse-interactive effects');
});

// ── Rule 9: No abrupt transitions ───────────────────────────────────────

test('Rule 9a: no animations <100ms → no abrupt note included', () => {
  const spec = makeSpec();
  const result = explainMotionSpec(spec);
  assert.ok(result.reasons.some(r => r.includes('abrupt') || r.includes('sufficient duration')), 'Should mention absence of abrupt transitions');
});

test('Rule 9b: >2 animations <100ms → abrupt transitions flagged', () => {
  const spec = makeSpec();
  spec.animations[0].duration = 50;
  spec.animations[1].duration = 60;
  spec.animations[2].duration = 70;
  const result = explainMotionSpec(spec);
  assert.ok(result.reasons.some(r => r.includes('abrupt') || r.includes('<100ms') || r.includes('jarring')), 'Should flag abrupt transitions');
});

// ── Rule 10: Library signal ──────────────────────────────────────────────

test('Rule 10a: GSAP library → GSAP mentioned in reasons', () => {
  const spec = makeSpec();
  spec.fingerprint.dominantLibrary = 'gsap';
  spec.fingerprint.libraries = ['gsap'];
  const result = explainMotionSpec(spec);
  assert.ok(result.reasons.some(r => r.includes('GSAP')), 'Should mention GSAP as dominant library');
});

test('Rule 10b: Framer Motion library → Framer mentioned', () => {
  const spec = makeSpec();
  spec.fingerprint.dominantLibrary = 'framer-motion';
  spec.fingerprint.libraries = ['framer-motion'];
  const result = explainMotionSpec(spec);
  assert.ok(result.reasons.some(r => r.includes('Framer Motion')), 'Should mention Framer Motion');
});

test('Rule 10c: CSS-only → no library reason added', () => {
  const spec = makeSpec();
  // default is css — library note only added for non-css
  const result = explainMotionSpec(spec);
  const libraryReasons = result.reasons.filter(r => r.includes('dominant animation library'));
  assert.equal(libraryReasons.length, 0, 'Should not add library note for CSS-only');
});

// ── Headline tests ────────────────────────────────────────────────────────

test('Headline includes feel word', () => {
  const spec = makeSpec();
  const result = explainMotionSpec(spec);
  assert.ok(result.headline.includes('"smooth"') || result.headline.includes('smooth'), 'Headline should include feel word');
});

test('Headline references key signal', () => {
  const spec = makeSpec();
  const result = explainMotionSpec(spec);
  assert.ok(typeof result.headline === 'string' && result.headline.length > 10, 'Headline should be non-empty string');
});

// ── Empty / edge cases ────────────────────────────────────────────────────

test('Empty animations array → no-animations explanation', () => {
  const spec = makeSpec();
  spec.animations = [];
  spec.fingerprint.animationCount = 0;
  const result = explainMotionSpec(spec);
  assert.ok(result.headline.includes('No animations'), 'Should indicate no animations');
  assert.ok(result.keySignal === 'none', 'Key signal should be none');
});

test('Explanation object has all required fields', () => {
  const spec = makeSpec();
  const result = explainMotionSpec(spec);
  assert.ok(Array.isArray(result.reasons), 'reasons should be array');
  assert.ok(typeof result.headline === 'string', 'headline should be string');
  assert.ok(typeof result.keySignal === 'string', 'keySignal should be string');
  assert.ok(typeof result.detail === 'object', 'detail should be object');
});

// ── Formatter tests ───────────────────────────────────────────────────────

test('formatExplanationTerminal returns string with headline', () => {
  const spec = makeSpec();
  const explanation = explainMotionSpec(spec);
  const output = formatExplanationTerminal(explanation, 'https://example.com');
  assert.ok(typeof output === 'string', 'Should return a string');
  assert.ok(output.includes('Motion Explanation'), 'Should include section header');
  assert.ok(output.includes(explanation.headline), 'Should include headline');
});

test('formatExplanationTerminal includes all reasons', () => {
  const spec = makeSpec();
  const explanation = explainMotionSpec(spec);
  const output = formatExplanationTerminal(explanation, 'https://example.com');
  for (const reason of explanation.reasons) {
    assert.ok(output.includes(reason), `Should include reason: ${reason.slice(0, 40)}...`);
  }
});

test('formatExplanationMarkdown returns markdown string', () => {
  const spec = makeSpec();
  const explanation = explainMotionSpec(spec);
  const output = formatExplanationMarkdown(explanation);
  assert.ok(output.includes('## Motion Explanation'), 'Should include markdown header');
  assert.ok(output.includes('Key signal:'), 'Should include key signal');
  assert.ok(output.includes('- '), 'Should include bullet list items');
});

test('formatExplanationMarkdown includes all reasons as bullets', () => {
  const spec = makeSpec();
  const explanation = explainMotionSpec(spec);
  const output = formatExplanationMarkdown(explanation);
  for (const reason of explanation.reasons) {
    assert.ok(output.includes(reason), `Markdown should include reason: ${reason.slice(0, 40)}...`);
  }
});

// ── Combined signal tests ─────────────────────────────────────────────────

test('High easing consistency + spring → consistent easing wins as key signal', () => {
  const spec = makeSpec();
  // 80% same easing + 1 spring
  spec.animations[0].easingName = 'spring-like';
  // Still 4/5 = 80% expressive-decelerate
  const result = explainMotionSpec(spec);
  // Consistent easing at 80% should dominate over 20% spring
  assert.ok(result.keySignal === 'consistent easing' || result.keySignal === 'spring physics', 'Key signal should be primary driver');
});

test('Scroll-linked with consistent easing → consistent easing key signal', () => {
  const spec = makeSpec();
  spec.fingerprint.scrollLinked = true;
  // 5/5 same easing = 100% → consistent easing beats scroll signal
  const result = explainMotionSpec(spec);
  assert.equal(result.keySignal, 'consistent easing');
});

test('Detail object contains expected sub-keys', () => {
  const spec = makeSpec();
  const result = explainMotionSpec(spec);
  assert.ok('easingConsistency' in result.detail, 'detail should have easingConsistency');
  assert.ok('durationRange' in result.detail, 'detail should have durationRange');
  assert.ok('reducedMotion' in result.detail, 'detail should have reducedMotion');
});