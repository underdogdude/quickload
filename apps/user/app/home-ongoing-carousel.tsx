"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { A11y, Keyboard } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";
import type { OngoingActivity } from "@/lib/home-ongoing-activity";
import "swiper/css";

function ActivityIcon({ kind }: { kind: OngoingActivity["kind"] }) {
  if (kind === "pickup") {
    return (
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-indigo-50 p-1">
        <Image
          src="/truck-pickup-active.png"
          alt=""
          width={56}
          height={56}
          className="h-full w-full object-contain"
          aria-hidden="true"
        />
      </span>
    );
  }

  return (
    <span
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600"
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7">
        <path
          d="m4.5 7.5 7.5 4 7.5-4M12 11.5V20M5 7.2 12 3.5l7 3.7v9.6l-7 3.7-7-3.7V7.2Z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function ActivityCard({ activity }: { activity: OngoingActivity }) {
  return (
    <Link
      href={activity.href}
      className="group block h-full overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-inset ring-slate-200 transition duration-200 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0802b8] active:scale-[0.99]"
      aria-label={`${activity.title} ${activity.detail} ${activity.supportingText}`}
    >
      <span className="flex items-center gap-3 p-4">
        <ActivityIcon kind={activity.kind} />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold leading-5 text-slate-950">
            {activity.title}
          </span>
          <span className="mt-1 block truncate text-sm text-slate-700 tabular-nums">
            {activity.detail}
          </span>
          <span className="mt-0.5 block truncate text-xs text-slate-500 tabular-nums">
            {activity.supportingText}
          </span>
        </span>
        <span
          className="flex h-11 w-7 shrink-0 items-center justify-end text-xl text-slate-400 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none"
          aria-hidden="true"
        >
          ›
        </span>
      </span>
    </Link>
  );
}

export function HomeOngoingCarousel({
  activities,
}: {
  activities: OngoingActivity[];
}) {
  const [swiperReady, setSwiperReady] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setReducedMotion(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
    setSwiperReady(true);
  }, []);

  if (activities.length === 1) {
    return <ActivityCard activity={activities[0]} />;
  }

  if (!swiperReady) {
    return (
      <div className="-mx-6 overflow-hidden" data-testid="home-ongoing-rail">
        <div className="ml-6 w-[84.75%]">
          <ActivityCard activity={activities[0]} />
        </div>
      </div>
    );
  }

  return (
    <div className="-mx-6 overflow-hidden" data-testid="home-ongoing-rail">
      <Swiper
        modules={[A11y, Keyboard]}
        slidesPerView={1.18}
        spaceBetween={12}
        slidesOffsetBefore={24}
        slidesOffsetAfter={24}
        speed={reducedMotion ? 0 : 220}
        keyboard={{ enabled: true, onlyInViewport: true }}
        a11y={{
          containerMessage: "รายการที่กำลังดำเนินการ",
          slideLabelMessage: "{{index}} จาก {{slidesLength}}",
        }}
        breakpoints={{
          480: { slidesPerView: 1.3 },
          640: { slidesPerView: 1.5 },
        }}
        className="!overflow-visible"
      >
        {activities.map((activity) => (
          <SwiperSlide key={activity.id} className="!h-auto">
            <ActivityCard activity={activity} />
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  );
}
