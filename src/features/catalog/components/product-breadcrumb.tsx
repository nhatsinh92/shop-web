import Link from "next/link";

interface ProductBreadcrumbProps {
  /** Category ancestors from the root down, as plain text (no category pages yet). */
  categoryPath: { slug: string; name: string }[];
  productName: string;
}

/** "Trang chủ / <category path> / <product name>"; only the home item is a link. */
export function ProductBreadcrumb({ categoryPath, productName }: ProductBreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-stone-600">
      <ol className="flex flex-wrap gap-2">
        <li>
          <Link href="/" className="inline-flex min-h-touch items-center hover:underline">
            Trang chủ
          </Link>
        </li>
        {categoryPath.map((item) => (
          <li key={item.slug} className="flex items-center gap-2">
            <span aria-hidden="true">/</span>
            <span>{item.name}</span>
          </li>
        ))}
        <li className="flex items-center gap-2 text-ink">
          <span aria-hidden="true">/</span>
          <span aria-current="page">{productName}</span>
        </li>
      </ol>
    </nav>
  );
}
