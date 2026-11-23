import Link from "next/link";

export default function ProductNotFound() {
  return (
    <main className="mx-auto flex max-w-content flex-col items-start gap-4 px-6 pt-16 pb-24">
      <h1 className="text-3xl font-extrabold">Không tìm thấy sản phẩm</h1>
      <p className="text-stone-600">Sản phẩm này không tồn tại hoặc đã ngừng bán.</p>
      <Link
        href="/"
        className="inline-flex h-touch items-center rounded-lg bg-brand px-5 font-bold text-white focus-visible:outline-2 focus-visible:outline-ring"
      >
        Về trang chủ
      </Link>
    </main>
  );
}
