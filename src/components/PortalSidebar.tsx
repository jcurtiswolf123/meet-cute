"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui";
import { logout } from "@/lib/actions";

// A faithful Twenty (twentyhq/twenty) style navigation sidebar: a vertical,
// stacked left rail with a workspace header, small-caps section labels, icon +
// label rows, an active pill, and a collapse toggle that narrows the rail to
// icons only (persisted). On mobile it becomes a slide-in drawer opened from a
// slim top bar. Restyled to the Meet Cute warm palette.

export type SidebarItem = { href: string; label: string; icon: IconName };
export type SidebarSection = { label?: string; items: SidebarItem[] };
export type PortalSidebarVariant = "warm" | "twenty";

const STORAGE_KEY = "mc.sidebar.collapsed";

export function PortalSidebar({
  workspace,
  subtitle,
  sections,
  homeHref,
  userName,
  avatarUrl,
  variant = "warm",
  hoverExpand = false,
  defaultCollapsed = false,
}: {
  workspace: string;
  subtitle?: string;
  sections: SidebarSection[];
  homeHref: string;
  userName: string;
  avatarUrl?: string | null;
  variant?: PortalSidebarVariant;
  hoverExpand?: boolean;
  defaultCollapsed?: boolean;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const desktopRailRef = useRef<HTMLElement>(null);
  const storageKey = `${STORAGE_KEY}.${homeHref.startsWith("/studio") ? "studio" : "member"}`;
  const visuallyCollapsed = collapsed && !hoverExpanded;

  // Restore the collapsed preference after mount (avoids hydration mismatch).
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const stored = localStorage.getItem(storageKey);
        setCollapsed(stored === null ? defaultCollapsed : stored === "1");
      } catch {
        /* ignore */
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [defaultCollapsed, storageKey]);

  useEffect(() => {
    if (!mobileOpen) return;

    const pageMain = document.querySelector("main");
    const openButton = openButtonRef.current;
    const priorOverflow = document.body.style.overflow;
    pageMain?.setAttribute("inert", "");
    document.body.style.overflow = "hidden";

    const focusableSelector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusable = () =>
      Array.from(drawerRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []);
    focusable()[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      pageMain?.removeAttribute("inert");
      document.body.style.overflow = priorOverflow;
      openButton?.focus();
    };
  }, [mobileOpen]);
  const toggleCollapse = () => {
    setHoverExpanded(false);
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const isActive = (href: string) =>
    href === homeHref ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  const rail = (
    <SidebarInner
      workspace={workspace}
      subtitle={subtitle}
      sections={sections}
      userName={userName}
      avatarUrl={avatarUrl}
      collapsed={visuallyCollapsed}
      persistentlyCollapsed={collapsed}
      isActive={isActive}
      logoutTo={homeHref.startsWith("/studio") ? "/studio/login" : "/login"}
      onToggleCollapse={toggleCollapse}
      searchQuery={searchQuery}
      onSearchQueryChange={setSearchQuery}
      variant={variant}
    />
  );

  return (
    <>
      <aside
        ref={desktopRailRef}
        data-portal-sidebar
        data-collapsed={visuallyCollapsed ? "true" : "false"}
        onMouseEnter={() => {
          if (hoverExpand && collapsed) setHoverExpanded(true);
        }}
        onMouseLeave={() => {
          if (hoverExpand && collapsed) setHoverExpanded(false);
        }}
        onFocusCapture={() => {
          if (hoverExpand && collapsed) setHoverExpanded(true);
        }}
        onBlurCapture={(event) => {
          if (
            hoverExpand &&
            collapsed &&
            !event.currentTarget.contains(event.relatedTarget as Node | null)
          ) {
            setHoverExpanded(false);
          }
        }}
        className={`hidden h-dvh shrink-0 md:flex md:flex-col ${
          variant === "twenty"
            ? "bg-[#f5f5f6]"
            : "sticky top-0 border-r border-line bg-paper/70 backdrop-blur"
        } ${
          visuallyCollapsed
            ? variant === "twenty"
              ? "w-12"
              : "w-[60px]"
            : variant === "twenty"
              ? "w-[220px]"
              : "w-64"
        } transition-[width] duration-200 ease-soft`}
      >
        {rail}
      </aside>

      <div className="sticky top-0 z-40 flex items-center justify-between gap-2 border-b border-line bg-paper px-4 py-2.5 md:hidden">
        <button
          ref={openButtonRef}
          onClick={() => setMobileOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-ink transition hover:bg-cream"
          aria-label="Open menu"
          aria-expanded={mobileOpen}
          aria-controls="mobile-navigation"
        >
          <PortalIcon name="menu" />
        </button>
        <span className="font-display text-base font-medium text-ink">{workspace}</span>
        <Avatar url={avatarUrl} name={userName} size={28} />
      </div>

      {/* Mobile drawer. */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-espresso/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside
            ref={drawerRef}
            id="mobile-navigation"
            role="dialog"
            aria-modal="true"
            aria-label={`${workspace} navigation`}
            className={`absolute left-0 top-0 flex h-full flex-col border-r border-line shadow-card ${
              variant === "twenty" ? "w-[220px] bg-[#f5f5f6]" : "w-64 bg-paper"
            }`}
          >
            <SidebarInner
              workspace={workspace}
              subtitle={subtitle}
              sections={sections}
              userName={userName}
              avatarUrl={avatarUrl}
              collapsed={false}
              persistentlyCollapsed={false}
              isActive={isActive}
              logoutTo={homeHref.startsWith("/studio") ? "/studio/login" : "/login"}
              onClose={() => setMobileOpen(false)}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              variant={variant}
            />
          </aside>
        </div>
      )}
    </>
  );
}

function SidebarInner({
  workspace,
  subtitle,
  sections,
  userName,
  avatarUrl,
  collapsed,
  persistentlyCollapsed,
  isActive,
  logoutTo,
  onToggleCollapse,
  onClose,
  searchQuery,
  onSearchQueryChange,
  variant,
}: {
  workspace: string;
  subtitle?: string;
  sections: SidebarSection[];
  userName: string;
  avatarUrl?: string | null;
  collapsed: boolean;
  persistentlyCollapsed: boolean;
  isActive: (href: string) => boolean;
  logoutTo: "/login" | "/studio/login";
  onToggleCollapse?: () => void;
  onClose?: () => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  variant: PortalSidebarVariant;
}) {
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleSections = normalizedSearch
    ? sections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) =>
            item.label.toLowerCase().includes(normalizedSearch),
          ),
        }))
        .filter((section) => section.items.length > 0)
    : sections;
  const twenty = variant === "twenty";

  return (
    <div className={`flex h-full flex-col ${twenty ? "px-2 py-3" : ""}`}>
      <div
        className={`flex items-center gap-2 ${
          twenty ? "min-h-8 px-1 pb-2" : "px-3 pb-2 pt-3"
        } ${collapsed ? "justify-center" : ""}`}
      >
        <div
          className={`flex shrink-0 items-center justify-center ${
            twenty
              ? "h-6 w-6 rounded-full border border-ember/35 bg-paper text-ember"
              : "h-8 w-8 rounded-lg bg-ember text-cream"
          }`}
        >
          <span className={`font-display leading-none ${twenty ? "text-[12px]" : "text-[15px]"}`}>
            M
          </span>
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className={`truncate font-semibold text-ink ${twenty ? "text-[13px]" : "text-sm"}`}>
              {workspace}
            </div>
            {subtitle && <div className="truncate text-[11px] text-muted">{subtitle}</div>}
          </div>
        )}
        {!collapsed &&
          (onClose ? (
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded text-muted transition hover:bg-ink/[0.06] hover:text-ink"
              aria-label="Close menu"
            >
              <PortalIcon name="x" />
            </button>
          ) : onToggleCollapse ? (
            <button
              onClick={onToggleCollapse}
              className="flex h-7 w-7 items-center justify-center rounded text-muted transition hover:bg-ink/[0.06] hover:text-ink"
              aria-label={persistentlyCollapsed ? "Keep sidebar open" : "Collapse sidebar"}
              title={persistentlyCollapsed ? "Keep open" : "Collapse"}
            >
              <PortalIcon name={persistentlyCollapsed ? "chevronsRight" : "chevronsLeft"} />
            </button>
          ) : null)}
      </div>

      {!collapsed && twenty && (
        <div className="relative mb-3">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted">
            <PortalIcon name="search" />
          </span>
          <input
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            className="h-8 w-full rounded border border-line bg-paper pl-8 pr-12 text-[12px] text-ink outline-none transition placeholder:text-muted focus:border-ink/30 focus:ring-2 focus:ring-ink/5"
            placeholder="Quick search..."
            aria-label="Quick search"
          />
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-line bg-[#f5f5f6] px-1.5 py-0.5 font-mono text-[9px] text-muted">
            /
          </span>
        </div>
      )}

      <nav className={`flex-1 overflow-y-auto ${twenty ? "px-0 py-0" : "px-2 py-2"}`}>
        {visibleSections.map((section, i) => (
          <div key={section.label ?? i} className={i > 0 ? (twenty ? "mt-3" : "mt-4") : ""}>
            {section.label && !collapsed && (
              <div
                className={`px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase text-muted/80 ${
                  twenty ? "tracking-[0.06em]" : "tracking-[0.08em]"
                }`}
              >
                {section.label}
              </div>
            )}
            {section.label && collapsed && i > 0 && <div className="mx-2 mb-2 border-t border-line" />}
            <ul className="flex flex-col gap-0.5">
              {section.items.map((it) => {
                const active = isActive(it.href);
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      onClick={onClose}
                      aria-current={active ? "page" : undefined}
                      title={collapsed ? it.label : undefined}
                      className={`group flex items-center gap-2.5 text-sm transition ${
                        twenty ? "h-7 rounded px-1" : "rounded-lg px-2.5 py-2"
                      } ${
                        collapsed ? "justify-center" : ""
                      } ${
                        active
                          ? twenty
                            ? "bg-ember/10 font-medium text-ink ring-1 ring-inset ring-ember/10"
                            : "bg-ember/12 font-medium text-ember-deep"
                          : twenty
                            ? "text-muted hover:bg-ink/[0.055] hover:text-ink"
                            : "text-muted hover:bg-cream hover:text-ink"
                      }`}
                    >
                      <span className={`shrink-0 ${active ? "text-ember-deep" : "text-muted group-hover:text-ink"}`}>
                        <PortalIcon name={it.icon} />
                      </span>
                      {!collapsed && <span className="truncate">{it.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {!collapsed && visibleSections.length === 0 && (
          <div className="px-2 py-4 text-xs text-muted">No views found.</div>
        )}
      </nav>

      {collapsed && onToggleCollapse && (
        <div className="flex justify-center px-2 pb-1">
          <button
            onClick={onToggleCollapse}
            className="flex h-8 w-8 items-center justify-center rounded text-muted transition hover:bg-ink/[0.055] hover:text-ink"
            aria-label="Expand sidebar"
            title="Expand"
          >
            <PortalIcon name="chevronsRight" />
          </button>
        </div>
      )}

      <form
        action={logout}
        className={twenty ? "border-t border-line pt-2" : "border-t border-line p-2"}
      >
        <input type="hidden" name="returnTo" value={logoutTo} />
        <button
          className={`flex w-full items-center gap-2.5 px-2.5 py-2 text-sm text-muted transition ${
            twenty ? "rounded hover:bg-ink/[0.055]" : "rounded-lg hover:bg-cream"
          } hover:text-ink ${
            collapsed ? "justify-center" : ""
          }`}
          title={`Sign out (${userName})`}
        >
          <Avatar url={avatarUrl} name={userName} size={24} />
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 truncate text-left text-ink">{userName}</span>
              <span className="shrink-0 text-muted">
                <PortalIcon name="logout" />
              </span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}

// Inline Tabler-style icons (Twenty uses @tabler/icons); kept dependency-free.
export type IconName =
  | "sparkles"
  | "message"
  | "users"
  | "columns"
  | "calendar"
  | "wand"
  | "userCog"
  | "home"
  | "heart"
  | "user"
  | "settings"
  | "menu"
  | "x"
  | "logout"
  | "chevronsLeft"
  | "chevronsRight"
  | "search";

export function PortalIcon({ name }: { name: IconName }) {
  const p = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "sparkles":
      return (
        <svg {...p}>
          <path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" />
          <path d="M18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
        </svg>
      );
    case "message":
      return (
        <svg {...p}>
          <path d="M4 5h16v11H8l-4 3z" />
          <path d="M8 9h8M8 12h5" />
        </svg>
      );
    case "users":
      return (
        <svg {...p}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 20c0-3 2.7-5 6-5s6 2 6 5" />
          <path d="M16 5.5a3 3 0 0 1 0 5.5M21 20c0-2.3-1.4-4-3.5-4.6" />
        </svg>
      );
    case "columns":
      return (
        <svg {...p}>
          <rect x="3" y="4" width="6" height="16" rx="1" />
          <rect x="10.5" y="4" width="6" height="11" rx="1" />
          <rect x="18" y="4" width="3" height="16" rx="1" opacity="0.5" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...p}>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M4 9h16M8 3v4M16 3v4" />
        </svg>
      );
    case "wand":
      return (
        <svg {...p}>
          <path d="M15 4V2M15 10V8M12.5 6.5h-2M19.5 6.5h-2" />
          <path d="M5 20l9-9 2 2-9 9z" />
        </svg>
      );
    case "userCog":
      return (
        <svg {...p}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 20c0-3 2.7-5 6-5" />
          <circle cx="17.5" cy="15.5" r="2.5" />
          <path d="M17.5 12v1M17.5 18v1M21 15.5h-1M15 15.5h-1" />
        </svg>
      );
    case "home":
      return (
        <svg {...p}>
          <path d="M4 11l8-6 8 6" />
          <path d="M6 10v9h12v-9" />
        </svg>
      );
    case "heart":
      return (
        <svg {...p}>
          <path d="M12 20s-7-4.4-7-9.2A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7-2.2c0 4.8-7 9.2-7 9.2z" />
        </svg>
      );
    case "user":
      return (
        <svg {...p}>
          <circle cx="12" cy="8" r="3.2" />
          <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" />
        </svg>
      );
    case "settings":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
        </svg>
      );
    case "menu":
      return (
        <svg {...p}>
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      );
    case "x":
      return (
        <svg {...p}>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      );
    case "logout":
      return (
        <svg {...p}>
          <path d="M14 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2" />
          <path d="M10 12h10M17 9l3 3-3 3" />
        </svg>
      );
    case "chevronsLeft":
      return (
        <svg {...p}>
          <path d="M11 7l-5 5 5 5M18 7l-5 5 5 5" />
        </svg>
      );
    case "chevronsRight":
      return (
        <svg {...p}>
          <path d="M13 7l5 5-5 5M6 7l5 5-5 5" />
        </svg>
      );
    case "search":
      return (
        <svg {...p}>
          <circle cx="11" cy="11" r="6" />
          <path d="M16 16l4 4" />
        </svg>
      );
  }
}
