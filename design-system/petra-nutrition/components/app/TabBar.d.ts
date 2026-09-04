import * as React from 'react';

export interface TabBarItem {
  id: string;
  label: string;
  /** Lucide icon node. */
  icon?: React.ReactNode;
}

export interface TabBarProps extends React.HTMLAttributes<HTMLElement> {
  items: TabBarItem[];
  activeId?: string;
  onSelect?: (id: string) => void;
}

export declare function TabBar(props: TabBarProps): JSX.Element;
