// MCP resources — expose motion spec data as readable resources.
// Each resource is a named piece of context an AI agent can request.

import { readFileSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

export function registerResources(server, specDir) {

  // ── List available motion spec files ──────────────────────────
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    let files = [];
    try {
      files = readdirSync(specDir)
        .filter(f => f.endsWith('-motion-mcp.json'))
        .map(f => ({
          uri: `motionlang://spec/${basename(f, '.json')}`,
          name: basename(f, '.json'),
          description: 'Motion spec — ' + basename(f, '-motion-mcp.json'),
          mimeType: 'application/json',
        }));
    } catch { /* dir doesn't exist yet */ }

    return { resources: files };
  });

  // ── Read a specific spec file ─────────────────────────────────
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params?.uri;
    if (!uri?.startsWith('motionlang://spec/')) {
      throw new Error(`Unknown resource URI: ${uri}`);
    }

    const filename = uri.replace('motionlang://spec/', '') + '.json';
    const filepath = join(specDir, filename);

    let content;
    try {
      content = readFileSync(filepath, 'utf8');
    } catch {
      throw new Error(`Spec file not found: ${filepath}`);
    }

    return {
      contents: [{
        uri,
        mimeType: 'application/json',
        text: content,
      }],
    };
  });
}
