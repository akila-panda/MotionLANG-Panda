// Detects spotlight / radial gradient effects that follow the cursor.
// Common pattern: a radial-gradient background-image or mask that
// repositions on mousemove to create a "lit" region under the cursor.

export function detectSpotlight(rawData) {
  const spotlight = rawData.mouseInteractions?.spotlight;
  if (!spotlight?.detected) return null;

  const elements = (spotlight.elements || []).map(el => ({
    element: el.element,
    radius: el.radius ?? null,       // px radius of the spotlight
    color: el.color || null,         // spotlight color / gradient stop
    technique: el.technique || null, // 'background-gradient' | 'mask' | 'pseudo'
    selector: el.selector || null,
  }));

  if (elements.length === 0) return null;

  return {
    detected: true,
    elements,
    counts: { total: elements.length },
  };
}
