import * as React from 'react';

export interface ChipProps extends React.HTMLAttributes<HTMLElement> {
  /** Text shown in the chip. */
  label?: string;
  /** Selected state. Renders on the near-black primary surface. */
  selected?: boolean;
  /** Makes the chip a button. Omit for a read-only tag. */
  onSelect?: () => void;
  /** Render over a full-bleed dark surface (Cook Mode, Scan). */
  onDark?: boolean;
  disabled?: boolean;
}

export declare function Chip(props: ChipProps): JSX.Element;
