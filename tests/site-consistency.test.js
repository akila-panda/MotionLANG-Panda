// tests/site-consistency.test.js
// Unit tests for src/site-consistency.js and src/formatters/site-report.js
// Uses node:test + assert/strict. No external test libs.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateSiteConsistencyReport } from '../src/site-consistency.js';
import { formatSiteReport } from '../src/formatters/site-report.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeSpec(url, overrides = {}) {
  return {
    meta: { url, title: 'Test', timestamp: new Date().toISOString() },
    _crawlMeta: { url, depth: 0, crawledAt: new Date().toISOString() },
    animations: [],
    tokens: { durations: [], easings: [] },
    fingerprint: {
      feel: 'neutral',
      dominantPattern: null,
      dominantLibrary: 'css',
      animationCount: 0,
      reducedMotionSupport: true,
    },
    components: [],
    ...overrides,
  };
}

function anim(id, easing, duration) {
  return { id, easing, duration, reducedMotion: 'no-preference', pattern: 'fade', componentId: null };
}

// ── generateSiteConsistencyReport ─────────────────────────────────────────

describe('generateSiteConsistencyReport', () => {

  it('returns consistent verdict with no specs', () => {
    const report = generateSiteConsistencyReport([]);
    assert.equal(report.verdict, 'consistent');
    assert.equal(report.pageCount, 0);
  });

  it('returns consistent verdict for a single well-formed page', () => {
    const spec = makeSpec('https://example.com', {
      animations: [anim('a1', 'ease-out', 400), anim('a2', 'ease-out', 480)],
      fingerprint: { feel: 'smooth', reducedMotionSupport: true, dominantLibrary: 'css', animationCount: 2 },
    });
    const report = generateSiteConsistencyReport([spec]);
    assert.equal(report.pageCount, 1);
    assert.equal(report.easingAnalysis.dominantEasing, 'ease-out');
    assert.equal(report.reducedMotionCoverage.coveragePercent, 100);
  });

  it('easing analysis identifies dominant easing', () => {
    const specs = [
      makeSpec('https://a.com', { animations: [anim('a1', 'ease-out', 400), anim('a2', 'ease-out', 400)] }),
      makeSpec('https://b.com', { animations: [anim('b1', 'ease-out', 400), anim('b2', 'linear', 300)] }),
      makeSpec('https://c.com', { animations: [anim('c1', 'ease-out', 400)] }),
    ];
    const report = generateSiteConsistencyReport(specs);
    assert.equal(report.easingAnalysis.dominantEasing, 'ease-out');
  });

  it('easing analysis detects deviating pages', () => {
    const specs = [
      makeSpec('https://a.com', { animations: [anim('a1', 'ease-out', 400)] }),
      makeSpec('https://b.com', { animations: [anim('b1', 'ease-out', 400)] }),
      makeSpec('https://c.com', { animations: [anim('c1', 'linear', 400)] }), // deviates
    ];
    const report = generateSiteConsistencyReport(specs);
    assert.equal(report.easingAnalysis.deviatingCount, 1);
    assert.ok(report.easingAnalysis.deviatingPages.includes('https://c.com'));
  });

  it('duration analysis builds bucket distribution', () => {
    const specs = [
      makeSpec('https://a.com', { animations: [anim('a1', 'ease', 480), anim('a2', 'ease', 480)] }),
      makeSpec('https://b.com', { animations: [anim('b1', 'ease', 200)] }),
    ];
    const report = generateSiteConsistencyReport(specs);
    assert.equal(report.durationAnalysis.bucketDistribution.md, 2); // 480ms = md
    assert.equal(report.durationAnalysis.bucketDistribution.sm, 1); // 200ms = sm (200–400)
    assert.equal(report.durationAnalysis.dominantBucket, 'md');
  });

  it('reduced motion coverage tracks missing pages', () => {
    const specs = [
      makeSpec('https://a.com', { fingerprint: { reducedMotionSupport: true, feel: 'smooth', dominantLibrary: 'css', animationCount: 1 } }),
      makeSpec('https://b.com', { fingerprint: { reducedMotionSupport: false, feel: 'energetic', dominantLibrary: 'css', animationCount: 1 } }),
      makeSpec('https://c.com', { fingerprint: { reducedMotionSupport: false, feel: 'neutral', dominantLibrary: 'css', animationCount: 1 } }),
    ];
    const report = generateSiteConsistencyReport(specs);
    assert.equal(report.reducedMotionCoverage.supportedCount, 1);
    assert.equal(report.reducedMotionCoverage.missingCount, 2);
    assert.ok(report.reducedMotionCoverage.missingPages.includes('https://b.com'));
    assert.ok(report.reducedMotionCoverage.missingPages.includes('https://c.com'));
    assert.equal(report.reducedMotionCoverage.coveragePercent, 33);
  });

  it('component drift detected when same selector has different easings across pages', () => {
    const specs = [
      makeSpec('https://a.com', {
        animations: [{ id: 'hero-a', easing: 'ease-out', duration: 400, reducedMotion: 'no-preference', pattern: 'fade', componentId: 'hero' }],
        components: [{ id: 'hero', label: 'Hero', selector: '.hero', animationIds: ['hero-a'] }],
      }),
      makeSpec('https://b.com', {
        animations: [{ id: 'hero-b', easing: 'linear', duration: 400, reducedMotion: 'no-preference', pattern: 'fade', componentId: 'hero' }],
        components: [{ id: 'hero', label: 'Hero', selector: '.hero', animationIds: ['hero-b'] }],
      }),
    ];
    const report = generateSiteConsistencyReport(specs);
    assert.ok(report.componentDrift.length > 0);
    const drift = report.componentDrift.find(d => d.selector === '.hero');
    assert.ok(drift, 'Should have drift for .hero');
    assert.ok(drift.easingDrift);
  });

  it('no component drift when same selector has same animation timing', () => {
    const sharedComponent = { id: 'hero', label: 'Hero', selector: '.hero', animationIds: ['anim-1'] };
    const specs = [
      makeSpec('https://a.com', {
        animations: [{ id: 'anim-1', easing: 'ease-out', duration: 400, reducedMotion: 'no-preference', pattern: 'fade', componentId: 'hero' }],
        components: [sharedComponent],
      }),
      makeSpec('https://b.com', {
        animations: [{ id: 'anim-1', easing: 'ease-out', duration: 420, reducedMotion: 'no-preference', pattern: 'fade', componentId: 'hero' }],
        components: [sharedComponent],
      }),
    ];
    const report = generateSiteConsistencyReport(specs);
    const drift = report.componentDrift.find(d => d.selector === '.hero');
    assert.ok(!drift, 'Should have no drift for .hero with consistent motion');
  });

  it('verdict is consistent when no drift', () => {
    const specs = [
      makeSpec('https://a.com', { animations: [anim('a1', 'ease-out', 400)] }),
      makeSpec('https://b.com', { animations: [anim('b1', 'ease-out', 480)] }),
    ];
    const report = generateSiteConsistencyReport(specs);
    assert.equal(report.verdict, 'consistent');
  });

  it('verdict escalates to major-drift with many problems', () => {
    const specs = [
      makeSpec('https://a.com', {
        animations: [anim('a1', 'ease-out', 400)],
        fingerprint: { reducedMotionSupport: false, feel: 'neutral', dominantLibrary: 'css', animationCount: 1 },
      }),
      makeSpec('https://b.com', {
        animations: [anim('b1', 'linear', 1500)],
        fingerprint: { reducedMotionSupport: false, feel: 'heavy', dominantLibrary: 'css', animationCount: 1 },
      }),
      makeSpec('https://c.com', {
        animations: [anim('c1', 'ease-in', 2000)],
        fingerprint: { reducedMotionSupport: false, feel: 'slow', dominantLibrary: 'css', animationCount: 1 },
      }),
      makeSpec('https://d.com', {
        animations: [anim('d1', 'ease', 1800)],
        fingerprint: { reducedMotionSupport: false, feel: 'heavy', dominantLibrary: 'css', animationCount: 1 },
      }),
    ];
    const report = generateSiteConsistencyReport(specs);
    assert.ok(['moderate-drift', 'major-drift'].includes(report.verdict));
  });

  it('per-page scores are present and sorted', () => {
    const specs = [
      makeSpec('https://a.com', { fingerprint: { reducedMotionSupport: true, feel: 'smooth', dominantLibrary: 'css', animationCount: 5 } }),
      makeSpec('https://b.com', { fingerprint: { reducedMotionSupport: false, feel: 'neutral', dominantLibrary: 'css', animationCount: 2 } }),
    ];
    const report = generateSiteConsistencyReport(specs);
    assert.equal(report.perPageScores.length, 2);
    assert.ok(report.perPageScores.every(p => typeof p.url === 'string'));
  });

  it('report has generatedAt timestamp', () => {
    const report = generateSiteConsistencyReport([makeSpec('https://example.com')]);
    assert.ok(typeof report.generatedAt === 'string');
    assert.ok(report.generatedAt.includes('T'));
  });

  it('summary is a non-empty string', () => {
    const report = generateSiteConsistencyReport([makeSpec('https://example.com')]);
    assert.ok(typeof report.summary === 'string');
    assert.ok(report.summary.length > 0);
  });

});

// ── formatSiteReport ───────────────────────────────────────────────────────

describe('formatSiteReport', () => {

  it('returns a markdown string', () => {
    const report = generateSiteConsistencyReport([makeSpec('https://example.com')]);
    const md = formatSiteReport(report, 'https://example.com');
    assert.equal(typeof md, 'string');
    assert.match(md, /# Site Motion Consistency Report/);
  });

  it('includes verdict in output', () => {
    const specs = [makeSpec('https://a.com'), makeSpec('https://b.com')];
    const report = generateSiteConsistencyReport(specs);
    const md = formatSiteReport(report, 'https://a.com');
    assert.match(md, /Verdict/);
  });

  it('includes executive summary table', () => {
    const report = generateSiteConsistencyReport([makeSpec('https://example.com')]);
    const md = formatSiteReport(report, 'https://example.com');
    assert.match(md, /Executive Summary/);
    assert.match(md, /Pages crawled/);
    assert.match(md, /Reduced motion coverage/);
  });

  it('includes easing analysis section', () => {
    const spec = makeSpec('https://example.com', {
      animations: [anim('a1', 'ease-out', 400)],
    });
    const report = generateSiteConsistencyReport([spec]);
    const md = formatSiteReport(report, 'https://example.com');
    assert.match(md, /Easing Analysis/);
  });

  it('includes duration bucket table', () => {
    const report = generateSiteConsistencyReport([makeSpec('https://example.com')]);
    const md = formatSiteReport(report, 'https://example.com');
    assert.match(md, /Duration Analysis/);
    assert.match(md, /Bucket/);
  });

  it('includes reduced motion coverage section', () => {
    const spec = makeSpec('https://example.com', {
      fingerprint: { reducedMotionSupport: false, feel: 'neutral', dominantLibrary: 'css', animationCount: 0 },
    });
    const report = generateSiteConsistencyReport([spec]);
    const md = formatSiteReport(report, 'https://example.com');
    assert.match(md, /Reduced Motion Coverage/);
    assert.match(md, /missing/i);
  });

  it('includes per-page score table', () => {
    const report = generateSiteConsistencyReport([makeSpec('https://example.com')]);
    const md = formatSiteReport(report, 'https://example.com');
    assert.match(md, /Per-page Score Table/);
    assert.match(md, /example\.com/);
  });

  it('includes recommendations section', () => {
    const report = generateSiteConsistencyReport([makeSpec('https://example.com')]);
    const md = formatSiteReport(report, 'https://example.com');
    assert.match(md, /Recommendations/);
  });

  it('includes component drift section with drift details', () => {
    const specs = [
      makeSpec('https://a.com', {
        animations: [{ id: 'h1', easing: 'ease-out', duration: 400, reducedMotion: 'no-preference', pattern: 'fade', componentId: 'hero' }],
        components: [{ id: 'hero', label: 'Hero', selector: '.hero', animationIds: ['h1'] }],
      }),
      makeSpec('https://b.com', {
        animations: [{ id: 'h2', easing: 'linear', duration: 900, reducedMotion: 'no-preference', pattern: 'fade', componentId: 'hero' }],
        components: [{ id: 'hero', label: 'Hero', selector: '.hero', animationIds: ['h2'] }],
      }),
    ];
    const report = generateSiteConsistencyReport(specs);
    const md = formatSiteReport(report, 'https://a.com');
    assert.match(md, /Component Motion Drift/);
    assert.match(md, /\.hero/);
  });

  it('ends with motionlang attribution line', () => {
    const report = generateSiteConsistencyReport([makeSpec('https://example.com')]);
    const md = formatSiteReport(report, 'https://example.com');
    assert.match(md, /motionlang --crawl-site/);
  });

});