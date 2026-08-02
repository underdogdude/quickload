"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Autoplay } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";
import { SendLink } from "@/lib/send-access-ui";
import "swiper/css";

const PROFILE_BANNERS = [
  {
    src: "/profile-banners/pickup.png",
    href: "/pickup",
    title: "เรียกรถเข้ารับถึงบ้าน",
    subtitle: "สะดวก ไม่ต้องต่อคิว",
  },
  {
    src: "/profile-banners/send.png",
    href: "/send",
    title: "ส่งพัสดุได้ง่ายกว่า",
    subtitle: "เริ่มรายการใหม่ในไม่กี่ขั้นตอน",
  },
  {
    src: "/profile-banners/price-check.png",
    href: "/price-check",
    title: "เช็คราคาก่อนส่ง",
    subtitle: "รู้ค่าใช้จ่ายก่อนตัดสินใจ",
  },
] as const;

type ProfileBanner = (typeof PROFILE_BANNERS)[number];

function BannerContent({ banner }: { banner: ProfileBanner }) {
  return (
    <span className="relative block aspect-[1890/640] overflow-hidden rounded-lg bg-[#000967] text-white">
      {/* eslint-disable-next-line @next/next/no-img-element -- local campaign background */}
      <img
        src="/profile-banners/bg.png"
        alt=""
        width={1890}
        height={640}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
        aria-hidden
      />
      <span className="relative z-10 grid h-full grid-cols-[52%_48%]">
        <span className="flex min-w-0 flex-col justify-center px-4 py-3">
          <span className="text-lg font-semibold leading-tight sm:text-lg">
            {banner.title}
          </span>
          <span className="mt-1 text-[11px] leading-tight text-white/80 sm:text-xs">
            {banner.subtitle}
          </span>
          <span className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-medium text-cyan-200 sm:text-[11px]">
            ดูบริการ <span aria-hidden>→</span>
          </span>
        </span>
        <span className="flex min-w-0 items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- transparent local campaign artwork */}
          <img
            src={banner.src}
            alt=""
            width={1280}
            height={720}
            loading="lazy"
            decoding="async"
            className="h-[92%] w-[92%] object-contain"
            aria-hidden
          />
        </span>
      </span>
    </span>
  );
}

function BannerLink({ banner }: { banner: ProfileBanner }) {
  const className =
    "block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00B7FF] focus-visible:ring-offset-2";
  if (banner.href === "/send") {
    return (
      <SendLink href={banner.href} className={className}>
        <BannerContent banner={banner} />
      </SendLink>
    );
  }
  return (
    <Link href={banner.href} prefetch className={className}>
      <BannerContent banner={banner} />
    </Link>
  );
}

export function ProfileBannerCarousel() {
  const [ready, setReady] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    setReduceMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <div className="px-6 py-6">
        <div className="mx-auto w-full max-w-lg">
          <BannerLink banner={PROFILE_BANNERS[0]} />
        </div>
      </div>
    );
  }

  return (
    <div className="profile-banner-carousel">
      <Swiper
        modules={[Autoplay]}
        slidesPerView={1.08}
        spaceBetween={15}
        slidesOffsetBefore={24}
        slidesOffsetAfter={10}
        centeredSlides
        loop
        autoplay={
          reduceMotion ? false : { delay: 4500, disableOnInteraction: true }
        }
        className="py-6"
      >
        {PROFILE_BANNERS.map((banner) => (
          <SwiperSlide key={banner.src} className="overflow-hidden rounded-2xl">
            <BannerLink banner={banner} />
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  );
}
