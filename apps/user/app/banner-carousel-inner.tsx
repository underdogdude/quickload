"use client";

import { Autoplay, Pagination } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";
import "swiper/css/pagination";

const banners = [
  { src: "/banner/banner1.png", alt: "ส่งพัสดุวันนี้ รับเครดิตค่าส่งพิเศษ" },
  { src: "/banner/banner1.png", alt: "ส่งพัสดุวันนี้ รับเครดิตค่าส่งพิเศษ" },
  { src: "/banner/banner1.png", alt: "ส่งพัสดุวันนี้ รับเครดิตค่าส่งพิเศษ" },
];

export function BannerCarousel() {
  return (
    <Swiper
      modules={[Autoplay, Pagination]}
      slidesPerView={1}
      loop
      autoplay={{ delay: 3500, disableOnInteraction: false }}
      pagination={{ clickable: true }}
      className="rounded-lg"
    >
      {banners.map((banner, index) => (
        <SwiperSlide key={`${banner.src}-${index}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- Use static public image without Next optimizer for ngrok stability */}
          <img
            src={banner.src}
            alt={banner.alt}
            className="aspect-[16/9] w-full rounded-lg object-cover"
          />
        </SwiperSlide>
      ))}
    </Swiper>
  );
}
