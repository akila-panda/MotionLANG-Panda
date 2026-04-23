// Accessibility module — audits a motionSpec for reduced-motion compliance
// and returns per-animation flags plus a top-level summary.
//
// Invariant: every animation object must carry a reducedMotion field.
// This module validates that invariant and provides the structured data
// that score.js uses for the accessibility component of the health score.

/**
 * Audit a motionSpec for reduced-motion compliance.
 * Returns a structured a11y report.
 *
 * @param {Object} motionSpec - assembled motionSpec object
 * @returns {Object} a11y audit report
 */
export function auditAccessibility(motionSpec) {
  const { animations, fingerprint, meta } = motionSpec;

  const total = animations.length;
  const supported = animations.filter(a => a.reducedMotion === 'supported').length;
  const missing   = animations.filter(a => a.reducedMotion === 'not-present').length;
  const partial   = animations.filter(a =>
    a.reducedMotion && a.reducedMotion !== 'supported' && a.reducedMotion !== 'not-present'
  ).length;

  // Animations that move AND have no reduced-motion fallback are the highest risk
  const movementPatterns = ['slide-up', 'slide-in', 'parallax', 'scroll-scrub',
                            'text-reveal', 'stagger', 'tilt-3d', 'morph', 'page-transition'];
  const highRisk = animations.filter(a =>
    movementPatterns.includes(a.pattern) && a.reducedMotion === 'not-present'
  );

  // WCAG 2.1 AA: prefers-reduced-motion must be respected
  const wcagCompliant = fingerprint.reducedMotionSupport === true;

  // Severity: fail if any movement animation has no fallback
  const severity = highRisk.length > 0 ? 'fail' : missing > 0 ? 'warn' : 'pass';

  const findings = [];

  if (!wcagCompliant) {
    findings.push({
      code:     'A001',
      severity: 'fail',
      message:  'prefers-reduced-motion media query not detected in stylesheets. WCAG 2.1 AA requires reduced motion support.',
      elements: [],
    });
  }

  if (highRisk.length > 0) {
    findings.push({
      code:     'A002',
      severity: 'fail',
      message:  `${highRisk.length} movement animation(s) have no reduced-motion fallback. These will cause vestibular issues for affected users.`,
      elements: highRisk.map(a => a.id),
    });
  }

  if (missing > 0 && highRisk.length === 0) {
    findings.push({
      code:     'A003',
      severity: 'warn',
      message:  `${missing} animation(s) are missing reduced-motion declarations. Check these are non-movement animations only.`,
      elements: animations.filter(a => a.reducedMotion === 'not-present').map(a => a.id),
    });
  }

  if (partial > 0) {
    findings.push({
      code:     'A004',
      severity: 'info',
      message:  `${partial} animation(s) have partial reduced-motion support (fade-only or no-transform). Verify these match designer intent.`,
      elements: animations.filter(a =>
        a.reducedMotion && a.reducedMotion !== 'supported' && a.reducedMotion !== 'not-present'
      ).map(a => a.id),
    });
  }

  return {
    url: meta?.url || null,
    wcagCompliant,
    severity,
    summary: {
      total,
      supported,
      missing,
      partial,
      highRiskCount: highRisk.length,
    },
    findings,
  };
}

/**
 * Attach a structured reducedMotion value to an animation object.
 * Called during pipeline assembly in index.js.
 *
 * @param {Object} anim          - animation object being assembled
 * @param {boolean} siteSupports - whether the site has prefers-reduced-motion
 * @returns {string} reducedMotion value to assign
 */
export function resolveReducedMotion(anim, siteSupports) {
  if (!siteSupports) return 'not-present';

  // Movement patterns with a global reduced-motion rule → fade-only
  const movementPatterns = ['slide-up', 'slide-in', 'parallax', 'scroll-scrub',
                            'text-reveal', 'stagger', 'morph', 'page-transition'];
  if (movementPatterns.includes(anim.pattern)) return 'fade-only';

  // Opacity-only or state-change patterns → fully supported
  return 'supported';
}