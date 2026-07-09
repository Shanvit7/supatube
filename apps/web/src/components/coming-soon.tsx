"use client"

import { GithubIcon } from "@/components/brand-icons"
import { GITHUB_URL } from "@/lib/constants"
import { motion } from "framer-motion"

// Staggered fade-up for text elements
const textItem = {
  hidden: { opacity: 0, y: 14 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      type: "tween" as const,
      duration: 0.65,
      delay: i * 0.09,
      ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
    },
  }),
}

// Separate entrance for the mark — scale in from slightly small
const markVariant = {
  hidden: { opacity: 0, scale: 0.82 },
  show: {
    opacity: 1,
    scale: 1,
    transition: {
      type: "spring" as const,
      stiffness: 260,
      damping: 22,
      delay: 0.04,
    },
  },
}

export const ComingSoon = () => (
  <main className="flex min-h-svh flex-col items-center justify-center px-6">
    <div className="flex w-full max-w-[34rem] flex-col items-center text-center">
      {/* Mark — the visual anchor, not a nav element */}
      <motion.div variants={markVariant} initial="hidden" animate="show">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 40 40"
          fill="none"
          aria-hidden="true"
          className="h-[4.5rem] w-[4.5rem]"
        >
          <rect width="40" height="40" rx="9" style={{ fill: "var(--color-primary)" }} />
          <rect x="9" y="9" width="22" height="5" rx="1.5" fill="white" />
          <rect x="9" y="17.5" width="22" height="5" rx="1.5" fill="white" opacity="0.55" />
          <rect x="9" y="26" width="22" height="5" rx="1.5" fill="white" opacity="0.25" />
        </svg>
      </motion.div>

      {/* Headline */}
      <motion.h1
        custom={0}
        variants={textItem}
        initial="hidden"
        animate="show"
        className="mt-8 text-[clamp(2.375rem,5.5vw,3.5rem)] font-bold leading-[1.08] tracking-[-0.03em] text-fg text-balance"
      >
        Turn YouTube into a knowledge base.
      </motion.h1>

      {/* Sub */}
      <motion.p
        custom={1}
        variants={textItem}
        initial="hidden"
        animate="show"
        className="mt-5 text-[1rem] leading-[1.72] text-fg-2 text-pretty"
      >
        Saves what you actually watched. Surfaces what to explore next based on your real taste.
        Search everything in plain English. Fully local — no cloud, no account.
      </motion.p>

      {/* Trust */}
      <motion.div
        custom={2}
        variants={textItem}
        initial="hidden"
        animate="show"
        className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2"
      >
        <span className="font-mono text-[0.6875rem] text-fg-3">
          Free forever · Fully local · Open source
        </span>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 font-mono text-[0.6875rem] text-fg-3 no-underline transition-colors hover:text-fg-2"
        >
          <GithubIcon size={12} />
          Follow on GitHub
        </a>
      </motion.div>
    </div>
  </main>
)
