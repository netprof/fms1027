import type { Menu } from "@/lib/order-view";

export function MenuCard({ menu }: { menu: Menu | null }) {
  if (!menu) {
    return <p className="text-sm text-zinc-500">這天的菜單還沒公布。</p>;
  }
  return (
    <section className="rounded border border-zinc-200 p-4 text-sm">
      <p className="font-medium">
        主菜：{menu.mainDish}　湯：{menu.soup}
      </p>
      <p className="mt-1 text-zinc-600">配菜：{menu.sideDishes.join("、")}</p>
      {menu.bMealItems.length > 0 && (
        <p className="mt-1 text-zinc-600">B 餐：{menu.bMealItems.join("、")}</p>
      )}
    </section>
  );
}
