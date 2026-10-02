import type { Metadata } from "next";
import "./globals.css";
import "leaflet/dist/leaflet.css";
import "./site-improvements.css";

export const metadata: Metadata = {
  title: "Blackfart — Fartifyty",
  description: "The world's serious chart for life's least dignified moments. Log a short story or clip, vote, and explore approximate map locations.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
