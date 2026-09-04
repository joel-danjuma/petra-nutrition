import React from 'react';

const CHIP_CSS = `
.petra-chip{display:inline-flex;align-items:center;gap:6px;font-family:var(--font-sans);font-size:var(--text-caption);font-weight:var(--weight-medium);line-height:var(--lh-snug);letter-spacing:0.16px;box-sizing:border-box;border-radius:var(--radius-sm);padding:8px 12px;border:1px solid var(--border-hairline);background:var(--surface-canvas);color:var(--text-ink);cursor:default;-webkit-tap-highlight-color:transparent}
.petra-chip--button{cursor:pointer}
.petra-chip--selected{background:var(--color-primary);border-color:var(--color-primary);color:var(--color-on-primary)}
.petra-chip--button:active{background:var(--surface-soft)}
.petra-chip--selected:active{background:var(--color-primary-active);border-color:var(--color-primary-active)}
.petra-chip--on-dark{background:transparent;border-color:var(--border-strong);color:var(--color-on-dark)}
.petra-chip:focus-visible{outline:none;box-shadow:var(--shadow-focus-ring)}
.petra-chip:disabled{color:var(--border-strong);border-color:var(--border-strong);cursor:not-allowed}
`;

function injectPetraCSS(id, css) {
  if (typeof document === 'undefined' || document.getElementById(id)) return;
  const s = document.createElement('style');
  s.id = id;
  s.textContent = css;
  document.head.appendChild(s);
}

/**
 * A small selectable or informational tag — filter categories, dietary
 * preferences, recipe metadata.
 *
 * Deliberately NOT pill-shaped. `--radius-pill` is a pricing sub-system signal
 * in this system, so chips take `--radius-sm` (the small inline-control radius)
 * to avoid reading as a pricing control.
 */
export function Chip({
  label,
  selected = false,
  onSelect,
  onDark = false,
  disabled = false,
  className = '',
  children,
  ...rest
}) {
  injectPetraCSS('petra-chip-css', CHIP_CSS);
  const Tag = onSelect ? 'button' : 'span';
  const cls = [
    'petra-chip',
    onSelect ? 'petra-chip--button' : '',
    selected ? 'petra-chip--selected' : '',
    onDark ? 'petra-chip--on-dark' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const tagProps = onSelect
    ? { type: 'button', onClick: onSelect, disabled, 'aria-pressed': selected }
    : {};

  return (
    <Tag className={cls} {...tagProps} {...rest}>
      {label ?? children}
    </Tag>
  );
}
