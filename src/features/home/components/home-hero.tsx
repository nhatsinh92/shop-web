import Link from "next/link";

/** 12.12 campaign banners from artboard Main (STATIC). Copy is static until a CMS exists. */
export function HomeHero() {
  return (
    <section aria-label="Sự kiện 12.12" className="flex flex-wrap items-stretch gap-6">
      <div className="flex min-h-80 flex-[2_1_560px] flex-col justify-between gap-6 rounded-2xl bg-brand p-10 text-white">
        <div className="flex flex-col gap-3">
          <span className="text-sm font-semibold tracking-[0.08em] uppercase">
            Siêu sale ngày đôi
          </span>
          <h1 className="text-5xl leading-[0.95] font-extrabold tracking-[-0.03em] md:text-7xl">
            12.12
            <br />
            Giảm đến 50%
          </h1>
          <p className="max-w-[460px] text-lg">
            Voucher 120K cho đơn đầu, flash sale mỗi 2 giờ, freeship toàn quốc.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="#flash"
            className="inline-flex min-h-touch items-center rounded-lg bg-white px-6 py-3.5 font-bold text-brand-deep no-underline hover:text-brand-deep"
          >
            Săn deal ngay
          </Link>
          <Link
            href="/vouchers"
            className="inline-flex min-h-touch items-center rounded-lg border-[1.5px] border-white px-6 py-3.5 font-semibold text-white no-underline hover:text-white"
          >
            Lấy voucher
          </Link>
        </div>
      </div>

      <div className="flex flex-[1_1_300px] flex-col gap-6">
        <div className="flex min-h-[148px] flex-1 flex-col justify-between rounded-2xl bg-info p-7 text-white">
          <span className="text-sm font-semibold">Điện tử – Công nghệ</span>
          <span className="text-[32px] leading-[1.05] font-extrabold">
            Trả góp 0%
            <br />
            đến 12 tháng
          </span>
        </div>
        <div className="flex min-h-[148px] flex-1 flex-col justify-between rounded-2xl bg-stone-100 p-7">
          <span className="text-sm font-semibold text-stone-600">Thời trang</span>
          <span className="text-[32px] leading-[1.05] font-extrabold">
            Mua 2
            <br />
            giảm thêm 15%
          </span>
        </div>
      </div>
    </section>
  );
}
