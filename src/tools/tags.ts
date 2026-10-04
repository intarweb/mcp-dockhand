/**
 * Tag management tools (Dockhand 1.0.46 -> 1.0.51, 10 tools): the global tag catalog
 * (list/create/update/delete) plus per-environment tag assignment to containers and
 * stacks (list/get/set).
 *
 * Contracts read off the real Finsys/dockhand v1.0.51 handler, not the changelog or the
 * `@openapi` summary line alone:
 *   src/routes/api/tags/+server.ts                  GET (no body/query) — {tags}.
 *     POST (body name!:string, color?:string, icon?:string) — admin-only
 *     (auth.isAdmin); returns the tag object directly ({id,name,color,icon}), NOT
 *     wrapped in {tag:...}.
 *   src/routes/api/tags/[id]/+server.ts              PUT (path id!:integer, body
 *     name?:string, color?:string, icon?:string|null — every field optional, only
 *     provided keys are patched) — admin-only; {success:true}.
 *     DELETE (path id!:integer) — admin-only; {success:true}. Cascades: removes the
 *     tag from every container and stack assignment too.
 *   src/routes/api/container-tags/+server.ts         GET (query env?:integer —
 *     parseEnvParam() tolerates a missing/invalid value and targets the local/default
 *     environment) — a containerName -> tagIds map, e.g. {"plex":[1,5]}.
 *   src/routes/api/container-tags/[name]/+server.ts  GET (path name!:string, query
 *     env?:integer) — {tagIds}.
 *     PUT (path name!:string, query env?:integer, body tagIds!:array<integer>) —
 *     {tagIds} (echoes back the array that was set; the handler itself tolerates a
 *     missing/non-array body by falling back to an empty array, but the tool always
 *     sends the caller's array).
 *   src/routes/api/stack-tags/+server.ts             GET (query env?:integer) — a
 *     stackName -> tagIds map, e.g. {"nextcloud":[2]}.
 *   src/routes/api/stacks/[name]/tags/+server.ts     GET (path name!:string, query
 *     env?:integer) — {tagIds}.
 *     PUT (path name!:string, query env?:integer, body tagIds!:array<integer>) —
 *     {tagIds}.
 *
 * `environmentId` is `.optional()` for all 6 assignment tools (list/get/set
 * container-tags, list/get/set stack-tags) — mirroring the handler's own optionality
 * (parseEnvParam(null) => null => local/default environment), same convention as
 * get_container_compose/get_container_version_notes (see
 * tests/container-compose-version-notes.test.ts). The 4 core catalog tools
 * (list/create/update/delete_tag) take NO environmentId at all — the tag catalog is
 * global, not per-environment.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DockhandClient } from '../client/dockhand-client.js';
import { registerTool, jsonResponse } from '../utils/tool-helper.js';
import { encodePath } from '../utils/encode-path.js';

export function registerTagTools(server: McpServer, client: DockhandClient): void {

  // --- Global tag catalog ---

  registerTool(server, 'list_tags',
    {},
    async () => {
      return jsonResponse(await client.get('/api/tags'));
    }
  );

  registerTool(server, 'create_tag',
    {
      name: z.string().describe('Tag name'),
      color: z.string().optional().describe('Tag color'),
      icon: z.string().optional().describe('Tag icon'),
    },
    async ({ name, color, icon }) => {
      const body: Record<string, unknown> = { name };
      if (color !== undefined) body.color = color;
      if (icon !== undefined) body.icon = icon;
      return jsonResponse(await client.post('/api/tags', body));
    }
  );

  registerTool(server, 'update_tag',
    {
      tagId: z.number().describe('Tag ID'),
      name: z.string().optional().describe('New tag name'),
      color: z.string().optional().describe('New tag color'),
      icon: z.string().nullable().optional().describe('New tag icon (pass null to clear it back to default; handler accepts icon: string|null)'),
    },
    async ({ tagId, name, color, icon }) => {
      const body: Record<string, unknown> = {};
      if (name !== undefined) body.name = name;
      if (color !== undefined) body.color = color;
      if (icon !== undefined) body.icon = icon;
      return jsonResponse(await client.put(`/api/tags/${encodePath(tagId)}`, body));
    }
  );

  registerTool(server, 'delete_tag',
    { tagId: z.number().describe('Tag ID') },
    async ({ tagId }) => {
      return jsonResponse(await client.delete(`/api/tags/${encodePath(tagId)}`));
    }
  );

  // --- Container tag assignment (per environment) ---

  registerTool(server, 'list_container_tags',
    {
      environmentId: z.number().optional().describe('Environment ID (omit for local/default environment)'),
    },
    async ({ environmentId }) => {
      return jsonResponse(await client.get('/api/container-tags', { env: environmentId }));
    }
  );

  registerTool(server, 'get_container_tags',
    {
      environmentId: z.number().optional().describe('Environment ID (omit for local/default environment)'),
      containerName: z.string().describe('Container name'),
    },
    async ({ environmentId, containerName }) => {
      return jsonResponse(await client.get(`/api/container-tags/${encodePath(containerName)}`, { env: environmentId }));
    }
  );

  registerTool(server, 'set_container_tags',
    {
      environmentId: z.number().optional().describe('Environment ID (omit for local/default environment)'),
      containerName: z.string().describe('Container name'),
      tagIds: z.array(z.number()).describe('Full set of tag IDs to assign to the container (replaces the existing assignment)'),
    },
    async ({ environmentId, containerName, tagIds }) => {
      return jsonResponse(await client.put(`/api/container-tags/${encodePath(containerName)}`, { tagIds }, { env: environmentId }));
    }
  );

  // --- Stack tag assignment (per environment) ---

  registerTool(server, 'list_stack_tags',
    {
      environmentId: z.number().optional().describe('Environment ID (omit for local/default environment)'),
    },
    async ({ environmentId }) => {
      return jsonResponse(await client.get('/api/stack-tags', { env: environmentId }));
    }
  );

  registerTool(server, 'get_stack_tags',
    {
      environmentId: z.number().optional().describe('Environment ID (omit for local/default environment)'),
      stackName: z.string().describe('Stack name'),
    },
    async ({ environmentId, stackName }) => {
      return jsonResponse(await client.get(`/api/stacks/${encodePath(stackName)}/tags`, { env: environmentId }));
    }
  );

  registerTool(server, 'set_stack_tags',
    {
      environmentId: z.number().optional().describe('Environment ID (omit for local/default environment)'),
      stackName: z.string().describe('Stack name'),
      tagIds: z.array(z.number()).describe('Full set of tag IDs to assign to the stack (replaces the existing assignment)'),
    },
    async ({ environmentId, stackName, tagIds }) => {
      return jsonResponse(await client.put(`/api/stacks/${encodePath(stackName)}/tags`, { tagIds }, { env: environmentId }));
    }
  );
}
