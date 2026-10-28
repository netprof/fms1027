"use client";

import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export function LoginForm() {
  const next = useSearchParams().get("next") ?? "";
  const [state, action, pending] = useActionState<LoginState, FormData>(
    login,
    null,
  );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <label className="flex flex-col gap-1 text-sm">
        帳號
        <input
          name="username"
          autoComplete="username"
          defaultValue={state?.username}
          required
          className="rounded border border-zinc-300 bg-transparent p-2 text-base"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        密碼
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="rounded border border-zinc-300 bg-transparent p-2 text-base"
        />
      </label>
      {state?.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-zinc-900 py-2 text-white disabled:opacity-40"
      >
        {pending ? "登入中…" : "登入"}
      </button>
    </form>
  );
}
