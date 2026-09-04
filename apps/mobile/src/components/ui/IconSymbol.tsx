import React from 'react';
import { Ionicons } from '@expo/vector-icons';

interface IconSymbolProps {
  name: keyof typeof Ionicons.glyphMap;
  size: number;
  color: string;
  style?: any;
}

export function IconSymbol({ name, size, color, style }: IconSymbolProps) {
  return <Ionicons name={name} size={size} color={color} style={style} />;
}
