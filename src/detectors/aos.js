// Detects Animate On Scroll (AOS) library.
// AOS stores config on data-aos attributes and exposes
// window.AOS at runtime. Both are checked by the crawler.

export function detectAos(rawData) {
  const aos = rawData.aos;
  if (!aos?.detected) return null;

  const animations = (aos.elements || []).map(el => ({
    source: 'aos',
    element: el.selector,
    animation: el.animation,    // e.g. 'fade-up', 'slide-left'
    duration: el.duration ? Number(el.duration) : null,
    delay: el.delay ? Number(el.delay) : null,
    easing: el.easing || null,
    once: el.once !== 'false',
  }));

  return {
    detected: true,
    version: aos.version || null,
    method: aos.method || null,
    animations,
    counts: { total: animations.length },
  };
}
