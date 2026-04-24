// Site consistency report formatter.
// Generates a *-site-consistency-report.md from a SiteConsistencyReport object.
// src/formatters/site-report.js

/**
 * Format a site consistency report as a markdown string.
 *
 * @param {object} report - Result of generateSiteConsistencyReport()
 * @param {string} startUrl - The starting URL of the crawl
 * @returns {string}
 */
export function formatSiteReport(report, startUrl = '') {
  const lines = [];

  // ── Header ───────────────────────────────────────────────────────
  lines.push(`# Site Motion Consistency Report`);
  if (startUrl) lines.push(`## ${startUrl}`);
  lines.push('');
  lines.push(`> **Verdict: ${verdictLabel(report.verdict)}**`);
  lines.push('');
  lines.push(report.summary);
  lines.push('');
  lines.push(`*Generated: ${report.generatedAt}*`);
  lines.push('');

  // ── Executive Summary ─────────────────────────────────────────────
  lines.push('---');
  lines.push('');
  lines.push('## Executive Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Pages crawled | ${report.pageCount} |`);
  lines.push(`| Verdict | ${verdictLabel(report.verdict)} |`);
  lines.push(`| Dominant easing | \`${report.easingAnalysis.dominantEasing || 'none'}\` |`);
  lines.push(`| Unique easings site-wide | ${report.easingAnalysis.uniqueEasingCount} |`);
  lines.push(`| Dominant duration bucket | ${report.durationAnalysis.dominantBucket || 'none'} |`);
  lines.push(`| Reduced motion coverage | ${report.reducedMotionCoverage.coveragePercent}% |`);
  lines.push(`| Components with drift | ${report.componentDrift.length} |`);
  lines.push('');

  // ── Easing Analysis ───────────────────────────────────────────────
  lines.push('## Easing Analysis');
  lines.push('');

  if (report.easingAnalysis.uniqueEasingCount === 0) {
    lines.push('No easing values detected across crawled pages.');
  } else {
    lines.push(`**Dominant easing:** \`${report.easingAnalysis.dominantEasing}\` (used on ${report.easingAnalysis.dominantPercent}% of pages with animations)`);
    lines.push('');
    lines.push('**Site-wide easing usage:**');
    lines.push('');
    for (const [easing, count] of Object.entries(report.easingAnalysis.siteWideEasingCounts)) {
      lines.push(`- \`${easing}\` — ${count} animation(s)`);
    }
    lines.push('');

    if (report.easingAnalysis.deviatingPages.length > 0) {
      lines.push(`**⚠️ Pages deviating from dominant easing (${report.easingAnalysis.deviatingCount}):**`);
      lines.push('');
      for (const url of report.easingAnalysis.deviatingPages) {
        lines.push(`- ${url}`);
      }
    } else {
      lines.push('✅ All pages use the dominant easing consistently.');
    }
  }
  lines.push('');

  // ── Duration Analysis ─────────────────────────────────────────────
  lines.push('## Duration Analysis');
  lines.push('');
  lines.push('**Duration bucket distribution (site-wide):**');
  lines.push('');
  lines.push('| Bucket | Range | Count |');
  lines.push('|--------|-------|-------|');
  const bucketRanges = {
    instant: '0–80ms',
    xs:      '80–200ms',
    sm:      '200–400ms',
    md:      '400–700ms',
    lg:      '700–1100ms',
    xl:      '1100ms+',
  };
  for (const [bucket, range] of Object.entries(bucketRanges)) {
    const count = report.durationAnalysis.bucketDistribution[bucket] || 0;
    const dominant = bucket === report.durationAnalysis.dominantBucket ? ' ← dominant' : '';
    lines.push(`| ${bucket} | ${range} | ${count}${dominant} |`);
  }
  lines.push('');

  if (report.durationAnalysis.deviatingPages.length > 0) {
    lines.push(`**⚠️ Pages with predominantly long durations (xl bucket):**`);
    lines.push('');
    for (const url of report.durationAnalysis.deviatingPages) {
      lines.push(`- ${url}`);
    }
  } else {
    lines.push('✅ Duration distribution looks consistent across pages.');
  }
  lines.push('');

  // ── Reduced Motion Coverage ───────────────────────────────────────
  lines.push('## Reduced Motion Coverage');
  lines.push('');
  const rm = report.reducedMotionCoverage;
  lines.push(`**Coverage: ${rm.coveragePercent}%** (${rm.supportedCount}/${report.pageCount} pages)`);
  lines.push('');

  if (rm.missingPages.length > 0) {
    lines.push(`**🔴 Pages missing prefers-reduced-motion (${rm.missingCount}):**`);
    lines.push('');
    for (const url of rm.missingPages) {
      lines.push(`- ${url}`);
    }
    lines.push('');
    lines.push('> Add `@media (prefers-reduced-motion: reduce)` to your global stylesheet for WCAG 2.1 AA compliance.');
  } else {
    lines.push('✅ All pages support prefers-reduced-motion.');
  }
  lines.push('');

  // ── Component Drift ───────────────────────────────────────────────
  lines.push('## Component Motion Drift');
  lines.push('');

  if (report.componentDrift.length === 0) {
    lines.push('✅ No component motion drift detected. Components animate consistently across pages.');
  } else {
    lines.push(`**${report.componentDrift.length} component(s) animate differently across pages:**`);
    lines.push('');
    for (const drift of report.componentDrift) {
      lines.push(`### \`${drift.selector}\` — ${drift.label}`);
      lines.push('');
      if (drift.easingDrift) {
        lines.push(`- **Easing drift:** ${drift.uniqueEasings.map(e => `\`${e}\``).join(', ')}`);
      }
      if (drift.durationVariance > 200) {
        lines.push(`- **Duration variance:** ${drift.durationVariance}ms across pages`);
      }
      lines.push('');
      lines.push('| Page | Dominant Easing | Avg Duration |');
      lines.push('|------|----------------|--------------|');
      for (const p of drift.pages) {
        lines.push(`| ${p.url} | \`${p.dominantEasing || 'none'}\` | ${p.avgDuration ? p.avgDuration + 'ms' : '—'} |`);
      }
      lines.push('');
    }
  }

  // ── Per-page Score Table ──────────────────────────────────────────
  lines.push('## Per-page Score Table');
  lines.push('');
  lines.push('| Page | Animations | Reduced Motion | Feel | Grade |');
  lines.push('|------|-----------|----------------|------|-------|');

  for (const page of report.perPageScores) {
    const rm_icon = page.reducedMotion ? '✅' : '❌';
    lines.push(`| ${page.url} | ${page.animCount} | ${rm_icon} | ${page.feel} | ${page.grade || '—'} |`);
  }
  lines.push('');

  // ── Recommendations ───────────────────────────────────────────────
  lines.push('## Recommendations');
  lines.push('');
  const recs = buildRecommendations(report);
  if (recs.length === 0) {
    lines.push('No specific recommendations — motion system is consistent across pages.');
  } else {
    for (const rec of recs) {
      lines.push(`- ${rec}`);
    }
  }
  lines.push('');

  lines.push('---');
  lines.push(`*motionlang --crawl-site — ${startUrl} — ${report.generatedAt}*`);

  return lines.join('\n');
}

// ── Helpers ────────────────────────────────────────────────────────────────

function verdictLabel(verdict) {
  const labels = {
    'consistent':      '✅ Consistent',
    'minor-drift':     '🟡 Minor Drift',
    'moderate-drift':  '🟠 Moderate Drift',
    'major-drift':     '🔴 Major Drift',
  };
  return labels[verdict] || verdict;
}

function buildRecommendations(report) {
  const recs = [];

  if (report.reducedMotionCoverage.missingCount > 0) {
    recs.push(`Add \`prefers-reduced-motion\` support to ${report.reducedMotionCoverage.missingCount} page(s) for WCAG 2.1 AA compliance.`);
  }

  if (report.easingAnalysis.uniqueEasingCount > 6) {
    recs.push(`Consolidate ${report.easingAnalysis.uniqueEasingCount} unique easing values to a 3–4 canonical set. Consider CSS custom properties for consistency.`);
  }

  if (report.easingAnalysis.deviatingCount > 0) {
    recs.push(`${report.easingAnalysis.deviatingCount} page(s) don't use the dominant easing ("${report.easingAnalysis.dominantEasing}"). Audit those pages for inconsistent animation code.`);
  }

  if (report.componentDrift.length > 0) {
    recs.push(`${report.componentDrift.length} component(s) have motion drift. Extract shared animation values to a central token file.`);
  }

  if (report.durationAnalysis.deviatingCount > 0) {
    recs.push(`${report.durationAnalysis.deviatingCount} page(s) use excessively long durations (>1100ms). Consider reducing to the "lg" bucket (700ms).`);
  }

  return recs;
}