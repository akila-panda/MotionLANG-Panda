// MCP tools — callable functions an AI agent can invoke.
// Three tools: get_motion_tokens, get_animation_for_pattern,
// get_easing_for_component.

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

export function registerTools(server, specDir) {

  // ── Tool definitions ───────────────────────────────────────────
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'get_motion_tokens',
        description: 'Returns all motion tokens (duration and easing values) from the most recent motion spec. Use this before building any animated component to get the correct duration and easing values for this product.',
        inputSchema: {
          type: 'object',
          properties: {
            site: {
              type: 'string',
              description: 'Optional hostname filter e.g. "linear-app". If omitted, uses the most recent spec.',
            },
          },
        },
      },
      {
        name: 'get_animation_for_pattern',
        description: "Returns the detected animation parameters for a specific pattern type. Use this to get the exact values to implement a specific animation pattern that matches the product's motion system.",
        inputSchema: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              description: 'Pattern name: slide-up | fade-in | stagger | scroll-scrub | pin-section | parallax | text-reveal | morph | state-change | page-transition',
            },
            site: { type: 'string', description: 'Optional hostname filter.' },
          },
          required: ['pattern'],
        },
      },
      {
        name: 'get_easing_for_component',
        description: 'Returns the best matching easing value for a given component type or interaction. Use when picking the right easing for a button hover, modal entrance, or scroll reveal.',
        inputSchema: {
          type: 'object',
          properties: {
            component: {
              type: 'string',
              description: 'Component or interaction type e.g. "button hover", "modal entrance", "scroll reveal"',
            },
            site: { type: 'string', description: 'Optional hostname filter.' },
          },
          required: ['component'],
        },
      },
    ],
  }));

  // ── Tool execution ─────────────────────────────────────────────
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const spec = loadLatestSpec(specDir, args?.site);

    if (!spec) {
      return {
        content: [{ type: 'text', text: 'No motion spec found. Run: motionlang <url> --out <dir>' }],
        isError: true,
      };
    }

    if (name === 'get_motion_tokens') {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            source: spec.source,
            feel: spec.fingerprint?.feel,
            library: spec.fingerprint?.dominantLibrary,
            tokens: spec.tokens,
            instructions: spec.instructions,
          }, null, 2),
        }],
      };
    }

    if (name === 'get_animation_for_pattern') {
      const matches = (spec.patterns || []).filter(p => p.pattern === args.pattern);
      if (matches.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `No animations found for pattern "${args.pattern}" in ${spec.source}.`,
          }],
        };
      }
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ pattern: args.pattern, source: spec.source, matches, tokens: spec.tokens }, null, 2),
        }],
      };
    }

    if (name === 'get_easing_for_component') {
      const component = (args.component || '').toLowerCase();
      const easings = spec.tokens?.easings || {};

      let recommended = null;
      if (/enter|appear|reveal|open|in\b|show/.test(component)) {
        recommended = easings['expressive-decelerate'] || easings['smooth-decelerate'] || easings['expo-out'] || Object.values(easings)[0];
      } else if (/exit|close|leave|out\b|hide/.test(component)) {
        recommended = easings['expressive-accelerate'] || easings['ease-in'] || Object.values(easings)[0];
      } else if (/hover|focus|active|state/.test(component)) {
        recommended = easings['ease-out'] || easings['material-standard'] || Object.values(easings)[0];
      } else if (/scroll|parallax|scrub/.test(component)) {
        recommended = easings['linear'] || easings['ease-in-out'] || Object.values(easings)[0];
      } else {
        recommended = Object.values(easings)[0];
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            component: args.component,
            recommendedEasing: recommended,
            allEasings: easings,
            source: spec.source,
          }, null, 2),
        }],
      };
    }

    return {
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      isError: true,
    };
  });
}

// ── Helper: load most recent MCP spec from output dir ─────────
function loadLatestSpec(specDir, siteFilter) {
  let files = [];
  try {
    files = readdirSync(specDir)
      .filter(f => f.endsWith('-motion-mcp.json'))
      .filter(f => !siteFilter || f.includes(siteFilter));
  } catch { return null; }

  if (files.length === 0) return null;

  files.sort();
  const latest = files[files.length - 1];

  try {
    return JSON.parse(readFileSync(join(specDir, latest), 'utf8'));
  } catch { return null; }
}
