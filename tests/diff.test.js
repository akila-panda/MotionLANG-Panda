import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { diffSpecs, isDriftExceeded, formatDiffMarkdown, loadSpec } from '../src/diff.js';
import { annotateSpec, getAnnotations, removeAnnotation, formatAnnotationsTerminal } from '../src/utils/annotate.js';
import { tagSpec, getVersionHistory, listAllVersions, formatVersionsTerminal } from '../src/utils/version.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_SPEC = {
  meta: { url: 'https://example.com', timestamp: Date.now() },
  fingerprint: {
    feel: 'smooth',
    dominantPattern: 'fade-in',
    dominantLibrary: 'css',
    reducedMotionSupport: true,
    animationCount: 3,
  },
  animations: [
    { id: 'anim-001', pattern: 'fade-in', element: '.hero', duration: 480, delay: 0, easing: 'ease-out', componentId: 'hero' },
    { id: 'anim-002', pattern: 'slide-up', element: '.nav', duration: 300, delay: 120, easing: 'ease-out', componentId: 'nav' },
    { id: 'anim-003', pattern: 'fade-in', element: '.cta', duration: 480, delay: 0, easing: 'ease-out', componentId: 'hero' },
  ],
  components: [
    { id: 'hero', label: 'Hero Section', animationIds: ['anim-001', 'anim-003'], dominantPattern: 'fade-in' },
    { id: 'nav',  label: 'Navigation',  animationIds: ['anim-002'], dominantPattern: 'slide-up' },
  ],
  tokens: {
    durations: [{ name: 'duration-md', value: '480ms' }, { name: 'duration-sm', value: '300ms' }],
    easings:   [{ name: 'easing-ease-out', value: 'ease-out' }],
  },
};

const IDENTICAL_SPEC = JSON.parse(JSON.stringify(BASE_SPEC));

const MINOR_CHANGE_SPEC = JSON.parse(JSON.stringify(BASE_SPEC));
MINOR_CHANGE_SPEC.animations[0].duration = 500; // one param change

const MAJOR_CHANGE_SPEC = JSON.parse(JSON.stringify(BASE_SPEC));
MAJOR_CHANGE_SPEC.fingerprint.feel = 'snappy';
MAJOR_CHANGE_SPEC.fingerprint.dominantPattern = 'slide-up';
MAJOR_CHANGE_SPEC.animations = [
  { id: 'anim-004', pattern: 'scale', element: '.new', duration: 200, delay: 0, easing: 'ease-in', componentId: null },
  { id: 'anim-005', pattern: 'slide-up', element: '.nav', duration: 400, delay: 0, easing: 'ease-in', componentId: 'nav' },
  { id: 'anim-006', pattern: 'scroll-linked', element: '.hero', duration: 0, delay: 0, easing: 'linear', componentId: 'hero' },
  { id: 'anim-007', pattern: 'fade-in', element: '.footer', duration: 600, delay: 0, easing: 'ease-out', componentId: null },
  { id: 'anim-008', pattern: 'parallax', element: '.bg', duration: 0, delay: 0, easing: 'linear', componentId: null },
  { id: 'anim-009', pattern: 'stagger', element: '.cards', duration: 480, delay: 120, easing: 'ease-out', componentId: null },
];
MAJOR_CHANGE_SPEC.tokens.durations.push({ name: 'duration-xs', value: '100ms' });

// ── diffSpecs ─────────────────────────────────────────────────────────────────

describe('diffSpecs — identical specs', () => {
  it('returns verdict identical', () => {
    const diff = diffSpecs(BASE_SPEC, IDENTICAL_SPEC);
    assert.equal(diff.verdict, 'identical');
  });
  it('totalDelta is 0', () => {
    const diff = diffSpecs(BASE_SPEC, IDENTICAL_SPEC);
    assert.equal(diff.totalDelta, 0);
  });
  it('no additions or removals', () => {
    const diff = diffSpecs(BASE_SPEC, IDENTICAL_SPEC);
    assert.equal(diff.additions.length, 0);
    assert.equal(diff.removals.length, 0);
  });
  it('no token changes', () => {
    const diff = diffSpecs(BASE_SPEC, IDENTICAL_SPEC);
    const tc = diff.tokenChanges;
    assert.equal(tc.added.length + tc.removed.length + tc.changed.length, 0);
  });
});

describe('diffSpecs — minor change (one param)', () => {
  it('returns verdict minor-drift or moderate-drift', () => {
    const diff = diffSpecs(BASE_SPEC, MINOR_CHANGE_SPEC);
    assert.ok(['minor-drift', 'moderate-drift'].includes(diff.verdict));
  });
  it('detects duration change on anim-001', () => {
    const diff = diffSpecs(BASE_SPEC, MINOR_CHANGE_SPEC);
    const changed = diff.changes.find(c => c.id === 'anim-001');
    assert.ok(changed, 'anim-001 should be in changes');
    const durationChange = changed.paramChanges.find(p => p.param === 'duration');
    assert.ok(durationChange, 'should have duration paramChange');
    assert.equal(durationChange.from, 480);
    assert.equal(durationChange.to, 500);
  });
});

describe('diffSpecs — major change', () => {
  it('returns verdict major-drift', () => {
    const diff = diffSpecs(BASE_SPEC, MAJOR_CHANGE_SPEC);
    assert.equal(diff.verdict, 'major-drift');
  });
  it('detects all original animations as removed', () => {
    const diff = diffSpecs(BASE_SPEC, MAJOR_CHANGE_SPEC);
    const removedIds = diff.removals.map(r => r.id);
    assert.ok(removedIds.includes('anim-001'));
    assert.ok(removedIds.includes('anim-002'));
    assert.ok(removedIds.includes('anim-003'));
  });
  it('detects new animations as added', () => {
    const diff = diffSpecs(BASE_SPEC, MAJOR_CHANGE_SPEC);
    const addedIds = diff.additions.map(a => a.id);
    assert.ok(addedIds.includes('anim-004'));
    assert.ok(addedIds.includes('anim-005'));
  });
  it('detects fingerprint change', () => {
    const diff = diffSpecs(BASE_SPEC, MAJOR_CHANGE_SPEC);
    const feelChange = diff.fingerprintChanges.find(c => c.property === 'feel');
    assert.ok(feelChange);
    assert.equal(feelChange.from, 'smooth');
    assert.equal(feelChange.to, 'snappy');
  });
  it('detects new token added', () => {
    const diff = diffSpecs(BASE_SPEC, MAJOR_CHANGE_SPEC);
    const added = diff.tokenChanges.added.find(t => t.name === 'duration-xs');
    assert.ok(added);
  });
  it('totalDelta is > 8', () => {
    const diff = diffSpecs(BASE_SPEC, MAJOR_CHANGE_SPEC);
    assert.ok(diff.totalDelta > 8);
  });
});

describe('diffSpecs — component changes', () => {
  it('detects removed component', () => {
    const specB = JSON.parse(JSON.stringify(BASE_SPEC));
    specB.components = [specB.components[0]]; // remove 'nav'
    const diff = diffSpecs(BASE_SPEC, specB);
    const navRemoved = diff.componentChanges.find(c => c.id === 'nav' && c.change === 'removed');
    assert.ok(navRemoved);
  });
  it('detects added component', () => {
    const specB = JSON.parse(JSON.stringify(BASE_SPEC));
    specB.components.push({ id: 'footer', label: 'Footer', animationIds: [], dominantPattern: 'fade-in' });
    const diff = diffSpecs(BASE_SPEC, specB);
    const footerAdded = diff.componentChanges.find(c => c.id === 'footer' && c.change === 'added');
    assert.ok(footerAdded);
  });
  it('detects animation count change in component', () => {
    const specB = JSON.parse(JSON.stringify(BASE_SPEC));
    specB.components[0].animationIds = ['anim-001']; // was 2, now 1
    const diff = diffSpecs(BASE_SPEC, specB);
    const heroChange = diff.componentChanges.find(c => c.id === 'hero' && c.change === 'animation-count-changed');
    assert.ok(heroChange);
    assert.equal(heroChange.from, 2);
    assert.equal(heroChange.to, 1);
  });
});

describe('diffSpecs — handles missing/empty arrays', () => {
  it('handles specs with no components array', () => {
    const specA = { ...BASE_SPEC, components: undefined };
    const specB = { ...BASE_SPEC, components: undefined };
    assert.doesNotThrow(() => diffSpecs(specA, specB));
  });
  it('handles specs with empty animations', () => {
    const specA = { ...BASE_SPEC, animations: [] };
    const specB = { ...BASE_SPEC, animations: [] };
    const diff = diffSpecs(specA, specB);
    assert.equal(diff.additions.length, 0);
    assert.equal(diff.removals.length, 0);
  });
});

// ── isDriftExceeded ──────────────────────────────────────────────────────────

describe('isDriftExceeded', () => {
  it('major-drift exceeds moderate-drift threshold', () => {
    assert.equal(isDriftExceeded('major-drift', 'moderate-drift'), true);
  });
  it('major-drift exceeds minor-drift threshold', () => {
    assert.equal(isDriftExceeded('major-drift', 'minor-drift'), true);
  });
  it('moderate-drift does not exceed major-drift threshold', () => {
    assert.equal(isDriftExceeded('moderate-drift', 'major-drift'), false);
  });
  it('identical does not exceed any threshold', () => {
    assert.equal(isDriftExceeded('identical', 'minor-drift'), false);
  });
  it('minor-drift exceeds identical threshold', () => {
    assert.equal(isDriftExceeded('minor-drift', 'identical'), true);
  });
});

// ── formatDiffMarkdown ────────────────────────────────────────────────────────

describe('formatDiffMarkdown', () => {
  it('produces a string', () => {
    const diff = diffSpecs(BASE_SPEC, MINOR_CHANGE_SPEC);
    const md = formatDiffMarkdown(diff);
    assert.equal(typeof md, 'string');
  });
  it('contains verdict in output', () => {
    const diff = diffSpecs(BASE_SPEC, MAJOR_CHANGE_SPEC);
    const md = formatDiffMarkdown(diff);
    assert.ok(md.includes('major-drift'));
  });
  it('contains identical verdict for identical specs', () => {
    const diff = diffSpecs(BASE_SPEC, IDENTICAL_SPEC);
    const md = formatDiffMarkdown(diff);
    assert.ok(md.includes('identical'));
  });
  it('contains Motion Spec Diff Report header', () => {
    const diff = diffSpecs(BASE_SPEC, IDENTICAL_SPEC);
    const md = formatDiffMarkdown(diff);
    assert.ok(md.includes('Motion Spec Diff Report'));
  });
});

// ── annotate.js ───────────────────────────────────────────────────────────────

let tmpSpecPath;
let tmpDir;

describe('annotateSpec', () => {
  before(() => {
    tmpDir = join(tmpdir(), `motionlang-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    tmpSpecPath = join(tmpDir, 'test-motion-spec.json');
    writeFileSync(tmpSpecPath, JSON.stringify(BASE_SPEC, null, 2), 'utf8');
  });

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('adds an annotation to the spec', () => {
    annotateSpec(tmpSpecPath, {
      'anim-001': { note: 'approved by client', author: 'Alice' },
    });
    const annotations = getAnnotations(tmpSpecPath);
    assert.ok(annotations['anim-001']);
    assert.equal(annotations['anim-001'].note, 'approved by client');
    assert.equal(annotations['anim-001'].author, 'Alice');
  });

  it('adds date automatically', () => {
    const annotations = getAnnotations(tmpSpecPath);
    assert.ok(annotations['anim-001'].date);
  });

  it('adds a second annotation without removing the first', () => {
    annotateSpec(tmpSpecPath, {
      'anim-002': { note: 'needs review', author: 'Bob' },
    });
    const annotations = getAnnotations(tmpSpecPath);
    assert.ok(annotations['anim-001']);
    assert.ok(annotations['anim-002']);
  });

  it('overwrites the note on re-annotation of same ID', () => {
    annotateSpec(tmpSpecPath, {
      'anim-001': { note: 'updated note', author: 'Alice' },
    });
    const annotations = getAnnotations(tmpSpecPath);
    assert.equal(annotations['anim-001'].note, 'updated note');
  });

  it('removes annotation correctly', () => {
    removeAnnotation(tmpSpecPath, 'anim-002');
    const annotations = getAnnotations(tmpSpecPath);
    assert.equal(annotations['anim-002'], undefined);
  });

  it('returns empty object if no annotations exist', () => {
    const freshPath = join(tmpDir, 'fresh-spec.json');
    writeFileSync(freshPath, JSON.stringify(BASE_SPEC, null, 2), 'utf8');
    const annotations = getAnnotations(freshPath);
    assert.deepEqual(annotations, {});
  });

  it('formatAnnotationsTerminal returns (no annotations) for empty', () => {
    const out = formatAnnotationsTerminal({});
    assert.ok(out.includes('no annotations'));
  });

  it('formatAnnotationsTerminal includes note text', () => {
    const annotations = { 'anim-001': { note: 'test note', author: 'Alice', date: new Date().toISOString() } };
    const out = formatAnnotationsTerminal(annotations);
    assert.ok(out.includes('test note'));
    assert.ok(out.includes('anim-001'));
  });
});

// ── version.js ────────────────────────────────────────────────────────────────

describe('tagSpec and getVersionHistory', () => {
  let vTmpDir;
  let vSpecPath;

  before(() => {
    vTmpDir = join(tmpdir(), `motionlang-version-test-${Date.now()}`);
    mkdirSync(vTmpDir, { recursive: true });
    vSpecPath = join(vTmpDir, 'versioned-motion-spec.json');
    writeFileSync(vSpecPath, JSON.stringify(BASE_SPEC, null, 2), 'utf8');
  });

  after(() => {
    rmSync(vTmpDir, { recursive: true, force: true });
  });

  it('tags a spec with a version string', () => {
    tagSpec(vSpecPath, 'v1.0', 'Initial release');
    const history = getVersionHistory(vSpecPath);
    assert.equal(history.length, 1);
    assert.equal(history[0].version, 'v1.0');
    assert.equal(history[0].note, 'Initial release');
  });

  it('adds taggedAt date automatically', () => {
    const history = getVersionHistory(vSpecPath);
    assert.ok(history[0].taggedAt);
  });

  it('appends a second version tag', () => {
    tagSpec(vSpecPath, 'v1.1', 'Post-rebrand');
    const history = getVersionHistory(vSpecPath);
    assert.equal(history.length, 2);
    assert.equal(history[1].version, 'v1.1');
  });

  it('updates an existing version tag (no duplicates)', () => {
    tagSpec(vSpecPath, 'v1.1', 'Updated note');
    const history = getVersionHistory(vSpecPath);
    const v11s = history.filter(v => v.version === 'v1.1');
    assert.equal(v11s.length, 1);
    assert.equal(v11s[0].note, 'Updated note');
  });

  it('returns empty array if no versions exist', () => {
    const freshPath = join(vTmpDir, 'fresh-motion-spec.json');
    writeFileSync(freshPath, JSON.stringify(BASE_SPEC, null, 2), 'utf8');
    const history = getVersionHistory(freshPath);
    assert.deepEqual(history, []);
  });

  it('listAllVersions scans directory', () => {
    const all = listAllVersions(vTmpDir);
    assert.ok(all.length >= 2); // v1.0 and v1.1
    assert.ok(all.some(v => v.version === 'v1.0'));
    assert.ok(all.some(v => v.version === 'v1.1'));
  });

  it('listAllVersions sorts newest first', () => {
    const all = listAllVersions(vTmpDir);
    for (let i = 1; i < all.length; i++) {
      assert.ok(new Date(all[i - 1].taggedAt) >= new Date(all[i].taggedAt));
    }
  });

  it('listAllVersions returns empty for dir with no spec files', () => {
    const emptyDir = join(vTmpDir, 'empty');
    mkdirSync(emptyDir, { recursive: true });
    const all = listAllVersions(emptyDir);
    assert.deepEqual(all, []);
  });

  it('formatVersionsTerminal returns (no version tags) for empty', () => {
    const out = formatVersionsTerminal([]);
    assert.ok(out.includes('no version tags'));
  });

  it('formatVersionsTerminal includes version string', () => {
    const versions = [{ version: 'v2.0', url: 'https://example.com', note: 'big update', taggedAt: new Date().toISOString() }];
    const out = formatVersionsTerminal(versions);
    assert.ok(out.includes('v2.0'));
    assert.ok(out.includes('big update'));
  });
});

// ── loadSpec ─────────────────────────────────────────────────────────────────

describe('loadSpec', () => {
  it('throws a readable error for missing file', () => {
    assert.throws(
      () => loadSpec('/nonexistent/path/spec.json'),
      (err) => err.message.includes('Cannot load spec')
    );
  });
});