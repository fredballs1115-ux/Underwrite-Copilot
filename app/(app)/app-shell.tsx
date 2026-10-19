"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type FocusEvent, type ReactNode } from "react";
import { signOut } from "@/app/login/actions";
import { LogoMark } from "@/app/logo";
import { DataNotices } from "@/app/data-notices";
import { ToastProvider } from "./toaster";
import { CommandPalette } from "./command-palette";
import { ShortcutsSheet, useShortcutsKey } from "./shortcuts-sheet";
import type { MarketNavEntry } from "@/lib/market-match";
import { personName } from "@/lib/person";
import { PersonBadge } from "./person-badge";

function NavIcon({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}
const IconLayers = (p: { className?: string }) => (
  <NavIcon className={p.className}>
    <path d="m12 2 9 5-9 5-9-5 9-5Z" />
    <path d="m3 12 9 5 9-5" />
    <path d="m3 17 9 5 9-5" />
  </NavIcon>
);
const IconCard = (p: { className?: string }) => (
  <NavIcon className={p.className}>
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <path d="M2 10h20" />
  </NavIcon>
);
const IconUser = (p: { className?: string }) => (
  <NavIcon className={p.className}>
    <path d="M20 21a8 8 0 0 0-16 0" />
    <circle cx="12" cy="7" r="4" />
  </NavIcon>
);
const IconTarget = (p: { className?: string }) => (
  <NavIcon className={p.className}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="0.8" fill="currentColor" />
  </NavIcon>
);
const IconUsers = (p: { className?: string }) => (
  <NavIcon className={p.className}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </NavIcon>
);
const IconChart = (p: { className?: string }) => (
  <NavIcon className={p.className}>
    <path d="M3 3v18h18" />
    <path d="M8 17v-3" />
    <path d="M13 17V7" />
    <path d="M18 17v-6" />
  </NavIcon>
);
const IconMemory = (p: { className?: string }) => (
  <NavIcon className={p.className}>
    <path d="M4 4h16v5H4z" />
    <path d="M4 15h16v5H4z" />
    <path d="M8 6.5h0" />
    <path d="M8 17.5h0" />
  </NavIcon>
);
const IconPin = (p: { className?: string }) => (
  <NavIcon className={p.className}>
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10" r="3" />
  </NavIcon>
);
const IconCalc = (p: { className?: string }) => (
  <NavIcon className={p.className}>
    <rect x="4" y="2" width="16" height="20" rx="2" />
    <path d="M8 6h8" />
    <path d="M8 11h.01M12 11h.01M16 11h.01" />
    <path d="M8 15h.01M12 15h.01M16 15h4" />
    <path d="M8 19h.01M12 19h.01" />
  </NavIcon>
);
const IconNews = (p: { className?: string }) => (
  <NavIcon className={p.className}>
    <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
    <path d="M18 14h-8" />
    <path d="M15 18h-5" />
    <path d="M10 6h8v4h-8V6Z" />
  </NavIcon>
);

/** One of the app's sections: its path, its name, whether it is the one on
 *  screen, and the icon the sidebar and the phone's strip both draw. */
type NavEntry = readonly [href: string, label: string, active: boolean, Icon: (p: { className?: string }) => ReactNode];

/**
 * The phone's navigation (signed-in gaps, M6): one row of the sidebar's own
 * sections, each chip with the sidebar's icon, scrolling sideways. Three
 * things the bare row of eleven words lacked:
 *
 * - the section on screen is brought into the row's view whenever the page
 *   changes, centred where the row allows — "Account" is its eleventh chip
 *   and sat past a phone's edge on its own page;
 * - each edge the row runs on past is faded, drawn OVER the row and never
 *   as a mask on it (ToolRow's rule), the right one going once the row is
 *   scrolled to its end, the left one coming once it is scrolled from its
 *   start;
 * - a chip the keyboard lands on is brought clear of the fade (ToolRow's
 *   `scrollIntoView`, on `:focus-visible` alone, so a tap that moved the
 *   row never loses its click).
 */
function PhoneNav({ nav, pathname }: { nav: readonly NavEntry[]; pathname: string }) {
  const stripRef = useRef<HTMLElement>(null);
  const [edges, setEdges] = useState({ start: false, end: true });
  // Read in the scroll handler alone: setting the row's scroll below fires
  // it, so the fades follow every move, the page's own included.
  const onScroll = () => {
    const s = stripRef.current;
    if (!s) return;
    setEdges({ start: s.scrollLeft > 1, end: s.scrollLeft < s.scrollWidth - s.clientWidth - 1 });
  };
  useEffect(() => {
    const s = stripRef.current;
    const chip = s?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!s || !chip || s.scrollWidth <= s.clientWidth) return;
    // The row's own scroll, never scrollIntoView, which would scroll the
    // page under the sticky bar too.
    s.scrollLeft = Math.max(0, chip.offsetLeft - (s.clientWidth - chip.offsetWidth) / 2);
  }, [pathname]);
  const reveal = (e: FocusEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    const s = e.currentTarget;
    if (s.scrollWidth <= s.clientWidth || !target.matches(":focus-visible")) return;
    target.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  return (
    <div className="relative border-t border-white/10">
      <nav
        ref={stripRef}
        aria-label="Primary"
        onScroll={onScroll}
        onFocus={reveal}
        data-phone-nav
        className="relative overflow-x-auto scroll-px-10"
      >
        <div className="flex w-max gap-1 px-3 py-2 pr-10">
          {nav.map(([href, label, active, Icon]) => (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                active ? "bg-white/12 text-white" : "text-white/65 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${active ? "text-accent" : ""}`} />
              {label}
            </Link>
          ))}
        </div>
      </nav>
      <span
        aria-hidden
        data-nav-fade="start"
        className={`pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-l from-transparent to-sidebar transition-opacity ${
          edges.start ? "opacity-100" : "opacity-0"
        }`}
      />
      <span
        aria-hidden
        data-nav-fade="end"
        className={`pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-r from-transparent to-sidebar transition-opacity ${
          edges.end ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}

/**
 * The reader's badge in the phone's top bar, where Sign out had stood as
 * a word (signed-in gaps, M6): it opens their name and email, the account
 * and Sign out. Esc or a tap outside closes it, Esc handing focus back to
 * the badge. The panel is the chrome's own dark, so the sidebar's white
 * focus ring (globals.css, `.bg-sidebar :focus-visible`) shows on it.
 */
function AccountMenu({ name, email, id }: { name: string; email: string; id: string | null }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={boxRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`Account and sign out, ${name}`}
        data-account-menu
        className="flex rounded-full p-1.5 transition-colors hover:bg-white/10"
      >
        <PersonBadge name={name} id={id} size="sm" decorative className="ring-1 ring-white/20" />
      </button>
      {open && (
        <div
          id={panelId}
          className="absolute right-0 top-full z-20 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-white/15 bg-sidebar p-2 text-white shadow-lg"
        >
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <PersonBadge name={name} id={id} size="md" decorative className="ring-1 ring-white/20" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{name}</span>
              <span className="block truncate text-xs text-white/60">{email}</span>
            </span>
          </div>
          <Link
            href="/account"
            onClick={() => setOpen(false)}
            className="mt-1 block rounded-lg px-2 py-2 text-sm text-white/85 transition-colors hover:bg-white/10 hover:text-white"
          >
            Account
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="block w-full rounded-lg px-2 py-2 text-left text-sm text-white/85 transition-colors hover:bg-white/10 hover:text-white"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/** The signed-in app chrome: a dark navy sidebar on desktop, a top bar on mobile. */
export function AppShell({
  userEmail,
  userId = null,
  userName = null,
  markets = [],
  children,
}: {
  userEmail: string;
  /** what the reader's badge tone is keyed on, as on every other surface */
  userId?: string | null;
  /** the name the reader set on the account page (lib/person `viewerName`),
   *  else their email's local part */
  userName?: string | null;
  /** slim covered-market list for the ⌘K palette (built server-side) */
  markets?: MarketNavEntry[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const inPipeline = pathname.startsWith("/deals");
  const inCriteria = pathname.startsWith("/criteria");
  const inComps = pathname.startsWith("/comps");
  const inAnalytics = pathname.startsWith("/analytics");
  // Submarkets are a panel on Market data, not a section of their own, so a
  // submarket's detail page lights the same nav item.
  const inMarket = pathname.startsWith("/market") || pathname.startsWith("/submarkets");
  const inNews = pathname.startsWith("/news");
  const inTools = pathname.startsWith("/tools");
  const inTeam = pathname.startsWith("/team");
  const inBilling = pathname.startsWith("/billing");
  const inAccount = pathname.startsWith("/account");
  // A deal's own page keeps its bar at a phone's foot once the header
  // scrolls away (#437), so the footer below the page clears it too.
  const onDealPage = /^\/deals\/[^/]+$/.test(pathname) && pathname !== "/deals/compare";
  const [paletteOpen, setPaletteOpen] = useState(false);
  // "?" anywhere, or the palette's "Keyboard shortcuts", opens the sheet.
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  useShortcutsKey(() => setShortcutsOpen(true));
  // The reader as every teammate sees them: their name, else the email's
  // local part (lib/person), never the address as a name.
  const shownName = (userName ?? "").trim() || personName(null, userEmail, "You");
  // The app's sections, ONE list the sidebar and the phone's strip both
  // draw, each with its icon: the phone's chips had been words alone.
  const nav = [
    ["/deals", "Pipeline", inPipeline, IconLayers],
    ["/criteria", "Buy box", inCriteria, IconTarget],
    ["/comps", "Pull comps", inComps, IconPin],
    ["/market", "Market data", inMarket, IconMemory],
    ["/tools", "Deal math", inTools, IconCalc],
    ["/news", "News", inNews, IconNews],
    ["/analytics", "Analytics", inAnalytics, IconChart],
    ["/team", "Team", inTeam, IconUsers],
    ["/billing", "Billing", inBilling, IconCard],
    ["/account", "Account", inAccount, IconUser],
  ] as const;

  return (
    <ToastProvider>
    <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} markets={markets} onShowShortcuts={() => setShortcutsOpen(true)} />
    {shortcutsOpen ? <ShortcutsSheet onClose={() => setShortcutsOpen(false)} /> : null}
    {/* The skip link is the root layout's (app/skip-link.tsx), shared with
        the public pages; it targets the <main id="main"> below. */}
    <div className="flex min-h-screen bg-canvas">
      {/* Sidebar — desktop */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-sidebar text-white md:flex">
        <Link href="/deals" className="flex items-center gap-2.5 px-5 py-5">
          <LogoMark className="h-8 w-8" />
          <span className="font-semibold tracking-tight">
            Underwrite Copilot
          </span>
        </Link>

        <div className="px-3 pb-1">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/55 transition-colors hover:bg-white/10 hover:text-white/80"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5"
              aria-hidden
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            Jump to…
            <kbd className="ml-auto rounded border border-white/15 px-1.5 py-0.5 text-[10px] text-white/60">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* The app's primary navigation, named as its own landmark: the
            aside around it also holds the logo, the palette and the
            account, so a screen reader's list of landmarks had shown only an
            unnamed navigation inside a "complementary" region. */}
        <nav aria-label="Primary" className="mt-1 flex-1 space-y-1 overflow-y-auto px-3">
          {nav.map(([href, label, active, Icon]) => (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-white/12 text-white"
                  : "text-white/65 hover:bg-white/5 hover:text-white"
              }`}
            >
              {active && (
                <span
                  className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-accent"
                  aria-hidden
                />
              )}
              <Icon className={`h-4 w-4 ${active ? "text-accent" : ""}`} />
              {label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-white/10 px-3 py-4">
          {/* Not a nav item (the list is full) — a quiet standing pointer to
              the improvement log, same target as the ⌘K "What's new" action. */}
          <Link
            href="/whats-new"
            className="mb-2 block rounded-lg px-2 py-1.5 text-sm text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            What&apos;s new
          </Link>
          <Link
            href="/account"
            className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/10"
          >
            <PersonBadge name={shownName} id={userId} size="md" decorative className="ring-1 ring-white/20" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-white/90">{shownName}</span>
              <span title={userEmail} className="block truncate text-xs text-white/60">
                {userEmail}
              </span>
            </span>
          </Link>
          <form action={signOut} className="mt-2">
            <button
              type="submit"
              className="w-full rounded-lg px-2 py-1.5 text-left text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar — mobile */}
        <header data-app-topbar className="sticky top-0 z-10 bg-sidebar text-white md:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <Link href="/deals" className="flex items-center gap-2">
              <LogoMark className="h-7 w-7" />
              <span className="font-semibold tracking-tight">
                Underwrite Copilot
              </span>
            </Link>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                aria-label="Search deals and actions"
                className="rounded-lg p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4.5 w-4.5"
                  aria-hidden
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
              </button>
              {/* The reader's badge in Sign out's place, as an app's top
                  bar has it: their name, the account and Sign out behind it. */}
              <AccountMenu name={shownName} email={userEmail} id={userId} />
            </div>
          </div>
          {/* Mobile nav — the sidebar is desktop-only, so these live here,
              under the same name; only one of the two is ever displayed. */}
          <PhoneNav nav={nav} pathname={pathname} />
        </header>

        <main id="main" className="flex-1">
          {/* The pipeline is a table of eight columns and gets a table's
              room; every other page keeps the reading width. */}
          <div className={`mx-auto w-full px-5 py-8 sm:px-8 ${pathname === "/deals" ? "max-w-7xl" : "max-w-5xl"}`}>
            {children}
          </div>
        </main>
        {/* The terms, the privacy policy and the security page on every
            signed-in page: what a customer may need to read, and the footer
            links Google's Street View policies ask of a web app that shows
            its imagery ("web apps should include these links in their
            footer", as the runner printed the policies on Oct 5, 2026). */}
        <footer className={`border-t border-line px-5 py-4 sm:px-8 print:hidden ${onDealPage ? "max-md:pb-20" : ""}`}>
          <nav aria-label="Terms and policies" className="mx-auto flex max-w-7xl gap-4 text-xs text-muted">
            <Link href="/terms" className="hover:text-ink">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-ink">
              Privacy
            </Link>
            <Link href="/security" className="hover:text-ink">
              Security
            </Link>
          </nav>
          {/* The data providers' notices on every signed-in page, in the
              footer's type: the deal pages, the market pages and the
              calculators all draw FRED's figures (app/data-notices). */}
          <DataNotices className="mx-auto mt-2 max-w-7xl text-xs text-muted" />
        </footer>
      </div>
    </div>
    </ToastProvider>
  );
}
