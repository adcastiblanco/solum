import type { Metadata, Viewport } from "next";

export const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://solum.auralabs.life";
export const siteName = "Solum Health";
export const siteTitle = "Solum Health — Document AI for clinical workflows";
export const siteDescription =
  "Extract, ground, and review clinical documents with bounding-box traceability. Doc AI + GPT-4o + Claude ensemble for trustworthy medical data extraction.";
export const brandColor = "#1E3A5F";

export const siteMetadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteTitle,
    template: "%s — Solum Health",
  },
  description: siteDescription,
  applicationName: siteName,
  keywords: [
    "clinical document AI",
    "medical document extraction",
    "document AI",
    "healthcare",
    "PDF extraction",
    "bounding box grounding",
    "Solum Health",
  ],
  authors: [{ name: siteName }],
  creator: siteName,
  publisher: siteName,
  formatDetection: { email: false, address: false, telephone: false },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName,
    title: siteTitle,
    description: siteDescription,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
  },
  icons: {
    icon: [{ url: "/branding/icon.svg", type: "image/svg+xml" }],
    shortcut: [{ url: "/branding/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-icon", sizes: "180x180", type: "image/png" }],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

export const siteViewport: Viewport = {
  themeColor: brandColor,
  colorScheme: "light",
};
