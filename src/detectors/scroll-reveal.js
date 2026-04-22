// Detects ScrollReveal library.
// ScrollReveal exposes its config via sr.store at runtime.
// Also detects the data-sr-id attribute it stamps on elements.

export function detectScrollReveal(rawData) {
  const sr = rawData.scrollReveal;
  if (!sr?.detected) return null;

  const animations = (sr.elements || []).map(el => ({
    source: 'scroll-reveal',
    element: el.selector,
    duration: el.duration || null,
    delay: el.delay || null,
    distance: el.distance || null,
    origin: el.origin || null,
    opacity: el.opacity ?? null,
    easing: el.easing || null,
    reset: el.reset || false,
  }));

  return {
    detected: true,
    version: sr.version || null,
    method: sr.method || null,
    animations,
    counts: { total: animations.length },
  };
}