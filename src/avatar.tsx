import type { CSSProperties } from 'react';

const colors = [
  ['#e8e0fb', '#6543a5'],
  ['#d9eee8', '#227666'],
  ['#ffe4d5', '#a94e24'],
  ['#dce8ff', '#2759b0'],
  ['#f7dfeb', '#a03f73'],
  ['#f4e8cc', '#88671d'],
];
export function Avatar({
  name,
  identity,
  className = '',
}: {
  name: string;
  identity?: string;
  className?: string;
}) {
  const seed = identity ?? name;
  const hash = Array.from(seed).reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 0);
  const [background, color] = colors[hash % colors.length];
  const parts = name.trim().split(/\s+/);
  const initials =
    name === 'Unknown sender'
      ? '?'
      : `${parts[0]?.[0] ?? ''}${parts.length > 1 ? parts.at(-1)?.[0] : ''}`.toUpperCase();
  return (
    <span
      className={`person-avatar ${className}`}
      style={{ '--avatar-bg': background, '--avatar-ink': color } as CSSProperties}
      title={name}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}
