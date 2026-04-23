// MCP stdio server — connects motionlang to Claude Code, Cursor, Windsurf.
// Run with: motionlang mcp --dir ./motion-spec-output
// Then add to your MCP config:
//   { "command": "node", "args": ["/path/to/bin/motionlang.js", "mcp", "--dir", "./motion-spec-output"] }

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerResources } from './resources.js';
import { registerTools } from './tools.js';

export async function startMcpServer(specDir) {
  const server = new Server(
    {
      name: 'motionlang',
      version: '1.0.0',
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    }
  );

  // Register all resources and tools
  registerResources(server, specDir);
  registerTools(server, specDir);

  // Error handler
  server.onerror = (error) => {
    process.stderr.write(`[motionlang MCP] ${error.message}\n`);
  };

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write(`[motionlang MCP] Server running — watching ${specDir}\n`);
}
