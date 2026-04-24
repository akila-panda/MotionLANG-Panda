// Tests for Phase 17: Figma Component Export
// Covers: motion-figma-component.js, motion-figma-annotations.js, motion-figma-devmode.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatFigmaComponent } from '../src/formatters/motion-figma-component.js';
import { formatFigmaAnnotations } from '../src/formatters/motion-figma-annotations.js';
import { formatFigmaDevMode } from '../src/formatters/motion-figma-devmode.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_TOKENS = {
  durations: [{ name: 'duration-md', value: '480ms', bucket: 'md' }],
  easings:   [{ name: 'easing-standard', value: 'cubic-bezier(0.4,0,0.2,1)', humanName: 'standard' }],
};

const MOCK_ANIMATIONS = [
  {
    id: 'slide-up-001', pattern: 'slide-up', componentId: 'hero',
    duration: 480, easing: 'cubic-bezier(0.4,0,0.2,1)', easingName: 'standard',
    delay: 0, durationBucket: 'md', reducedMotion: 'supported', confidence: 0.9,
  },
  {
    id: 'stagger-002', pattern: 'stagger', componentId: 'hero',
    duration: 400, easing: 'ease-out', easingName: 'standard',
    delay: 120, staggerInterval: 120, durationBucket: 'md', reducedMotion: 'supported', confidence: 0.85,
  },
  {
    id: 'fade-in-003', pattern: 'fade-in', componentId: 'feature-grid',
    duration: 300, easing: 'ease-out', easingName: 'standard',
    delay: 0, durationBucket: 'sm', reducedMotion: 'none', confidence: 0.8,
  },
];

const MOCK_COMPONENTS = [
  {
    id: 'hero', label: 'Hero Section', selector: 'section.hero',
    elementCount: 14, animationIds: ['slide-up-001', 'stagger-002'],
    dominantPattern: 'slide-up', feel: 'smooth', width: 1280, height: 600,
  },
  {
    id: 'feature-grid', label: 'Feature Grid', selector: '.features',
    elementCount: 8, animationIds: ['fade-in-003'],
    dominantPattern: 'fade-in', feel: 'subtle', width: 1280, height: 400,
  },
];

const MOCK_SPEC = {
  meta: { url: 'https://example.com', timestamp: '2026-04-24T00:00:00Z', component: null },
  fingerprint: { feel: 'smooth', dominantLibrary: 'css', animationCount: 3, dominantPattern: 'slide-up' },
  animations: MOCK_ANIMATIONS,
  components: MOCK_COMPONENTS,
  tokens: MOCK_TOKENS,
};

// ── motion-figma-component.js ─────────────────────────────────────────────────

test('formatFigmaComponent: returns valid JS script string', () => {
  const script = formatFigmaComponent(MOCK_SPEC, 'hero');
  assert.equal(typeof script, 'string');
  assert.ok(script.length > 100, 'script should not be empty');
});

test('formatFigmaComponent: script is IIFE pattern', () => {
  const script = formatFigmaComponent(MOCK_SPEC, 'hero');
  assert.ok(script.includes('(async () => {'), 'should use async IIFE');
  assert.ok(script.includes('})().catch('), 'should have error handler');
});

test('formatFigmaComponent: includes component label', () => {
  const script = formatFigmaComponent(MOCK_SPEC, 'hero');
  assert.ok(script.includes('Hero Section'), 'should reference component label');
});

test('formatFigmaComponent: creates a frame', () => {
  const script = formatFigmaComponent(MOCK_SPEC, 'hero');
  assert.ok(script.includes('figma.createFrame()'), 'should create a frame');
  assert.ok(script.includes('layoutMode'), 'should set Auto Layout');
});

test('formatFigmaComponent: creates layers for each animation', () => {
  const script = formatFigmaComponent(MOCK_SPEC, 'hero');
  assert.ok(script.includes('slide-up-001'), 'should include first animation');
  assert.ok(script.includes('stagger-002'), 'should include second animation');
  // feature-grid animation should NOT appear (wrong component)
  assert.ok(!script.includes('fade-in-003'), 'should not include other component animations');
});

test('formatFigmaComponent: converts to component', () => {
  const script = formatFigmaComponent(MOCK_SPEC, 'hero');
  assert.ok(script.includes('createComponentFromNode'), 'should create Figma component');
});

test('formatFigmaComponent: attaches plugin data', () => {
  const script = formatFigmaComponent(MOCK_SPEC, 'hero');
  assert.ok(script.includes('setPluginData'), 'should attach plugin data');
  assert.ok(script.includes('motionlang'), 'should use motionlang plugin key');
});

test('formatFigmaComponent: unknown component returns error comment', () => {
  const script = formatFigmaComponent(MOCK_SPEC, 'nonexistent');
  assert.ok(script.startsWith('// ERROR'), 'should return error comment for unknown component');
  assert.ok(script.includes('"hero"'), 'error should list available components');
});

test('formatFigmaComponent: works by label (case-insensitive)', () => {
  const script = formatFigmaComponent(MOCK_SPEC, 'hero section');
  assert.ok(!script.startsWith('// ERROR'), 'should find component by label');
  assert.ok(script.includes('Hero Section'));
});

test('formatFigmaComponent: includes viewport focus', () => {
  const script = formatFigmaComponent(MOCK_SPEC, 'hero');
  assert.ok(script.includes('scrollAndZoomIntoView'), 'should focus viewport on new component');
});

test('formatFigmaComponent: includes figma.notify', () => {
  const script = formatFigmaComponent(MOCK_SPEC, 'hero');
  assert.ok(script.includes('figma.notify'), 'should show a notification');
  assert.ok(script.includes('2 animation'), 'notify should mention animation count');
});

test('formatFigmaComponent: component with no animations adds placeholder', () => {
  const specNoAnims = { ...MOCK_SPEC, animations: [] };
  const script = formatFigmaComponent(specNoAnims, 'hero');
  assert.ok(script.includes('Placeholder'), 'should add placeholder for empty component');
});

// ── motion-figma-annotations.js ──────────────────────────────────────────────

test('formatFigmaAnnotations: returns object with json and script keys', () => {
  const result = formatFigmaAnnotations(MOCK_SPEC);
  assert.ok(typeof result === 'object', 'should return object');
  assert.ok(typeof result.json === 'string', 'should have json field');
  assert.ok(typeof result.script === 'string', 'should have script field');
});

test('formatFigmaAnnotations: JSON is valid and parseable', () => {
  const { json } = formatFigmaAnnotations(MOCK_SPEC);
  const data = JSON.parse(json);
  assert.equal(data.version, '2.0');
  assert.equal(data.generator, 'motionlang');
  assert.ok(Array.isArray(data.annotations), 'annotations should be array');
});

test('formatFigmaAnnotations: all animations included when no componentId', () => {
  const { json } = formatFigmaAnnotations(MOCK_SPEC);
  const data = JSON.parse(json);
  assert.equal(data.annotations.length, 3, 'should include all 3 animations');
});

test('formatFigmaAnnotations: scoped to component when componentId provided', () => {
  const { json } = formatFigmaAnnotations(MOCK_SPEC, 'hero');
  const data = JSON.parse(json);
  assert.equal(data.annotations.length, 2, 'should include only hero animations');
  assert.ok(data.component, 'should include component metadata');
  assert.equal(data.component.id, 'hero');
});

test('formatFigmaAnnotations: annotation cards have required fields', () => {
  const { json } = formatFigmaAnnotations(MOCK_SPEC, 'hero');
  const data = JSON.parse(json);
  const card = data.annotations[0];
  assert.ok(card.animationId, 'card should have animationId');
  assert.ok(card.pattern, 'card should have pattern');
  assert.ok(card.patternLabel, 'card should have human pattern label');
  assert.ok(card.trigger, 'card should have trigger');
  assert.ok(card.cardText, 'card should have formatted cardText');
});

test('formatFigmaAnnotations: cardText includes key fields', () => {
  const { json } = formatFigmaAnnotations(MOCK_SPEC, 'hero');
  const data = JSON.parse(json);
  const card = data.annotations[0];
  assert.ok(card.cardText.includes('slide-up-001'), 'cardText should include animation ID');
  assert.ok(card.cardText.includes('480ms'), 'cardText should include duration');
});

test('formatFigmaAnnotations: reducedMotion field describes accessibility status', () => {
  const { json } = formatFigmaAnnotations(MOCK_SPEC);
  const data = JSON.parse(json);
  const supported = data.annotations.find(a => a.animationId === 'slide-up-001');
  const unsupported = data.annotations.find(a => a.animationId === 'fade-in-003');
  assert.ok(supported.reducedMotion.includes('supported'), 'supported should say supported');
  assert.ok(unsupported.reducedMotion.includes('⚠️'), 'unsupported should show warning');
});

test('formatFigmaAnnotations: script is IIFE', () => {
  const { script } = formatFigmaAnnotations(MOCK_SPEC, 'hero');
  assert.ok(script.includes('(async () => {'), 'script should use async IIFE');
  assert.ok(script.includes('figma.loadFontAsync'), 'script should load fonts');
});

test('formatFigmaAnnotations: script creates annotation cards', () => {
  const { script } = formatFigmaAnnotations(MOCK_SPEC, 'hero');
  assert.ok(script.includes('createAnnotationCard'), 'script should call card factory');
  assert.ok(script.includes('figma.createFrame'), 'script should create frames');
});

test('formatFigmaAnnotations: summary includes key stats', () => {
  const { json } = formatFigmaAnnotations(MOCK_SPEC, 'hero');
  const data = JSON.parse(json);
  assert.equal(data.summary.totalAnimations, 2);
  assert.ok('hasReducedMotion' in data.summary, 'summary should have hasReducedMotion');
});

test('formatFigmaAnnotations: stagger annotation includes stagger field', () => {
  const { json } = formatFigmaAnnotations(MOCK_SPEC, 'hero');
  const data = JSON.parse(json);
  const staggerCard = data.annotations.find(a => a.animationId === 'stagger-002');
  assert.ok(staggerCard.stagger, 'stagger animation should have stagger field');
  assert.ok(staggerCard.stagger.includes('120ms'), 'stagger should show interval');
});

// ── motion-figma-devmode.js ───────────────────────────────────────────────────

test('formatFigmaDevMode: returns a string', () => {
  const script = formatFigmaDevMode(MOCK_SPEC);
  assert.equal(typeof script, 'string');
  assert.ok(script.length > 100);
});

test('formatFigmaDevMode: script is IIFE', () => {
  const script = formatFigmaDevMode(MOCK_SPEC);
  assert.ok(script.includes('(async () => {'));
  assert.ok(script.includes('})().catch('));
});

test('formatFigmaDevMode: includes snippet map with all animations when unscoped', () => {
  const script = formatFigmaDevMode(MOCK_SPEC);
  assert.ok(script.includes('slide-up-001'), 'should include all animation IDs');
  assert.ok(script.includes('stagger-002'));
  assert.ok(script.includes('fade-in-003'));
});

test('formatFigmaDevMode: scoped to component when componentId given', () => {
  const script = formatFigmaDevMode(MOCK_SPEC, 'hero');
  assert.ok(script.includes('slide-up-001'), 'hero animations should be present');
  assert.ok(script.includes('stagger-002'));
  // fade-in-003 belongs to feature-grid
  assert.ok(!script.includes('fade-in-003'), 'feature-grid animations should be excluded');
});

test('formatFigmaDevMode: includes GSAP snippet', () => {
  const script = formatFigmaDevMode(MOCK_SPEC, 'hero');
  assert.ok(script.includes('gsap.from('), 'should include GSAP code');
  assert.ok(script.includes("import gsap from 'gsap'") || script.includes('gsap.from('));
});

test('formatFigmaDevMode: includes Framer Motion snippet', () => {
  const script = formatFigmaDevMode(MOCK_SPEC, 'hero');
  assert.ok(script.includes('Variants'), 'should include Framer variants');
  assert.ok(script.includes('framer-motion') || script.includes('Variants'));
});

test('formatFigmaDevMode: includes CSS snippet', () => {
  const script = formatFigmaDevMode(MOCK_SPEC, 'hero');
  assert.ok(script.includes('@keyframes') || script.includes('css'), 'should include CSS animation');
  assert.ok(script.includes('prefers-reduced-motion'), 'should include reduced-motion CSS');
});

test('formatFigmaDevMode: uses setSharedPluginData', () => {
  const script = formatFigmaDevMode(MOCK_SPEC, 'hero');
  assert.ok(script.includes('setSharedPluginData'), 'should use shared plugin data for Dev Mode');
});

test('formatFigmaDevMode: recursively traverses children', () => {
  const script = formatFigmaDevMode(MOCK_SPEC, 'hero');
  assert.ok(script.includes('children'), 'should recurse into children');
  assert.ok(script.includes('attachSnippetsToNode'), 'should define recursive attach function');
});

test('formatFigmaDevMode: warns when no selection', () => {
  const script = formatFigmaDevMode(MOCK_SPEC, 'hero');
  assert.ok(script.includes('Select a frame'), 'should check for empty selection');
});

test('formatFigmaDevMode: attaches summary to selection root', () => {
  const script = formatFigmaDevMode(MOCK_SPEC, 'hero');
  assert.ok(script.includes("'summary'"), 'should attach summary to root node');
  assert.ok(script.includes('motionlang'), 'summary should use motionlang key');
});

test('formatFigmaDevMode: mentions correct animation count in notify', () => {
  const script = formatFigmaDevMode(MOCK_SPEC, 'hero');
  assert.ok(script.includes('attached'), 'should report number of layers with snippets');
});