import { UtensilsCrossed } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { roboto } from "../fonts";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "員工登入" };

export default function LoginPage() {
  return (
    <main
      className={`${roboto.variable} flex flex-1 items-center justify-center bg-ground p-4 font-admin text-ink`}
    >
      <div className="w-full max-w-sm overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="flex items-center gap-2 bg-primary px-6 py-5 text-white">
          <UtensilsCrossed size={24} aria-hidden />
          <div>
            <div className="text-lg font-medium">團膳管理系統</div>
            <div className="text-xs text-white/70">員工登入</div>
          </div>
        </div>
        <div className="p-6">
          {/* The form reads ?next= from the URL, which needs a boundary. */}
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
