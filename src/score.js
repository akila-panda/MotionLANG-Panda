// Motion health score. Audits a motionSpec against best practices.
// Returns a score 0–100 and a list of findings with severity levels.

export function scoreMotionSpec(motionSpec) {
  const { animations, tokens, fingerprint } = motionSpec;
  const findings = [];
  let deductions = 0;

  // ── Reduced motion ─────────────────────────────────────────────
  if (!fingerprint.reducedMotionSupport) {
    findings.push({
      severity: 'error',
      code: 'NO_REDUCED_MOTION',
      message: 'prefers-reduced-motion not detected. WCAG 2.1 AA requires reduced motion support.',
      deduction: 20,
    });
    deductions += 20;
  }

  // ── Duration consistency ────────────────────────────────────────
  const durations = animations.map(a => a.duration).filter(Boolean);
  const uniqueDurations = new Set(durations);
  if (uniqueDurations.size > 5) {
    findings.push({
      severity: 'warning',
      code: 'DURATION_INCONSISTENCY',
      message: `${uniqueDurations.size} unique duration values detected. Consider consolidating to a token scale of 3–5 steps.`,
      deduction: 10,
      deductionDetails: {
        affectedAnimationIds: animations.filter(a => a.duration).map(a => a.id).filter(Boolean),
        uniqueValues: [...uniqueDurations],
      },
    });
    deductions += 10;
  }

  // ── Easing consistency ──────────────────────────────────────────
  const easings = animations.map(a => a.easing).filter(Boolean);
  const uniqueEasings = new Set(easings);
  if (uniqueEasings.size > 4) {
    // Find dominant easing to identify non-dominant animations
    const easingCounts = {};
    for (const e of easings) easingCounts[e] = (easingCounts[e] || 0) + 1;
    const dominant = Object.entries(easingCounts).sort((a, b) => b[1] - a[1])[0];
    const dominantEasing = dominant ? dominant[0] : null;
    findings.push({
      severity: 'warning',
      code: 'EASING_INCONSISTENCY',
      message: `${uniqueEasings.size} unique easing values detected. A motion system typically uses 2–4 named easings.`,
      deduction: 10,
      deductionDetails: {
        affectedAnimationIds: animations
          .filter(a => a.easing && a.easing !== dominantEasing)
          .map(a => a.id)
          .filter(Boolean),
        dominantEasing,
        uniqueValues: [...uniqueEasings],
      },
    });
    deductions += 10;
  }

  // ── Animation count ─────────────────────────────────────────────
  if (animations.length === 0) {
    findings.push({
      severity: 'info',
      code: 'NO_ANIMATIONS',
      message: 'No animations detected. Try running with --scroll --mouse --interactions for a deeper scan.',
      deduction: 0,
    });
  }

  // ── Token coverage ──────────────────────────────────────────────
  const customEasings = tokens.easings.filter(e => e.humanName === 'custom');
  if (customEasings.length > 0) {
    findings.push({
      severity: 'info',
      code: 'UNNAMED_EASINGS',
      message: `${customEasings.length} easing value(s) could not be named. Consider adding them to your easing token scale.`,
      deduction: 5,
      deductionDetails: {
        affectedAnimationIds: customEasings.map(e => e.name).filter(Boolean),
        easingValues: customEasings.map(e => e.value),
      },
    });
    deductions += 5;
  }

  // ── Duration extremes ───────────────────────────────────────────
  const longAnims = animations.filter(a => a.duration && a.duration > 1000);
  if (longAnims.length > 0) {
    findings.push({
      severity: 'warning',
      code: 'LONG_DURATIONS',
      message: `${longAnims.length} animation(s) exceed 1000ms. Long animations can feel slow and hurt perceived performance.`,
      deduction: 5,
      deductionDetails: {
        affectedAnimationIds: longAnims.map(a => a.id).filter(Boolean),
        affectedDurations: longAnims.map(a => ({ id: a.id, duration: a.duration })),
      },
    });
    deductions += 5;
  }

  const score = Math.max(0, 100 - deductions);

  const grade =
    score >= 90 ? 'A' :
    score >= 80 ? 'B' :
    score >= 70 ? 'C' :
    score >= 60 ? 'D' : 'F';

  return {
    score,
    grade,
    findings,
    summary: {
      total: animations.length,
      uniqueDurations: uniqueDurations.size,
      uniqueEasings: uniqueEasings.size,
      reducedMotion: fingerprint.reducedMotionSupport,
    },
  };
}