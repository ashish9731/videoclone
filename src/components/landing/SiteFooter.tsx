import { Link } from "@tanstack/react-router";
import { Scissors } from "lucide-react";
import { APP_PATH, AUTH_PATH, NAV_LINKS } from "./site-data";

export function SiteFooter() {
  return (
    <footer className="border-t bg-panel/40">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 md:grid-cols-[1.4fr_1fr_1fr] md:px-8">
        <div>
          <div className="flex items-center gap-2 font-display text-base font-bold">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/15 ring-1 ring-primary/30">
              <Scissors className="h-3.5 w-3.5 text-primary" />
            </span>
            Cutroom
          </div>
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">
            A multi-track video editor that renders in your browser — timeline, grades, caption
            lanes and MP4 export, with no render queue in the middle.
          </p>
        </div>

        <div>
          <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            Explore
          </h3>
          <ul className="mt-3 space-y-2 text-sm">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  className="text-foreground/80 transition-colors hover:text-primary"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            Open the app
          </h3>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link
                to={APP_PATH}
                className="text-foreground/80 transition-colors hover:text-primary"
              >
                My projects
              </Link>
            </li>
            <li>
              <Link
                to={AUTH_PATH}
                className="text-foreground/80 transition-colors hover:text-primary"
              >
                Sign in or create an account
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground md:flex-row md:items-center md:justify-between md:px-8">
          <span>© {new Date().getFullYear()} Cutroom</span>
        </div>
      </div>
    </footer>
  );
}
