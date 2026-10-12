// Types for scripts/smoke.mjs, so tests/smoke.test.ts can import its pure helpers under strict TypeScript.
export interface Expect {
  status?: number;
  contentType?: string;
  bodyIncludes?: string;
  bodyEquals?: string;
  bodyEqualsName?: string;
  cacheControl?: string[];
  cacheIncludes?: string;
  location?: string;
  locationEndsWith?: string;
}
export interface SmokeResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}
export interface Result {
  url: string;
  label: string;
  status: number | null;
  ok: boolean;
  skipped?: boolean;
}
export interface Summary {
  base: string;
  ok: boolean;
  checks: { url: string; expect: string; status: number | null; ok: boolean; skipped?: true }[];
}
export const VIEW_PATHS: string[];
export const MISSING_PATHS: string[];
export const HTML_CACHE: string[];
export function assetUrls(html: string): string[];
export function evaluate(check: { expect: Expect }, response: SmokeResponse): { ok: boolean; problems: string[] };
export function summarize(base: string, results: Result[]): Summary;
export function parseBase(arg: string | undefined): string | null;
