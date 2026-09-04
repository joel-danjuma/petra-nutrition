import React from 'react';

const PROGRESS_CSS = `
.petra-progress{display:flex;align-items:center;gap:12px;font-family:var(--font-sans)}
.petra-progress__label{width:64px;flex:none;font-size:var(--text-body-md);font-weight:var(--weight-regular);line-height:var(--lh-body);color:var(--text-ink)}
.petra-progress__track{flex:1;height:6px;border-radius:var(--radius-xs);background:var(--surface-strong);overflow:hidden}
.petra-progress__fill{height:100%;background:var(--color-primary)}
.petra-progress__readout{width:72px;flex:none;text-align:right;font-size:var(--text-caption);font-weight:var(--weight-medium);line-height:var(--lh-title);letter-spacing:0.16px;color:var(--text-muted)}
`;

function injectPetraCSS(id, css) {
  if (typeof document === 'undefined' || document.getElementById(id)) return;
  const s = document.createElement('style');
  s.id = id;
  s.textContent = css;
  document.head.appendChild(s);
}

/**
 * A labelled progress bar — daily nutrition targets, a shopping-list pick-up
 * count, cook-mode step progress.
 *
 * The fill is ink rather than green: progress is not a success state, and the
 * signature colours are reserved for full surfaces. The track is the strong
 * neutral surface.
 */
export function ProgressRow({ label, value = 0, readout, className = '', ...rest }) {
  injectPetraCSS('petra-progress-css', PROGRESS_CSS);
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);

  return (
    <div className={['petra-progress', className].filter(Boolean).join(' ')} {...rest}>
      <span className="petra-progress__label">{label}</span>
      <div
        className="petra-progress__track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={label}
      >
        <div className="petra-progress__fill" style={{ width: pct + '%' }} />
      </div>
      {readout ? <span className="petra-progress__readout">{readout}</span> : null}
    </div>
  );
}
