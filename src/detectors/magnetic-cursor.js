// Detects magnetic cursor effects — elements that attract the cursor
// toward their centre when the pointer enters a radius around them.
// Detected by observing element transform changes as cursor approaches.

export function detectMagneticCursor(rawData) {
  const magnetic = rawData.mouseInteractions?.magnetic;
  if (!magnetic?.detected) return null;

  const elements = (magnetic.elements || []).map(el => ({
    element: el.element,
    pullRadius: el.pullRadius ?? null,   // px radius at which pull activates
    pullStrength: el.pullStrength ?? null, // 0–1, fraction of offset applied
    selector: el.selector || null,
  }));

  if (elements.length === 0) return null;

  return {
    detected: true,
    elements,
    counts: { total: elements.length },
  };
}
