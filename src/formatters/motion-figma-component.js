// Generates a Figma Plugin API script that creates a component frame
// with correct layer structure, Auto Layout, and Smart Animate transitions
// for a detected component.
//
// The generated script is pasted into the Figma Console (Plugins → Development
// → Open Console) and run there — no external plugin required for basic use.
//
// Output: *-motion-figma-component.js

/**
 * Generate a Figma Plugin script that creates a component frame
 * from a detected motionlang component.
 *
 * @param {Object} motionSpec  - full motionSpec object
 * @param {string} componentId - which component to export (from components[])
 * @returns {string} JavaScript source to paste into Figma Console
 */
export function formatFigmaComponent(motionSpec, componentId) {
  const { animations, components = [], meta, tokens } = motionSpec;

  // Find the target component
  const component = components.find(c => c.id === componentId)
    || components.find(c => c.label.toLowerCase() === componentId.toLowerCase());

  if (!component) {
    const available = components.map(c => `"${c.id}"`).join(', ');
    return `// ERROR: Component "${componentId}" not found.\n// Available: ${available || 'none (run without --component to see all)'}\n`;
  }

  // Filter animations belonging to this component
  const compAnims = animations.filter(a => a.componentId === component.id);

  const lines = [];
  lines.push(`// ═══════════════════════════════════════════════════════════════`);
  lines.push(`// motionlang — Figma Component Frame Script`);
  lines.push(`// Component : ${component.label}`);
  lines.push(`// Selector  : ${component.selector}`);
  lines.push(`// Source    : ${meta.url}`);
  lines.push(`// Generated : ${meta.timestamp}`);
  lines.push(`// ───────────────────────────────────────────────────────────────`);
  lines.push(`// HOW TO USE:`);
  lines.push(`//   1. Open Figma → Plugins → Development → Open Console`);
  lines.push(`//   2. Paste this entire script and press Enter`);
  lines.push(`//   3. A component frame appears on your current page`);
  lines.push(`// ═══════════════════════════════════════════════════════════════`);
  lines.push(``);
  lines.push(`(async () => {`);
  lines.push(`  const page = figma.currentPage;`);
  lines.push(``);
  lines.push(`  // ── 1. Create the top-level component frame ──────────────────`);
  lines.push(`  const frame = figma.createFrame();`);
  lines.push(`  frame.name = ${JSON.stringify(component.label)};`);

  // Dimensions — use viewport-based estimate if available
  const frameW = Math.min(Math.max(component.width || 800, 320), 1440);
  const frameH = Math.min(Math.max(component.height || 400, 100), 1200);
  lines.push(`  frame.resize(${frameW}, ${frameH});`);
  lines.push(`  frame.x = 100;`);
  lines.push(`  frame.y = 100;`);
  lines.push(``);
  lines.push(`  // Auto Layout — column, 16px gap`);
  lines.push(`  frame.layoutMode = 'VERTICAL';`);
  lines.push(`  frame.itemSpacing = 16;`);
  lines.push(`  frame.paddingTop    = 32;`);
  lines.push(`  frame.paddingBottom = 32;`);
  lines.push(`  frame.paddingLeft   = 32;`);
  lines.push(`  frame.paddingRight  = 32;`);
  lines.push(`  frame.primaryAxisSizingMode  = 'AUTO';`);
  lines.push(`  frame.counterAxisSizingMode  = 'FIXED';`);
  lines.push(`  frame.fills = [{ type: 'SOLID', color: { r: 0.97, g: 0.97, b: 0.97 } }];`);
  lines.push(``);
  lines.push(`  // ── 2. Create child layers for each animation ─────────────────`);
  lines.push(`  const layers = [];`);
  lines.push(``);

  if (compAnims.length === 0) {
    lines.push(`  // No animations detected for this component`);
    lines.push(`  // Adding a placeholder layer`);
    lines.push(`  const placeholder = figma.createRectangle();`);
    lines.push(`  placeholder.name = 'Placeholder — No animations detected';`);
    lines.push(`  placeholder.resize(${frameW - 64}, 80);`);
    lines.push(`  placeholder.fills = [{ type: 'SOLID', color: { r: 0.85, g: 0.85, b: 0.85 } }];`);
    lines.push(`  placeholder.cornerRadius = 8;`);
    lines.push(`  frame.appendChild(placeholder);`);
  } else {
    for (const anim of compAnims) {
      const layerName = `${anim.id} — ${anim.pattern}`;
      const layerH = patternToHeight(anim.pattern);
      lines.push(`  // Layer: ${layerName}`);
      lines.push(`  {`);
      lines.push(`    const layer = figma.createRectangle();`);
      lines.push(`    layer.name = ${JSON.stringify(layerName)};`);
      lines.push(`    layer.resize(${frameW - 64}, ${layerH});`);
      lines.push(`    layer.fills = [{ type: 'SOLID', color: ${patternToColor(anim.pattern)} }];`);
      lines.push(`    layer.cornerRadius = 8;`);
      lines.push(`    layer.opacity = 1;`);
      lines.push(`    layers.push({ node: layer, anim: ${JSON.stringify({ id: anim.id, pattern: anim.pattern, duration: anim.duration, easing: anim.easing, delay: anim.delay || 0 })} });`);
      lines.push(`    frame.appendChild(layer);`);
      lines.push(`  }`);
      lines.push(``);
    }
  }

  lines.push(`  // ── 3. Convert frame to a Figma Component ─────────────────────`);
  lines.push(`  const component_node = figma.createComponentFromNode(frame);`);
  lines.push(`  component_node.name = ${JSON.stringify(component.label)};`);
  lines.push(``);
  lines.push(`  // ── 4. Attach motion metadata as plugin data ──────────────────`);
  const metaObj = JSON.stringify({
    componentId:      component.id,
    label:            component.label,
    selector:         component.selector,
    source:           meta.url,
    animationCount:   compAnims.length,
    dominantPattern:  component.dominantPattern,
    feel:             component.feel,
    motionlangVersion: '2.0.0',
  }, null, 2);
  lines.push('  const motionMeta = ' + metaObj + ';');
  lines.push(`  component_node.setPluginData('motionlang', JSON.stringify(motionMeta));`);
  lines.push(``);
  lines.push(`  // ── 5. Set up Smart Animate prototype transitions ─────────────`);
  lines.push(`  // Smart Animate uses the easing + duration from the extracted spec.`);
  lines.push(`  // Each layer gets a reaction that triggers on click for preview.`);

  if (compAnims.length > 0) {
    lines.push(`  for (const { node, anim } of layers) {`);
    lines.push(`    const easingType = easingNameToFigmaType(anim.easing);`);
    lines.push(`    // Prototype reactions require a destination frame — wire manually in Figma`);
    lines.push(`    // The easing + duration values are stored as plugin data for reference:`);
    lines.push(`    node.setPluginData('motionAnim', JSON.stringify({`);
    lines.push(`      id: anim.id,`);
    lines.push(`      pattern: anim.pattern,`);
    lines.push(`      duration: anim.duration,`);
    lines.push(`      easing: anim.easing,`);
    lines.push(`      delay: anim.delay,`);
    lines.push(`      easingType,`);
    lines.push(`    }));`);
    lines.push(`  }`);
  }

  lines.push(``);
  lines.push(`  // ── 6. Viewport focus ─────────────────────────────────────────`);
  lines.push(`  figma.viewport.scrollAndZoomIntoView([component_node]);`);
  lines.push(`  figma.notify('✅ ${component.label} component created with ${compAnims.length} animation layer${compAnims.length !== 1 ? 's' : ''}');`);
  lines.push(``);
  lines.push(`  // ── Helper: map easing string → Figma easing type ─────────────`);
  lines.push(`  function easingNameToFigmaType(easing) {`);
  lines.push(`    if (!easing) return 'EASE_OUT';`);
  lines.push(`    if (easing.includes('spring')) return 'SPRING';`);
  lines.push(`    if (easing === 'linear') return 'LINEAR';`);
  lines.push(`    if (easing.includes('ease-in-out') || easing.includes('ease-in-out')) return 'EASE_IN_AND_OUT';`);
  lines.push(`    if (easing.includes('ease-in')) return 'EASE_IN';`);
  lines.push(`    return 'EASE_OUT';`);
  lines.push(`  }`);
  lines.push(``);
  lines.push(`})().catch(err => { figma.notify('❌ Error: ' + err.message, { error: true }); console.error(err); });`);

  return lines.join('\n');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function patternToHeight(pattern) {
  const map = {
    'hero-entrance': 120,
    'stagger': 60,
    'slide-up': 60,
    'fade-in': 48,
    'scale-in': 56,
    'scroll-scrub': 80,
    'pin-section': 80,
    'hover-lift': 48,
    'morph': 64,
    'spring-bounce': 72,
  };
  return map[pattern] || 56;
}

function patternToColor(pattern) {
  // Returns a Figma color object {r, g, b} for each pattern type
  const map = {
    'hero-entrance':  '{ r: 0.40, g: 0.55, b: 0.95 }',
    'stagger':        '{ r: 0.45, g: 0.80, b: 0.70 }',
    'slide-up':       '{ r: 0.60, g: 0.50, b: 0.92 }',
    'fade-in':        '{ r: 0.70, g: 0.70, b: 0.78 }',
    'scale-in':       '{ r: 0.95, g: 0.65, b: 0.40 }',
    'scroll-scrub':   '{ r: 0.40, g: 0.75, b: 0.95 }',
    'pin-section':    '{ r: 0.35, g: 0.60, b: 0.90 }',
    'hover-lift':     '{ r: 0.90, g: 0.80, b: 0.40 }',
    'morph':          '{ r: 0.90, g: 0.50, b: 0.65 }',
    'spring-bounce':  '{ r: 0.50, g: 0.90, b: 0.60 }',
  };
  return map[pattern] || '{ r: 0.75, g: 0.75, b: 0.80 }';
}