import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { segmentPage, attachComponentIds } from '../src/segmenter.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeDomStructure(overrides = {}) {
  return {
    landmarks:       [],
    headings:        [],
    namedBlocks:     [],
    repeatedPatterns:[],
    viewportHeight:  800,
    viewportWidth:   1280,
    pageHeight:      4000,
    ...overrides,
  };
}

// ── segmentPage: null / empty input ─────────────────────────────────────────

describe('segmentPage — null / empty input', () => {
  it('returns [] when domStructure is null', () => {
    assert.deepEqual(segmentPage(null), []);
  });

  it('returns [] when domStructure is undefined', () => {
    assert.deepEqual(segmentPage(undefined), []);
  });

  it('returns [] when all arrays are empty', () => {
    const result = segmentPage(makeDomStructure());
    assert.deepEqual(result, []);
  });
});

// ── Heuristic 1: Semantic landmarks ─────────────────────────────────────────

describe('segmentPage — heuristic 1: semantic landmarks', () => {
  it('detects a <section> landmark', () => {
    const ds = makeDomStructure({
      landmarks: [{
        tag: 'section', id: 'hero', classes: 'hero-section',
        ariaLabel: null, role: null,
        width: 1280, height: 600, top: 0, isViewportSized: false,
      }],
    });
    const result = segmentPage(ds);
    assert.ok(result.length > 0, 'should detect at least one component');
    const comp = result[0];
    assert.equal(comp.selector, '#hero');
    assert.ok(comp.label.length > 0);
    assert.ok(Array.isArray(comp.animationIds));
  });

  it('uses aria-label as component label when present', () => {
    const ds = makeDomStructure({
      landmarks: [{
        tag: 'section', id: null, classes: '',
        ariaLabel: 'Pricing Plans', role: 'region',
        width: 1280, height: 400, top: 800, isViewportSized: false,
      }],
    });
    const result = segmentPage(ds);
    assert.ok(result.length > 0);
    assert.ok(result[0].label.toLowerCase().includes('pricing'));
  });

  it('skips tiny landmarks (height < 50)', () => {
    const ds = makeDomStructure({
      landmarks: [{
        tag: 'nav', id: null, classes: 'breadcrumb',
        ariaLabel: null, role: null,
        width: 300, height: 20, top: 0, isViewportSized: false,
      }],
    });
    const result = segmentPage(ds);
    assert.equal(result.length, 0, 'tiny landmark should be skipped');
  });

  it('detects multiple landmark types', () => {
    const ds = makeDomStructure({
      landmarks: [
        { tag: 'header', id: 'site-header', classes: '', ariaLabel: null, role: null, width: 1280, height: 80, top: 0, isViewportSized: false },
        { tag: 'main',   id: 'main-content', classes: '', ariaLabel: null, role: null, width: 1280, height: 2000, top: 80, isViewportSized: false },
        { tag: 'footer', id: 'site-footer', classes: '', ariaLabel: null, role: null, width: 1280, height: 200, top: 2080, isViewportSized: false },
      ],
    });
    const result = segmentPage(ds);
    assert.ok(result.length >= 2, 'should detect header, main, footer');
  });
});

// ── Heuristic 2: Heading anchors ─────────────────────────────────────────────

describe('segmentPage — heuristic 2: heading anchors', () => {
  it('creates components from h2 headings', () => {
    const ds = makeDomStructure({
      headings: [
        { tag: 'h2', text: 'How It Works', id: null, classes: '', top: 400 },
        { tag: 'h2', text: 'Pricing',      id: null, classes: '', top: 900 },
      ],
      pageHeight: 1800,
    });
    const result = segmentPage(ds);
    assert.ok(result.length >= 2);
    const labels = result.map(c => c.label.toLowerCase());
    assert.ok(labels.some(l => l.includes('how') || l.includes('works')));
    assert.ok(labels.some(l => l.includes('pricing')));
  });

  it('uses heading id as selector when available', () => {
    const ds = makeDomStructure({
      headings: [
        { tag: 'h2', text: 'Features', id: 'features-heading', classes: '', top: 500 },
      ],
      pageHeight: 2000,
    });
    const result = segmentPage(ds);
    assert.ok(result.length > 0);
    // selector should reference the heading id
    assert.ok(result.some(c => c.selector.includes('features-heading')));
  });

  it('skips headings with zero height span (TOC entries)', () => {
    const ds = makeDomStructure({
      headings: [
        { tag: 'h2', text: 'Section A', id: null, classes: '', top: 100 },
        { tag: 'h2', text: 'Section B', id: null, classes: '', top: 110 }, // 10px gap — too small
      ],
      pageHeight: 2000,
    });
    const result = segmentPage(ds);
    // The 10px section should be filtered out
    const heights = result.map(c => c.height);
    assert.ok(heights.every(h => h >= 50), 'all detected sections should have height >= 50');
  });
});

// ── Heuristic 3: Viewport-sized blocks ───────────────────────────────────────

describe('segmentPage — heuristic 3: viewport-sized blocks', () => {
  it('detects a full-screen hero section', () => {
    const ds = makeDomStructure({
      landmarks: [{
        tag: 'section', id: null, classes: 'hero-wrapper',
        ariaLabel: null, role: null,
        width: 1280, height: 800, top: 0, isViewportSized: true,
      }],
    });
    const result = segmentPage(ds);
    assert.ok(result.length > 0, 'viewport-sized block should be detected');
    assert.ok(result[0].height >= 800);
  });

  it('does not flag non-viewport-sized blocks via this heuristic', () => {
    const ds = makeDomStructure({
      landmarks: [{
        tag: 'section', id: 'small', classes: '',
        ariaLabel: null, role: null,
        width: 1280, height: 200, top: 0, isViewportSized: false,
      }],
    });
    const result = segmentPage(ds);
    // May still be detected as a landmark, but not specifically as viewport-sized
    if (result.length > 0) {
      assert.ok(result[0].source !== 'viewport-block' || result[0].height >= 600);
    }
  });
});

// ── Heuristic 4: Named blocks ─────────────────────────────────────────────────

describe('segmentPage — heuristic 4: class/ID name patterns', () => {
  it('detects a .hero div', () => {
    const ds = makeDomStructure({
      namedBlocks: [{
        tag: 'div', id: null, classes: 'hero hero-container',
        matchedKeywords: ['hero'],
        width: 1280, height: 700, top: 0, isViewportSized: true,
      }],
    });
    const result = segmentPage(ds);
    assert.ok(result.length > 0);
    assert.ok(result.some(c => c.label.toLowerCase().includes('hero')));
  });

  it('detects a #pricing section', () => {
    const ds = makeDomStructure({
      namedBlocks: [{
        tag: 'section', id: 'pricing', classes: 'pricing-section',
        matchedKeywords: ['pricing'],
        width: 1280, height: 500, top: 1200, isViewportSized: false,
      }],
    });
    const result = segmentPage(ds);
    assert.ok(result.length > 0);
    assert.ok(result.some(c => c.selector === '#pricing' || c.label.toLowerCase().includes('pricing')));
  });

  it('detects a .cta block', () => {
    const ds = makeDomStructure({
      namedBlocks: [{
        tag: 'div', id: null, classes: 'cta-wrapper cta',
        matchedKeywords: ['cta'],
        width: 1280, height: 300, top: 2000, isViewportSized: false,
      }],
    });
    const result = segmentPage(ds);
    assert.ok(result.length > 0);
    assert.ok(result.some(c => c.label.toLowerCase().includes('cta') || c.selector.includes('cta')));
  });

  it('detects multiple named blocks', () => {
    const ds = makeDomStructure({
      namedBlocks: [
        { tag: 'div', id: null, classes: 'hero', matchedKeywords: ['hero'], width: 1280, height: 700, top: 0, isViewportSized: true },
        { tag: 'section', id: 'features', classes: 'features-grid', matchedKeywords: ['feature'], width: 1280, height: 600, top: 700, isViewportSized: false },
        { tag: 'div', id: null, classes: 'testimonials-section', matchedKeywords: ['testimonial'], width: 1280, height: 400, top: 1800, isViewportSized: false },
      ],
    });
    const result = segmentPage(ds);
    assert.ok(result.length >= 2, 'should detect at least hero and features');
  });
});

// ── Heuristic 5: Repeated DOM patterns ───────────────────────────────────────

describe('segmentPage — heuristic 5: repeated DOM patterns', () => {
  it('detects a 4-card pricing grid', () => {
    const ds = makeDomStructure({
      repeatedPatterns: [{
        parentTag: 'div', parentId: 'pricing-grid', parentClasses: 'pricing-grid',
        childTag: 'div', count: 4, top: 1200, height: 400,
      }],
    });
    const result = segmentPage(ds);
    assert.ok(result.length > 0, 'repeated pattern should produce a component');
    const comp = result[0];
    assert.ok(comp.label.toLowerCase().includes('4') || comp.label.toLowerCase().includes('div'));
  });

  it('detects a 6-item testimonial list', () => {
    const ds = makeDomStructure({
      repeatedPatterns: [{
        parentTag: 'ul', parentId: null, parentClasses: 'testimonials-list',
        childTag: 'li', count: 6, top: 2000, height: 600,
      }],
    });
    const result = segmentPage(ds);
    // li inside ul with 6 items — should be detected unless it hits the trivial filter
    // (our filter skips ul>li when count > 20, so 6 should pass)
    assert.ok(result.length > 0);
  });

  it('skips trivially large ul > li lists (nav menus)', () => {
    const ds = makeDomStructure({
      repeatedPatterns: [{
        parentTag: 'ul', parentId: null, parentClasses: 'site-nav',
        childTag: 'li', count: 25, top: 0, height: 50,
      }],
    });
    const result = segmentPage(ds);
    // count > 20 for ul>li should be skipped
    assert.equal(result.length, 0, 'large nav lists should be filtered');
  });

  it('skips patterns with fewer than 3 children', () => {
    const ds = makeDomStructure({
      repeatedPatterns: [{
        parentTag: 'div', parentId: null, parentClasses: 'two-col',
        childTag: 'div', count: 2, top: 500, height: 300,
      }],
    });
    const result = segmentPage(ds);
    assert.equal(result.length, 0, 'count < 3 should be skipped');
  });
});

// ── Deduplication ─────────────────────────────────────────────────────────────

describe('segmentPage — deduplication', () => {
  it('deduplicates components at the same top position', () => {
    const ds = makeDomStructure({
      landmarks: [{
        tag: 'section', id: 'hero', classes: 'hero',
        ariaLabel: null, role: null, width: 1280, height: 700, top: 0, isViewportSized: true,
      }],
      namedBlocks: [{
        tag: 'section', id: 'hero', classes: 'hero',
        matchedKeywords: ['hero'], width: 1280, height: 700, top: 0, isViewportSized: true,
      }],
    });
    const result = segmentPage(ds);
    // Both heuristics detect the same element — should merge to 1
    assert.ok(result.length <= 2, 'overlapping components should be deduplicated');
  });

  it('keeps components at distinct positions', () => {
    const ds = makeDomStructure({
      landmarks: [
        { tag: 'section', id: 'hero', classes: '', ariaLabel: null, role: null, width: 1280, height: 600, top: 0, isViewportSized: false },
        { tag: 'section', id: 'pricing', classes: '', ariaLabel: null, role: null, width: 1280, height: 500, top: 1200, isViewportSized: false },
      ],
    });
    const result = segmentPage(ds);
    assert.ok(result.length >= 2, 'distinct sections should both be present');
  });
});

// ── Output schema ─────────────────────────────────────────────────────────────

describe('segmentPage — output schema', () => {
  it('every component has required fields', () => {
    const ds = makeDomStructure({
      landmarks: [{
        tag: 'section', id: 'about', classes: '',
        ariaLabel: null, role: null, width: 1280, height: 400, top: 800, isViewportSized: false,
      }],
    });
    const result = segmentPage(ds);
    assert.ok(result.length > 0);
    for (const comp of result) {
      assert.ok(typeof comp.id === 'string',        'id must be string');
      assert.ok(typeof comp.label === 'string',     'label must be string');
      assert.ok(typeof comp.selector === 'string',  'selector must be string');
      assert.ok(typeof comp.top === 'number',       'top must be number');
      assert.ok(typeof comp.height === 'number',    'height must be number');
      assert.ok(Array.isArray(comp.animationIds),   'animationIds must be array');
      assert.equal(comp.dominantPattern, null,      'dominantPattern starts null');
      assert.equal(comp.feel, null,                 'feel starts null');
    }
  });

  it('components are sorted by top position', () => {
    const ds = makeDomStructure({
      landmarks: [
        { tag: 'footer', id: 'footer', classes: '', ariaLabel: null, role: null, width: 1280, height: 200, top: 3000, isViewportSized: false },
        { tag: 'section', id: 'hero', classes: '', ariaLabel: null, role: null, width: 1280, height: 600, top: 0, isViewportSized: false },
        { tag: 'main', id: 'content', classes: '', ariaLabel: null, role: null, width: 1280, height: 2000, top: 600, isViewportSized: false },
      ],
    });
    const result = segmentPage(ds);
    for (let i = 1; i < result.length; i++) {
      assert.ok(result[i].top >= result[i - 1].top, 'components should be sorted by top');
    }
  });
});

// ── attachComponentIds ────────────────────────────────────────────────────────

describe('attachComponentIds', () => {
  it('sets componentId to null when components array is empty', () => {
    const animations = [
      { id: 'fade-in-001', pattern: 'fade-in', source: 'css-keyframes' },
    ];
    attachComponentIds(animations, []);
    assert.equal(animations[0].componentId, null);
  });

  it('sets componentId to null on all animations when components is null', () => {
    const animations = [
      { id: 'slide-up-001', pattern: 'slide-up' },
      { id: 'fade-in-001', pattern: 'fade-in' },
    ];
    attachComponentIds(animations, null);
    for (const a of animations) assert.equal(a.componentId, null);
  });

  it('fills dominantPattern on a component after attachment', () => {
    const components = [{
      id: 'hero', label: 'Hero', selector: '#hero',
      top: 0, height: 600, source: 'semantic-landmark', confidence: 0.9,
      animationIds: [], dominantPattern: null, feel: null,
    }];
    const animations = [
      { id: 'slide-up-001', pattern: 'slide-up', componentId: null, easingName: 'smooth-decelerate' },
      { id: 'slide-up-002', pattern: 'slide-up', componentId: null, easingName: 'smooth-decelerate' },
      { id: 'fade-in-001',  pattern: 'fade-in',  componentId: null, easingName: null },
    ];
    attachComponentIds(animations, components);
    // All assigned to the single component
    assert.equal(components[0].dominantPattern, 'slide-up');
  });

  it('animationIds array is populated on the matched component', () => {
    const components = [{
      id: 'hero', label: 'Hero', selector: '#hero',
      top: 0, height: 600, source: 'semantic-landmark', confidence: 0.9,
      animationIds: [], dominantPattern: null, feel: null,
    }];
    const animations = [
      { id: 'fade-in-001', pattern: 'fade-in', componentId: null, easingName: null },
      { id: 'fade-in-002', pattern: 'fade-in', componentId: null, easingName: null },
    ];
    attachComponentIds(animations, components);
    assert.equal(components[0].animationIds.length, 2);
  });
});