import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, useAuthStore } from '@petra/shared';
import { Colors } from '../../src/constants/Colors';
import { useColorScheme } from '../../src/hooks/useColorScheme';
import { ChatMessage } from '../../src/components/ChatMessage';
import { LoadingDots } from '../../src/components/ui/LoadingDots';

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
}

const getApiUrl = () => {
  if (__DEV__) {
    return Platform.OS === 'android' ? 'http://10.0.2.2:3001/api' : 'http://localhost:3001/api';
  }
  return 'https://api.petra-ai.com/api';
};

export default function ChatScreen() {
  const colorScheme = useColorScheme();
  const { user } = useAuth();
  const token = useAuthStore(state => state.token);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      content: `Hello ${user?.firstName || 'there'}! I'm Petra, your AI kitchen assistant. I can help you discover recipes, plan meals, manage your pantry, and answer any cooking questions. What would you like to cook today?`,
      role: 'assistant',
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  const API_URL = getApiUrl();

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
      // Session creation failure is non-fatal — we'll try again with the first message
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputText.trim(),
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
          body: JSON.stringify({ title: userMessage.content.slice(0, 50) }),
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
        body: JSON.stringify({ sessionId: activeSessionId, message: userMessage.content }),
      });

      const data = await res.json();

      if (data.success) {
        const aiResponse: Message = {
          id: (Date.now() + 1).toString(),
          content: data.data?.content || data.data?.message || 'I received your message, but something went wrong with my response.',
          role: 'assistant',
          timestamp: new Date(),
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

  const renderMessage = ({ item }: { item: Message }) => (
    <ChatMessage message={item} />
  );

  const renderFooter = () => {
    if (!isLoading) return null;
    return (
      <View style={[styles.loadingContainer, { backgroundColor: Colors[colorScheme ?? 'light'].background }]}>
        <View style={[styles.loadingBubble, { backgroundColor: Colors[colorScheme ?? 'light'].tint + '20' }]}>
          <LoadingDots />
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors[colorScheme ?? 'light'].background }]}>
      <View style={[styles.header, { borderBottomColor: Colors[colorScheme ?? 'light'].tabIconDefault + '20' }]}>
        <View style={styles.headerContent}>
          <View style={[styles.avatarContainer, { backgroundColor: Colors[colorScheme ?? 'light'].tint }]}>
            <Text style={styles.avatarText}>P</Text>
          </View>
          <View>
            <Text style={[styles.headerTitle, { color: Colors[colorScheme ?? 'light'].text }]}>
              Petra AI
            </Text>
            <Text style={[styles.headerSubtitle, { color: Colors[colorScheme ?? 'light'].tabIconDefault }]}>
              Your Kitchen Assistant
            </Text>
          </View>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={item => item.id}
        style={styles.messagesList}
        contentContainerStyle={styles.messagesContainer}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={renderFooter}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={[styles.inputContainer, {
          backgroundColor: Colors[colorScheme ?? 'light'].background,
          borderTopColor: Colors[colorScheme ?? 'light'].tabIconDefault + '20',
        }]}>
          <View style={[styles.inputWrapper, {
            backgroundColor: Colors[colorScheme ?? 'light'].background,
            borderColor: Colors[colorScheme ?? 'light'].tabIconDefault + '30',
          }]}>
            <TextInput
              style={[styles.textInput, { color: Colors[colorScheme ?? 'light'].text }]}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Ask Petra anything about cooking..."
              placeholderTextColor={Colors[colorScheme ?? 'light'].tabIconDefault}
              multiline
              maxLength={500}
              returnKeyType="send"
              onSubmitEditing={sendMessage}
              blurOnSubmit={false}
            />
            <TouchableOpacity
              style={[styles.sendButton, {
                backgroundColor: inputText.trim() ? Colors[colorScheme ?? 'light'].tint : Colors[colorScheme ?? 'light'].tabIconDefault + '30',
              }]}
              onPress={sendMessage}
              disabled={!inputText.trim() || isLoading}
            >
              <Ionicons
                name="send"
                size={20}
                color={inputText.trim() ? 'white' : Colors[colorScheme ?? 'light'].tabIconDefault}
              />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { borderBottomWidth: 1, paddingHorizontal: 16, paddingVertical: 12 },
  headerContent: { flexDirection: 'row', alignItems: 'center' },
  avatarContainer: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  headerTitle: { fontSize: 18, fontWeight: '600' },
  headerSubtitle: { fontSize: 14, marginTop: 2 },
  messagesList: { flex: 1 },
  messagesContainer: { padding: 16 },
  inputContainer: { borderTopWidth: 1, padding: 16 },
  inputWrapper: { flexDirection: 'row', alignItems: 'flex-end', borderWidth: 1, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 8, minHeight: 48 },
  textInput: { flex: 1, fontSize: 16, maxHeight: 100, paddingVertical: 8 },
  sendButton: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  loadingContainer: { paddingVertical: 8 },
  loadingBubble: { alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 18, marginHorizontal: 16 },
});
