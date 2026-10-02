import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Blackfart — Fartifyty",
  description: "The world's serious chart for life's least dignified moments. Log a story or real recording, vote, and explore the rough world map.",
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
