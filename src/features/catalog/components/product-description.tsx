/** "Mô tả sản phẩm": the description rendered as plain text. */
export function ProductDescription({ description }: { description: string }) {
  return (
    <section aria-labelledby="desc-h" className="flex max-w-3xl flex-col gap-4">
      <h2 id="desc-h" className="text-2xl font-extrabold">
        Mô tả sản phẩm
      </h2>
      <p className="text-base leading-relaxed whitespace-pre-line text-stone-700">{description}</p>
    </section>
  );
}
