/**
 * `export_image`'s `tag` query parameter (Dockhand 1.0.51, T7) — a new, OPTIONAL
 * parameter on an existing tool; the pre-1.0.51 contract (environmentId + imageId,
 * `env` query only) must keep working unchanged.
 *
 * Ground-truthed against `Finsys/dockhand` v1.0.51,
 * `src/routes/api/images/[id]/export/+server.ts`:
 *   GET /api/images/{id}/export?env=<id>&tag=<tag>
 *   `url.searchParams.get('tag')` (line 42) — which of the image's tags to name the
 *   downloaded tar after and export BY (defaults to the image's first RepoTag when
 *   omitted; a bare-id export carries RepoTags:null and loads back unnamed, which is
 *   why the real tag matters here, not just the filename).
 */
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { registerImageTools } from '../src/tools/images.js';

type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;
type ZodShape = Record<string, z.ZodTypeAny>;

interface MockClient {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  postRawBody: ReturnType<typeof vi.fn>;
}

function setup(): { handlers: Map<string, ToolHandler>; schemas: Map<string, ZodShape>; client: MockClient } {
  const handlers = new Map<string, ToolHandler>();
  const schemas = new Map<string, ZodShape>();
  const server = {
    tool: (name: string, _d: string, s: ZodShape, cb: ToolHandler) => {
      handlers.set(name, cb);
      schemas.set(name, s);
    },
  };
  const client: MockClient = {
    get: vi.fn().mockResolvedValue({ ok: true }),
    post: vi.fn().mockResolvedValue({ ok: true }),
    postRawBody: vi.fn().mockResolvedValue({ ok: true }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerImageTools(server as any, client as any);
  return { handlers, schemas, client };
}

async function call(name: string, args: Record<string, unknown>) {
  const { handlers, client } = setup();
  const handler = handlers.get(name);
  if (!handler) throw new Error(`${name} was not registered`);
  await handler(args);
  return client;
}

describe('export_image — tag param (T7)', () => {
  it('pre-1.0.51 contract: environmentId + imageId only, tag omitted from the query', async () => {
    const client = await call('export_image', { environmentId: 2, imageId: 'sha256:abc123' });
    expect(client.get).toHaveBeenCalledWith('/api/images/sha256%3Aabc123/export', {
      env: 2,
      tag: undefined,
    });
  });

  it('T7: tag is forwarded when given', async () => {
    const client = await call('export_image', {
      environmentId: 2,
      imageId: 'sha256:abc123',
      tag: 'myapp:1.2.3',
    });
    expect(client.get).toHaveBeenCalledWith('/api/images/sha256%3Aabc123/export', {
      env: 2,
      tag: 'myapp:1.2.3',
    });
  });

  it('tag is optional — the tool schema accepts a call without it', () => {
    const { schemas } = setup();
    const schema = z.object(schemas.get('export_image')!);
    const result = schema.safeParse({ environmentId: 2, imageId: 'sha256:abc123' });
    expect(result.success).toBe(true);
  });

  it('GEGENVERSUCH: a non-string tag is rejected by the tool schema', () => {
    const { schemas } = setup();
    const schema = z.object(schemas.get('export_image')!);
    const result = schema.safeParse({ environmentId: 2, imageId: 'sha256:abc123', tag: 123 });
    expect(result.success).toBe(false);
  });
});
