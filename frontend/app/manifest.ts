import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Corporate Credit AI",
    short_name: "Credit AI",
    description:
      "AI-powered credit appraisal — upload financials and generate CAM reports.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#0A1628",
    theme_color: "#0A1628",
    categories: ["finance", "business", "productivity"],
    icons: [
      {
        src: "/icons/app-icon.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/app-icon.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
