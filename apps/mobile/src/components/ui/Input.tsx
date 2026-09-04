import React from 'react';
import {
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';

import { color, fontSize, radius, space, type } from '../../theme';
import { Text } from './Text';

/**
 * Text input: the system's small radius, one hairline border, no fill and no
 * shadow. Labels sit above rather than floating inside.
 */
export interface InputProps extends TextInputProps {
  label?: string;
  hint?: string;
  /** Slot rendered at the trailing edge, e.g. a password reveal toggle. */
  trailing?: React.ReactNode;
  containerStyle?: ViewStyle;
}

export function Input({ label, hint, trailing, containerStyle, style, ...rest }: InputProps) {
  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text preset="labelMd" color={color.ink}>
          {label}
        </Text>
      ) : null}
      <View style={styles.field}>
        <TextInput
          style={[styles.input, style]}
          placeholderTextColor={color.muted}
          {...rest}
        />
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </View>
      {hint ? <Text preset="caption">{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.xs },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: color.hairline,
    borderRadius: radius.sm,
    backgroundColor: color.canvas,
    paddingHorizontal: space.sm,
  },
  input: {
    ...type.bodyMd,
    flex: 1,
    fontSize: fontSize.labelMd,
    color: color.ink,
    paddingVertical: space.sm,
  },
  trailing: { paddingLeft: space.xs },
});
