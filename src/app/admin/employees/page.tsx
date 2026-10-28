import { asc, desc } from "drizzle-orm";
import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { inputClass, labelClass } from "@/components/styles";
import { db } from "@/db";
import { employees } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { AdminPage } from "../admin-page";
import { createEmployee, updateEmployee } from "./actions";

export const metadata: Metadata = { title: "帳號" };

export default function EmployeesPage() {
  return (
    <AdminPage
      title="員工與帳號"
      note="員工可兼任司機。沒有帳號的員工只能被指派為司機，無法登入。管理者可維護所有基本資料；一般員工只能電話改單。"
    >
      <Content />
    </AdminPage>
  );
}

function RoleSelect({ value }: { value?: string }) {
  return (
    <select name="role" defaultValue={value ?? "staff"} className={inputClass}>
      <option value="staff">員工</option>
      <option value="admin">管理者</option>
    </select>
  );
}

async function Content() {
  const me = await requireAdmin();
  const rows = await db
    .select()
    .from(employees)
    .orderBy(desc(employees.active), asc(employees.id));

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-2 font-medium">新增員工</h2>
        <ActionForm action={createEmployee} submitLabel="新增" resetOnSuccess className="flex flex-wrap items-end gap-3">
          <label className={labelClass}>
            姓名
            <input name="name" required maxLength={30} className={`${inputClass} w-28`} />
          </label>
          <label className={labelClass}>
            電話
            <input name="phone" required maxLength={30} className={`${inputClass} w-36`} />
          </label>
          <label className={labelClass}>
            角色
            <RoleSelect />
          </label>
          <label className={labelClass}>
            帳號（可留空）
            <input name="username" maxLength={30} autoComplete="off" className={`${inputClass} w-28`} />
          </label>
          <label className={labelClass}>
            密碼（至少 8 字元）
            <input name="password" type="password" autoComplete="new-password" className={`${inputClass} w-36`} />
          </label>
        </ActionForm>
      </section>

      <section>
        <h2 className="mb-2 font-medium">員工列表（{rows.length}）</h2>
        <ul className="divide-y divide-zinc-100">
          {rows.map((e) => (
            <li key={e.id} className={`py-2 ${e.active ? "" : "opacity-50"}`}>
              <ActionForm action={updateEmployee.bind(null, e.id)} className="flex flex-wrap items-end gap-3">
                <label className={labelClass}>
                  姓名
                  <input name="name" required maxLength={30} defaultValue={e.name} className={`${inputClass} w-28`} />
                </label>
                <label className={labelClass}>
                  電話
                  <input name="phone" required maxLength={30} defaultValue={e.phone} className={`${inputClass} w-36`} />
                </label>
                <label className={labelClass}>
                  角色
                  <RoleSelect value={e.role} />
                </label>
                <label className={labelClass}>
                  帳號
                  <input name="username" maxLength={30} defaultValue={e.username ?? ""} autoComplete="off" className={`${inputClass} w-28`} />
                </label>
                <label className={labelClass}>
                  {e.passwordHash ? "重設密碼（留空不變）" : "密碼"}
                  <input name="password" type="password" autoComplete="new-password" className={`${inputClass} w-36`} />
                </label>
                <label className="flex items-center gap-1 pb-1 text-sm">
                  <input type="checkbox" name="active" defaultChecked={e.active} />
                  啟用
                </label>
                {e.id === me.id && <span className="pb-1 text-xs text-zinc-500">（目前登入）</span>}
              </ActionForm>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
