import * as React from 'react';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Lucide icon node, thin outline. */
  icon?: React.ReactNode;
  title: string;
  body?: string;
  /** Usually a secondary <Button>. */
  action?: React.ReactNode;
}

export declare function EmptyState(props: EmptyStateProps): JSX.Element;
