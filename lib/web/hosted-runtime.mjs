import { requireRuntime } from './config.mjs';

// Only the Vercel entry point uses this boundary, and it is as strict as local
// and CLI startup. The 2026-10-22 exception for Node 24.21.0 ended on
// 2026-10-31, when the production function reported 24.22.2; see
// docs/evidence/2026-10-22-hosted-runtime-exception.md.
export function requireHostedRuntime(env = process.env, version = process.versions.node) {
  requireRuntime(version);
}
