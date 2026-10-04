/**
 * User sidebar preference tools.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DockhandClient } from '../client/dockhand-client.js';
import { registerTool, jsonResponse } from '../utils/tool-helper.js';

export function registerPreferenceTools(server: McpServer, client: DockhandClient): void {

  registerTool(server, 'get_sidebar_preferences',
    {},
    async () => {
      return jsonResponse(await client.get('/api/preferences/sidebar'));
    }
  );

  registerTool(server, 'set_sidebar_preferences',
    {
      preferences: z.record(z.string(), z.unknown()).describe('Sidebar preference object (layout/visibility settings)'),
    },
    async ({ preferences }) => {
      return jsonResponse(await client.post('/api/preferences/sidebar', preferences));
    }
  );

  registerTool(server, 'reset_sidebar_preferences',
    {},
    async () => {
      return jsonResponse(await client.delete('/api/preferences/sidebar'));
    }
  );

  registerTool(server, 'get_environment_order',
    {},
    async () => {
      return jsonResponse(await client.get('/api/preferences/environment-order'));
    }
  );

  registerTool(server, 'set_environment_order',
    {
      order: z.array(z.number().int()).refine((a) => new Set(a).size === a.length, { message: 'order must not repeat an id' }).describe('Environment ids in the desired display order (most preferred first). Must not repeat an id.'),
    },
    async ({ order }) => {
      return jsonResponse(await client.post('/api/preferences/environment-order', { order }));
    }
  );

  registerTool(server, 'reset_environment_order',
    {},
    async () => {
      return jsonResponse(await client.delete('/api/preferences/environment-order'));
    }
  );

  registerTool(server, 'get_tag_order',
    {},
    async () => {
      return jsonResponse(await client.get('/api/preferences/tag-order'));
    }
  );

  registerTool(server, 'set_tag_order',
    {
      order: z.array(z.number().int()).refine((a) => new Set(a).size === a.length, { message: 'order must not repeat an id' }).describe('Tag ids in the desired display order (most preferred first). Must not repeat an id.'),
    },
    async ({ order }) => {
      return jsonResponse(await client.post('/api/preferences/tag-order', { order }));
    }
  );

  registerTool(server, 'reset_tag_order',
    {},
    async () => {
      return jsonResponse(await client.delete('/api/preferences/tag-order'));
    }
  );
}
