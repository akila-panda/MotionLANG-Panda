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
import { detectCdpAnimations } from './detectors/cdp-animations.js';
import { detectMouseParallax } from './detectors/mouse-parallax.js';
import { detectMagneticCursor } from './detectors/magnetic-cursor.js';
import { detectTilt3d } from './detectors/tilt-3d.js';
import { detectCursorFollower } from './detectors/cursor-follower.js';
import { detectSpotlight } from './detectors/spotlight.js';
import { computeFingerprint, buildMotionTokens } from './fingerprint.js';
import { resolveReducedMotion } from './accessibility.js';
import { segmentPage, attachComponentIds } from './segmenter.js';

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
    cdp:                  safeDetect(detectCdpAnimations, rawData),
    mouseParallax:        safeDetect(detectMouseParallax, rawData),
    magneticCursor:       safeDetect(detectMagneticCursor, rawData),
    tilt3d:               safeDetect(detectTilt3d, rawData),
    cursorFollower:       safeDetect(detectCursorFollower, rawData),
    spotlight:            safeDetect(detectSpotlight, rawData),
  };

  // ── Classify into 15-pattern taxonomy ─────────────────────────────
  const animations = classifyAnimations(detections);

  // ── Attach reducedMotion flag to every animation ───────────────────
  for (const anim of animations) {
    anim.reducedMotion = resolveReducedMotion(anim, rawData.reducedMotionSupport);
  }

  // ── Component segmentation ────────────────────────────────────────
  const components = safeDetect(segmentPage, rawData.domStructure) || [];
  attachComponentIds(animations, components);

  // ── Compute motion fingerprint (via extracted module) ─────────────
  const fingerprint = computeFingerprint(animations, detections, rawData);

  // ── Assemble the motionSpec object ────────────────────────────────
  const motionSpec = {
    meta: {
      url: rawData.url,
      title: rawData.title,
      timestamp: new Date().toISOString(),
      elementCount: rawData.elementCount,
      simulationFlags: rawData.simulationFlags,
      component: options.component || null,
    },
    fingerprint,
    components,
    animations,
    tokens: buildMotionTokens(animations),
    raw: {
      cssKeyframes:    detections.cssKeyframes,
      cssTransitions:  detections.cssTransitions,
      motionVariables: rawData.motionVariables || {},
      cdp:             detections.cdp,
    },
  };

  return motionSpec;
}