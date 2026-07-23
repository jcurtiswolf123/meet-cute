"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui";
import { logout } from "@/lib/actions";

// A faithful Twenty (twentyhq/twenty) style navigation sidebar: a vertical,
// stacked left rail with a workspace header, small-caps section labels, icon +
// label rows, an active pill, and a collapse toggle that narrows the rail to
// icons only (persisted). On mobile it becomes a slide-in drawer opened from a
// slim top bar. Restyled to the Meet Cute warm palette.

export type SidebarItem = { href: string; label: string; icon: IconName };
export type SidebarSection = { label?: string; items: SidebarItem[] };

const STORAGE_KEY = "mc.sidebar.collapsed";

export function PortalSidebar({
  workspace,
  subtitle,
  sections,
  homeHref,
  userName,
  avatarUrl,
}: {
  workspace: string;
  subtitle?: string;
  sections: SidebarSection[];
  homeHref: string;
  userName: string;
  avatarUrl?: string | null;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Restore the collapsed preference after mount (avoids hydration mismatch).
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
      } catch {
        /* ignore */
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const toggleCollapse = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
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
      collapsed={collapsed}
      isActive={isActive}
      logoutTo={homeHref.startsWith("/studio") ? "/studio/login" : "/login"}
      onToggleCollapse={toggleCollapse}
    />
  );

  return (
    <>
      {/* Desktop rail: sticky, full height, collapsible width. */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 border-r border-line bg-paper/70 backdrop-blur md:flex md:flex-col ${
          collapsed ? "w-[60px]" : "w-64"
        } transition-[width] duration-200 ease-soft`}
      >
        {rail}
      </aside>

      {/* Mobile top bar. */}
      <div className="sticky top-0 z-40 flex items-center justify-between gap-2 border-b border-line bg-paper/80 px-4 py-2.5 backdrop-blur md:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-ink transition hover:bg-cream"
          aria-label="Open menu"
        >
          <Icon name="menu" />
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
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col border-r border-line bg-paper shadow-card">
            <SidebarInner
              workspace={workspace}
              subtitle={subtitle}
              sections={sections}
              userName={userName}
              avatarUrl={avatarUrl}
              collapsed={false}
              isActive={isActive}
              logoutTo={homeHref.startsWith("/studio") ? "/studio/login" : "/login"}
              onClose={() => setMobileOpen(false)}
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
  isActive,
  logoutTo,
  onToggleCollapse,
  onClose,
}: {
  workspace: string;
  subtitle?: string;
  sections: SidebarSection[];
  userName: string;
  avatarUrl?: string | null;
  collapsed: boolean;
  isActive: (href: string) => boolean;
  logoutTo: "/login" | "/studio/login";
  onToggleCollapse?: () => void;
  onClose?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      {/* Workspace header */}
      <div className={`flex items-center gap-2 px-3 pb-2 pt-3 ${collapsed ? "justify-center" : ""}`}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ember text-cream">
          <span className="font-display text-[15px] leading-none">M</span>
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-ink">{workspace}</div>
            {subtitle && <div className="truncate text-[11px] text-muted">{subtitle}</div>}
          </div>
        )}
        {!collapsed &&
          (onClose ? (
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-cream hover:text-ink"
              aria-label="Close menu"
            >
              <Icon name="x" />
            </button>
          ) : onToggleCollapse ? (
            <button
              onClick={onToggleCollapse}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-cream hover:text-ink"
              aria-label="Collapse sidebar"
              title="Collapse"
            >
              <Icon name="chevronsLeft" />
            </button>
          ) : null)}
      </div>

      {/* Nav sections */}
      <nav className="flex-1 overflow-y-auto px-2 py-2">
        {sections.map((section, i) => (
          <div key={i} className={i > 0 ? "mt-4" : ""}>
            {section.label && !collapsed && (
              <div className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted/80">
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
                      className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition ${
                        collapsed ? "justify-center" : ""
                      } ${
                        active
                          ? "bg-ember/12 font-medium text-ember-deep"
                          : "text-muted hover:bg-cream hover:text-ink"
                      }`}
                    >
                      <span className={`shrink-0 ${active ? "text-ember-deep" : "text-muted group-hover:text-ink"}`}>
                        <Icon name={it.icon} />
                      </span>
                      {!collapsed && <span className="truncate">{it.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Collapsed expand toggle */}
      {collapsed && onToggleCollapse && (
        <div className="flex justify-center px-2 pb-1">
          <button
            onClick={onToggleCollapse}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition hover:bg-cream hover:text-ink"
            aria-label="Expand sidebar"
            title="Expand"
          >
            <Icon name="chevronsRight" />
          </button>
        </div>
      )}

      {/* Footer: user + sign out */}
      <form
        action={logout}
        className="border-t border-line p-2"
      >
        <input type="hidden" name="returnTo" value={logoutTo} />
        <button
          className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted transition hover:bg-cream hover:text-ink ${
            collapsed ? "justify-center" : ""
          }`}
          title={`Sign out (${userName})`}
        >
          <Avatar url={avatarUrl} name={userName} size={24} />
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 truncate text-left text-ink">{userName}</span>
              <span className="shrink-0 text-muted">
                <Icon name="logout" />
              </span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}

// Inline Tabler-style icons (Twenty uses @tabler/icons); kept dependency-free.
type IconName =
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
  | "chevronsRight";

function Icon({ name }: { name: IconName }) {
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
  }
}
