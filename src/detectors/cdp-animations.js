// CDP Animation domain detector.
// Uses Chrome DevTools Protocol via Playwright to capture ALL animations
// on the page — cross-library, including those not detectable via DOM APIs.
// This is the fallback that catches what CSS, GSAP, and Framer detectors miss.
//
// CDP captures: animation name, duration, delay, easing, playback rate,
// target element, keyframe offsets — regardless of which library created them.
//
// rawData.cdpAnimations is populated by crawler.js before this runs.

import { nameEasing } from '../utils/easing-names.js';

export function detectCdpAnimations(rawData) {
  const cdp = rawData.cdpAnimations;
  if (!cdp?.detected || !cdp.animations?.length) return null;

  const animations = cdp.animations.map(anim => {
    const source = anim.source || {};
    const timing = source.timing || {};

    const durationMs = typeof timing.duration === 'number' ? timing.duration : null;
    const delayMs    = typeof timing.delay    === 'number' ? timing.delay    : null;
    const easing     = timing.easing || null;

    return {
      cdpId:       anim.id || null,
      name:        anim.name || null,
      type:        anim.type || null,           // 'CSSTransition' | 'CSSAnimation' | 'WebAnimation'
      playState:   anim.playState || null,
      durationMs,
      delayMs,
      easing,
      easingName:  nameEasing(easing),
      iterations:  timing.iterations ?? null,
      fill:        timing.fill || null,
      direction:   timing.direction || null,
      target: anim.target || null,
      keyframes:   (source.keyframesRule?.keyframes || []).map(kf => ({
        offset: kf.offset,
        style:  kf.style,
      })),
    };
  });

  // Deduplicate against what CSS detectors already found.
  // CDP captures everything including transitions — we only want
  // animations that add NEW information (WebAnimation type or named
  // CSSAnimations not already in the keyframes detector).
  const webAnimations = animations.filter(a =>
    a.type === 'WebAnimation' ||
    (a.type === 'CSSAnimation' && a.name && !a.name.startsWith('none'))
  );

  const counts = {
    total:          animations.length,
    cssTransitions: animations.filter(a => a.type === 'CSSTransition').length,
    cssAnimations:  animations.filter(a => a.type === 'CSSAnimation').length,
    webAnimations:  animations.filter(a => a.type === 'WebAnimation').length,
  };

  return {
    detected: true,
    animations,
    webAnimations,
    counts,
  };
}
