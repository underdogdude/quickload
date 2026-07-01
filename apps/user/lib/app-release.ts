/**
 * ─── Quickload user app — release metadata (home footer) ───────────────────
 *
 * ⚠️  UPDATE ON EVERY PRODUCTION DEPLOY (mandatory)
 *
 * Before merging or deploying `apps/user` to Vercel, you MUST edit this file:
 *
 *   1. APP_VERSION  — bump semver (patch for routine deploys, minor/major when appropriate)
 *   2. APP_RELEASE_DATE — set to the deploy date in Asia/Bangkok as YYYYMMDD (no dashes)
 *
 * The home page footer reads these constants. Do not hard-code version/date elsewhere.
 *
 * Agents: if you prepare a deploy PR or the user says "deploy", check this file first.
 * If the date is not today (Bangkok) or version was not bumped, update it in the same change.
 *
 * @see apps/user/components/app-footer.tsx
 * @see .cursor/rules/app-release-version.mdc
 */

/** Semver shown in footer, e.g. "1.0.1" */
export const APP_VERSION = "1.0.1";

/** Deploy date YYYYMMDD (Asia/Bangkok), e.g. "20260701" */
export const APP_RELEASE_DATE = "20260701";

export function formatAppReleaseLabel(): string {
  return `Version: ${APP_VERSION} (${APP_RELEASE_DATE})`;
}
