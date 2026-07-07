import { useId } from "react";

/**
 * The product mark: three range bars (low / base / high) with the base
 * highlighted in the accent — the "ranges, not hero numbers" idea as a glyph.
 * Works in server and client components; gradient ids are namespaced with
 * useId so multiple marks can share a page.
 */
export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b4a80" />
          <stop offset="1" stopColor="#1a3054" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="8.5" fill={`url(#${id}-g)`} />
      <rect
        x="1.5"
        y="1.5"
        width="29"
        height="29"
        rx="8"
        fill="none"
        stroke="rgba(255,255,255,0.16)"
      />
      <rect x="8" y="17" width="3.6" height="7" rx="1.8" fill="rgba(255,255,255,0.82)" />
      <rect x="14.2" y="9" width="3.6" height="15" rx="1.8" fill="#8ab4f8" />
      <rect x="20.4" y="13" width="3.6" height="11" rx="1.8" fill="rgba(255,255,255,0.82)" />
    </svg>
  );
}
