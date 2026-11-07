import { useId } from 'react'

export function GrillMark({ size = 38 }: { size?: number }) {
  const gradientId = `grill-mark-${useId().replaceAll(':', '')}`

  return (
    <svg
      className="grill-mark"
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      role="img"
      aria-label="The Grill Phrenz J logo"
    >
      <defs>
        <linearGradient id={gradientId} x1="5" y1="4" x2="35" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F18A35" />
          <stop offset="1" stopColor="#D72F3B" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="38" height="38" rx="13" fill={`url(#${gradientId})`} />
      <path d="M20 7.5c1.4 4.1-1.6 5.9.4 8.3 1.1 1.3 2.8 1.4 3.8 3.3 2.2 4.1-.6 8.4-4.8 8.4s-7-3-6.2-6.8c.4-2 2-3.5 3.4-5.3.8 2.4 1.7 2.8 2.7 2.3 1.8-1 .3-4.3.7-10.2Z" fill="white" />
      <path d="M10 29.5h20M12.5 32.5h15" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
