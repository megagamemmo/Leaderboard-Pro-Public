import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Leaderboard Pro",
  description: "Local-first tournament operations console for TourSystem36 events.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
