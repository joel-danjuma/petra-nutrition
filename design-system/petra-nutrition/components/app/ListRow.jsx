import React from 'react';

const LISTROW_CSS = `
.petra-listrow{display:flex;align-items:center;gap:12px;width:100%;box-sizing:border-box;padding:12px 16px;font-family:var(--font-sans);text-align:left;background:transparent;border:0;border-bottom:1px solid var(--border-hairline);color:var(--text-ink)}
.petra-listrow--last{border-bottom:0}
.petra-listrow--button{cursor:pointer;-webkit-tap-highlight-color:transparent}
.petra-listrow--button:active{background:var(--surface-soft)}
.petra-listrow--muted{opacity:.55}
.petra-listrow--muted .petra-listrow__title{text-decoration:line-through}
.petra-listrow:focus-visible{outline:none;box-shadow:var(--shadow-focus-ring)}
.petra-listrow__body{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
.petra-listrow__title{font-size:var(--text-label-md);font-weight:var(--weight-medium);line-height:var(--lh-snug);color:var(--text-ink)}
.petra-listrow__detail{font-size:var(--text-caption);font-weight:var(--weight-medium);line-height:var(--lh-title);letter-spacing:0.16px;color:var(--text-muted)}
.petra-listrow__value{flex:none;font-size:var(--text-body-md);font-weight:var(--weight-regular);line-height:var(--lh-body);color:var(--text-body)}
.petra-listrow__slot{flex:none;display:inline-flex;align-items:center;justify-content:center}
`;

function injectPetraCSS(id, css) {
  if (typeof document === 'undefined' || document.getElementById(id)) return;
  const s = document.createElement('style');
  s.id = id;
  s.textContent = css;
  document.head.appendChild(s);
}

/**
 * One row inside a grouped list — ingredients, shopping items, pantry entries,
 * settings.
 *
 * Rows are separated by the system's single hairline; there are no decorative
 * or coloured dividers, and the group itself is a flat content card.
 */
export function ListRow({
  title,
  value,
  detail,
  leading,
  trailing,
  onSelect,
  last = false,
  muted = false,
  className = '',
  ...rest
}) {
  injectPetraCSS('petra-listrow-css', LISTROW_CSS);
  const Tag = onSelect ? 'button' : 'div';
  const cls = [
    'petra-listrow',
    last ? 'petra-listrow--last' : '',
    onSelect ? 'petra-listrow--button' : '',
    muted ? 'petra-listrow--muted' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const tagProps = onSelect ? { type: 'button', onClick: onSelect } : {};

  return (
    <Tag className={cls} {...tagProps} {...rest}>
      {leading ? (
        <span className="petra-listrow__slot" aria-hidden="true">
          {leading}
        </span>
      ) : null}
      <span className="petra-listrow__body">
        <span className="petra-listrow__title">{title}</span>
        {detail ? <span className="petra-listrow__detail">{detail}</span> : null}
      </span>
      {value ? <span className="petra-listrow__value">{value}</span> : null}
      {trailing ? <span className="petra-listrow__slot">{trailing}</span> : null}
    </Tag>
  );
}
