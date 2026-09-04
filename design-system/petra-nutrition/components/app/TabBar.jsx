import React from 'react';

const TABBAR_CSS = `
.petra-tabbar{display:flex;align-items:stretch;justify-content:space-around;box-sizing:border-box;background:var(--surface-canvas);border-top:1px solid var(--border-hairline);padding:8px 4px}
.petra-tabbar__item{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:4px 0;border:0;background:transparent;cursor:pointer;font-family:var(--font-sans);font-size:var(--text-legal);font-weight:var(--weight-medium);line-height:1;color:var(--text-muted);-webkit-tap-highlight-color:transparent}
.petra-tabbar__item--active{color:var(--text-ink)}
.petra-tabbar__item:focus-visible{outline:none;box-shadow:var(--shadow-focus-ring)}
.petra-tabbar__icon{display:inline-flex;align-items:center;justify-content:center}
.petra-tabbar__icon svg{width:22px;height:22px;stroke-width:1.85}
`;

function injectPetraCSS(id, css) {
  if (typeof document === 'undefined' || document.getElementById(id)) return;
  const s = document.createElement('style');
  s.id = id;
  s.textContent = css;
  document.head.appendChild(s);
}

/**
 * The app's bottom tab bar.
 *
 * The active tint is ink, not a brand accent — this system's primary is
 * near-black and colour is never used as a small highlight. The bar sits on the
 * white canvas above a single hairline, with no blur, elevation or fill.
 */
export function TabBar({ items = [], activeId, onSelect, className = '', ...rest }) {
  injectPetraCSS('petra-tabbar-css', TABBAR_CSS);
  return (
    <nav className={['petra-tabbar', className].filter(Boolean).join(' ')} {...rest}>
      {items.map(item => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            className={[
              'petra-tabbar__item',
              active ? 'petra-tabbar__item--active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-current={active ? 'page' : undefined}
            onClick={() => onSelect && onSelect(item.id)}
          >
            <span className="petra-tabbar__icon" aria-hidden="true">
              {item.icon}
            </span>
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
