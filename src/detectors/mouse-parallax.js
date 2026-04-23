// Detects parallax depth layers driven by mouse movement.
// Parallax elements move at a different rate to the cursor —
// captured by observing transform changes during mouse grid traversal.

export function detectMouseParallax(rawData) {
  const parallax = rawData.mouseInteractions?.parallax;
  if (!parallax?.detected) return null;

  const layers = (parallax.layers || []).map(layer => ({
    element: layer.element,
    intensityX: layer.intensityX ?? null,  // px moved per 100px cursor travel
    intensityY: layer.intensityY ?? null,
    direction: layer.direction || 'both',   // 'x' | 'y' | 'both'
    depth: layer.depth ?? null,             // normalised 0–1, higher = more movement
  }));

  if (layers.length === 0) return null;

  return {
    detected: true,
    layers,
    counts: { total: layers.length },
  };
}
