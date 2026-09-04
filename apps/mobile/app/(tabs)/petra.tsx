import { useState, useRef, useEffect } from 'react';
import {
  View,
  TextInput,
  Pressable,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowRight } from 'lucide-react-native';
import { router } from 'expo-router';
import { useAuth, useAuthStore } from '@petra/shared';

import { color, fontSize, radius, space, type } from '../../src/theme';
import { ChatMessage } from '../../src/components/ChatMessage';
import { Chip } from '../../src/components/ui/Chip';
import { LoadingDots } from '../../src/components/ui/LoadingDots';
import { Text } from '../../src/components/ui/Text';
import { RecipeCard, RecipeCardSummary } from '../../src/components/RecipeCard';
import { API_URL } from '../../src/config/api';

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  /** Set when Petra recommended a real recipe from the library. */
  recipe?: RecipeCardSummary | null;
}

const SUGGESTIONS = ['Something with what I have', 'Under 30 minutes', 'Leftover ideas'];

export default function PetraChatScreen() {
  const { user } = useAuth();
  const token = useAuthStore(state => state.token);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      content: `Evening${user?.firstName ? `, ${user.firstName}` : ''}. What's in the kitchen tonight, and what should I build around it?`,
      role: 'assistant',
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    createSession();
  }, []);

  const createSession = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/chat/sessions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Mobile Chat' }),
      });
      const data = await res.json();
      if (data.success) setSessionId(data.data.id);
    } catch {
      // Session creation failure is non-fatal — retried with the first message
    }
  };

  const sendMessage = async (text?: string) => {
    const content = (text ?? inputText).trim();
    if (!content || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content,
      role: 'user',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);

    try {
      let activeSessionId = sessionId;

      if (!activeSessionId && token) {
        const res = await fetch(`${API_URL}/chat/sessions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: content.slice(0, 50) }),
        });
        const data = await res.json();
        if (data.success) {
          activeSessionId = data.data.id;
          setSessionId(activeSessionId);
        }
      }

      const res = await fetch(`${API_URL}/chat/message`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: activeSessionId, message: content }),
      });

      const data = await res.json();

      if (data.success) {
        const aiResponse: Message = {
          id: (Date.now() + 1).toString(),
          content:
            data.data?.content ||
            'I received your message, but something went wrong with my response.',
          role: 'assistant',
          timestamp: new Date(),
          recipe: data.data?.recipe ?? null,
        };
        setMessages(prev => [...prev, aiResponse]);
      } else {
        throw new Error(data.error?.message || 'Failed to get response');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to send message. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    flatListRef.current?.scrollToEnd({ animated: true });
  }, [messages, isLoading]);

  const canSend = inputText.trim().length > 0 && !isLoading;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text preset="labelMd" color={color.white}>
            P
          </Text>
        </View>
        <View style={styles.flex}>
          <Text preset="titleSm">Petra</Text>
          <Text preset="caption">Reading your pantry</Text>
        </View>
        <Chip label="Diet" onPress={() => router.push('/(tabs)/profile')} />
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={({ item }) => (
          <View>
            <ChatMessage message={item} />
            {item.recipe ? (
              <RecipeCard
                variant="compact"
                recipe={item.recipe}
                showOpenAffordance
                onPress={() => router.push(`/recipes/${item.recipe!.id}`)}
                style={styles.recipeCard}
              />
            ) : null}
          </View>
        )}
        keyExtractor={item => item.id}
        style={styles.flex}
        contentContainerStyle={styles.messagesContainer}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={
          isLoading ? (
            <View style={styles.loadingBubble}>
              <LoadingDots />
              <Text preset="bodyMd">Checking what you have…</Text>
            </View>
          ) : null
        }
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={styles.inputContainer}>
          <FlatList
            horizontal
            data={SUGGESTIONS}
            keyExtractor={s => s}
            showsHorizontalScrollIndicator={false}
            style={styles.chipsRow}
            renderItem={({ item }) => (
              <Chip label={item} onPress={() => sendMessage(item)} style={styles.chip} />
            )}
          />
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.textInput}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Ask Petra anything about cooking"
              placeholderTextColor={color.muted}
              multiline
              maxLength={500}
              returnKeyType="send"
              onSubmitEditing={() => sendMessage()}
              blurOnSubmit={false}
            />
            <Pressable
              style={[
                styles.sendButton,
                { backgroundColor: canSend ? color.ink : color.surfaceStrong },
              ]}
              onPress={() => sendMessage()}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityLabel="Send message"
            >
              <ArrowRight
                size={18}
                color={canSend ? color.white : color.muted}
                strokeWidth={1.85}
              />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.canvas },
  flex: { flex: 1 },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  avatar: {
    width: space.xl + space.xxs,
    height: space.xl + space.xxs,
    borderRadius: radius.full,
    backgroundColor: color.ink,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messagesContainer: { padding: space.md },
  recipeCard: { marginTop: space.xs, marginBottom: space.xs, width: '88%' },
  loadingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    alignSelf: 'flex-start',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    backgroundColor: color.surfaceSoft,
  },
  inputContainer: {
    borderTopWidth: 1,
    borderTopColor: color.hairline,
    padding: space.sm,
    backgroundColor: color.canvas,
  },
  chipsRow: { marginBottom: space.xs, flexGrow: 0 },
  chip: { marginRight: space.xs },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderWidth: 1,
    borderColor: color.hairline,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    gap: space.xs,
  },
  textInput: {
    ...type.bodyMd,
    flex: 1,
    fontSize: fontSize.labelMd,
    maxHeight: 100,
    paddingVertical: space.xs,
    color: color.ink,
  },
  sendButton: {
    width: space.xl + space.xxs,
    height: space.xl + space.xxs,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: space.xxs,
  },
});
