import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ensureSession } from "@/lib/session";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  // No login screen: the session is obtained silently (anonymous sign-in or
  // demo credentials). Failures surface in the root error component with a
  // concrete configuration message.
  beforeLoad: async () => {
    const user = await ensureSession();
    return { user };
  },
  component: () => <Outlet />,
});
