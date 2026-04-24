// Generates an MCP resource file.
// Claude Code, Cursor, and Windsurf read this file to understand
// the product's motion system when generating components.
// Place at .motionlang/motion-spec.mcp.json in your repo root.

export function formatMcp(motionSpec) {
  const { animations, tokens, fingerprint, meta } = motionSpec;

  const resource = {
    schema: 'motionlang/mcp@1.0',
    source: meta.url,
    timestamp: meta.timestamp,
    ...(meta.component && { component: { id: meta.component.id, label: meta.component.label, selector: meta.component.selector } }),

    // Top-level summary for the LLM context window
    summary: [
      `This product uses ${fingerprint.dominantLibrary} for animations.`,
      `The motion feel is ${fingerprint.feel}.`,
      `${fingerprint.animationCount} animation patterns detected.`,
      fingerprint.reducedMotionSupport
        ? 'prefers-reduced-motion is supported — always include reduced-motion fallbacks.'
        : 'WARNING: prefers-reduced-motion not detected. Add reduced-motion support.',
    ].join(' '),

    // Token reference — use these values in generated components
    tokens: {
      durations: Object.fromEntries(
        tokens.durations.map(d => [d.bucket || d.name, d.value])
      ),
      easings: Object.fromEntries(
        tokens.easings.map(e => [e.humanName, e.value])
      ),
    },

    // Pattern library — canonical animation patterns for this product
    patterns: animations.map(anim => ({
      id: anim.id,
      pattern: anim.pattern,
      duration: anim.duration ? `${anim.duration}ms` : null,
      easing: anim.easing || null,
      easingName: anim.easingName || null,
      source: anim.source || null,
    })),

    // Instructions for AI coding agents
    instructions: [
      `When generating animated components for this product, use these exact duration and easing values.`,
      `Dominant animation pattern is "${fingerprint.dominantPattern}" — match this style in new components.`,
      `Always wrap animations in a prefers-reduced-motion media query or equivalent hook.`,
      `Primary animation library: ${fingerprint.dominantLibrary}.`,
    ],
  };

  return JSON.stringify(resource, null, 2);
}