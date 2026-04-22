// Maps raw cubic-bezier strings and CSS keywords to human-readable names.
// Used across formatters and the classifier.

export const EASING_NAMES = {
  'linear': 'linear',
  'ease': 'ease',
  'ease-in': 'ease-in',
  'ease-out': 'ease-out',
  'ease-in-out': 'ease-in-out',
  'cubic-bezier(0.4, 0, 0.2, 1)': 'material-standard',
  'cubic-bezier(0.4, 0, 1, 1)': 'material-accelerate',
  'cubic-bezier(0, 0, 0.2, 1)': 'material-decelerate',
  'cubic-bezier(0.16, 1, 0.3, 1)': 'expressive-decelerate',
  'cubic-bezier(0.87, 0, 0.13, 1)': 'expressive-in-out',
  'cubic-bezier(0.33, 0.12, 0.15, 1)': 'expressive-standard',
  'cubic-bezier(0.39, 0.18, 0.17, 0.99)': 'expressive-enter',
  'cubic-bezier(0.25, 1, 0.5, 1)': 'smooth-decelerate',
  'cubic-bezier(0.25, 0.46, 0.45, 0.94)': 'smooth-decelerate',
  'cubic-bezier(0.32, 0.72, 0, 1)': 'snappy',
  'cubic-bezier(0.22, 1, 0.36, 1)': 'expo-out',
  'cubic-bezier(0.76, 0, 0.24, 1)': 'expo-in-out',
  'cubic-bezier(0.34, 1.56, 0.64, 1)': 'spring-overshoot',
  'cubic-bezier(0.68, -0.6, 0.32, 1.6)': 'spring-bouncy',
};

export function nameEasing(value) {
  if (!value) return 'unknown';
  const trimmed = value.trim().toLowerCase();

  // Direct lookup
  if (EASING_NAMES[trimmed]) return EASING_NAMES[trimmed];

  // Fuzzy cubic-bezier match (normalise spaces)
  const normalised = trimmed.replace(/\s+/g, '');
  for (const [key, name] of Object.entries(EASING_NAMES)) {
    if (key.replace(/\s+/g, '') === normalised) return name;
  }

  // Classify by curve shape
  const cb = trimmed.match(/cubic-bezier\(\s*([\d.]+)\s*,\s*([-\d.]+)\s*,\s*([\d.]+)\s*,\s*([-\d.]+)\s*\)/);
  if (cb) {
    const [, x1, y1, x2, y2] = cb.map(Number);
    if (y1 > 1 || y2 > 1 || y1 < 0 || y2 < 0) return 'spring-like';
    if (x1 < 0.2 && x2 > 0.8) return 'ease-in-out-custom';
    if (x1 < 0.2) return 'ease-in-custom';
    if (x2 > 0.8) return 'ease-out-custom';
  }

  return 'custom';
}

// Duration bucket classifier
export function bucketDuration(ms) {
  const n = parseFloat(ms);
  if (isNaN(n)) return 'unknown';
  if (n <= 100) return 'instant';
  if (n <= 200) return 'xs';
  if (n <= 400) return 'sm';
  if (n <= 700) return 'md';
  return 'lg';
}

// Parse a raw duration string like "300ms" or "0.3s" → number in ms
export function parseDurationMs(raw) {
  if (!raw) return null;
  const str = raw.trim();
  if (str.endsWith('ms')) return parseFloat(str);
  if (str.endsWith('s')) return parseFloat(str) * 1000;
  return null;
}