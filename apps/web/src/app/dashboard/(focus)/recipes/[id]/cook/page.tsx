'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type TouchEvent,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  Hand,
  Pause,
  Play,
  Timer,
  X,
} from 'lucide-react';
import {
  clampStep,
  formatTimer,
  ingredientsForStep,
  splitStep,
  useApi,
} from '@petra/shared';
import toast from 'react-hot-toast';

import { EmptyState, Eyebrow, PantryArt } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { useApiQuery } from '@/hooks/use-api-query';
import { useWaveGesture } from '@/hooks/use-wave-gesture';
import { cn } from '@/lib/utils';
import { amountOf, type RecipeWire } from '@/lib/wire';

/**
 * Cook mode: one step, large enough to read from the hob.
 *
 * The whole screen is the control — the left half goes back, the right half
 * goes on — because hands are wet. Keyboard (← → space), a swipe, or an
 * opt-in wave do the same. The screen stays awake while it is open.
 */
export default function CookModePage({ params }: { params: { id: string } }) {
  const api = useApi();
  const router = useRouter();
  const recipe = useApiQuery(
    a => a.client.get<RecipeWire>(`/recipes/${params.id}`),
    [params.id]
  );

  const steps = useMemo(
    () =>
      [...(recipe.data?.instructions ?? [])].sort((a, b) => a.step - b.step),
    [recipe.data]
  );
  const [index, setIndex] = useState(0);
  const [flash, setFlash] = useState<'left' | 'right' | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const step = steps[index];
  const isLast = index === steps.length - 1;

  // Reset the timer to each step's own duration.
  useEffect(() => {
    setSeconds(step?.duration ? step.duration * 60 : 0);
    setRunning(false);
  }, [step]);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setSeconds(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [running]);

  // Side effects belong here, not in the updater above (which React may run twice).
  useEffect(() => {
    if (running && seconds === 0) {
      setRunning(false);
      toast.success('Time is up.');
    }
  }, [running, seconds]);

  const finish = useCallback(async () => {
    const r = recipe.data;
    if (!r || finishing) return;
    setFinishing(true);
    try {
      if (r.nutrition) {
        await api.analytics.logMealCompletion({
          recipeId: r.id,
          calories: r.nutrition.calories,
          protein: r.nutrition.protein,
          fiber: r.nutrition.fiber ?? undefined,
          servings: r.servings,
        });
      }
      toast.success('Cooked. Enjoy it.');
    } catch {
      // Logging is a nicety; never strand someone in cook mode over it.
    }
    router.push(`/dashboard/recipes/${r.id}`);
  }, [api, finishing, recipe.data, router]);

  const go = useCallback(
    (delta: 1 | -1) => {
      if (delta === 1 && isLast) {
        void finish();
        return;
      }
      setIndex(i => clampStep(i + delta, steps.length));
      setFlash(delta === 1 ? 'right' : 'left');
      window.setTimeout(() => setFlash(null), 220);
    },
    [finish, isLast, steps.length]
  );

  const wave = useWaveGesture(() => go(1));

  // Keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        e.target.closest('button, a, input')
      ) {
        if (e.key === ' ') return; // let a focused control handle space
      }
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        go(1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        go(-1);
      } else if (e.key === 'Escape') {
        router.push(`/dashboard/recipes/${params.id}`);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, params.id, router]);

  // Keep the screen awake while cooking, where the browser allows it.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & {
      wakeLock?: {
        request: (t: 'screen') => Promise<{ release: () => Promise<void> }>;
      };
    };
    const request = () =>
      nav.wakeLock
        ?.request('screen')
        .then(l => {
          lock = l;
        })
        .catch(() => undefined);
    void request();
    const onVis = () => !document.hidden && void request();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release().catch(() => undefined);
    };
  }, []);

  // Swipe.
  const touchX = useRef<number | null>(null);
  const onTouchStart = (e: TouchEvent) => {
    touchX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: TouchEvent) => {
    const start = touchX.current;
    touchX.current = null;
    const end = e.changedTouches[0]?.clientX;
    if (start === null || end === undefined) return;
    const dx = end - start;
    if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
  };

  const r = recipe.data;

  if (recipe.status === 'loading') {
    return <div className="min-h-screen bg-background" aria-busy="true" />;
  }
  if (!r || steps.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-gutter">
        <EmptyState
          icon={Timer}
          title={
            r
              ? 'This recipe has no steps to cook from'
              : 'That recipe is not here'
          }
          action={
            <Button asChild variant="secondary">
              <Link
                href={r ? `/dashboard/recipes/${r.id}` : '/dashboard/recipes'}
              >
                Back
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  const { title, body } = splitStep(step.instruction);
  const forStep = ingredientsForStep(
    step.instruction,
    [...r.ingredients].sort((a, b) => a.order - b.order)
  );
  const waveLabel = {
    off: 'Wave to advance',
    starting: 'Starting camera…',
    on: 'Wave to advance · on',
    denied: 'Camera blocked',
    unavailable: 'No camera',
  }[wave.state];

  return (
    <div
      className="relative min-h-[100dvh] overflow-hidden bg-background text-ink"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* The two halves of the screen are the controls. */}
      <button
        type="button"
        aria-label="Previous step"
        onClick={() => go(-1)}
        disabled={index === 0}
        className={cn(
          'absolute inset-y-0 left-0 z-[1] w-1/2 cursor-w-resize transition-colors duration-200',
          flash === 'left' ? 'bg-surface-soft' : 'bg-transparent'
        )}
      />
      <button
        type="button"
        aria-label={isLast ? 'Finish cooking' : 'Next step'}
        onClick={() => go(1)}
        className={cn(
          'absolute inset-y-0 right-0 z-[1] w-1/2 cursor-e-resize transition-colors duration-200',
          flash === 'right' ? 'bg-surface-soft' : 'bg-transparent'
        )}
      />

      <div className="pointer-events-none relative z-[2] mx-auto flex min-h-[100dvh] max-w-[1180px] flex-col gap-[clamp(14px,2.2vw,22px)] px-gutter pb-[calc(clamp(16px,3vw,28px)+env(safe-area-inset-bottom,0px))] pt-[calc(clamp(16px,3vw,28px)+env(safe-area-inset-top,0px))]">
        <div className="flex items-center justify-between gap-md">
          <Button
            asChild
            variant="secondary"
            className="pointer-events-auto rounded-md px-3.5 text-body-lg font-regular"
          >
            <Link href={`/dashboard/recipes/${r.id}`}>
              <X className="h-[18px] w-[18px]" aria-hidden />
              Exit
            </Link>
          </Button>
          <span className="hidden min-w-0 truncate text-body-md text-muted-foreground nav:block">
            {r.title}
            {r.servings ? ` · serves ${r.servings}` : ''} · Step {index + 1} of{' '}
            {steps.length}
          </span>
          <button
            type="button"
            onClick={wave.toggle}
            aria-pressed={wave.state === 'on'}
            className="pointer-events-auto flex min-h-target items-center gap-xs rounded-md px-sm text-body-md text-muted-foreground active:bg-secondary"
          >
            <Hand className="h-[18px] w-[18px]" aria-hidden />
            <span className="nav:hidden">
              {wave.state === 'on' ? 'Wave · on' : 'Wave'}
            </span>
            <span className="hidden nav:inline">{waveLabel}</span>
          </button>
        </div>

        <div
          className="flex gap-1.5"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={index + 1}
          aria-label={`Step ${index + 1} of ${steps.length}`}
        >
          {steps.map((s, i) => (
            <div
              key={s.id}
              className={cn(
                'h-1 flex-1 rounded-full',
                i <= index ? 'bg-primary' : 'bg-surface-strong'
              )}
            />
          ))}
        </div>

        <div className="grid flex-1 grid-auto-340 items-center gap-[clamp(20px,3.5vw,40px)]">
          <div
            className="flex flex-col gap-[clamp(10px,1.6vw,16px)]"
            aria-live="polite"
          >
            <p
              aria-hidden
              className="m-0 text-cook-num leading-[0.9] tracking-[-0.03em] tabular-nums"
            >
              {String(index + 1).padStart(2, '0')}
            </p>
            <h1 className="m-0 text-[clamp(28px,3.6vw,42px)] leading-[1.12]">
              {title}
            </h1>
            {body ? (
              <p className="m-0 max-w-[32ch] text-[clamp(18px,2vw,23px)] leading-[1.45] text-body">
                {body}
              </p>
            ) : null}
            {step.tip ? (
              <p className="m-0 max-w-[40ch] text-label-md leading-[1.45] text-app-danger">
                {step.tip}
              </p>
            ) : null}
            {step.duration ? (
              <div className="pointer-events-auto mt-xs flex items-center gap-sm">
                <span className="text-title-lg tabular-nums" aria-live="off">
                  {formatTimer(seconds)}
                </span>
                <Button
                  variant="secondary"
                  onClick={() => setRunning(v => !v)}
                  disabled={seconds === 0 && !running}
                >
                  {running ? (
                    <Pause className="h-4 w-4" aria-hidden />
                  ) : (
                    <Play className="h-4 w-4" aria-hidden />
                  )}
                  {running ? 'Pause' : 'Start timer'}
                </Button>
              </div>
            ) : null}
          </div>

          {forStep.length ? (
            <section className="flex flex-col gap-3.5 rounded-md bg-signature-cream p-[clamp(14px,2.4vw,24px)]">
              <Eyebrow as="h2" className="text-label-sm">
                For this step
              </Eyebrow>
              <ul className="m-0 grid list-none grid-cols-2 gap-[clamp(8px,1.4vw,12px)] p-0">
                {forStep.map(i => (
                  <li
                    key={i.id}
                    className="flex min-w-0 flex-col items-center gap-1.5 rounded-sm bg-background p-sm"
                  >
                    <PantryArt
                      name={i.name}
                      size={72}
                      className="h-auto w-full max-w-28"
                    />
                    <span className="text-center text-label-md text-ink">
                      {i.name}
                    </span>
                    {i.amount ? (
                      <span className="text-center text-body-md text-muted-foreground">
                        {amountOf(i)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-md border-t border-border pt-3.5">
          <span
            className={cn(
              'flex items-center gap-1.5 text-body-lg text-muted-foreground',
              index === 0 && 'opacity-40'
            )}
          >
            <ChevronLeft className="h-[18px] w-[18px]" aria-hidden />
            <span className="nav:hidden">Back</span>
            <span className="hidden nav:inline">Tap left to go back</span>
          </span>
          <span className="hidden text-body-md text-muted-foreground nav:inline">
            Knuckle, wrist or a wave. You don&apos;t need clean hands.
          </span>
          <span className="flex items-center gap-1.5 text-body-lg text-ink">
            <span className="nav:hidden">{isLast ? 'Done' : 'Next'}</span>
            <span className="hidden nav:inline">
              {isLast ? 'Tap right to finish' : 'Tap right for next'}
            </span>
            <ChevronRight className="h-[18px] w-[18px]" aria-hidden />
          </span>
        </div>
      </div>
    </div>
  );
}
