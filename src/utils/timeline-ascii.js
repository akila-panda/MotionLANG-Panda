// ASCII timeline generator.
// Takes an array of animations with duration and delay.
// Returns a formatted multi-line string showing proportional bars.

const BAR_WIDTH = 40; // max chars for the timeline area

/**
 * Build an ASCII bar chart for a group of animations.
 * Each row: "label │ ░░░░████████░░░│ delay–end ms"
 *
 * @param {Array<{id: string, duration: number, delay?: number, easing?: string, easingName?: string}>} animations
 * @param {object} [opts]
 * @param {string} [opts.title] - optional section title
 * @returns {string}
 */
export function timelineAscii(animations, opts = {}) {
  if (!animations || animations.length === 0) return '';

  // Normalise — only include animations that have duration
  const items = animations
    .filter(a => a.duration != null && a.duration > 0)
    .map(a => ({
      label: a.id || 'anim',
      duration: Math.round(a.duration),
      delay:    Math.round(a.delay || 0),
    }));

  if (items.length === 0) return '';

  const totalMs = Math.max(...items.map(i => i.delay + i.duration));
  if (totalMs <= 0) return '';

  // Label column width
  const labelWidth = Math.min(18, Math.max(...items.map(i => i.label.length)));

  const lines = [];

  if (opts.title) {
    lines.push(`**${opts.title} — Timeline (0–${totalMs}ms)**`);
    lines.push('');
  }

  lines.push('```');
  for (const item of items) {
    const label = item.label.padEnd(labelWidth).slice(0, labelWidth);

    // Convert delay + duration to bar positions (0..BAR_WIDTH)
    const startChar  = Math.round((item.delay / totalMs) * BAR_WIDTH);
    const endChar    = Math.round(((item.delay + item.duration) / totalMs) * BAR_WIDTH);
    const barLength  = Math.max(1, endChar - startChar);

    const pre   = '░'.repeat(startChar);
    const bar   = '█'.repeat(barLength);
    const post  = '░'.repeat(Math.max(0, BAR_WIDTH - startChar - barLength));

    const timing = item.delay > 0
      ? `  ${item.delay}–${item.delay + item.duration}ms`
      : `  0–${item.duration}ms`;

    lines.push(`${label} │${pre}${bar}${post}│${timing}`);
  }

  // Footer stats
  const staggerIntervals = detectStaggerInterval(items);
  const dominantEasing   = opts.easing || '';

  lines.push('');
  if (staggerIntervals !== null) {
    lines.push(`Stagger interval: ${staggerIntervals}ms  │  Total duration: ${totalMs}ms${dominantEasing ? `  │  Easing: ${dominantEasing}` : ''}`);
  } else {
    lines.push(`Total duration: ${totalMs}ms${dominantEasing ? `  │  Easing: ${dominantEasing}` : ''}`);
  }
  lines.push('```');

  return lines.join('\n');
}

/**
 * Detect a consistent stagger interval from sorted delay values.
 * Returns the interval in ms, or null if not consistent.
 *
 * @param {Array<{delay: number}>} items - sorted by delay
 * @returns {number|null}
 */
export function detectStaggerInterval(items) {
  if (items.length < 2) return null;

  const sorted  = [...items].sort((a, b) => a.delay - b.delay);
  const gaps    = [];

  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].delay - sorted[i - 1].delay;
    if (gap > 0) gaps.push(gap);
  }

  if (gaps.length === 0) return null;

  const minGap = Math.min(...gaps);
  const maxGap = Math.max(...gaps);

  // Consistent if all gaps are within ±30ms of each other
  if (maxGap - minGap <= 30) {
    return Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length);
  }

  return null;
}

/**
 * Decide whether a group of animations is worth showing a timeline for.
 * Criteria: 2+ animations AND at least one has a non-zero delay (stagger/sequence).
 *
 * @param {Array} animations
 * @returns {boolean}
 */
export function shouldRenderTimeline(animations) {
  if (!animations || animations.length < 2) return false;
  return animations.some(a => (a.delay || 0) > 0);
}