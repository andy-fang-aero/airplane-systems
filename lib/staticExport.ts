/**
 * Vercel Web Analytics loads /_vercel/insights/script.js, which only a Vercel deployment serves; a static export
 * (STATIC_EXPORT=1, scripts/deploy-aws.sh) would request it and get a 404. next.config.ts sets
 * NEXT_PUBLIC_STATIC_EXPORT=1 for that build only; callers pass the literal `process.env.NEXT_PUBLIC_STATIC_EXPORT`
 * so Next inlines it.
 */
export const vercelAnalytics = (staticExport: string | undefined) => staticExport !== "1";
