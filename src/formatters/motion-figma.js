// Generates a Figma Variables-compatible JSON package.
// Import into Figma via the Variables Import plugin or
// the Figma Console MCP. Creates a "Motion" collection with
// duration and easing tokens.

export function formatFigma(motionSpec) {
  const { tokens, meta, fingerprint } = motionSpec;

  const collection = {
    name: 'Motion',
    modes: ['Default'],
    variables: [],
  };

  // Duration tokens
  for (const d of tokens.durations) {
    collection.variables.push({
      name: `duration/${d.bucket || d.name}`,
      type: 'NUMBER',
      values: { Default: parseInt(d.value) },
      description: `${d.value} — ${d.bucket} duration`,
      scopes: ['ALL_SCOPES'],
    });
  }

  // Easing tokens (stored as strings)
  for (const e of tokens.easings) {
    collection.variables.push({
      name: `easing/${e.humanName}`,
      type: 'STRING',
      values: { Default: e.value },
      description: `${e.humanName} — ${e.value}`,
      scopes: ['ALL_SCOPES'],
    });
  }

  const output = {
    version: '1.0',
    generator: 'motionlang',
    source: meta.url,
    timestamp: meta.timestamp,
    fingerprint: {
      feel: fingerprint.feel,
      dominantLibrary: fingerprint.dominantLibrary,
      animationCount: fingerprint.animationCount,
    },
    collections: [collection],
  };

  return JSON.stringify(output, null, 2);
}