"use client";

import {
  Building2,
  CalendarOff,
  MonitorPlay,
  PhoneCall,
  Route,
  Tag,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; icon: LucideIcon };

const SECTIONS: { title: string; adminOnly: boolean; items: Item[] }[] = [
  {
    title: "作業",
    adminOnly: false,
    items: [
      { href: "/admin/orders", label: "電話改單", icon: PhoneCall },
      { href: "/board", label: "訂餐儀表板", icon: MonitorPlay },
    ],
  },
  {
    title: "基本資料",
    adminOnly: true,
    items: [
      { href: "/admin/companies", label: "客戶", icon: Building2 },
      { href: "/admin/routes", label: "路線", icon: Route },
      { href: "/admin/menus", label: "菜單", icon: UtensilsCrossed },
      { href: "/admin/holidays", label: "休假日", icon: CalendarOff },
      { href: "/admin/prices", label: "價位", icon: Tag },
      { href: "/admin/employees", label: "帳號", icon: Users },
    ],
  },
];

// Site and route detail pages light up their list's menu item.
const ALIASES: Record<string, string> = { "/admin/sites": "/admin/companies" };

export function SidebarNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const section = "/" + pathname.split("/").slice(1, 3).join("/");
  const current = ALIASES[section] ?? section;

  return (
    <nav className="py-2">
      {SECTIONS.filter((s) => isAdmin || !s.adminOnly).map((s) => (
        <div key={s.title} className="mb-2">
          <div className="px-4 pb-1 pt-3 text-xs font-medium text-ink-muted">{s.title}</div>
          <ul>
            {s.items.map(({ href, label, icon: Icon }) => {
              const active = current === href;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 px-6 py-2.5 text-sm transition-colors ${
                      active
                        ? "bg-primary-soft font-medium text-primary-ink"
                        : "text-ink hover:bg-slate-50"
                    }`}
                  >
                    <Icon size={16} strokeWidth={2} aria-hidden />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
