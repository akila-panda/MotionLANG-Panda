// Generates Figma annotation card data for a component's animations.
// Produces a JSON file + an optional Figma Console script that places
// annotation cards over each animated layer.
//
// Annotation cards show: trigger, duration, easing, stagger, reduced-motion.
// Formatted for paste into Figma frames via the generated plugin script.
//
// Output: *-motion-figma-annotations.json  (data)
//         *-motion-figma-annotations.js    (plugin script)

/**
 * Generate annotation card data for all animations in a motionSpec.
 * Can be scoped to a single component or cover all animations.
 *
 * @param {Object}  motionSpec   - full motionSpec object
 * @param {string}  [componentId] - scope to this component id (optional)
 * @returns {{ json: string, script: string }}
 */
export function formatFigmaAnnotations(motionSpec, componentId) {
  const { animations, components = [], meta, fingerprint } = motionSpec;

  // Scope to component if specified
  let targetAnims = animations;
  let targetComponent = null;

  if (componentId) {
    targetComponent = components.find(c => c.id === componentId)
      || components.find(c => c.label.toLowerCase() === componentId.toLowerCase());
    if (targetComponent) {
      targetAnims = animations.filter(a => a.componentId === targetComponent.id);
    }
  }

  // Build annotation cards
  const cards = targetAnims.map(anim => buildAnnotationCard(anim, components));

  const annotationData = {
    version: '2.0',
    generator: 'motionlang',
    source: meta.url,
    timestamp: meta.timestamp,
    ...(targetComponent && {
      component: {
        id: targetComponent.id,
        label: targetComponent.label,
        selector: targetComponent.selector,
      },
    }),
    summary: {
      totalAnimations: cards.length,
      dominantPattern: fingerprint?.dominantPattern,
      feel: fingerprint?.feel,
      hasReducedMotion: cards.some(c => c.reducedMotion !== 'none'),
    },
    annotations: cards,
  };

  const json = JSON.stringify(annotationData, null, 2);
  const script = buildAnnotationScript(annotationData, targetComponent, meta);

  return { json, script };
}

// ── Annotation card builder ───────────────────────────────────────────────────

function buildAnnotationCard(anim, components) {
  const component = components.find(c => c.id === anim.componentId);

  return {
    animationId:   anim.id,
    componentId:   anim.componentId || null,
    componentLabel: component?.label || null,
    element:       formatElement(anim.element),
    pattern:       anim.pattern,
    patternLabel:  patternLabel(anim.pattern),
    trigger:       deriveTrigger(anim),
    duration:      anim.duration ? `${anim.duration}ms` : null,
    durationBucket: anim.durationBucket || null,
    easing:        anim.easing || null,
    easingName:    anim.easingName || null,
    delay:         anim.delay ? `${anim.delay}ms` : null,
    stagger:       anim.staggerInterval ? `${anim.staggerInterval}ms interval` : null,
    reducedMotion: describeReducedMotion(anim.reducedMotion),
    confidence:    anim.confidence ?? null,
    notes:         anim.annotations?.note || null,
    // Formatted card text — ready for Figma sticky note
    cardText:      buildCardText(anim, component),
  };
}

function buildCardText(anim, component) {
  const lines = [];
  lines.push(`⬡ ${anim.id}`);
  if (component) lines.push(`Component: ${component.label}`);
  lines.push(`Pattern: ${patternLabel(anim.pattern)}`);
  lines.push(`Trigger: ${deriveTrigger(anim)}`);
  if (anim.duration) lines.push(`Duration: ${anim.duration}ms (${anim.durationBucket || 'custom'})`);
  if (anim.easing)   lines.push(`Easing: ${anim.easingName || anim.easing}`);
  if (anim.delay)    lines.push(`Delay: ${anim.delay}ms`);
  if (anim.staggerInterval) lines.push(`Stagger: ${anim.staggerInterval}ms`);
  lines.push(`Reduced motion: ${describeReducedMotion(anim.reducedMotion)}`);
  return lines.join('\n');
}

// ── Figma Console script builder ──────────────────────────────────────────────

function buildAnnotationScript(data, targetComponent, meta) {
  const lines = [];
  lines.push(`// ═══════════════════════════════════════════════════════════════`);
  lines.push(`// motionlang — Figma Annotation Overlay Script`);
  if (targetComponent) {
    lines.push(`// Component  : ${targetComponent.label}`);
  }
  lines.push(`// Source     : ${meta.url}`);
  lines.push(`// Generated  : ${meta.timestamp}`);
  lines.push(`// Annotations: ${data.annotations.length} cards`);
  lines.push(`// ───────────────────────────────────────────────────────────────`);
  lines.push(`// HOW TO USE:`);
  lines.push(`//   1. Open Figma → Plugins → Development → Open Console`);
  lines.push(`//   2. Select the target frame or component on your canvas`);
  lines.push(`//   3. Paste this entire script and press Enter`);
  lines.push(`//   4. Annotation cards appear next to each animated layer`);
  lines.push(`// ═══════════════════════════════════════════════════════════════`);
  lines.push(``);
  lines.push(`(async () => {`);
  lines.push(`  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });`);
  lines.push(`  await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });`);
  lines.push(`  await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });`);
  lines.push(``);
  lines.push(`  const page = figma.currentPage;`);
  lines.push(`  const selection = figma.currentPage.selection;`);
  lines.push(`  const parentFrame = selection.length > 0 ? selection[0] : null;`);
  lines.push(``);
  lines.push(`  // Annotation data`);
  lines.push(`  const annotations = ${JSON.stringify(data.annotations, null, 2)};`);
  lines.push(``);
  lines.push(`  // ── Create annotation group ───────────────────────────────────`);
  lines.push(`  const group_nodes = [];`);
  lines.push(`  let yOffset = parentFrame ? parentFrame.y : 100;`);
  lines.push(`  let xOffset = parentFrame ? (parentFrame.x + parentFrame.width + 40) : 100;`);
  lines.push(``);
  lines.push(`  for (let i = 0; i < annotations.length; i++) {`);
  lines.push(`    const ann = annotations[i];`);
  lines.push(`    const card = await createAnnotationCard(ann, xOffset, yOffset + i * 180);`);
  lines.push(`    group_nodes.push(card);`);
  lines.push(`  }`);
  lines.push(``);
  lines.push(`  if (group_nodes.length > 1) {`);
  lines.push(`    const group = figma.group(group_nodes, page);`);
  lines.push(`    group.name = '📐 motionlang Annotations — ${targetComponent?.label || 'All'}';`);
  lines.push(`    figma.viewport.scrollAndZoomIntoView([group]);`);
  lines.push(`  } else if (group_nodes.length === 1) {`);
  lines.push(`    figma.viewport.scrollAndZoomIntoView(group_nodes);`);
  lines.push(`  }`);
  lines.push(``);
  lines.push(`  figma.notify('✅ ${data.annotations.length} annotation card${data.annotations.length !== 1 ? 's' : ''} created');`);
  lines.push(``);
  lines.push(`  // ── Card factory ─────────────────────────────────────────────`);
  lines.push(`  async function createAnnotationCard(ann, x, y) {`);
  lines.push(`    const CARD_W = 260;`);
  lines.push(`    const CARD_PAD = 16;`);
  lines.push(`    const card = figma.createFrame();`);
  lines.push(`    card.name = '📌 ' + ann.animationId;`);
  lines.push(`    card.resize(CARD_W, 160);`);
  lines.push(`    card.x = x;`);
  lines.push(`    card.y = y;`);
  lines.push(`    card.cornerRadius = 8;`);
  lines.push(`    card.fills = [{ type: 'SOLID', color: { r: 1, g: 0.98, b: 0.88 } }];`);
  lines.push(`    card.strokes = [{ type: 'SOLID', color: { r: 0.95, g: 0.80, b: 0.20 } }];`);
  lines.push(`    card.strokeWeight = 1.5;`);
  lines.push(`    card.layoutMode = 'VERTICAL';`);
  lines.push(`    card.itemSpacing = 6;`);
  lines.push(`    card.paddingTop = CARD_PAD;`);
  lines.push(`    card.paddingBottom = CARD_PAD;`);
  lines.push(`    card.paddingLeft = CARD_PAD;`);
  lines.push(`    card.paddingRight = CARD_PAD;`);
  lines.push(`    card.primaryAxisSizingMode = 'AUTO';`);
  lines.push(`    card.counterAxisSizingMode = 'FIXED';`);
  lines.push(``);
  lines.push(`    // Title row`);
  lines.push(`    addText(card, ann.animationId, 11, true, { r: 0.15, g: 0.15, b: 0.40 });`);
  lines.push(`    addText(card, ann.patternLabel, 10, false, { r: 0.30, g: 0.30, b: 0.50 });`);
  lines.push(`    addDivider(card, CARD_W - CARD_PAD * 2);`);
  lines.push(``);
  lines.push(`    // Fields`);
  lines.push(`    if (ann.trigger)       addField(card, 'Trigger',   ann.trigger);`);
  lines.push(`    if (ann.duration)      addField(card, 'Duration',  ann.duration + (ann.durationBucket ? ' (' + ann.durationBucket + ')' : ''));`);
  lines.push(`    if (ann.easing)        addField(card, 'Easing',    ann.easingName || ann.easing);`);
  lines.push(`    if (ann.delay)         addField(card, 'Delay',     ann.delay);`);
  lines.push(`    if (ann.stagger)       addField(card, 'Stagger',   ann.stagger);`);
  lines.push(`    if (ann.reducedMotion) addField(card, 'A11y',      ann.reducedMotion);`);
  lines.push(`    if (ann.notes)         addField(card, 'Note',      ann.notes);`);
  lines.push(``);
  lines.push(`    page.appendChild(card);`);
  lines.push(`    return card;`);
  lines.push(`  }`);
  lines.push(``);
  lines.push(`  function addText(parent, text, size, bold, color) {`);
  lines.push(`    const t = figma.createText();`);
  lines.push(`    t.fontName = { family: 'Inter', style: bold ? 'Bold' : 'Regular' };`);
  lines.push(`    t.fontSize = size;`);
  lines.push(`    t.characters = String(text);`);
  lines.push(`    t.fills = [{ type: 'SOLID', color }];`);
  lines.push(`    t.layoutAlign = 'STRETCH';`);
  lines.push(`    parent.appendChild(t);`);
  lines.push(`  }`);
  lines.push(``);
  lines.push(`  function addField(parent, label, value) {`);
  lines.push(`    const row = figma.createFrame();`);
  lines.push(`    row.layoutMode = 'HORIZONTAL';`);
  lines.push(`    row.itemSpacing = 8;`);
  lines.push(`    row.fills = [];`);
  lines.push(`    row.primaryAxisSizingMode = 'AUTO';`);
  lines.push(`    row.counterAxisSizingMode = 'AUTO';`);
  lines.push(`    const lbl = figma.createText();`);
  lines.push(`    lbl.fontName = { family: 'Inter', style: 'Medium' };`);
  lines.push(`    lbl.fontSize = 9;`);
  lines.push(`    lbl.characters = label.toUpperCase();`);
  lines.push(`    lbl.fills = [{ type: 'SOLID', color: { r: 0.55, g: 0.45, b: 0.10 } }];`);
  lines.push(`    const val = figma.createText();`);
  lines.push(`    val.fontName = { family: 'Inter', style: 'Regular' };`);
  lines.push(`    val.fontSize = 10;`);
  lines.push(`    val.characters = String(value);`);
  lines.push(`    val.fills = [{ type: 'SOLID', color: { r: 0.10, g: 0.10, b: 0.15 } }];`);
  lines.push(`    row.appendChild(lbl);`);
  lines.push(`    row.appendChild(val);`);
  lines.push(`    parent.appendChild(row);`);
  lines.push(`  }`);
  lines.push(``);
  lines.push(`  function addDivider(parent, w) {`);
  lines.push(`    const line = figma.createLine();`);
  lines.push(`    line.resize(w, 0);`);
  lines.push(`    line.strokes = [{ type: 'SOLID', color: { r: 0.90, g: 0.75, b: 0.20 }, opacity: 0.5 }];`);
  lines.push(`    parent.appendChild(line);`);
  lines.push(`  }`);
  lines.push(``);
  lines.push(`})().catch(err => { figma.notify('❌ Error: ' + err.message, { error: true }); console.error(err); });`);

  return lines.join('\n');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatElement(element) {
  if (!element) return null;
  if (typeof element === 'string') return element.substring(0, 80);
  return (element.outerHtml || element.classes || JSON.stringify(element)).substring(0, 80);
}

function deriveTrigger(anim) {
  const pattern = anim.pattern;
  if (pattern === 'scroll-scrub' || pattern === 'intersection-observer') return 'scroll';
  if (pattern === 'hover-lift' || pattern === 'hover-reveal') return 'hover';
  if (pattern === 'focus-ring') return 'focus';
  if (pattern === 'click-morph' || pattern === 'state-change') return 'interaction';
  if (pattern === 'pin-section') return 'scroll-pin';
  return 'page-load';
}

function describeReducedMotion(rm) {
  if (!rm || rm === 'none') return 'not supported ⚠️';
  if (rm === 'supported' || rm === true) return 'supported ✓';
  if (typeof rm === 'string') return rm;
  return 'supported ✓';
}

function patternLabel(pattern) {
  const map = {
    'fade-in':            'Fade In',
    'slide-up':           'Slide Up',
    'scale-in':           'Scale In',
    'stagger':            'Stagger Sequence',
    'hero-entrance':      'Hero Entrance',
    'scroll-scrub':       'Scroll-scrub',
    'pin-section':        'Pinned Section',
    'hover-lift':         'Hover Lift',
    'hover-reveal':       'Hover Reveal',
    'morph':              'Morph / Shape Change',
    'spring-bounce':      'Spring Bounce',
    'focus-ring':         'Focus Ring',
    'state-change':       'State Change',
    'click-morph':        'Click Morph',
    'intersection-observer': 'Intersection Observer',
  };
  return map[pattern] || pattern;
}