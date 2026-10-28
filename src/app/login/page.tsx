import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "員工登入" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center p-6">
      <h1 className="mb-6 text-2xl font-semibold">員工登入</h1>
      {/* The form reads ?next= from the URL, which needs a boundary. */}
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
