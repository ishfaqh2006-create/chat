import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "szchat - Secure E2EE Messaging",
  description: "szchat - Fast, End-to-End Encrypted (AES-GCM 256-bit) Web Messaging App",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

/**
 * interactive-widget=resizes-content is the critical setting:
 * it makes the browser resize the viewport when the keyboard appears,
 * so the chat input stays above the keyboard on mobile.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body style={{ height: "100dvh", overflow: "hidden" }}>
        {children}
      </body>
    </html>
  );
}
