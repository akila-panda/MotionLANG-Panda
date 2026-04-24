// Component boundary detection.
// Takes rawData from crawler.js (which now includes rawData.domStructure)
// and groups DOM elements into named component regions using five heuristics.
// Returns a components[] array. Each component has id, label, selector,
// elementCount, top, height, animationIds (filled later), dominantPattern,
// and feel (both filled later by index.js).
// src/segmenter.js

// ── Heuristic 1: Semantic landmarks ─────────────────────────────────────────
// HTML5 landmark elements define clear section boundaries.
// Priority: highest — these are explicit semantic signals.
function fromSemanticLandmarks(domStructure) {
  const { landmarks = [] } = domStructure;
  const components = [];

  for (const el of landmarks) {
    // Skip tiny landmarks (likely nested or decorative)
    if (el.height < 50 || el.width < 100) continue;

    const label = labelFromElement(el);
    const selector = selectorFor(el);

    components.push({
      id:      slugify(label),
      label,
      selector,
      top:     el.top,
      height:  el.height,
      source:  'semantic-landmark',
      confidence: 0.9,
    });
  }

  return components;
}

// ── Heuristic 2: Heading anchors ─────────────────────────────────────────────
// h1/h2 elements define section starts. Content until the next heading
// belongs to that section. Creates components from heading spans.
function fromHeadingAnchors(domStructure) {
  const { headings = [], pageHeight = 0 } = domStructure;
  if (headings.length === 0) return [];

  // Sort by top position
  const sorted = [...headings].sort((a, b) => a.top - b.top);
  const components = [];

  for (let i = 0; i < sorted.length; i++) {
    const h = sorted[i];
    const nextTop = sorted[i + 1]?.top ?? pageHeight;
    const height = nextTop - h.top;

    // Skip headings that are likely in a list or table of contents
    if (height < 50) continue;

    const label = h.text
      ? titleCase(h.text.slice(0, 40))
      : `${h.tag.toUpperCase()} Section`;

    const selector = h.id
      ? `#${h.id}`
      : h.classes
        ? `.${h.classes.split(' ')[0]}`
        : h.tag;

    components.push({
      id:      slugify(label),
      label,
      selector,
      top:     h.top,
      height,
      source:  'heading-anchor',
      confidence: 0.65,
    });
  }

  return components;
}

// ── Heuristic 3: Viewport-sized blocks ───────────────────────────────────────
// Elements whose height >= 80% viewport height are standalone full-screen
// sections. Catches hero divs, full-screen landing sections, etc.
function fromViewportSizedBlocks(domStructure) {
  const { landmarks = [], namedBlocks = [] } = domStructure;
  const components = [];
  const allBlocks = [...landmarks, ...namedBlocks];

  for (const el of allBlocks) {
    if (!el.isViewportSized) continue;

    const label = labelFromElement(el);
    const selector = selectorFor(el);

    components.push({
      id:      slugify(label),
      label,
      selector,
      top:     el.top,
      height:  el.height,
      source:  'viewport-block',
      confidence: 0.8,
    });
  }

  return components;
}

// ── Heuristic 4: Class/ID name patterns ──────────────────────────────────────
// Elements whose class/id contains recognised component keywords.
// The crawler already filtered these into namedBlocks.
function fromNamedBlocks(domStructure) {
  const { namedBlocks = [] } = domStructure;
  const components = [];

  for (const el of namedBlocks) {
    const kw = el.matchedKeywords[0];
    const label = labelFromElement(el) || titleCase(kw);
    const selector = selectorFor(el);

    components.push({
      id:      slugify(label),
      label,
      selector,
      top:     el.top,
      height:  el.height,
      source:  'named-block',
      confidence: 0.75,
    });
  }

  return components;
}

// ── Heuristic 5: Repeated DOM patterns ────────────────────────────────────────
// Arrays of 3+ similar sibling elements are grouped as a single component
// (card grid, testimonial list, pricing table, etc.)
function fromRepeatedPatterns(domStructure) {
  const { repeatedPatterns = [] } = domStructure;
  const components = [];

  for (const rp of repeatedPatterns) {
    if (rp.count < 3) continue;
    // Skip trivial containers (li inside ul is expected everywhere)
    if (rp.parentTag === 'ul' && rp.childTag === 'li' && rp.count > 20) continue;

    const kwMatch = componentKeywordFromClasses(rp.parentClasses, rp.parentId || '');
    const label = kwMatch
      ? `${titleCase(kwMatch)} (${rp.count}× ${rp.childTag})`
      : `Repeated ${titleCase(rp.childTag)}s (${rp.count})`;

    const selector = rp.parentId
      ? `#${rp.parentId}`
      : rp.parentClasses
        ? `.${rp.parentClasses.split(' ')[0]}`
        : rp.parentTag;

    components.push({
      id:      slugify(label),
      label,
      selector,
      top:     rp.top,
      height:  rp.height,
      source:  'repeated-pattern',
      confidence: 0.7,
    });
  }

  return components;
}

// ── Main segmentation function ────────────────────────────────────────────────
export function segmentPage(domStructure) {
  if (!domStructure) return [];

  // Run all 5 heuristics
  const candidates = [
    ...fromSemanticLandmarks(domStructure),
    ...fromViewportSizedBlocks(domStructure),
    ...fromNamedBlocks(domStructure),
    ...fromHeadingAnchors(domStructure),
    ...fromRepeatedPatterns(domStructure),
  ];

  // Sort by top position
  candidates.sort((a, b) => a.top - b.top);

  // Deduplicate: merge components that cover the same DOM region.
  // Two candidates are considered duplicates if their top positions are
  // within MERGE_THRESHOLD px AND they share significant height overlap.
  const MERGE_THRESHOLD = 120;
  const merged = [];

  for (const candidate of candidates) {
    const overlap = merged.find(existing => {
      const topDiff = Math.abs(existing.top - candidate.top);
      return topDiff <= MERGE_THRESHOLD;
    });

    if (overlap) {
      // Keep the higher-confidence one; merge label if it adds info
      if (candidate.confidence > overlap.confidence) {
        overlap.id         = candidate.id;
        overlap.label      = candidate.label;
        overlap.selector   = candidate.selector;
        overlap.confidence = candidate.confidence;
        overlap.source     = candidate.source;
      }
    } else {
      merged.push({ ...candidate });
    }
  }

  // Ensure unique IDs (append suffix if collision)
  const idCounts = {};
  for (const c of merged) {
    idCounts[c.id] = (idCounts[c.id] || 0) + 1;
  }
  const idSeen = {};
  for (const c of merged) {
    if (idCounts[c.id] > 1) {
      idSeen[c.id] = (idSeen[c.id] || 0) + 1;
      c.id = `${c.id}-${idSeen[c.id]}`;
    }
  }

  // Build final components — animationIds/dominantPattern/feel filled by index.js
  return merged.map((c, i) => ({
    id:              c.id || `component-${i + 1}`,
    label:           c.label || `Component ${i + 1}`,
    selector:        c.selector || '',
    top:             c.top,
    height:          c.height,
    source:          c.source,
    confidence:      c.confidence,
    animationIds:    [],
    dominantPattern: null,
    feel:            null,
  }));
}

// ── Attach componentId to animations ─────────────────────────────────────────
// Assigns the nearest component to each animation based on the animation's
// element selector. Falls back to proximity (top position).
// Called by index.js after segmentation.
export function attachComponentIds(animations, components) {
  if (!components || components.length === 0) {
    for (const anim of animations) anim.componentId = null;
    return;
  }

  for (const anim of animations) {
    // Try to match by element selector
    const matched = findComponentForAnimation(anim, components);
    anim.componentId = matched ? matched.id : null;
    if (matched) matched.animationIds.push(anim.id);
  }

  // Fill dominantPattern and feel per component
  for (const comp of components) {
    const compAnims = animations.filter(a => a.componentId === comp.id);
    if (compAnims.length === 0) continue;

    const patternCounts = {};
    for (const a of compAnims) {
      patternCounts[a.pattern] = (patternCounts[a.pattern] || 0) + 1;
    }
    comp.dominantPattern = Object.entries(patternCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    // Simple feel from easing names
    const easingNames = compAnims.map(a => a.easingName).filter(Boolean);
    comp.feel = easingNames.length > 0 ? deriveFeel(easingNames) : 'unknown';
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function findComponentForAnimation(anim, components) {
  // Try element selector match first
  const selector = anim.element || anim.selector || extractSelector(anim);
  if (selector) {
    for (const comp of components) {
      if (comp.selector && selectorOverlaps(selector, comp.selector)) {
        return comp;
      }
    }
  }

  // Fallback: no position data available — assign to largest component
  if (components.length > 0) {
    return components.reduce((best, c) =>
      c.animationIds.length <= best.animationIds.length ? c : best,
      components[0]
    );
  }

  return null;
}

function extractSelector(anim) {
  if (anim.targets && anim.targets.length > 0) {
    const t = anim.targets[0];
    if (t.id) return `#${t.id}`;
    if (t.classes) return `.${t.classes.split(' ')[0]}`;
  }
  if (anim.keyframe?.name) return `[data-keyframe="${anim.keyframe.name}"]`;
  return null;
}

function selectorOverlaps(animSelector, compSelector) {
  // Simple string-based check: does the animation selector relate to the component?
  const a = animSelector.toLowerCase();
  const c = compSelector.toLowerCase().replace(/[#.]/g, '');
  return a.includes(c) || c.includes(a.replace(/[#.]/g, ''));
}

const COMPONENT_KEYWORDS = [
  'hero', 'feature', 'pricing', 'cta', 'card', 'testimonial',
  'footer', 'nav', 'banner', 'showcase', 'team', 'about',
  'contact', 'faq', 'gallery', 'services', 'stats', 'clients',
  'learn', 'benefits', 'intro',
];

function componentKeywordFromClasses(classes = '', id = '') {
  const str = `${classes} ${id}`.toLowerCase();
  return COMPONENT_KEYWORDS.find(kw => str.includes(kw)) || null;
}

function labelFromElement(el) {
  // Priority: aria-label > id > first meaningful class > tag
  if (el.ariaLabel) return titleCase(el.ariaLabel);
  if (el.id) return titleCase(el.id.replace(/[-_]/g, ' '));

  const kw = componentKeywordFromClasses(el.classes || '', el.id || '');
  if (kw) return titleCase(kw);

  const firstClass = (el.classes || '').split(' ').find(c => c.length > 2);
  if (firstClass) return titleCase(firstClass.replace(/[-_]/g, ' '));

  return titleCase(el.tag || 'section');
}

function selectorFor(el) {
  if (el.id) return `#${el.id}`;
  const firstClass = (el.classes || '').split(' ').find(c => c.length > 2);
  if (firstClass) return `${el.tag || 'div'}.${firstClass}`;
  return el.tag || 'section';
}

function titleCase(str) {
  return String(str)
    .trim()
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function slugify(str) {
  return String(str)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function deriveFeel(easingNames) {
  const counts = {};
  for (const e of easingNames) counts[e] = (counts[e] || 0) + 1;
  const total = easingNames.length;
  const spring   = ((counts['spring-like'] || 0) + (counts['spring-overshoot'] || 0) + (counts['spring-bouncy'] || 0)) / total;
  const smooth   = ((counts['expressive-decelerate'] || 0) + (counts['smooth-decelerate'] || 0) + (counts['expo-out'] || 0)) / total;
  const snappy   = ((counts['snappy'] || 0) + (counts['ease-in-custom'] || 0)) / total;
  const mechanic = ((counts['linear'] || 0) + (counts['ease-in-out'] || 0)) / total;
  if (spring   > 0.4) return 'springy';
  if (smooth   > 0.4) return 'smooth';
  if (snappy   > 0.3) return 'snappy';
  if (mechanic > 0.4) return 'mechanical';
  return 'mixed';
}