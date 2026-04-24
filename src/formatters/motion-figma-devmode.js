// Generates a Figma Plugin API script that adds GSAP and Framer Motion
// code snippets to component layers in Figma Dev Mode.
//
// When a developer clicks a component in Figma Dev Mode, they see
// paste-ready GSAP and Framer Motion code in the panel.
//
// Output: *-motion-figma-devmode.js

/**
 * Generate a Figma Plugin script that attaches Dev Mode code snippets
 * to component layers using the Code Snippet Editor API.
 *
 * @param {Object}  motionSpec   - full motionSpec object
 * @param {string}  [componentId] - scope to this component (optional)
 * @returns {string} JavaScript source to paste into Figma Console
 */
export function formatFigmaDevMode(motionSpec, componentId) {
  const { animations, components = [], meta, tokens } = motionSpec;

  // Scope animations
  let targetAnims = animations;
  let targetComponent = null;

  if (componentId) {
    targetComponent = components.find(c => c.id === componentId)
      || components.find(c => c.label.toLowerCase() === componentId.toLowerCase());
    if (targetComponent) {
      targetAnims = animations.filter(a => a.componentId === targetComponent.id);
    }
  }

  const snippets = targetAnims.map(anim => ({
    animId:    anim.id,
    layerName: `${anim.id} — ${anim.pattern}`,
    gsap:      buildGsapSnippet(anim, tokens),
    framer:    buildFramerSnippet(anim, tokens),
    css:       buildCssSnippet(anim),
  }));

  const lines = [];
  lines.push(`// ═══════════════════════════════════════════════════════════════`);
  lines.push(`// motionlang — Figma Dev Mode Snippets Script`);
  if (targetComponent) {
    lines.push(`// Component  : ${targetComponent.label}`);
  }
  lines.push(`// Source     : ${meta.url}`);
  lines.push(`// Generated  : ${meta.timestamp}`);
  lines.push(`// Snippets   : ${snippets.length} animations × 3 frameworks`);
  lines.push(`// ───────────────────────────────────────────────────────────────`);
  lines.push(`// HOW TO USE:`);
  lines.push(`//   1. Open Figma → Plugins → Development → Open Console`);
  lines.push(`//   2. Select the component frame on your canvas`);
  lines.push(`//   3. Paste this entire script and press Enter`);
  lines.push(`//   4. Open Dev Mode, click any layer → see code snippets in panel`);
  lines.push(`// ═══════════════════════════════════════════════════════════════`);
  lines.push(``);
  lines.push(`(async () => {`);
  lines.push(`  const page = figma.currentPage;`);
  lines.push(`  const selection = page.selection;`);
  lines.push(``);
  lines.push(`  if (selection.length === 0) {`);
  lines.push(`    figma.notify('⚠️ Select a frame or component first', { error: true });`);
  lines.push(`    return;`);
  lines.push(`  }`);
  lines.push(``);
  lines.push(`  // Snippet data indexed by layer name`);
  lines.push(`  const snippetMap = ${JSON.stringify(buildSnippetMap(snippets), null, 2)};`);
  lines.push(``);
  lines.push(`  let attached = 0;`);
  lines.push(``);
  lines.push(`  function attachSnippetsToNode(node) {`);
  lines.push(`    const key = node.name;`);
  lines.push(`    const data = snippetMap[key];`);
  lines.push(`    if (data) {`);
  lines.push(`      // Store snippets as plugin data — readable in Dev Mode via Code Snippet Editor`);
  lines.push(`      node.setSharedPluginData('motionlang', 'gsap',   data.gsap);`);
  lines.push(`      node.setSharedPluginData('motionlang', 'framer', data.framer);`);
  lines.push(`      node.setSharedPluginData('motionlang', 'css',    data.css);`);
  lines.push(`      node.setSharedPluginData('motionlang', 'meta',   JSON.stringify({`);
  lines.push(`        animId:  data.animId,`);
  lines.push(`        source:  ${JSON.stringify(meta.url)},`);
  lines.push(`        version: '2.0.0',`);
  lines.push(`      }));`);
  lines.push(`      attached++;`);
  lines.push(`    }`);
  lines.push(`    // Recurse into children`);
  lines.push(`    if ('children' in node) {`);
  lines.push(`      for (const child of node.children) {`);
  lines.push(`        attachSnippetsToNode(child);`);
  lines.push(`      }`);
  lines.push(`    }`);
  lines.push(`  }`);
  lines.push(``);
  lines.push(`  for (const node of selection) {`);
  lines.push(`    attachSnippetsToNode(node);`);
  lines.push(`  }`);
  lines.push(``);
  lines.push(`  figma.notify('✅ Dev Mode snippets attached to ' + attached + ' layer' + (attached !== 1 ? 's' : ''));`);
  lines.push(``);
  lines.push(`  // ── Also write a summary to the top-level selection nodes ─────`);
  lines.push(`  for (const node of selection) {`);
  lines.push(`    const summary = {`);
  lines.push(`      source:         ${JSON.stringify(meta.url)},`);
  lines.push(`      component:      ${JSON.stringify(targetComponent?.label || 'all')},`);
  lines.push(`      animationCount: ${snippets.length},`);
  lines.push(`      frameworks:     ['gsap', 'framer-motion', 'css'],`);
  lines.push(`      motionlang:     '2.0.0',`);
  lines.push(`    };`);
  lines.push(`    node.setSharedPluginData('motionlang', 'summary', JSON.stringify(summary));`);
  lines.push(`  }`);
  lines.push(``);
  lines.push(`})().catch(err => { figma.notify('❌ Error: ' + err.message, { error: true }); console.error(err); });`);

  return lines.join('\n');
}

// ── Snippet builders ──────────────────────────────────────────────────────────

function buildGsapSnippet(anim, tokens) {
  const durationSec = anim.duration ? (anim.duration / 1000).toFixed(2) : '0.4';
  const ease = anim.easing || 'power2.out';
  const delay = anim.delay ? `\n  delay: ${(anim.delay / 1000).toFixed(2)},` : '';
  const stagger = anim.staggerInterval ? `\n  stagger: ${(anim.staggerInterval / 1000).toFixed(2)},` : '';
  const from = gsapFromProps(anim.pattern);

  const lines = [
    `// ${anim.id} — ${anim.pattern}`,
    `// Source: motionlang extraction from ${tokens ? 'live site' : 'unknown'}`,
    `gsap.from('[data-anim="${anim.id}"]', {`,
    `  ${from}`,
    `  duration: ${durationSec},`,
    `  ease: '${ease}',${delay}${stagger}`,
    `});`,
  ];

  if (anim.pattern === 'scroll-scrub' || anim.pattern === 'intersection-observer') {
    lines.splice(2, 0, `// Scroll-triggered version:`);
    lines.push(`// scrollTrigger: { trigger: '[data-anim="${anim.id}"]', start: 'top 80%' }`);
  }

  return lines.join('\n');
}

function buildFramerSnippet(anim, tokens) {
  const durationSec = anim.duration ? (anim.duration / 1000).toFixed(2) : '0.4';
  const ease = anim.easing || 'easeOut';
  const delay = anim.delay ? `\n      delay: ${(anim.delay / 1000).toFixed(2)},` : '';
  const { hidden, visible } = framerVariants(anim.pattern);

  return [
    `// ${anim.id} — ${anim.pattern}`,
    `const ${toCamelCase(anim.id)}Variants = {`,
    `  hidden:  ${hidden},`,
    `  visible: {`,
    `    ...${visible},`,
    `    transition: {`,
    `      duration: ${durationSec},`,
    `      ease: '${ease}',${delay}`,
    `    },`,
    `  },`,
    `};`,
    ``,
    `// Usage:`,
    `// <motion.div variants={${toCamelCase(anim.id)}Variants} initial="hidden" animate="visible" />`,
  ].join('\n');
}

function buildCssSnippet(anim) {
  const duration = anim.duration ? `${anim.duration}ms` : '400ms';
  const easing = anim.easing || 'ease-out';
  const delay = anim.delay ? `${anim.delay}ms` : '0ms';
  const keyframes = cssKeyframes(anim.pattern, anim.id);

  return [
    `/* ${anim.id} — ${anim.pattern} */`,
    keyframes,
    ``,
    `[data-anim="${anim.id}"] {`,
    `  animation: ${toCamelCase(anim.id)} ${duration} ${easing} ${delay} both;`,
    `}`,
    ``,
    `@media (prefers-reduced-motion: reduce) {`,
    `  [data-anim="${anim.id}"] {`,
    `    animation-duration: 0.01ms;`,
    `    animation-iteration-count: 1;`,
    `  }`,
    `}`,
  ].join('\n');
}

// ── Pattern helpers ───────────────────────────────────────────────────────────

function gsapFromProps(pattern) {
  const map = {
    'fade-in':       'opacity: 0,',
    'slide-up':      'opacity: 0, y: 40,',
    'scale-in':      'opacity: 0, scale: 0.85,',
    'hero-entrance': 'opacity: 0, y: 60, scale: 0.95,',
    'spring-bounce': 'opacity: 0, y: 30, scale: 0.9,',
    'hover-lift':    'y: 0, boxShadow: "none",',
    'morph':         'scaleX: 0.8, opacity: 0,',
    'stagger':       'opacity: 0, y: 20,',
  };
  return map[pattern] || 'opacity: 0,';
}

function framerVariants(pattern) {
  const map = {
    'fade-in':       { hidden: '{ opacity: 0 }',              visible: '{ opacity: 1 }' },
    'slide-up':      { hidden: '{ opacity: 0, y: 40 }',       visible: '{ opacity: 1, y: 0 }' },
    'scale-in':      { hidden: '{ opacity: 0, scale: 0.85 }', visible: '{ opacity: 1, scale: 1 }' },
    'hero-entrance': { hidden: '{ opacity: 0, y: 60 }',       visible: '{ opacity: 1, y: 0 }' },
    'spring-bounce': { hidden: '{ opacity: 0, y: 30 }',       visible: '{ opacity: 1, y: 0 }' },
    'morph':         { hidden: '{ scaleX: 0.8, opacity: 0 }', visible: '{ scaleX: 1, opacity: 1 }' },
    'stagger':       { hidden: '{ opacity: 0, y: 20 }',       visible: '{ opacity: 1, y: 0 }' },
  };
  return map[pattern] || { hidden: '{ opacity: 0 }', visible: '{ opacity: 1 }' };
}

function cssKeyframes(pattern, id) {
  const name = toCamelCase(id);
  const map = {
    'fade-in':       `@keyframes ${name} { from { opacity: 0; } to { opacity: 1; } }`,
    'slide-up':      `@keyframes ${name} { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }`,
    'scale-in':      `@keyframes ${name} { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: scale(1); } }`,
    'hero-entrance': `@keyframes ${name} { from { opacity: 0; transform: translateY(60px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }`,
    'spring-bounce': `@keyframes ${name} { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }`,
    'morph':         `@keyframes ${name} { from { opacity: 0; transform: scaleX(0.8); } to { opacity: 1; transform: scaleX(1); } }`,
    'stagger':       `@keyframes ${name} { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }`,
  };
  return map[pattern] || `@keyframes ${name} { from { opacity: 0; } to { opacity: 1; } }`;
}

function buildSnippetMap(snippets) {
  const map = {};
  for (const s of snippets) {
    map[s.layerName] = {
      animId: s.animId,
      gsap:   s.gsap,
      framer: s.framer,
      css:    s.css,
    };
  }
  return map;
}

function toCamelCase(str) {
  return str.replace(/[-_](.)/g, (_, c) => c.toUpperCase()).replace(/^[^a-zA-Z]/, '');
}