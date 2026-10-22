// GET/DELETE /api/jobs/{id}: `lines` holds every line on each call. A cancel only sets a flag
// the operation must poll (see JOB_CANCEL_IS_COOPERATIVE in src/openapi/description-suffixes.ts).

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DockhandClient } from '../client/dockhand-client.js';
import { registerTool, jsonResponse } from '../utils/tool-helper.js';
import { encodePath } from '../utils/encode-path.js';

export function registerJobTools(server: McpServer, client: DockhandClient): void {

  registerTool(server, 'get_job',
    {
      jobId: z.string().min(1).describe('Job id (UUID) returned as `jobId` by a long-running operation (a git stack deploy, a stack restart, …)'),
    },
    async ({ jobId }) => {
      return jsonResponse(await client.get(`/api/jobs/${encodePath(jobId)}`));
    }
  );

  registerTool(server, 'cancel_job',
    {
      jobId: z.string().min(1).describe('Job id (UUID) of a running background job'),
    },
    async ({ jobId }) => {
      return jsonResponse(await client.delete(`/api/jobs/${encodePath(jobId)}`));
    }
  );
}
