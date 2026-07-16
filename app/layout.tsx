import { Toaster } from "@/components/ui/sonner"
import { Providers } from "@/components/providers";
import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Lora } from "next/font/google";
import { getBaseUrl } from "@/lib/base-url";
import { cn } from "@/lib/utils";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

// Lora is coze.care's display serif — the /cms "studio" pages use it so the
// editor speaks the same visual language as the public site.
const lora = Lora({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-lora",
});
const appUrl = getBaseUrl();
// ?v= busts link-preview caches (chat apps cache OG images by URL) — bump it
// whenever the card art changes.
const socialImage = "/images/social-card.png?v=2";
const description = "Content editor for coze.care.";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    template: "%s | Coze CMS",
    default: "Coze CMS",
  },
  description,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: appUrl,
    siteName: "Coze CMS",
    title: "Coze CMS",
    description,
    images: [
      {
        url: socialImage,
        width: 1200,
        height: 630,
        alt: "Coze CMS social card",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Coze CMS",
    description,
    images: [socialImage],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {  
	return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          "min-h-screen bg-background font-sans antialiased",
          inter.variable,
          jetbrainsMono.variable,
          lora.variable,
        )}
      >
        <Providers user={null}>
          {children}
        </Providers>
        <Toaster/>
      </body>
    </html>
  );
}
