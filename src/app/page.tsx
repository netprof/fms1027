import Link from "next/link";

const LINKS = [
  { href: "/board", title: "訂餐儀表板", note: "廚房電視用，訂單即時更新" },
  { href: "/order", title: "模擬下單", note: "模擬客戶下單，受截止時間限制" },
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-2xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">團膳管理系統</h1>
      <ul className="grid gap-3 sm:grid-cols-2">
        {LINKS.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="block rounded border border-zinc-200 p-4 hover:border-zinc-400"
            >
              <div className="font-medium">{link.title}</div>
              <div className="text-sm text-zinc-500">{link.note}</div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
