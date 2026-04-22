// Pipeline orchestrator. Calls the crawler, runs all detectors,
// classifies results, and returns the assembled motionSpec object.
// src/index.js

import { crawlPage } from './crawler.js';
import { detectCssKeyframes } from './detectors/css-keyframes.js';
import { detectCssTransitions } from './detectors/css-transitions.js';
import { classifyAnimations } from './classifier.js';
import { detectGsap } from './detectors/gsap.js';
import { enrichScrollTriggers } from './detectors/gsap-scroll-trigger.js';
import { detectFramerMotion } from './detectors/framer-motion.js';
import { detectIntersectionObserver } from './detectors/intersection-observer.js';
import { detectAos } from './detectors/aos.js';
import { detectScrollReveal } from './detectors/scroll-reveal.js';

function safeDetect(fn, ...args) {
  try { return fn(...args); } catch { return null; }
}

export async function extractMotionLanguage(url, options = {}) {
  const rawData = await crawlPage(url, options);

  if (rawData.error) {
    throw new Error(`Crawler error: ${rawData.error}`);
  }

  // ── Run all detectors ──────────────────────────────────────────────
  const detections = {
    cssKeyframes:         safeDetect(detectCssKeyframes, rawData),
    cssTransitions:       safeDetect(detectCssTransitions, rawData),
    gsap:                 enrichScrollTriggers(safeDetect(detectGsap, rawData)),
    framer:               safeDetect(detectFramerMotion, rawData),
    intersectionObserver: safeDetect(detectIntersectionObserver, rawData),
    aos:                  safeDetect(detectAos, rawData),
    scrollReveal:         safeDetect(detectScrollReveal, rawData),
  };

  // ── Classify into 15-pattern taxonomy ─────────────────────────────
  const animations = classifyAnimations(detections);

  // ── Attach reducedMotion flag to every animation ───────────────────
  for (const anim of animations) {
    anim.reducedMotion = rawData.reducedMotionSupport
      ? 'supported'
      : 'not-present';
  }

  // ── Compute motion fingerprint ─────────────────────────────────────
  const patternCounts = {};
  for (const anim of animations) {
    patternCounts[anim.pattern] = (patternCounts[anim.pattern] || 0) + 1;
  }

  const dominantPattern = Object.entries(patternCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  const libraries = [];
  if (detections.gsap?.detected)                              libraries.push('gsap');
  if (detections.framer?.detected)                           libraries.push('framer-motion');
  if (detections.aos?.detected)                              libraries.push('aos');
  if (detections.scrollReveal?.detected)                     libraries.push('scroll-reveal');
  if (detections.cssKeyframes?.counts?.usedKeyframes > 0)    libraries.push('css');
  if (detections.cssTransitions?.counts?.uniqueProperties > 0 &&
      !libraries.includes('css'))                            libraries.push('css');

  const dominantLibrary = libraries[0] || 'css';

  // feel: springy / smooth / snappy / mechanical / mixed
  const easings = animations.map(a => a.easingName).filter(Boolean);
  const feel = computeFeel(easings, detections);

  // ── Assemble the motionSpec object ────────────────────────────────
  const motionSpec = {
    meta: {
      url: rawData.url,
      title: rawData.title,
      timestamp: new Date().toISOString(),
      elementCount: rawData.elementCount,
      simulationFlags: rawData.simulationFlags,
    },
    fingerprint: {
      feel,
      dominantPattern,
      dominantLibrary,
      libraries,
      scrollLinked: !!(detections.gsap?.scrollTriggers?.length > 0),
      reducedMotionSupport: rawData.reducedMotionSupport,
      animationCount: animations.length,
    },
    animations,
    tokens: buildMotionTokens(animations, detections),
    raw: {
      cssKeyframes:    detections.cssKeyframes,
      cssTransitions:  detections.cssTransitions,
      motionVariables: rawData.motionVariables || {},
    },
  };

  return motionSpec;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function computeFeel(easings, detections) {
  if (!easings.length) return 'unknown';

  const counts = {};
  for (const e of easings) counts[e] = (counts[e] || 0) + 1;

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

  const total = easings.length;
  if (springLike / total > 0.4) return 'springy';
  if (smooth / total > 0.4)     return 'smooth';
  if (snappy / total > 0.3)     return 'snappy';
  if (mechanical / total > 0.4) return 'mechanical';
  return 'mixed';
}

function buildMotionTokens(animations, detections) {
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
