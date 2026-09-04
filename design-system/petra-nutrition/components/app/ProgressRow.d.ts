import * as React from 'react';

export interface ProgressRowProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  /** 0–1. Clamped. */
  value: number;
  /** Right-aligned readout, e.g. "89 / 140 g". */
  readout?: string;
}

export declare function ProgressRow(props: ProgressRowProps): JSX.Element;
