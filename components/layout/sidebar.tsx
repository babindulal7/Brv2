import Link from "next/link";

const items = ["dashboard","inventory","rentals","clients","finance","expenses","depreciation","maintenance","cleaning","damage-log","bundles","pricing","settings"];

export function Sidebar() {
  return (
    <aside className="w-64 border-r border-zinc-800 bg-black/40 p-4">
      <h1 className="mb-6 text-lg font-bold">Babin Rentals v2</h1>
      <nav className="space-y-2">
        {items.map((item) => (
          <Link key={item} className="block rounded-lg px-3 py-2 text-zinc-300 hover:bg-zinc-900" href={`/${item}`}>
            {item}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
