import * as React from 'react';

export interface ListRowProps extends React.HTMLAttributes<HTMLElement> {
  title: string;
  /** Right-aligned secondary value, e.g. a quantity. */
  value?: string;
  /** Secondary line under the title. */
  detail?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  onSelect?: () => void;
  /** Suppress the divider on the final row of a group. */
  last?: boolean;
  /** Dim and strike through, e.g. a completed shopping item. */
  muted?: boolean;
}

export declare function ListRow(props: ListRowProps): JSX.Element;
