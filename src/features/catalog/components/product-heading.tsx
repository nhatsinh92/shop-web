interface ProductHeadingProps {
  brand: string;
  name: string;
}

/** Brand line and product name. No rating, review count or sold count (owner decision 2). */
export function ProductHeading({ brand, name }: ProductHeadingProps) {
  return (
    <div className="flex flex-col gap-2.5">
      <span className="text-sm font-semibold text-info">{brand} · Chính hãng</span>
      <h1 className="text-3xl leading-tight font-extrabold tracking-[-0.02em] lg:text-4xl">
        {name}
      </h1>
    </div>
  );
}
