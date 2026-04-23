// Fingerprint module — computes feel, dominant library/pattern, flags.
// Extracted from index.js so it can be tested and reused independently.
// src/fingerprint.js

export function computeFingerprint(animations, detections, rawData) {
  const patternCounts = {};
  for (const anim of animations) {
    patternCounts[anim.pattern] = (patternCounts[anim.pattern] || 0) + 1;
  }

  const dominantPattern = Object.entries(patternCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const libraries = [];
  if (detections.gsap?.detected)                           libraries.push('gsap');
  if (detections.framer?.detected)                         libraries.push('framer-motion');
  if (detections.aos?.detected)                            libraries.push('aos');
  if (detections.scrollReveal?.detected)                   libraries.push('scroll-reveal');
  if (detections.cssKeyframes?.counts?.usedKeyframes > 0)  libraries.push('css');
  if (detections.cssTransitions?.counts?.uniqueProperties > 0 &&
      !libraries.includes('css'))                          libraries.push('css');

  const dominantLibrary = libraries[0] || 'css';
  const easingNames = animations.map(a => a.easingName).filter(Boolean);
  const feel = computeFeel(easingNames, detections);

  return {
    feel,
    dominantPattern,
    dominantLibrary,
    libraries,
    scrollLinked: !!(detections.gsap?.scrollTriggers?.length > 0),
    mouseInteractive: !!(
      detections.mouseParallax?.detected ||
      detections.magneticCursor?.detected ||
      detections.tilt3d?.detected ||
      detections.cursorFollower?.detected ||
      detections.spotlight?.detected
    ),
    reducedMotionSupport: rawData.reducedMotionSupport,
    animationCount: animations.length,
  };
}

export function computeFeel(easingNames, detections = {}) {
  if (!easingNames.length) return 'unknown';

  const counts = {};
  for (const e of easingNames) counts[e] = (counts[e] || 0) + 1;
  const total = easingNames.length;

  const springLike = (counts['spring-like'] || 0) +
    (counts['spring-overshoot'] || 0) +
    (counts['spring-bouncy'] || 0);
  const smooth = (counts['expressive-decelerate'] || 0) +
    (counts['smooth-decelerate'] || 0) +
    (counts['expo-out'] || 0) +
    (counts['material-decelerate'] || 0);
  const snappy = (counts['snappy'] || 0) +
    (counts['ease-in-custom'] || 0);
  const mechanical = (counts['linear'] || 0) +
    (counts['ease-in-out'] || 0);

  if (springLike / total > 0.4)  return 'springy';
  if (smooth    / total > 0.4)   return 'smooth';
  if (snappy    / total > 0.3)   return 'snappy';
  if (mechanical / total > 0.4)  return 'mechanical';
  return 'mixed';
}

export function buildMotionTokens(animations) {
  const durations = new Map();
  const easings   = new Map();

  for (const anim of animations) {
    if (anim.duration) {
      const key = `duration-${anim.durationBucket || 'md'}`;
      if (!durations.has(key)) {
        durations.set(key, {
          name:   key,
          value:  `${Math.round(anim.duration)}ms`,
          bucket: anim.durationBucket,
        });
      }
    }
    if (anim.easing && anim.easingName) {
      const key = `easing-${anim.easingName}`;
      if (!easings.has(key)) {
        easings.set(key, {
          name:      key,
          value:     anim.easing,
          humanName: anim.easingName,
        });
      }
    }
  }

  return {
    durations: [...durations.values()],
    easings:   [...easings.values()],
  };
}