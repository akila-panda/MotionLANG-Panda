// Generates a Figma Variables-compatible JSON package.
// Import into Figma via the Variables Import plugin or
// the Figma Console MCP. Creates a "Motion" collection with
// duration and easing tokens.
//
// Schema logic is in utils/figma-token-schema.js.

import { buildFigmaCollection } from '../utils/figma-token-schema.js';

export function formatFigma(motionSpec) {
  const { tokens, meta, fingerprint } = motionSpec;

  const collection = buildFigmaCollection(tokens);

  const output = {
    version: '1.0',
    generator: 'motionlang',
    source: meta.url,
    timestamp: meta.timestamp,
    ...(meta.component && { component: { id: meta.component.id, label: meta.component.label, selector: meta.component.selector } }),
    fingerprint: {
      feel: fingerprint.feel,
      dominantLibrary: fingerprint.dominantLibrary,
      animationCount: fingerprint.animationCount,
    },
    collections: [collection],
  };

  return JSON.stringify(output, null, 2);
}