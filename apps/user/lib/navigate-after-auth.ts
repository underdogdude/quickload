import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

/**
 * Client navigation after session cookie is set. Re-fetches server components
 * (root layout header/nav) which still hold the pre-login shell on soft nav.
 */
export function navigateAfterAuth(router: AppRouterInstance, href: string) {
  router.replace(href);
  router.refresh();
}
