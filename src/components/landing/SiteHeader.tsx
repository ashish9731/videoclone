import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, Scissors, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { APP_PATH, AUTH_PATH, NAV_LINKS } from "./site-data";

/**
 * The landing page is public and server-rendered, so the session is only read after mount: the
 * header just swaps the call-to-action wording for someone who is already signed in, and the
 * authenticated route guard handles the rest if the state is stale.
 */
function useSignedIn() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session?.user));
    const { data } = supabase.auth.onAuthStateChange((_event, session) =>
      setSignedIn(!!session?.user),
    );
    return () => data.subscription.unsubscribe();
  }, []);
  return signedIn;
}

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const signedIn = useSignedIn();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        scrolled || open
          ? "border-b bg-background/85 backdrop-blur-md"
          : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3.5 md:px-8">
        <a
          href="#top"
          className="flex items-center gap-2 font-display text-lg font-bold tracking-tight"
        >
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/15 ring-1 ring-primary/30">
            <Scissors className="h-4 w-4 text-primary" />
          </span>
          Cutroom
        </a>

        <nav className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          {!signedIn && (
            <Button asChild variant="ghost" size="sm">
              <Link to={AUTH_PATH}>Sign in</Link>
            </Button>
          )}
          <Button asChild size="sm" className="gap-1.5">
            <Link to={APP_PATH}>
              {signedIn ? "Open my projects" : "Start editing"}
              <span aria-hidden="true">→</span>
            </Link>
          </Button>
        </div>

        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="grid h-9 w-9 place-items-center rounded-md border bg-card lg:hidden"
        >
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>

      {open && (
        <div className="border-t bg-background/95 px-5 pb-5 pt-3 backdrop-blur-md lg:hidden">
          <nav className="grid gap-1">
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {l.label}
              </a>
            ))}
          </nav>
          <div className="mt-3 grid gap-2">
            <Button asChild className="w-full">
              <Link to={APP_PATH} onClick={() => setOpen(false)}>
                {signedIn ? "Open my projects" : "Start editing"}
              </Link>
            </Button>
            {!signedIn && (
              <Button asChild variant="secondary" className="w-full">
                <Link to={AUTH_PATH} onClick={() => setOpen(false)}>
                  Sign in
                </Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
