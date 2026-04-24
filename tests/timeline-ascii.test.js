import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { timelineAscii, detectStaggerInterval, shouldRenderTimeline } from '../src/utils/timeline-ascii.js';

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeAnim(id, duration, delay = 0) {
  return { id, duration, delay, pattern: 'fade-in', reducedMotion: 'missing', confidence: 0.9 };
}

// ── detectStaggerInterval ───────────────────────────────────────────────────

describe('detectStaggerInterval', () => {
  it('returns null for a single animation', () => {
    assert.equal(detectStaggerInterval([makeAnim('a', 400, 0)]), null);
  });

  it('returns null when all delays are zero', () => {
    const items = [makeAnim('a', 400, 0), makeAnim('b', 400, 0)];
    assert.equal(detectStaggerInterval(items), null);
  });

  it('detects a consistent 120ms stagger interval', () => {
    const items = [
      makeAnim('a', 400, 0),
      makeAnim('b', 400, 120),
      makeAnim('c', 400, 240),
      makeAnim('d', 400, 360),
    ];
    assert.equal(detectStaggerInterval(items), 120);
  });

  it('detects consistent interval even when items are unsorted', () => {
    const items = [
      makeAnim('c', 400, 240),
      makeAnim('a', 400, 0),
      makeAnim('b', 400, 120),
    ];
    assert.equal(detectStaggerInterval(items), 120);
  });

  it('returns null when gap variance > 30ms', () => {
    const items = [
      makeAnim('a', 400, 0),
      makeAnim('b', 400, 50),
      makeAnim('c', 400, 300),
    ];
    assert.equal(detectStaggerInterval(items), null);
  });

  it('rounds averaged interval', () => {
    // gaps: 99, 101, 100 → average 100 → rounded 100
    const items = [
      makeAnim('a', 400, 0),
      makeAnim('b', 400, 99),
      makeAnim('c', 400, 200),
      makeAnim('d', 400, 300),
    ];
    assert.equal(detectStaggerInterval(items), 100);
  });
});

// ── shouldRenderTimeline ────────────────────────────────────────────────────

describe('shouldRenderTimeline', () => {
  it('returns false for empty array', () => {
    assert.equal(shouldRenderTimeline([]), false);
  });

  it('returns false for single animation', () => {
    assert.equal(shouldRenderTimeline([makeAnim('a', 400)]), false);
  });

  it('returns false when 2+ anims but no delays', () => {
    const items = [makeAnim('a', 400, 0), makeAnim('b', 400, 0)];
    assert.equal(shouldRenderTimeline(items), false);
  });

  it('returns true when 2+ anims and at least one has delay > 0', () => {
    const items = [makeAnim('a', 400, 0), makeAnim('b', 400, 120)];
    assert.equal(shouldRenderTimeline(items), true);
  });

  it('returns false for null input', () => {
    assert.equal(shouldRenderTimeline(null), false);
  });
});

// ── timelineAscii ───────────────────────────────────────────────────────────

describe('timelineAscii', () => {
  it('returns empty string for empty array', () => {
    assert.equal(timelineAscii([]), '');
  });

  it('returns empty string for animations without duration', () => {
    assert.equal(timelineAscii([{ id: 'a', duration: null }]), '');
  });

  it('returns a non-empty string for valid animations', () => {
    const items = [
      makeAnim('slide-up-001', 640, 0),
      makeAnim('fade-in-002', 480, 120),
    ];
    const result = timelineAscii(items);
    assert.ok(result.length > 0);
    assert.ok(result.includes('```'));
  });

  it('includes animation IDs in output', () => {
    const items = [
      makeAnim('hero-slide-001', 640, 0),
      makeAnim('hero-fade-002', 480, 120),
    ];
    const result = timelineAscii(items);
    assert.ok(result.includes('hero-slide-001'));
    assert.ok(result.includes('hero-fade-002'));
  });

  it('includes title when provided', () => {
    const items = [makeAnim('a', 400, 0), makeAnim('b', 400, 100)];
    const result = timelineAscii(items, { title: 'My Section' });
    assert.ok(result.includes('My Section'));
  });

  it('shows total duration in footer', () => {
    const items = [
      makeAnim('a', 640, 0),
      makeAnim('b', 480, 240),
    ];
    const result = timelineAscii(items);
    // total = 240 + 480 = 720ms
    assert.ok(result.includes('720ms'));
  });

  it('shows stagger interval when consistent', () => {
    const items = [
      makeAnim('a', 400, 0),
      makeAnim('b', 400, 120),
      makeAnim('c', 400, 240),
    ];
    const result = timelineAscii(items);
    assert.ok(result.includes('120ms'));
  });

  it('bar for delayed animation starts after pre-fill chars', () => {
    const items = [
      makeAnim('first',  400, 0),
      makeAnim('second', 400, 400),
    ];
    const result = timelineAscii(items);
    // second item should have ░ chars before the █ chars
    const lines = result.split('\n');
    const secondLine = lines.find(l => l.includes('second'));
    assert.ok(secondLine, 'should have a line for second anim');
    // should have pre-fill then bar
    assert.ok(secondLine.includes('░') && secondLine.includes('█'));
  });

  it('includes easing in footer when provided', () => {
    const items = [makeAnim('a', 400, 0), makeAnim('b', 400, 100)];
    const result = timelineAscii(items, { easing: 'expressive-decelerate' });
    assert.ok(result.includes('expressive-decelerate'));
  });

  it('handles single animation gracefully (no crash)', () => {
    const items = [makeAnim('solo', 400, 0)];
    const result = timelineAscii(items);
    // should return something (single bar, no stagger footer)
    assert.ok(typeof result === 'string');
  });
});