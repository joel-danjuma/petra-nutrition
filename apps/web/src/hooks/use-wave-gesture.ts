'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type WaveState = 'off' | 'starting' | 'on' | 'denied' | 'unavailable';

const W = 64;
const H = 48;
/** Mean per-pixel brightness change (0–255) that counts as a wave. */
const MOTION_THRESHOLD = 28;
/** Share of the frame that must change — a hand, not sensor noise. */
const AREA_THRESHOLD = 0.18;
/** After a wave, ignore motion this long so one wave is one step. */
const COOLDOWN_MS = 1400;
const SAMPLE_MS = 120;

/**
 * Advance cook mode with a wave of the hand, for when your hands are covered
 * in flour.
 *
 * Opt-in, and private by construction: the camera feed is drawn to a 64×48
 * canvas in this tab, compared frame to frame, and thrown away. No frame is
 * stored, uploaded or sent anywhere. Turning it off, leaving cook mode or
 * hiding the tab stops the camera.
 */
export function useWaveGesture(onWave: () => void) {
  const [state, setState] = useState<WaveState>('off');
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevRef = useRef<Uint8ClampedArray | null>(null);
  const lastWaveRef = useRef(0);
  const onWaveRef = useRef(onWave);
  onWaveRef.current = onWave;

  const stop = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    prevRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setState('unavailable');
      return;
    }
    setState('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 160 },
          height: { ideal: 120 },
          facingMode: 'user',
        },
        audio: false,
      });
      streamRef.current = stream;

      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();

      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('no canvas');

      timerRef.current = setInterval(() => {
        ctx.drawImage(video, 0, 0, W, H);
        const { data } = ctx.getImageData(0, 0, W, H);
        // Luma only; colour adds nothing to "did something move".
        const luma = new Uint8ClampedArray(W * H);
        for (let i = 0, p = 0; i < data.length; i += 4, p++) {
          luma[p] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
        }
        const prev = prevRef.current;
        prevRef.current = luma;
        if (!prev) return;

        let changed = 0;
        for (let p = 0; p < luma.length; p++) {
          if (Math.abs(luma[p] - prev[p]) > MOTION_THRESHOLD) changed++;
        }
        const now = Date.now();
        if (
          changed / luma.length > AREA_THRESHOLD &&
          now - lastWaveRef.current > COOLDOWN_MS
        ) {
          lastWaveRef.current = now;
          onWaveRef.current();
        }
      }, SAMPLE_MS);

      setState('on');
    } catch (err) {
      stop();
      const name = err instanceof DOMException ? err.name : '';
      setState(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'denied'
          : 'unavailable'
      );
    }
  }, [stop]);

  const toggle = useCallback(() => {
    if (state === 'on' || state === 'starting') {
      stop();
      setState('off');
    } else {
      void start();
    }
  }, [state, start, stop]);

  // A hidden tab should not keep the camera light on.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden && streamRef.current) {
        stop();
        setState('off');
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      stop();
    };
  }, [stop]);

  return { state, toggle };
}
