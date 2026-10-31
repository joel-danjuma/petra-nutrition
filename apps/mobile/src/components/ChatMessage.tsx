import React from 'react';
import { StyleSheet, View } from 'react-native';

import { color, onDark, radius, space } from '../theme';
import { Text } from './ui/Text';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

/**
 * Chat bubbles. The user's turn is the near-black ink surface (it is the
 * emphasised one), Petra's is the soft surface with a hairline. Both take the
 * content-card radius rather than a rounded chat pill.
 *
 * Takes the three fields it draws rather than a message type of its own: the
 * screen's entries carry a whole `ChatReply`, and this only needs the text.
 */
export function ChatMessage({ role, content, timestamp }: ChatMessageProps) {
  const isUser = role === 'user';

  return (
    <View style={[styles.container, isUser ? styles.alignEnd : styles.alignStart]}>
      <View style={[styles.bubble, isUser ? styles.user : styles.assistant]}>
        <Text preset="bodyMd" color={isUser ? color.white : color.ink}>
          {content}
        </Text>
        <Text
          preset="caption"
          color={isUser ? onDark.textMuted : color.muted}
          style={styles.timestamp}
        >
          {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: space.xxs },
  alignEnd: { alignItems: 'flex-end' },
  alignStart: { alignItems: 'flex-start' },
  bubble: {
    maxWidth: '84%',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    gap: space.xxs,
  },
  user: { backgroundColor: color.ink },
  assistant: {
    backgroundColor: color.surfaceSoft,
    borderWidth: 1,
    borderColor: color.hairline,
  },
  timestamp: { alignSelf: 'flex-end' },
});
