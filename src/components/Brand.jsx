export function BrandMark({ size = 34 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <rect width="64" height="64" rx="17" fill="#24322b" />
      <path d="M18 14.5h22.5c3.59 0 6.5 2.91 6.5 6.5v28.5H18z" fill="#fbf7ee" />
      <path d="M39 14.5v9h8" fill="#e8dfcc" />
      <circle cx="25.5" cy="27" r="2.2" fill="#cf5735" />
      <circle cx="34" cy="34.5" r="2.2" fill="#cf5735" />
      <path d="M24 27.3h7M32.5 34.8h7.5" stroke="#cf5735" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M24 37.5h16M24 42h12.5" stroke="#24322b" strokeWidth="2.6" strokeLinecap="round" opacity=".86" />
    </svg>
  );
}

export function Brand({ compact = false }) {
  return (
    <span className={`brand${compact ? ' brand-compact' : ''}`}>
      <BrandMark size={compact ? 28 : 34} />
      <span className="brand-word">
        printario<span className="brand-dot">.</span>
      </span>
    </span>
  );
}
