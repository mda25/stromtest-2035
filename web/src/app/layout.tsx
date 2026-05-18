import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SiteFooter } from "@/components/site/footer";
import { SiteNav } from "@/components/site/nav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Editorial display serif for hero + section headlines. Variable axis
// "SOFT" / "WONK" disabled to keep it grounded and serious; this is a
// methodology project, not a magazine cover.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: {
    default: "stromtest·2035 — public stress-test of Germany's energy plans",
    template: "%s — stromtest·2035",
  },
  description:
    "Open public stress-test of Germany's energy transition plans against historical weather years. PyPSA-Eur, citation-disciplined scenarios, every assumption sourced.",
  openGraph: {
    title: "stromtest·2035",
    description:
      "Public stress-test of Germany's energy transition plans against historical weather years.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <SiteNav />
        <div className="flex flex-1 flex-col">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
