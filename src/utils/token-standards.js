// Canonical DTCG-aligned motion token naming convention.
// Used by token-normalise.js and token-merge.js.
// All outputs using --standardise will reference these names.

// Duration scale: canonical names mapped to ms ranges [min, max)
export const DURATION_SCALE = [
  { name: 'motion/duration/instant', min: 0,    max: 80   },
  { name: 'motion/duration/xs',      min: 80,   max: 200  },
  { name: 'motion/duration/sm',      min: 200,  max: 400  },
  { name: 'motion/duration/md',      min: 400,  max: 700  },
  { name: 'motion/duration/lg',      min: 700,  max: 1100 },
  { name: 'motion/duration/xl',      min: 1100, max: Infinity },
];

// Easing families: canonical names with associated curve shapes and keywords
export const EASING_FAMILIES = [
  {
    name: 'motion/easing/standard',
    description: 'General-purpose easing — enters and exits with similar feel',
    keywords: ['ease', 'ease-in-out', 'material-standard', 'ease-in-out-custom'],
    cubicBeziers: [
      'cubic-bezier(0.4, 0, 0.2, 1)', // material-standard
      'cubic-bezier(0.87, 0, 0.13, 1)', // expressive-in-out
      'cubic-bezier(0.76, 0, 0.24, 1)', // expo-in-out
      'cubic-bezier(0.33, 0.12, 0.15, 1)', // expressive-standard
    ],
    // Heuristic: moderate x1, high x2 → balanced curve
    heuristic: (x1, y1, x2, y2) => x1 >= 0.2 && x1 <= 0.5 && x2 >= 0.5 && x2 <= 0.9,
  },
  {
    name: 'motion/easing/decelerate',
    description: 'Enter animations — elements come in with energy, settle softly',
    keywords: [
      'ease-out', 'material-decelerate', 'expressive-decelerate',
      'smooth-decelerate', 'snappy', 'expo-out', 'ease-out-custom',
    ],
    cubicBeziers: [
      'cubic-bezier(0, 0, 0.2, 1)',   // material-decelerate
      'cubic-bezier(0.16, 1, 0.3, 1)', // expressive-decelerate
      'cubic-bezier(0.25, 1, 0.5, 1)', // smooth-decelerate
      'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      'cubic-bezier(0.32, 0.72, 0, 1)', // snappy
      'cubic-bezier(0.22, 1, 0.36, 1)', // expo-out
      'cubic-bezier(0.39, 0.18, 0.17, 0.99)', // expressive-enter
    ],
    // Heuristic: low x1 → slow start (decelerating from fast entry)
    heuristic: (x1, y1, x2, y2) => x1 <= 0.2 && x2 <= 0.5,
  },
  {
    name: 'motion/easing/accelerate',
    description: 'Exit animations — elements leave quickly',
    keywords: ['ease-in', 'material-accelerate', 'ease-in-custom'],
    cubicBeziers: [
      'cubic-bezier(0.4, 0, 1, 1)', // material-accelerate
    ],
    // Heuristic: high x1 → fast exit
    heuristic: (x1, y1, x2, y2) => x1 >= 0.4 && x2 >= 0.8,
  },
  {
    name: 'motion/easing/spring',
    description: 'Spring-based natural physics — overshoots or bounces',
    keywords: ['spring-overshoot', 'spring-bouncy', 'spring-like'],
    cubicBeziers: [
      'cubic-bezier(0.34, 1.56, 0.64, 1)',  // spring-overshoot
      'cubic-bezier(0.68, -0.6, 0.32, 1.6)', // spring-bouncy
    ],
    // Heuristic: y values outside [0,1] → spring/bounce
    heuristic: (x1, y1, x2, y2) => y1 > 1 || y2 > 1 || y1 < 0 || y2 < 0,
  },
  {
    name: 'motion/easing/linear',
    description: 'Mechanical, constant-rate — used for scroll-scrub and progress',
    keywords: ['linear'],
    cubicBeziers: ['linear'],
    heuristic: (x1, y1, x2, y2) => false, // only matched by keyword
  },
];

/**
 * Maps a duration in ms to the canonical DTCG name.
 * @param {number} ms
 * @returns {string} e.g. 'motion/duration/md'
 */
export function canonicaliseDuration(ms) {
  const n = parseFloat(ms);
  if (isNaN(n)) return 'motion/duration/md'; // fallback
  for (const bucket of DURATION_SCALE) {
    if (n >= bucket.min && n < bucket.max) return bucket.name;
  }
  return 'motion/duration/xl';
}

/**
 * Maps a cubic-bezier string or CSS keyword to the canonical DTCG easing name.
 * Uses: direct keyword match → known cubic-bezier match → heuristic → 'motion/easing/standard'.
 * @param {string} value  e.g. 'cubic-bezier(0.16, 1, 0.3, 1)' or 'ease-out'
 * @returns {string} e.g. 'motion/easing/decelerate'
 */
export function canonicaliseEasing(value) {
  if (!value) return 'motion/easing/standard';
  const trimmed = value.trim().toLowerCase().replace(/\s+/g, '');

  // 1. Match by keyword
  for (const family of EASING_FAMILIES) {
    if (family.keywords.some(k => k.replace(/\s+/g, '') === trimmed)) {
      return family.name;
    }
  }

  // 2. Match known cubic-bezier strings
  for (const family of EASING_FAMILIES) {
    if (family.cubicBeziers.some(cb => cb.replace(/\s+/g, '') === trimmed)) {
      return family.name;
    }
  }

  // 3. Heuristic from parsed curve values
  const match = trimmed.match(/cubic-bezier\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\)/);
  if (match) {
    const [, x1, y1, x2, y2] = match.map(Number);
    for (const family of EASING_FAMILIES) {
      if (family.heuristic(x1, y1, x2, y2)) return family.name;
    }
  }

  return 'motion/easing/standard'; // safe default
}

/**
 * Converts a site-derived token key (e.g. 'duration-md', 'easing-expressive-decelerate')
 * to its canonical DTCG name.
 * @param {'duration'|'easing'} type
 * @param {string} siteKey
 * @param {string|number} value  The actual ms or cubic-bezier value
 * @returns {string}
 */
export function canonicaliseTokenKey(type, siteKey, value) {
  if (type === 'duration') return canonicaliseDuration(value);
  if (type === 'easing') return canonicaliseEasing(value);
  return siteKey;
}