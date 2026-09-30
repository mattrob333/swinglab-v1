import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SwingLab",
    short_name: "SwingLab",
    description: "Record a swing and compare it with a pro, frame by frame",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#08090a",
    theme_color: "#08090a",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
