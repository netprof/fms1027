import Link from "next/link";
import { Suspense } from "react";
import { getCurrentEmployee } from "@/lib/auth";
import { logout } from "../login/actions";

// The shell is static; the signed-in name streams in behind a boundary so the
// session read doesn't hold up the page.
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center gap-4 border-b border-zinc-200 px-4 py-2">
        <span className="font-semibold">團膳後台</span>
        <nav className="flex gap-3 text-sm">
          <Link href="/admin/orders" className="hover:underline">
            電話改單
          </Link>
          <Link href="/board" className="hover:underline">
            儀表板
          </Link>
        </nav>
        <div className="ml-auto text-sm">
          <Suspense>
            <SignedIn />
          </Suspense>
        </div>
      </header>
      {children}
    </div>
  );
}

async function SignedIn() {
  const employee = await getCurrentEmployee();
  if (!employee) return null;
  return (
    <form action={logout} className="flex items-center gap-3">
      <span className="text-zinc-600">{employee.name}</span>
      <button type="submit" className="text-blue-600 hover:underline">
        登出
      </button>
    </form>
  );
}
