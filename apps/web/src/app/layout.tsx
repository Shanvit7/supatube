import type { Metadata } from "next"
import { Azeret_Mono, Oxanium } from "next/font/google"
import "@/app/globals.css"

// Oxanium — variable geometric, purpose-built for tech/gaming brands.
// Squared terminals, 200–800 weight range, commissioned feel without costume.
const sans = Oxanium({
  subsets: ["latin"],
  display: "swap",
  variable: "--ff-sans",
})

// Azeret Mono — quirky geometric mono with personality.
// Not IBM Plex Mono, not Space Mono. Labels, status chips, inline code.
const mono = Azeret_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  display: "swap",
  variable: "--ff-mono",
})

export const metadata: Metadata = {
  title: "Poiesis — Watch a tutorial. Get the codebase.",
  description:
    "Point it at a YouTube coding tutorial. Get a git repo on your GitHub — commit by commit, chapter by chapter. No notes. No pausing. The learning artifact is a repo.",
}

const RootLayout = ({ children }: { children: React.ReactNode }) => (
  <html lang="en" className={`${sans.variable} ${mono.variable}`}>
    <body className="bg-bg text-fg font-sans antialiased overflow-x-hidden">{children}</body>
  </html>
)

export default RootLayout
