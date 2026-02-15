import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Automations",
  description: "Personal AI automation dashboard",
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
