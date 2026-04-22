// Detects IntersectionObserver-based scroll reveal patterns.
// AOS and ScrollReveal both use IO under the hood — this catches
// custom IO implementations that neither library covers.

export function detectIntersectionObserver(rawData) {
  const elements = rawData.computedStyles || [];

  const ioAnimations = [];

  // Check for AOS data attributes captured by crawler
  if (rawData.aosElements?.length > 0) {
    for (const el of rawData.aosElements) {
      ioAnimations.push({
        source: 'aos',
        element: el.selector,
        animation: el.animation,
        duration: el.duration,
        delay: el.delay,
        easing: el.easing,
        once: el.once,
      });
    }
  }

  // Check for ScrollReveal config captured by crawler
  if (rawData.scrollRevealConfig) {
    ioAnimations.push({
      source: 'scroll-reveal',
      ...rawData.scrollRevealConfig,
    });
  }

  // Elements with will-change: opacity or transform are almost always IO-animated
  const ioLikeElements = elements.filter(el =>
    el.willChange && el.willChange !== 'auto' &&
    (el.willChange.includes('opacity') || el.willChange.includes('transform'))
  );

  if (ioAnimations.length === 0 && ioLikeElements.length === 0) return null;

  return {
    detected: true,
    animations: ioAnimations,
    ioLikeElements: ioLikeElements.slice(0, 20),
    counts: {
      total: ioAnimations.length,
      ioLike: ioLikeElements.length,
    },
  };
}
