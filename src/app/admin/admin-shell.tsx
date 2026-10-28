"use client";

import { ChevronRight, House, Menu, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";

// Breadcrumb labels by path prefix; detail pages get their parent first.
const CRUMBS: Record<string, { label: string; parent?: string }> = {
  "/admin/orders": { label: "電話改單" },
  "/admin/companies": { label: "客戶" },
  "/admin/companies/*": { label: "公司", parent: "/admin/companies" },
  "/admin/sites/*": { label: "廠區設定", parent: "/admin/companies" },
  "/admin/routes": { label: "路線" },
  "/admin/routes/*": { label: "路線設定", parent: "/admin/routes" },
  "/admin/menus": { label: "菜單" },
  "/admin/holidays": { label: "休假日" },
  "/admin/prices": { label: "價位" },
  "/admin/employees": { label: "帳號" },
};

function crumbsFor(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  const key =
    parts.length > 2 ? `/${parts[0]}/${parts[1]}/*` : `/${parts.join("/")}`;
  const here = CRUMBS[key];
  if (!here) return [];
  const parent = here.parent ? CRUMBS[here.parent] : undefined;
  return [
    ...(parent ? [{ label: parent.label, href: here.parent }] : []),
    { label: here.label, href: undefined },
  ];
}

// Reads the URL, so it renders inside its own boundary (required on
// dynamic routes such as /admin/sites/[id]).
function Breadcrumb() {
  const crumbs = crumbsFor(usePathname());
  return (
    <>
      {crumbs.map((c) => (
        <span key={c.label} className="flex items-center gap-2">
          <ChevronRight size={14} aria-hidden />
          {c.href ? (
            <Link href={c.href} className="hover:text-primary">
              {c.label}
            </Link>
          ) : (
            <span className="text-ink">{c.label}</span>
          )}
        </span>
      ))}
    </>
  );
}

// Ultima-style frame: indigo top bar, white sidebar, breadcrumb strip and a
// light ground for the page cards. nav and user come from the server.
export function AdminShell({
  nav,
  user,
  children,
}: {
  nav: ReactNode;
  user: ReactNode;
  children: ReactNode;
}) {
  // Drawer on small screens; any link click inside it closes it.
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-ground font-admin text-ink">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 bg-primary px-4 text-white shadow-md">
        <button
          type="button"
          aria-label="選單"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="rounded-full p-1.5 hover:bg-white/10 lg:hidden"
        >
          <Menu size={20} />
        </button>
        <Link href="/admin/orders" className="flex items-center gap-2 text-lg font-medium tracking-wide">
          <UtensilsCrossed size={22} aria-hidden />
          團膳管理系統
        </Link>
        <div className="ml-auto text-sm">{user}</div>
      </header>

      <div className="flex flex-1">
        {open && (
          <div
            className="fixed inset-0 top-14 z-10 bg-black/30 lg:hidden"
            onClick={() => setOpen(false)}
            aria-hidden
          />
        )}
        <aside
          onClick={(e) => {
            if ((e.target as Element).closest("a")) setOpen(false);
          }}
          className={`fixed bottom-0 left-0 top-14 z-20 w-60 shrink-0 overflow-y-auto bg-white shadow-[0_3px_5px_rgba(0,0,0,0.02),0_0_2px_rgba(0,0,0,0.05),0_1px_4px_rgba(0,0,0,0.08)] transition-transform lg:sticky lg:h-[calc(100vh-3.5rem)] lg:translate-x-0 ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {nav}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-11 items-center gap-2 bg-white px-6 text-sm text-ink-muted">
            <Link href="/admin/orders" aria-label="首頁" className="hover:text-primary">
              <House size={15} />
            </Link>
            <Suspense>
              <Breadcrumb />
            </Suspense>
          </div>
          <div className="flex-1 p-4 sm:p-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
