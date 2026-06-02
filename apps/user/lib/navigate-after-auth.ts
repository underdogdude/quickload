import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

type NavigateAfterAuthOptions = {
  /**
   * Full page load — use after registration when the session cookie was just
   * set via API. Soft nav (router.replace) can fail in LINE in-app browser:
   * middleware may still see profileCompleted=false and bounce back to /register.
   */
  hard?: boolean;
};

/**
 * Client navigation after session cookie is set. Re-fetches server components
 * (root layout header/nav) which still hold the pre-login shell on soft nav.
 */
export function navigateAfterAuth(
  router: AppRouterInstance,
  href: string,
  options?: NavigateAfterAuthOptions,
) {
  if (options?.hard && typeof window !== "undefined") {
    window.location.replace(href);
    return;
  }
  router.replace(href);
  router.refresh();
}
