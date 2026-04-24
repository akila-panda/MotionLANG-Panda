// Site consistency report generator.
// Takes an array of motionSpecs from a site crawl and produces a
// cross-page consistency analysis with drift detection.
// src/site-consistency.js

/**
 * Generate a site consistency report from an array of motionSpecs.
 *
 * @param {object[]} motionSpecs - Array of motionSpec objects from crawlSite()
 * @returns {SiteConsistencyReport}
 *
 * @typedef {{
 *   verdict: 'consistent'|'minor-drift'|'moderate-drift'|'major-drift',
 *   pageCount: number,
 *   easingAnalysis: object,
 *   durationAnalysis: object,
 *   reducedMotionCoverage: object,
 *   componentDrift: object[],
 *   perPageScores: object[],
 *   summary: string,
 *   generatedAt: string
 * }} SiteConsistencyReport
 */
export function generateSiteConsistencyReport(motionSpecs) {
  if (!motionSpecs || motionSpecs.length === 0) {
    return {
      verdict: 'consistent',
      pageCount: 0,
      easingAnalysis: { uniqueEasings: [], dominantEasing: null, deviatingPages: [] },
      durationAnalysis: { bucketDistribution: {}, deviatingPages: [] },
      reducedMotionCoverage: { supportedCount: 0, missingCount: 0, missingPages: [], coveragePercent: 100 },
      componentDrift: [],
      perPageScores: [],
      summary: 'No pages crawled.',
      generatedAt: new Date().toISOString(),
    };
  }

  const easingAnalysis    = analyseEasings(motionSpecs);
  const durationAnalysis  = analyseDurations(motionSpecs);
  const reducedMotion     = analyseReducedMotion(motionSpecs);
  const componentDrift    = detectComponentDrift(motionSpecs);
  const perPageScores     = scorePages(motionSpecs);
  const verdict           = computeVerdict(easingAnalysis, durationAnalysis, reducedMotion, componentDrift);

  return {
    verdict,
    pageCount: motionSpecs.length,
    easingAnalysis,
    durationAnalysis,
    reducedMotionCoverage: reducedMotion,
    componentDrift,
    perPageScores,
    summary: buildSummary(verdict, motionSpecs.length, easingAnalysis, durationAnalysis, reducedMotion, componentDrift),
    generatedAt: new Date().toISOString(),
  };
}

// ── Easing analysis ────────────────────────────────────────────────────────

function analyseEasings(specs) {
  const siteWideEasings = {};
  const perPage = [];

  for (const spec of specs) {
    const url = spec.meta?.url || spec._crawlMeta?.url || 'unknown';
    const easings = (spec.animations || []).map(a => a.easing).filter(Boolean);
    const pageEasingSet = new Set(easings);

    for (const e of easings) {
      siteWideEasings[e] = (siteWideEasings[e] || 0) + 1;
    }
    perPage.push({ url, uniqueEasings: [...pageEasingSet], count: easings.length });
  }

  const sorted = Object.entries(siteWideEasings).sort((a, b) => b[1] - a[1]);
  const dominantEasing = sorted[0]?.[0] || null;
  const uniqueEasings = Object.keys(siteWideEasings);

  // Pages that deviate from dominant (use <50% dominant easing when they have animations)
  const deviatingPages = perPage
    .filter(p => p.count > 0 && dominantEasing && !p.uniqueEasings.includes(dominantEasing))
    .map(p => p.url);

  const dominantPercent = dominantEasing && perPage.filter(p => p.count > 0).length > 0
    ? Math.round(
        (perPage.filter(p => p.uniqueEasings.includes(dominantEasing)).length /
          perPage.filter(p => p.count > 0).length) * 100
      )
    : 100;

  return {
    uniqueEasings,
    uniqueEasingCount: uniqueEasings.length,
    dominantEasing,
    dominantPercent,
    deviatingPages,
    deviatingCount: deviatingPages.length,
    siteWideEasingCounts: Object.fromEntries(sorted),
  };
}

// ── Duration analysis ──────────────────────────────────────────────────────

const BUCKETS = [
  { name: 'instant', min: 0,    max: 80   },
  { name: 'xs',      min: 80,   max: 200  },
  { name: 'sm',      min: 200,  max: 400  },
  { name: 'md',      min: 400,  max: 700  },
  { name: 'lg',      min: 700,  max: 1100 },
  { name: 'xl',      min: 1100, max: Infinity },
];

function durationBucket(ms) {
  for (const b of BUCKETS) {
    if (ms >= b.min && ms < b.max) return b.name;
  }
  return 'xl';
}

function analyseDurations(specs) {
  const bucketDistribution = { instant: 0, xs: 0, sm: 0, md: 0, lg: 0, xl: 0 };
  const perPage = [];

  for (const spec of specs) {
    const url = spec.meta?.url || spec._crawlMeta?.url || 'unknown';
    const durations = (spec.animations || []).map(a => a.duration).filter(Boolean);
    const pageBuckets = {};

    for (const d of durations) {
      const b = durationBucket(d);
      bucketDistribution[b]++;
      pageBuckets[b] = (pageBuckets[b] || 0) + 1;
    }
    perPage.push({ url, buckets: pageBuckets, count: durations.length });
  }

  // Dominant bucket site-wide
  const sortedBuckets = Object.entries(bucketDistribution).sort((a, b) => b[1] - a[1]);
  const dominantBucket = sortedBuckets[0]?.[0] || null;

  // Pages that only use xl durations (likely outliers)
  const deviatingPages = perPage
    .filter(p => p.count > 0 && p.buckets.xl > 0 && (p.buckets.xl / p.count) > 0.5)
    .map(p => p.url);

  return {
    bucketDistribution,
    dominantBucket,
    deviatingPages,
    deviatingCount: deviatingPages.length,
  };
}

// ── Reduced motion ─────────────────────────────────────────────────────────

function analyseReducedMotion(specs) {
  const missingPages = [];
  let supportedCount = 0;

  for (const spec of specs) {
    const url = spec.meta?.url || spec._crawlMeta?.url || 'unknown';
    if (spec.fingerprint?.reducedMotionSupport) {
      supportedCount++;
    } else {
      missingPages.push(url);
    }
  }

  const total = specs.length;
  const missingCount = missingPages.length;
  const coveragePercent = total > 0 ? Math.round((supportedCount / total) * 100) : 100;

  return { supportedCount, missingCount, missingPages, coveragePercent };
}

// ── Component drift ────────────────────────────────────────────────────────

function detectComponentDrift(specs) {
  // Group components by selector across pages. If same selector has
  // different dominant easing or duration bucket → motion drift.
  const selectorMap = {};

  for (const spec of specs) {
    const url = spec.meta?.url || spec._crawlMeta?.url || 'unknown';
    for (const component of (spec.components || [])) {
      const key = component.selector;
      if (!key) continue;

      const animIds = new Set(component.animationIds || []);
      const anims = (spec.animations || []).filter(a => animIds.has(a.id));
      if (anims.length === 0) continue;

      const easings = anims.map(a => a.easing).filter(Boolean);
      const durations = anims.map(a => a.duration).filter(Boolean);
      const dominantEasing = mode(easings);
      const avgDuration = durations.length > 0
        ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length)
        : null;

      if (!selectorMap[key]) selectorMap[key] = [];
      selectorMap[key].push({ url, label: component.label, dominantEasing, avgDuration });
    }
  }

  const driftItems = [];

  for (const [selector, pages] of Object.entries(selectorMap)) {
    if (pages.length < 2) continue;

    const easings = pages.map(p => p.dominantEasing).filter(Boolean);
    const durations = pages.map(p => p.avgDuration).filter(Boolean);
    const uniqueEasings = new Set(easings);
    const durationVariance = durations.length > 1
      ? Math.max(...durations) - Math.min(...durations)
      : 0;

    const hasDrift = uniqueEasings.size > 1 || durationVariance > 200;
    if (!hasDrift) continue;

    driftItems.push({
      selector,
      label: pages[0].label,
      pageCount: pages.length,
      easingDrift: uniqueEasings.size > 1,
      uniqueEasings: [...uniqueEasings],
      durationVariance,
      pages: pages.map(p => ({ url: p.url, dominantEasing: p.dominantEasing, avgDuration: p.avgDuration })),
    });
  }

  return driftItems;
}

// ── Per-page scores ────────────────────────────────────────────────────────

function scorePages(specs) {
  return specs
    .map(spec => {
      const url = spec.meta?.url || spec._crawlMeta?.url || 'unknown';
      const animCount = (spec.animations || []).length;
      const reducedMotion = spec.fingerprint?.reducedMotionSupport || false;
      const feel = spec.fingerprint?.feel || 'unknown';
      const grade = spec.fingerprint?.grade || gradeFromSpec(spec);

      return { url, animCount, reducedMotion, feel, grade };
    })
    .sort((a, b) => gradeOrder(a.grade) - gradeOrder(b.grade));
}

function gradeFromSpec(spec) {
  // Simple grade from animation count and reduced motion
  if (!spec.fingerprint?.reducedMotionSupport) return 'F';
  return 'B';
}

function gradeOrder(g) {
  return { A: 0, B: 1, C: 2, D: 3, F: 4 }[g] ?? 5;
}

// ── Verdict ────────────────────────────────────────────────────────────────

function computeVerdict(easing, duration, reducedMotion, componentDrift) {
  let driftScore = 0;

  // Easing deviations
  if (easing.deviatingCount >= 3) driftScore += 3;
  else if (easing.deviatingCount >= 1) driftScore += 1;

  // Duration outliers
  if (duration.deviatingCount >= 3) driftScore += 2;
  else if (duration.deviatingCount >= 1) driftScore += 1;

  // Reduced motion missing across multiple pages
  if (reducedMotion.missingCount >= 3) driftScore += 2;
  else if (reducedMotion.missingCount >= 1) driftScore += 1;

  // Component drift
  if (componentDrift.length >= 3) driftScore += 3;
  else if (componentDrift.length >= 1) driftScore += 1;

  if (driftScore === 0) return 'consistent';
  if (driftScore <= 2)  return 'minor-drift';
  if (driftScore <= 5)  return 'moderate-drift';
  return 'major-drift';
}

// ── Summary ────────────────────────────────────────────────────────────────

function buildSummary(verdict, pageCount, easing, duration, reducedMotion, componentDrift) {
  const parts = [
    `Crawled ${pageCount} page${pageCount === 1 ? '' : 's'}.`,
    `Verdict: ${verdict}.`,
  ];

  if (easing.deviatingCount > 0) {
    parts.push(`${easing.deviatingCount} page(s) deviate from the dominant easing ("${easing.dominantEasing}").`);
  }

  if (reducedMotion.missingCount > 0) {
    parts.push(`prefers-reduced-motion missing on ${reducedMotion.missingCount} page(s) (${100 - reducedMotion.coveragePercent}% uncovered).`);
  }

  if (componentDrift.length > 0) {
    parts.push(`${componentDrift.length} component(s) animate differently across pages (motion drift detected).`);
  }

  return parts.join(' ');
}

// ── Utilities ──────────────────────────────────────────────────────────────

function mode(arr) {
  if (arr.length === 0) return null;
  const counts = {};
  for (const v of arr) counts[v] = (counts[v] || 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}