import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "tinkr",
  description: "Your remix library and collaboration dashboard"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
