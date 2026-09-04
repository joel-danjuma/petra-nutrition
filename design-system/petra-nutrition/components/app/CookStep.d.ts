import * as React from 'react';

export interface CookStepProps extends React.HTMLAttributes<HTMLElement> {
  stepNumber: number;
  totalSteps: number;
  instruction: string;
  /** Formatted time, e.g. "12:00". Omit to hide the timer. */
  timeLabel?: string;
  timerRunning?: boolean;
  onToggleTimer?: () => void;
}

export declare function CookStep(props: CookStepProps): JSX.Element;
