import type { Metadata } from "next";
import {
  Amiri,
  Bricolage_Grotesque,
  EB_Garamond,
  Geist,
  IBM_Plex_Sans_Arabic,
  IM_Fell_English,
} from "next/font/google";
import "./globals.css";

// Modern theme
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"] });
const plexArabic = IBM_Plex_Sans_Arabic({ variable: "--font-arabic", subsets: ["arabic"], weight: ["400", "500", "600"] });

// Antique theme
const garamond = EB_Garamond({ variable: "--font-garamond", subsets: ["latin"] });
const fell = IM_Fell_English({ variable: "--font-fell", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });
const amiri = Amiri({ variable: "--font-amiri", subsets: ["arabic"], weight: ["400", "700"] });

export const metadata: Metadata = {
  title: "Encore",
  description: "Reminiscence sessions for people living with dementia, grounded in Qloo taste data.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const fonts = [geistSans, bricolage, plexArabic, garamond, fell, amiri].map((f) => f.variable).join(" ");
  return (
    <html lang="en" data-theme="modern" className={`${fonts} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
