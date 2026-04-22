// Detects CSS @keyframes animations from computed styles and live
// Web Animations API data returned by the crawler.

import { nameEasing, parseDurationMs, bucketDuration } from '../utils/easing-names.js';

export function detectCssKeyframes(rawData) {
  const { keyframes = [], liveAnimations = [], computedStyles = [] } = rawData;

  if (!keyframes.length && !liveAnimations.length) return null;

  // Build a set of animation names referenced in computed styles
  const referencedNames = new Set();
  for (const el of computedStyles) {
    if (!el.animation || el.animation === 'none') continue;
    const nameMatch = el.animation.match(/^([\w-]+)/);
    if (nameMatch && nameMatch[1] !== 'none') referencedNames.add(nameMatch[1]);
  }

  // Enrich keyframe rules
  const enrichedKeyframes = keyframes.map(kf => {
    const propertiesAnimated = new Set();
    for (const step of kf.steps) {
      const props = step.style
        .split(';')
        .map(s => s.split(':')[0].trim())
        .filter(Boolean);
      props.forEach(p => propertiesAnimated.add(p));
    }

    // Detect bounce (first and last keyframe identical)
    const first = kf.steps.find(s => s.offset === '0%' || s.offset === 'from');
    const last  = kf.steps.find(s => s.offset === '100%' || s.offset === 'to');
    const isBounce = !!(first && last &&
      first.style === last.style && kf.steps.length > 2);

    return {
      name: kf.name,
      steps: kf.steps,
      propertiesAnimated: [...propertiesAnimated],
      isUsed: referencedNames.has(kf.name),
      isBounce,
    };
  });

  // Enrich live Web Animations API results
  const enrichedLive = liveAnimations.map(anim => {
    const durationMs = typeof anim.duration === 'number'
      ? anim.duration
      : parseDurationMs(anim.duration);

    return {
      ...anim,
      durationMs,
      durationBucket: bucketDuration(durationMs),
      easingName: nameEasing(anim.easing),
    };
  });

  return {
    keyframes: enrichedKeyframes,
    liveAnimations: enrichedLive,
    counts: {
      keyframeRules: enrichedKeyframes.length,
      usedKeyframes: enrichedKeyframes.filter(k => k.isUsed).length,
      liveInstances: enrichedLive.length,
    },
  };
}