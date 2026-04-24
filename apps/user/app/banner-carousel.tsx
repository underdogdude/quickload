"use client";

import dynamic from "next/dynamic";

const LazyBannerCarousel = dynamic(
  () => import("./banner-carousel-inner").then((m) => m.BannerCarousel),
  {
    ssr: false,
    loading: () => (
      <div
        className="aspect-[16/9] w-full animate-pulse rounded-lg bg-white/15"
        aria-hidden
      />
    ),
  },
);

export function BannerCarousel() {
  return <LazyBannerCarousel />;
}
