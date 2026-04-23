// Detects custom cursor follower elements — a DOM element that trails
// the real cursor with physics-based lag (lerp / spring).
// Detected by observing elements that follow mouse position with delay.

export function detectCursorFollower(rawData) {
  const follower = rawData.mouseInteractions?.cursorFollower;
  if (!follower?.detected) return null;

  return {
    detected: true,
    element: follower.element || null,
    lagFactor: follower.lagFactor ?? null,  // 0–1, higher = more lag/trail
    selector: follower.selector || null,
    style: follower.style || null,          // 'dot' | 'ring' | 'blob' | 'custom'
    counts: { total: 1 },
  };
}
