import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import { AIRCRAFT_IDS } from "./lib/systems";

const sharedConfig: NextConfig = {
  reactStrictMode: true,
  // three ships ESM examples; let Next transpile it for the browser bundle
  transpilePackages: ["three"],
};

// every view is the one static page: /c172s and /c172s/electrical serve it, and App reads the view from the path
// (other paths, including unknown airplanes, 404)
const viewRewrites: NextConfig["rewrites"] = async () => [
  { source: `/:ac(${AIRCRAFT_IDS.join("|")})/:sys?`, destination: "/" },
];

/**
 * `STATIC_EXPORT=1 next build` writes a static export to out/ for a plain file host (scripts/deploy-aws.sh); the host
 * then serves index.html for every view path (infra/cloudfront/view-rewrite.js). Every other build, and `next dev`,
 * keeps the rewrites above.
 */
export default function nextConfig(phase: string): NextConfig {
  if (phase !== PHASE_DEVELOPMENT_SERVER && process.env.STATIC_EXPORT === "1") {
    // NEXT_PUBLIC_STATIC_EXPORT drops Vercel Analytics from the export (lib/staticExport.ts)
    return { ...sharedConfig, output: "export", env: { NEXT_PUBLIC_STATIC_EXPORT: "1" } };
  }
  return { ...sharedConfig, rewrites: viewRewrites };
}
