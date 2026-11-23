"use client";

import Image from "next/image";
import { useState } from "react";

import { cn } from "@/lib/utils";

interface ProductGalleryProps {
  images: { url: string; alt: string }[];
  /** Name of the selected colour (initially the first variant's); used in the alt text. */
  colorName: string;
}

/** Main image plus thumbnails. The contract has no per-variant images, so all variants share them. */
export function ProductGallery({ images, colorName }: ProductGalleryProps) {
  const [selected, setSelected] = useState(0);
  const current = images[selected] ?? images[0];
  const alt = `Ảnh sản phẩm – ${colorName}`;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-stone-100">
        {current && (
          <Image
            src={current.url}
            alt={alt}
            fill
            priority
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-cover"
          />
        )}
      </div>
      {images.length > 1 && (
        <ul className="grid grid-cols-5 gap-3">
          {images.map((image, index) => (
            <li key={image.url}>
              <button
                type="button"
                aria-label={`Ảnh ${index + 1}`}
                aria-pressed={index === selected}
                onClick={() => setSelected(index)}
                className={cn(
                  "relative block aspect-square w-full overflow-hidden rounded-lg bg-stone-100 focus-visible:outline-2 focus-visible:outline-ring",
                  index === selected ? "border-2 border-ink" : "border border-border",
                )}
              >
                <Image src={image.url} alt="" fill sizes="10vw" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
