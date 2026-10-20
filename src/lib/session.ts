import { supabase } from "@/integrations/supabase/client";

// The app ships without a login screen: every visitor gets a Supabase session
// silently, so row-level-security policies (auth.uid() = user_id) keep working.
// Preference order: existing session → anonymous sign-in (enable it in the
// Supabase Auth providers) → optional demo account from the environment.
export async function ensureSession(): Promise<{ id: string; email: string }> {
  const current = await supabase.auth.getSession();
  if (current.data.session?.user) return publicUser(current.data.session.user);

  const anon = await supabase.auth.signInAnonymously();
  if (!anon.error && anon.data.user) return publicUser(anon.data.user);

  const email = import.meta.env["VITE_DEMO_AUTH_EMAIL"];
  const password = import.meta.env["VITE_DEMO_AUTH_PASSWORD"];
  if (typeof email === "string" && typeof password === "string" && email && password) {
    const demo = await supabase.auth.signInWithPassword({ email, password });
    if (!demo.error && demo.data.user) return publicUser(demo.data.user);
  }

  throw new Error(
    "Backend not configured: enable anonymous sign-in (Supabase → Authentication → Providers → Anonymous) " +
      "or set VITE_DEMO_AUTH_EMAIL / VITE_DEMO_AUTH_PASSWORD in .env.",
  );
}

function publicUser(user: { id: string; email?: string | null }): { id: string; email: string } {
  return { id: user.id, email: user.email ?? "" };
}
