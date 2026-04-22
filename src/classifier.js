// Maps raw detector output to the 15 canonical motion patterns.
// Every animation in the final spec gets a pattern name + confidence score.

import { nameEasing } from './utils/easing-names.js';

// The 15 canonical pattern taxonomy
export const PATTERNS = [
  'slide-up',
  'slide-in',
  'fade-in',
  'stagger',
  'scroll-scrub',
  'pin-section',
  'parallax',
  'text-reveal',
  'counter',
  'magnetic-cursor',
  'tilt-3d',
  'spotlight',
  'cursor-follower',
  'morph',
  'page-transition',
  'state-change',
];

// ── Classify a single CSS keyframe ──────────────────────────────────────────
function classifyKeyframe(kf) {
  const props = kf.propertiesAnimated || [];
  const hasOpacity   = props.includes('opacity');
  const hasTransform = props.includes('transform');
  const hasClip      = props.some(p => p.includes('clip'));
  const hasColor     = props.some(p => p.includes('color'));
  const hasFilter    = props.some(p => p.includes('filter') || p.includes('blur'));

  // Check step values for movement direction
  const allStyles = (kf.steps || []).map(s => s.style).join(' ');
  const hasY       = /translateY|translate3d/.test(allStyles);
  const hasX       = /translateX/.test(allStyles);
  const hasScale   = /scale/.test(allStyles);
  const hasRotate  = /rotate/.test(allStyles);

  if (hasClip && hasOpacity) return { pattern: 'text-reveal', confidence: 0.8 };
  if (hasClip)               return { pattern: 'morph',       confidence: 0.7 };
  if (hasY && hasOpacity)    return { pattern: 'slide-up',    confidence: 0.85 };
  if (hasX && hasOpacity)    return { pattern: 'slide-in',    confidence: 0.85 };
  if (hasScale && hasOpacity)return { pattern: 'fade-in',     confidence: 0.75 };
  if (hasOpacity && !hasTransform) return { pattern: 'fade-in', confidence: 0.9 };
  if (hasRotate)             return { pattern: 'morph',       confidence: 0.65 };
  if (hasFilter)             return { pattern: 'fade-in',     confidence: 0.7 };
  if (hasColor)              return { pattern: 'state-change',confidence: 0.7 };

  return { pattern: 'fade-in', confidence: 0.5 };
}

// ── Classify a single CSS transition ────────────────────────────────────────
function classifyTransition(t) {
  const prop = (t.property || '').toLowerCase();

  if (prop === 'opacity')   return { pattern: 'fade-in',     confidence: 0.9 };
  if (prop === 'transform') return { pattern: 'state-change',confidence: 0.8 };
  if (prop === 'color' || prop === 'background-color' || prop === 'background')
                            return { pattern: 'state-change',confidence: 0.85 };
  if (prop === 'box-shadow')return { pattern: 'state-change',confidence: 0.8 };
  if (prop === 'border-color' || prop === 'border')
                            return { pattern: 'state-change',confidence: 0.8 };
  if (prop === 'width' || prop === 'height' || prop === 'max-height')
                            return { pattern: 'morph',        confidence: 0.7 };
  if (prop === 'filter' || prop === 'backdrop-filter')
                            return { pattern: 'fade-in',      confidence: 0.7 };
  if (prop === 'all')       return { pattern: 'state-change', confidence: 0.6 };

  return { pattern: 'state-change', confidence: 0.5 };
}

// ── Classify a GSAP tween ────────────────────────────────────────────────────
function classifyGsapTween(tween) {
  const vars = tween.vars || {};
  const hasY       = vars.y != null || vars.yPercent != null;
  const hasX       = vars.x != null || vars.xPercent != null;
  const hasOpacity = vars.opacity != null;
  const hasScale   = vars.scale != null;
  const hasStagger = vars.stagger != null;
  const hasScrub   = tween.scrollTrigger?.scrub != null;
  const hasPin     = tween.scrollTrigger?.pin != null;

  if (hasPin)                    return { pattern: 'pin-section',  confidence: 0.95 };
  if (hasScrub)                  return { pattern: 'scroll-scrub', confidence: 0.95 };
  if (hasStagger && hasY)        return { pattern: 'stagger',      confidence: 0.9  };
  if (hasStagger)                return { pattern: 'stagger',      confidence: 0.85 };
  if (hasY && hasOpacity)        return { pattern: 'slide-up',     confidence: 0.85 };
  if (hasX && hasOpacity)        return { pattern: 'slide-in',     confidence: 0.85 };
  if (hasOpacity && !hasY && !hasX) return { pattern: 'fade-in',  confidence: 0.85 };
  if (hasScale)                  return { pattern: 'morph',        confidence: 0.7  };

  return { pattern: 'fade-in', confidence: 0.5 };
}

// ── Classify a Framer Motion variant ────────────────────────────────────────
function classifyFramerVariant(variant) {
  const initial = variant.initial || {};
  const animate = variant.animate || variant.whileInView || {};
  const hasY       = initial.y != null || animate.y != null;
  const hasX       = initial.x != null || animate.x != null;
  const hasOpacity = initial.opacity != null || animate.opacity != null;
  const hasScale   = initial.scale != null || animate.scale != null;
  const hasStagger = variant.transition?.staggerChildren != null;

  if (hasStagger && hasY)   return { pattern: 'stagger',   confidence: 0.9  };
  if (hasStagger)           return { pattern: 'stagger',   confidence: 0.85 };
  if (hasY && hasOpacity)   return { pattern: 'slide-up',  confidence: 0.85 };
  if (hasX && hasOpacity)   return { pattern: 'slide-in',  confidence: 0.85 };
  if (hasOpacity && !hasY && !hasX) return { pattern: 'fade-in', confidence: 0.85 };
  if (hasScale)             return { pattern: 'morph',     confidence: 0.7  };

  return { pattern: 'fade-in', confidence: 0.5 };
}

// ── Main classify function ───────────────────────────────────────────────────
// Takes the assembled detections from index.js and returns an array of
// classified animation objects ready for the motion spec.

export function classifyAnimations(detections = {}) {
  const results = [];
  let idCounter = 1;

  const makeId = (prefix) => `${prefix}-${String(idCounter++).padStart(3, '0')}`;

  // ── CSS keyframes ──
  if (detections.cssKeyframes?.keyframes) {
    for (const kf of detections.cssKeyframes.keyframes) {
      if (!kf.isUsed) continue; // skip unreferenced @keyframes
      const { pattern, confidence } = classifyKeyframe(kf);
      results.push({
        id: makeId(pattern),
        pattern,
        confidence,
        source: 'css-keyframes',
        name: kf.name,
        keyframe: kf,
        reducedMotion: null, // filled by index.js after classification
      });
    }
  }

  // ── CSS transitions ──
  if (detections.cssTransitions?.transitions) {
    for (const t of detections.cssTransitions.transitions) {
      const { pattern, confidence } = classifyTransition(t);
      results.push({
        id: makeId(pattern),
        pattern,
        confidence,
        source: 'css-transitions',
        property: t.property,
        duration: t.durationMs,
        durationBucket: t.durationBucket,
        delay: t.delayMs,
        easing: t.easing,
        easingName: t.easingName,
        element: t.element,
        reducedMotion: null,
      });
    }
  }

  // ── GSAP tweens ──
  if (detections.gsap?.tweens) {
    for (const tween of detections.gsap.tweens) {
      const { pattern, confidence } = classifyGsapTween(tween);
      results.push({
        id: makeId(pattern),
        pattern,
        confidence,
        source: 'gsap',
        duration: tween.duration ? tween.duration * 1000 : null,
        delay: tween.delay ? tween.delay * 1000 : null,
        easing: tween.vars?.ease || null,
        easingName: nameEasing(tween.vars?.ease),
        stagger: tween.vars?.stagger || null,
        scrollTrigger: tween.scrollTrigger || null,
        targets: tween.targets || [],
        reducedMotion: null,
      });
    }
  }

  // ── Framer Motion variants ──
  if (detections.framer?.variants) {
    for (const variant of detections.framer.variants) {
      const { pattern, confidence } = classifyFramerVariant(variant);
      results.push({
        id: makeId(pattern),
        pattern,
        confidence,
        source: 'framer-motion',
        variant,
        reducedMotion: null,
      });
    }
  }

  return results;
}