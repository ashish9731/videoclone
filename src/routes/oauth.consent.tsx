import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ExternalLink, Loader2, Scissors, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { OAuthAuthorizationDetails } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/oauth/consent")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Authorize app — Cutroom" },
      {
        name: "description",
        content:
          "Approve or deny a third-party application's request to access your Cutroom account.",
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { authorization_id?: string | undefined } => {
    const value =
      typeof search["authorization_id"] === "string" ? search["authorization_id"] : undefined;
    return value === undefined ? {} : { authorization_id: value };
  },
  component: OAuthConsentPage,
});

// Friendly, user-facing copy for the standard OAuth scopes Supabase supports.
// Unknown scopes fall back to the raw identifier so nothing is silently hidden.
const SCOPE_DESCRIPTIONS: Record<string, string> = {
  openid: "Sign you in and confirm your identity (OpenID Connect)",
  email: "View your email address",
  profile: "View your name and profile picture",
  phone: "View your phone number",
};

function describeScope(scope: string): string {
  return SCOPE_DESCRIPTIONS[scope] ?? `Access ${scope}`;
}

function OAuthConsentPage() {
  const { authorization_id: authorizationId } = Route.useSearch();
  const [details, setDetails] = useState<OAuthAuthorizationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authorizationId) {
      setError("This authorization request is missing its authorization_id.");
      setLoading(false);
      return;
    }

    const id = authorizationId;
    let cancelled = false;

    async function load() {
      // The consent decision is attributed to the signed-in Cutroom user, so we
      // must have a live session before touching the OAuth server endpoints.
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (cancelled) return;

      if (!session?.user) {
        // Preserve the full authorization path so we return here after sign-in.
        const next = `/oauth/consent?authorization_id=${encodeURIComponent(id)}`;
        window.location.href = `/auth?next=${encodeURIComponent(next)}`;
        return;
      }

      const { data, error: detailsError } = await supabase.auth.oauth.getAuthorizationDetails(id);

      if (cancelled) return;

      if (detailsError) {
        setError(detailsError.message);
        setLoading(false);
        return;
      }

      // Two shapes: consent still needed (authorization_id present), or the user
      // already granted these scopes and Supabase just wants us to redirect on.
      if ("authorization_id" in data) {
        setDetails(data);
      } else {
        window.location.href = data.redirect_url;
        return;
      }

      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [authorizationId]);

  const decide = async (approve: boolean) => {
    if (!authorizationId || busy) return;
    setBusy(true);
    const { data, error: decisionError } = approve
      ? await supabase.auth.oauth.approveAuthorization(authorizationId)
      : await supabase.auth.oauth.denyAuthorization(authorizationId);

    if (decisionError) {
      toast.error(decisionError.message);
      setBusy(false);
      return;
    }

    // Hand the browser back to the third-party client with the code (or error).
    window.location.href = data.redirect_url;
  };

  if (loading) {
    return (
      <CenteredCard>
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-sm text-muted-foreground">Checking the authorization request…</p>
      </CenteredCard>
    );
  }

  if (error) {
    return (
      <CenteredCard>
        <ShieldCheck className="mx-auto h-8 w-8 text-destructive" />
        <h1 className="mt-4 text-lg font-semibold">Can't complete this request</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
      </CenteredCard>
    );
  }

  if (!details) {
    return (
      <CenteredCard>
        <p className="text-sm text-muted-foreground">No authorization request found.</p>
      </CenteredCard>
    );
  }

  const scopes = details.scope ? details.scope.split(/\s+/).filter(Boolean) : [];

  return (
    <CenteredCard>
      <div className="flex items-center justify-center gap-2 font-display text-lg font-bold">
        <Scissors className="h-5 w-5 text-primary" /> Cutroom
      </div>

      <div className="mt-6 flex flex-col items-center text-center">
        {details.client.logo_uri ? (
          <img
            src={details.client.logo_uri}
            alt=""
            className="h-12 w-12 rounded-xl border bg-background object-contain"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border bg-muted text-muted-foreground">
            <ExternalLink className="h-5 w-5" />
          </div>
        )}
        <h1 className="mt-4 text-xl font-semibold">Authorize {details.client.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This app is asking to connect to your Cutroom account.
        </p>
      </div>

      <dl className="mt-6 space-y-3 rounded-xl border bg-muted/40 p-4 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Signing in as</dt>
          <dd className="mt-0.5 font-medium text-foreground">{details.user.email}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">Redirect URI</dt>
          <dd className="mt-0.5 break-all font-mono text-xs text-foreground">
            {details.redirect_uri}
          </dd>
        </div>
        {details.client.uri && (
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Website</dt>
            <dd className="mt-0.5 break-all">
              <a
                href={details.client.uri}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                {details.client.uri}
                <ExternalLink className="h-3 w-3" />
              </a>
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-5">
        <h2 className="text-sm font-semibold">
          {scopes.length > 0
            ? `${details.client.name} will be able to:`
            : "No additional permissions requested."}
        </h2>
        {scopes.length > 0 && (
          <ul className="mt-2 space-y-2">
            {scopes.map((scope) => (
              <li key={scope} className="flex items-start gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{describeScope(scope)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-7 flex flex-col gap-2">
        <Button className="w-full gap-2" disabled={busy} onClick={() => void decide(true)}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Approve
        </Button>
        <Button
          variant="outline"
          className="w-full"
          disabled={busy}
          onClick={() => void decide(false)}
        >
          Deny
        </Button>
      </div>

      <p className="mt-5 text-center text-xs text-muted-foreground">
        You can revoke this app's access later from your account settings.
      </p>
    </CenteredCard>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm">{children}</div>
    </div>
  );
}
