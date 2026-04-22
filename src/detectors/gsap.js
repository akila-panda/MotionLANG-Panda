// Detects GSAP tweens and ScrollTrigger instances from window.gsap.globalTimeline.
// Runs inside the Playwright page context via crawler.js — this file processes
// the raw gsapData object that the crawler already extracted.

import { nameEasing, parseDurationMs } from '../utils/easing-names.js';

export function detectGsap(rawData) {
  const gsap = rawData.gsap;
  if (!gsap?.detected) return null;

  const tweens = (gsap.tweens || []).map(tween => {
    const durationMs = tween.duration != null ? tween.duration * 1000 : null;
    const delayMs    = tween.delay    != null ? tween.delay    * 1000 : null;
    const easing     = tween.vars?.ease || null;

    return {
      ...tween,
      durationMs,
      delayMs,
      easingName: nameEasing(easing),
    };
  });

  const scrollTriggers = gsap.scrollTriggers || [];

  return {
    detected: true,
    version: gsap.version || null,
    tweens,
    scrollTriggers,
    counts: {
      tweens: tweens.length,
      scrollTriggers: scrollTriggers.length,
      pinned: scrollTriggers.filter(st => st.pin).length,
      scrubbed: scrollTriggers.filter(st => st.scrub != null).length,
    },
  };
}