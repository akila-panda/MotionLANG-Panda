// Detects 3D card tilt effects — elements that rotate on X/Y axes
// in response to mouse position within the element bounds.
// Detected by observing rotateX/rotateY in computed transform during traversal.

export function detectTilt3d(rawData) {
  const tilt = rawData.mouseInteractions?.tilt;
  if (!tilt?.detected) return null;

  const elements = (tilt.elements || []).map(el => ({
    element: el.element,
    maxRotateX: el.maxRotateX ?? null,  // max degrees of X rotation
    maxRotateY: el.maxRotateY ?? null,  // max degrees of Y rotation
    perspective: el.perspective ?? null, // CSS perspective value in px
    selector: el.selector || null,
  }));

  if (elements.length === 0) return null;

  return {
    detected: true,
    elements,
    counts: { total: elements.length },
  };
}
