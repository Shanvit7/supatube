/**
 * Poiesis logo — horizontal lockup (mark + wordmark).
 * Inline SVG so Oxanium from the page context renders correctly.
 * Mark: 40×40 square, rx=8, primary-red fill, white P.
 * Wordmark: POIESIS in Oxanium 600, near-white.
 */
export const Logo = ({ className = "h-8 w-auto" }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 158 44"
    fill="none"
    aria-label="Poiesis"
    className={className}
  >
    <title>Poiesis</title>
    {/* ── Mark ────────────────────────────────────────────────── */}
    {/* Neo-brutal lift: hard offset shadow, no blur */}
    <rect x="4" y="4" width="40" height="40" rx="8" fill="oklch(0.06 0 0)" />
    {/* Main face */}
    <rect width="40" height="40" rx="8" fill="oklch(0.55 0.19 9)" />
    <text
      x="20"
      y="30"
      textAnchor="middle"
      fontFamily="Oxanium, sans-serif"
      fontWeight="800"
      fontSize="26"
      fill="oklch(0.98 0 0)"
    >
      P
    </text>

    {/* ── Wordmark ─────────────────────────────────────────────── */}
    <text
      x="54"
      y="28"
      fontFamily="Oxanium, sans-serif"
      fontWeight="600"
      fontSize="19"
      fill="oklch(0.95 0 0)"
      style={{ letterSpacing: "-0.01em" }}
    >
      POIESIS
    </text>
  </svg>
)
