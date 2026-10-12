/**
 * Web Workers have no `window`, but Next compiles `typeof window` checks to "object" in browser code, so three.js's
 * revision check (`window.__THREE__`) runs unguarded when it loads in a worker. Point `window` at the worker's global
 * first (fuselage.worker.ts imports this before anything else).
 */
const scope = globalThis as unknown as { window?: unknown };
scope.window ??= globalThis;
export {};
