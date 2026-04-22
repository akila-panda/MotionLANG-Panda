// Secondary ScrollTrigger extractor.
// Enriches raw ScrollTrigger data with pattern hints and pairs
// each ScrollTrigger to its parent tween where possible.

export function enrichScrollTriggers(gsapDetection) {
  if (!gsapDetection?.scrollTriggers?.length) return gsapDetection;

  const enriched = gsapDetection.scrollTriggers.map(st => ({
    ...st,
    patternHint: st.pin
      ? 'pin-section'
      : st.scrub != null
        ? 'scroll-scrub'
        : 'scroll-trigger',
  }));

  return {
    ...gsapDetection,
    scrollTriggers: enriched,
  };
}