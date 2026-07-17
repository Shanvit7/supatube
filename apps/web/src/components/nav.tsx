import { Logo } from "@/components/logo"

export const Nav = () => (
  <nav className="fixed inset-x-0 top-0 z-50 flex h-14 items-center px-8">
    <a href="/" aria-label="Poiesis home">
      <Logo className="h-7 w-auto" />
    </a>
  </nav>
)
