import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Secure E2EE Chat",
  description: "A highly secure, peer-to-peer, end-to-end encrypted chat for two.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
