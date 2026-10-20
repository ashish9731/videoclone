import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Mail, Scissors } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — Cutroom" },
      { name: "description", content: "Sign in to your Cutroom account to edit and save video projects." },
    ],
  }),
  // Already signed in? Skip the form.
  beforeLoad: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user) throw redirect({ to: "/projects" });
  },
  component: AuthPage,
});

type Mode = "signin" | "signup";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);

  // Complete an OAuth redirect: supabase-js exchanges the token in the URL, then
  // fires SIGNED_IN. Send the user into the app once a session exists.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) void navigate({ to: "/projects", replace: true });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  const google = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth` },
    });
    if (error) {
      toast.error(error.message);
      setBusy(false);
    }
    // On success the browser navigates to Google.
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error("Enter your email and password.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: name.trim() }, emailRedirectTo: `${window.location.origin}/auth` },
        });
        if (error) throw error;
        // If a session came back, email confirmation is off → go straight in.
        if (data.session?.user) {
          await navigate({ to: "/projects", replace: true });
          return;
        }
        setAwaitingConfirm(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        await navigate({ to: "/projects", replace: true });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 font-display text-xl font-bold">
          <Scissors className="h-6 w-6 text-primary" /> Cutroom
        </div>

        {awaitingConfirm ? (
          <div className="mt-8 rounded-2xl border bg-card p-6 text-center">
            <Mail className="mx-auto h-8 w-8 text-primary" />
            <h1 className="mt-4 text-lg font-semibold">Check your email</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We sent a confirmation link to <span className="font-medium text-foreground">{email}</span>. Open it to
              activate your account, then sign in.
            </p>
            <Button variant="secondary" className="mt-6 w-full" onClick={() => { setAwaitingConfirm(false); setMode("signin"); }}>
              Back to sign in
            </Button>
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border bg-card p-6 shadow-sm">
            <h1 className="text-lg font-semibold">{mode === "signin" ? "Welcome back" : "Create your account"}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "signin" ? "Sign in to open your projects." : "Sign up to start editing and save your work."}
            </p>

            <Button variant="outline" className="mt-6 w-full gap-2" onClick={google} disabled={busy}>
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                <path fill="currentColor" d="M12 10.2v3.9h5.5a4.8 4.8 0 0 1-2.1 3.1l3.4 2.6c2-1.8 3.1-4.5 3.1-7.7 0-.7-.1-1.4-.2-2H12Z" opacity=".01" />
                <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.2a5.3 5.3 0 0 1-2.3 3.5l3.6 2.8c2.1-1.9 3.3-4.8 3.3-8.4Z" />
                <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.6-2.8a7 7 0 0 1-4.3 1.2 7.2 7.2 0 0 1-6.8-5L1.5 17.4A12 12 0 0 0 12 24Z" />
                <path fill="#FBBC05" d="M5.2 14.5a7.2 7.2 0 0 1 0-4.6L1.5 7.1a12 12 0 0 0 0 10.8l3.7-3.4Z" />
                <path fill="#EA4335" d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.5 7.1l3.7 2.8A7.2 7.2 0 0 1 12 4.8Z" />
              </svg>
              Continue with Google
            </Button>

            <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
            </div>

            <form onSubmit={submit} className="space-y-4">
              {mode === "signup" && (
                <div className="space-y-1.5">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete={mode === "signin" ? "current-password" : "new-password"} />
              </div>
              <Button type="submit" className="w-full gap-2" disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {mode === "signin" ? "Sign in" : "Sign up"}
              </Button>
            </form>

            <p className="mt-5 text-center text-sm text-muted-foreground">
              {mode === "signin" ? "New to Cutroom? " : "Already have an account? "}
              <button
                className="font-medium text-primary hover:underline"
                onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setBusy(false); }}
              >
                {mode === "signin" ? "Create an account" : "Sign in"}
              </button>
            </p>
          </div>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link to="/" className="hover:underline">Back to home</Link>
        </p>
      </div>
    </div>
  );
}
