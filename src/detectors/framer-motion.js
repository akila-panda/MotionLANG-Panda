// Detects Framer Motion variants and spring configs from the page.
// Framer Motion exposes data via window.__framer_importFromPackage or
// React DevTools bridge. For server-rendered pages we fall back to
// inspecting motion component data attributes.

import { nameEasing } from '../utils/easing-names.js';

export function detectFramerMotion(rawData) {
  const framer = rawData.framer;
  if (!framer?.detected) return null;

  // At this stage the crawler returns { detected: true } from the basic
  // window check. Enrich with any variant data if present.
  const variants = framer.variants || [];
  const springs  = framer.springs  || [];

  const enrichedVariants = variants.map(v => ({
    ...v,
    easingName: nameEasing(v.transition?.ease || null),
  }));

  return {
    detected: true,
    variants: enrichedVariants,
    springs,
    counts: {
      variants: enrichedVariants.length,
      springs:  springs.length,
    },
  };
}