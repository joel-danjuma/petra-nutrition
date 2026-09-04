import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet } from 'react-native';
import { color as tokens, space } from '../../theme';

interface LoadingDotsProps {
  color?: string;
  size?: number;
}

export function LoadingDots({ color, size = space.xs }: LoadingDotsProps) {
  const defaultColor = color || tokens.muted;

  const animatedValues = useRef([
    new Animated.Value(0.3),
    new Animated.Value(0.3),
    new Animated.Value(0.3),
  ]).current;

  useEffect(() => {
    const animations = animatedValues.map((animatedValue, index) => {
      return Animated.loop(
        Animated.sequence([
          Animated.timing(animatedValue, {
            toValue: 1,
            duration: 600,
            delay: index * 200,
            useNativeDriver: true,
          }),
          Animated.timing(animatedValue, {
            toValue: 0.3,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      );
    });

    Animated.stagger(200, animations).start();

    return () => {
      animations.forEach(animation => animation.stop());
    };
  }, []);

  return (
    <View style={styles.container}>
      {animatedValues.map((animatedValue, index) => (
        <Animated.View
          key={index}
          style={[
            styles.dot,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: defaultColor,
              opacity: animatedValue,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xxs,
  },
  dot: {
    marginHorizontal: space.xxs / 2,
  },
});
