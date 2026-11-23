const TILES = [
  { name: "Điện thoại", dot: "bg-brand" },
  { name: "Laptop", dot: "bg-info" },
  { name: "Thời trang", dot: "bg-brand-deep" },
  { name: "Nhà cửa", dot: "bg-success" },
  { name: "Làm đẹp", dot: "bg-warning" },
  { name: "Mẹ & bé", dot: "bg-stone-600" },
] as const;

/** "Danh mục nổi bật" from artboard Main (STATIC). Plain items: there are no category pages yet. */
export function CategoryTiles() {
  return (
    <section aria-labelledby="cat-h" className="flex flex-col gap-5">
      <h2 id="cat-h" className="text-3xl font-extrabold tracking-[-0.02em]">
        Danh mục nổi bật
      </h2>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(140px,1fr))]">
        {TILES.map((tile) => (
          <li
            key={tile.name}
            className="flex flex-col items-center gap-3 rounded-xl bg-stone-100 px-3 py-5 text-center text-sm font-semibold"
          >
            <span aria-hidden="true" className={`size-14 rounded-full opacity-85 ${tile.dot}`} />
            {tile.name}
          </li>
        ))}
      </ul>
    </section>
  );
}
