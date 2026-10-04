import { describe, it, expect } from 'vitest';
import { TOOL_DESCRIPTION_SUFFIXES } from '../../src/openapi/description-suffixes.js';

describe('get_stack_deploy_log secret-safety suffix (Copilot review)', () => {
  it('carries a secret-bearing warning suffix (deploy logs can leak un-redacted secrets)', () => {
    const suffix = TOOL_DESCRIPTION_SUFFIXES.get_stack_deploy_log;
    expect(suffix).toBeDefined();
    expect(suffix).toMatch(/secret/i);
  });
});
