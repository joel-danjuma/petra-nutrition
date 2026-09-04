import React from 'react';

const EMPTY_CSS = `
.petra-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:12px;padding:48px 32px;font-family:var(--font-sans)}
.petra-empty__icon{color:var(--text-muted)}
.petra-empty__icon svg{width:40px;height:40px;stroke-width:1.5}
.petra-empty__title{font-size:var(--text-title-md);font-weight:var(--weight-regular);line-height:var(--lh-title-md);color:var(--text-ink);margin:0}
.petra-empty__body{font-size:var(--text-body-md);font-weight:var(--weight-regular);line-height:var(--lh-body);color:var(--text-body);margin:0;max-width:44ch;text-wrap:pretty}
.petra-empty__action{margin-top:12px}
`;

function injectPetraCSS(id, css) {
  if (typeof document === 'undefined' || document.getElementById(id)) return;
  const s = document.createElement('style');
  s.id = id;
  s.textContent = css;
  document.head.appendChild(s);
}

/**
 * The empty state for a list or collection — an empty pantry, an unplanned day,
 * a search with no results.
 *
 * Quiet by construction: a thin outline icon in muted ink, a 400-weight title
 * and one calm sentence. Nothing is coloured or illustrated, because an empty
 * list is not an error.
 */
export function EmptyState({ icon, title, body, action, className = '', ...rest }) {
  injectPetraCSS('petra-empty-css', EMPTY_CSS);
  return (
    <div className={['petra-empty', className].filter(Boolean).join(' ')} {...rest}>
      {icon ? (
        <span className="petra-empty__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <h3 className="petra-empty__title">{title}</h3>
      {body ? <p className="petra-empty__body">{body}</p> : null}
      {action ? <div className="petra-empty__action">{action}</div> : null}
    </div>
  );
}
