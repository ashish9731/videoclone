import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  // Real authentication: require a signed-in Supabase session (email or Google).
  // Signed-out visitors are redirected to /auth. The resolved user is passed
  // through context so editor / projects keep using user.id (== auth.uid()).
  beforeLoad: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) throw redirect({ to: "/auth" });
    return { user: { id: user.id, email: user.email ?? "" } };
  },
  component: () => <Outlet />,
});
