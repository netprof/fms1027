import { LogOut } from "lucide-react";
import { Suspense } from "react";
import { getCurrentEmployee } from "@/lib/auth";
import { roboto } from "../fonts";
import { logout } from "../login/actions";
import { AdminShell } from "./admin-shell";
import { SidebarNav } from "./sidebar-nav";

// The frame is static; the role-dependent menu and the signed-in name stream
// in behind boundaries so the session read doesn't hold up the page.
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className={`${roboto.variable} flex flex-1 flex-col`}>
      <AdminShell
        nav={
          <Suspense>
            <RoleNav />
          </Suspense>
        }
        user={
          <Suspense>
            <SignedIn />
          </Suspense>
        }
      >
        {children}
      </AdminShell>
    </div>
  );
}

async function RoleNav() {
  const employee = await getCurrentEmployee();
  return <SidebarNav isAdmin={employee?.role === "admin"} />;
}

async function SignedIn() {
  const employee = await getCurrentEmployee();
  if (!employee) return null;
  return (
    <form action={logout} className="flex items-center gap-3">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 font-medium">
        {employee.name.slice(0, 1)}
      </span>
      <span className="hidden flex-col leading-tight sm:flex">
        <span>{employee.name}</span>
        <span className="text-xs text-white/70">
          {employee.role === "admin" ? "管理者" : "員工"}
        </span>
      </span>
      <button
        type="submit"
        aria-label="登出"
        title="登出"
        className="rounded-full p-1.5 hover:bg-white/10"
      >
        <LogOut size={18} />
      </button>
    </form>
  );
}
