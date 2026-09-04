import React from 'react';

const COOKSTEP_CSS = `
.petra-cookstep{box-sizing:border-box;background:var(--surface-dark);color:var(--color-on-dark);font-family:var(--font-sans);padding:24px;border-radius:var(--radius-lg);display:flex;flex-direction:column;gap:24px}
.petra-cookstep__eyebrow{font-size:var(--text-caption);font-weight:var(--weight-medium);letter-spacing:1.2px;text-transform:uppercase;color:rgba(255,255,255,.62)}
.petra-cookstep__segments{display:flex;gap:4px}
.petra-cookstep__segment{flex:1;height:4px;border-radius:var(--radius-xs);background:rgba(255,255,255,.14)}
.petra-cookstep__segment--done{background:var(--color-on-dark)}
.petra-cookstep__instruction{font-size:var(--text-display-md);font-weight:var(--weight-regular);line-height:var(--lh-display-lg);color:var(--color-on-dark);text-wrap:pretty}
.petra-cookstep__timer{display:flex;align-items:center;gap:16px;padding:16px;border-radius:var(--radius-md);border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06)}
.petra-cookstep__time{flex:1;font-size:var(--text-display-md);font-weight:var(--weight-regular);line-height:var(--lh-display-lg);font-variant-numeric:tabular-nums;color:var(--color-on-dark)}
.petra-cookstep__btn{border:0;cursor:pointer;font-family:var(--font-sans);font-size:var(--text-button);font-weight:var(--weight-medium);padding:12px 24px;border-radius:var(--radius-lg);background:var(--surface-canvas);color:var(--text-ink)}
.petra-cookstep__btn:active{background:var(--surface-soft)}
.petra-cookstep__btn:focus-visible{outline:none;box-shadow:var(--shadow-focus-ring)}
`;

function injectPetraCSS(id, css) {
  if (typeof document === 'undefined' || document.getElementById(id)) return;
  const s = document.createElement('style');
  s.id = id;
  s.textContent = css;
  document.head.appendChild(s);
}

/**
 * A hands-free cooking step on the system's dark surface, with step progress
 * and an optional timer.
 *
 * This is a documented full-bleed dark *surface*, not a dark theme. The on-dark
 * rules therefore apply: type stays white and the emphasised control is a solid
 * white button — the system never inverts a button or makes it translucent over
 * a dark surface.
 */
export function CookStep({
  stepNumber = 1,
  totalSteps = 1,
  instruction,
  timeLabel,
  timerRunning = false,
  onToggleTimer,
  className = '',
  children,
  ...rest
}) {
  injectPetraCSS('petra-cookstep-css', COOKSTEP_CSS);

  return (
    <section className={['petra-cookstep', className].filter(Boolean).join(' ')} {...rest}>
      <div>
        <div className="petra-cookstep__eyebrow">
          STEP {stepNumber} OF {totalSteps}
        </div>
        <div className="petra-cookstep__segments" style={{ marginTop: 12 }}>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={[
                'petra-cookstep__segment',
                i < stepNumber ? 'petra-cookstep__segment--done' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            />
          ))}
        </div>
      </div>

      <p className="petra-cookstep__instruction" style={{ margin: 0 }}>
        {instruction}
      </p>

      {timeLabel ? (
        <div className="petra-cookstep__timer">
          <div>
            <div className="petra-cookstep__eyebrow">TIMER</div>
            <div className="petra-cookstep__time">{timeLabel}</div>
          </div>
          <button type="button" className="petra-cookstep__btn" onClick={onToggleTimer}>
            {timerRunning ? 'Pause' : 'Start'}
          </button>
        </div>
      ) : null}

      {children}
    </section>
  );
}
