import type { Metadata } from "next"
import { Geist, Syne_Mono } from "next/font/google"
import "@/app/globals.css"

// Geist proportional — headings AND body. Clean variable font, optical
// at any size, pairs with mono naturally (same design DNA).
const geist = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--ff-sans",
})

// Syne Mono — labels, badges, trust row. Avant-garde irregular letterforms — proprietary feel.
const syneMono = Syne_Mono({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--ff-mono",
})

export const metadata: Metadata = {
  title: "SupaTube — Find any video you've watched",
  description:
    "A Chrome extension that quietly remembers every video you actually watched on YouTube, then lets you search it in plain English. Free, no account, nothing leaves your computer.",
}

const RootLayout = ({ children }: { children: React.ReactNode }) => (
  <html lang="en" className={`${geist.variable} ${syneMono.variable}`}>
    <body className="bg-bg text-fg font-sans antialiased overflow-x-hidden">{children}</body>
  </html>
)

export default RootLayout
