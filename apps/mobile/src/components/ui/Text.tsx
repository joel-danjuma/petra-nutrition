import React from 'react';
import { Text as RNText, TextProps as RNTextProps, TextStyle } from 'react-native';

import { type, TypeName } from '../../theme';

/**
 * Every piece of text in the app goes through here, so type can only ever be
 * one of the design system's presets. Emphasis comes from size and colour —
 * there is deliberately no `bold` prop.
 */
export interface TextProps extends RNTextProps {
  /** Design-system type preset. Defaults to body copy. */
  preset?: TypeName;
  /** Override the preset's colour with another design-system colour. */
  color?: string;
  align?: TextStyle['textAlign'];
}

export function Text({
  preset = 'bodyMd',
  color,
  align,
  style,
  ...rest
}: TextProps) {
  return (
    <RNText
      style={[type[preset], color ? { color } : null, align ? { textAlign: align } : null, style]}
      {...rest}
    />
  );
}
