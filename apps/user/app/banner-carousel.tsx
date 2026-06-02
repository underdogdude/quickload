"use client";

import { useEffect, useState } from "react";
import { Autoplay, Pagination } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";
import "swiper/css/pagination";

const banners = [
  { src: "/banner/banner.png", alt: "ส่งพัสดุวันนี้ รับเครดิตค่าส่งพิเศษ" },
  { src: "/banner/no-queue.png", alt: "ส่งพัสดุวันนี้ รับเครดิตค่าส่งพิเศษ" },
  { src: "/banner/cheaper.png", alt: "ส่งพัสดุวันนี้ รับเครดิตค่าส่งพิเศษ" },
] as const;

function StaticBannerSlide({ banner }: { banner: (typeof banners)[number] }) {
  return (
    <div className="overflow-hidden rounded-lg">
      {/* eslint-disable-next-line @next/next/no-img-element -- static public asset; avoids optimizer issues on tunnel URLs */}
      <img
        src={banner.src}
        alt={banner.alt}
        width={640}
        height={360}
        loading="eager"
        decoding="async"
        className="aspect-[16/9] w-full rounded-lg object-cover"
      />
    </div>
  );
}

export function BannerCarousel() {
  const [swiperReady, setSwiperReady] = useState(false);

  useEffect(() => {
    setSwiperReady(true);
  }, []);

  if (!swiperReady) {
    return <StaticBannerSlide banner={banners[0]} />;
  }

  return (
    <Swiper
      modules={[Autoplay, Pagination]}
      slidesPerView={1}
      loop={banners.length > 1}
      autoplay={{ delay: 3500, disableOnInteraction: false }}
      pagination={{ clickable: true }}
      className="rounded-lg"
    >
      {banners.map((banner, index) => (
        <SwiperSlide key={`${banner.src}-${index}`}>
          <StaticBannerSlide banner={banner} />
        </SwiperSlide>
      ))}
    </Swiper>
  );
}
