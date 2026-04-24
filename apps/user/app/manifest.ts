import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Quickload",
    short_name: "Quickload",
    description: "Quickload — parcel services on LINE",
    start_url: "/",
    display: "standalone",
    background_color: "#F1F5F9",
    theme_color: "#2726F5",
    lang: "th",
    icons: [
      {
        src: "/truck.png",
        sizes: "any",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
