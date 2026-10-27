import { useState, useRef, useEffect, useCallback } from 'react';
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
import {
  ChatTurnError,
  errorMessage,
  messageRole,
  messageText,
  replyFromStoredMessage,
  saveGeneratedRecipe,
  startChatTurn,
  useApi,
  useAuth,
  useIsAuthenticated,
  type ChatRecipeCard,
  type ChatReply,
  type StoredChatMessage,
} from '@petra/shared';

import { color, fontSize, radius, space, type } from '../../src/theme';
import { ChatMessage } from '../../src/components/ChatMessage';
import { Chip } from '../../src/components/ui/Chip';
import { LoadingDots } from '../../src/components/ui/LoadingDots';
import { Text } from '../../src/components/ui/Text';
import { RecipeCard, RecipeCardSummary } from '../../src/components/RecipeCard';

/**
 * One bubble. An assistant entry carries the whole `ChatReply` — the shared
 * module's type, which is the agent contract's — so there is no local copy of
 * the recipe or nutrition shapes to drift.
 */
interface ChatEntry {
  key: string;
  role: 'user' | 'assistant';
  /** For a reply in flight, the text streamed so far. */
  content: string;
  timestamp: Date;
  /** Set once the reply is complete. */
  reply?: ChatReply;
  /** The reply broke partway; `content` is what had arrived. */
  failed?: boolean;
  /** Set once the first tap persisted the draft, so a second cannot duplicate it. */
  savedRecipeId?: string;
}

const SUGGESTIONS = ['Something with what I have', 'Under 30 minutes', 'Leftover ideas'];

let localKeys = 0;
const localKey = (prefix: string) => `${prefix}-${Date.now()}-${localKeys++}`;

const entryFromStored = (message: StoredChatMessage, i: number): ChatEntry => {
  const role = messageRole(message);
  return {
    key: message.id ?? `stored-${i}`,
    role,
    content: messageText(message.content),
    timestamp: message.timestamp ? new Date(message.timestamp) : new Date(),
    reply: role === 'assistant' ? replyFromStoredMessage(message) : undefined,
  };
};

/** The API's hydrated card, in the shape RecipeCard draws. */
const summaryFromCard = (card: ChatRecipeCard): RecipeCardSummary => ({
  id: card.id,
  title: card.title,
  imageUrl: card.imageUrl,
  totalTime: card.totalTime ?? undefined,
  servings: card.servings ?? undefined,
  dietaryTags: card.dietaryTags,
  nutrition: card.nutrition,
});

/**
 * Shape a composed dish into the card summary.
 *
 * Note this usually shows *more* than a library card: prep and cook times are
 * always present on a generation, while most imported recipes carry no timings
 * at all and `metaLine` correctly omits what it does not know.
 */
function summaryFromGenerated(entry: ChatEntry, reply: ChatReply): RecipeCardSummary {
  const generated = reply.generatedRecipe!;
  return {
    // Never navigated to. The press handler saves first and uses the real id it
    // gets back; a made-up uuid would 404 against a uuid-validated route.
    id: entry.savedRecipeId ?? `draft-${entry.key}`,
    title: generated.title,
    // Deliberately null: the saved row carries no image either, so the card's
    // placeholder is the same one the recipe screen will show after the tap.
    imageUrl: null,
    totalTime: generated.prepTime + generated.cookTime,
    servings: generated.servings,
    nutrition: reply.nutrition
      ? {
          calories: reply.nutrition.perServing.calories,
          protein: reply.nutrition.perServing.protein,
        }
      : null,
  };
}

/**
 * A library recipe the reply recommended.
 *
 * Only the whole-reply endpoint hydrates the card; a streamed or reloaded
 * reply carries the id alone, so the card is read here. A recipe that cannot
 * be read costs the card, not the conversation.
 */
function LibraryRecipe({ recipeId, card }: { recipeId: string; card?: ChatRecipeCard | null }) {
  const api = useApi();
  const [summary, setSummary] = useState<RecipeCardSummary | null>(
    card ? summaryFromCard(card) : null
  );

  useEffect(() => {
    if (summary) return;
    let cancelled = false;
    api.recipes
      .getById(recipeId)
      .then(recipe => {
        if (cancelled) return;
        setSummary({
          id: recipe.id,
          title: recipe.title,
          imageUrl: recipe.imageUrl ?? null,
          totalTime: recipe.totalTime,
          servings: recipe.servings,
          dietaryTags: recipe.dietaryTags,
          nutrition: recipe.nutrition
            ? { calories: recipe.nutrition.calories, protein: recipe.nutrition.protein }
            : null,
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [api, recipeId, summary]);

  if (!summary) return null;
  return (
    <RecipeCard
      variant="compact"
      recipe={summary}
      showOpenAffordance
      onPress={() => router.push(`/recipes/${recipeId}`)}
      style={styles.recipeCard}
    />
  );
}

export default function PetraChatScreen() {
  const { user } = useAuth();
  const api = useApi();
  const signedIn = useIsAuthenticated();
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  /** What Petra is doing right now, from the stream's progress frames. */
  const [progress, setProgress] = useState<string | null>(null);
  /** A clarifying question's answers, live, before the reply has finished. */
  const [liveOptions, setLiveOptions] = useState<string[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  /** Which entry's composed recipe is mid-save. Per entry, not global:
   *  a conversation can hold several composed cards. */
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const flatListRef = useRef<FlatList<ChatEntry>>(null);
  const inFlight = useRef<AbortController | null>(null);

  // Not stored: shown only while the conversation is empty.
  const greeting: ChatEntry = {
    key: 'greeting',
    role: 'assistant',
    content: `Evening${user?.firstName ? `, ${user.firstName}` : ''}. What's in the kitchen tonight, and what should I build around it?`,
    timestamp: new Date(),
  };

  /**
   * Pick up the most recent conversation.
   *
   * This used to create a session titled "Mobile Chat" on every mount — one
   * empty conversation per visit to the tab, and none of them ever reopened.
   * Now the newest is opened, and a new one is created only by the first
   * message of a conversation that has none.
   */
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    (async () => {
      try {
        const { sessions } = await api.chat.getSessions({ limit: 1, offset: 0 });
        const latest = sessions[0];
        if (!latest || cancelled) return;
        const session = await api.chat.getSession(latest.id);
        if (cancelled) return;
        setSessionId(latest.id);
        const messages: StoredChatMessage[] = session.messages ?? [];
        setEntries(messages.map(entryFromStored));
      } catch {
        // History is a convenience: without it the screen is a fresh chat.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, signedIn]);

  // Leaving the tab stops the turn rather than streaming into nothing.
  useEffect(() => () => inFlight.current?.abort(), []);

  const patch = useCallback((key: string, update: Partial<ChatEntry>) => {
    setEntries(prev => prev.map(e => (e.key === key ? { ...e, ...update } : e)));
  }, []);

  const sendMessage = async (text?: string) => {
    const content = (text ?? inputText).trim();
    if (!content || isSending) return;
    if (!signedIn) {
      Alert.alert('Sign in to chat', 'Your session has expired. Sign in and try again.');
      return;
    }

    const controller = new AbortController();
    inFlight.current = controller;
    const userKey = localKey('user');
    const replyKey = localKey('reply');
    setEntries(prev => [
      ...prev,
      { key: userKey, role: 'user', content, timestamp: new Date() },
      { key: replyKey, role: 'assistant', content: '', timestamp: new Date() },
    ]);
    setInputText('');
    setIsSending(true);
    setProgress(null);
    setLiveOptions([]);

    try {
      // Streamed through `expo/fetch` (the client ApiProvider registers), and
      // decoded by the same contract decoder the API and the web use.
      const result = await startChatTurn(api, {
        sessionId,
        text: content,
        signal: controller.signal,
        onSession: session => setSessionId(session.id),
        onProgress: label => setProgress(label),
        onText: streamed => {
          setProgress(null);
          patch(replyKey, { content: streamed });
        },
        onInterrupt: (_question, options) => setLiveOptions(options),
      });
      setSessionId(result.sessionId);
      // `done` is authoritative: its text replaces what streamed.
      patch(replyKey, { content: result.reply.content, reply: result.reply });
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof ChatTurnError) {
        // The question is stored; keep what arrived and say it was cut off.
        patch(replyKey, { content: error.partialText, failed: true });
      } else {
        // Nothing was stored, so nothing stays — and the text goes back in
        // the composer rather than being lost.
        setEntries(prev => prev.filter(e => e.key !== userKey && e.key !== replyKey));
        setInputText(content);
      }
      Alert.alert('Error', errorMessage(error, 'Failed to send message. Please try again.'));
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
      setIsSending(false);
      setProgress(null);
      setLiveOptions([]);
    }
  };

  /**
   * Open a dish Petra composed, saving it on the way.
   *
   * Generated recipes are ephemeral until someone wants one: writing a row for
   * every suggestion would fill the library with dishes nobody opened. The tap
   * is that moment of wanting, so it persists, then navigates to the real
   * recipe screen — from there it behaves like any other recipe, cook mode
   * included.
   */
  const openGeneratedRecipe = async (key: string) => {
    const entry = entries.find(e => e.key === key);
    if (!entry?.reply?.generatedRecipe) return;

    // Already saved: straight through, no second write.
    if (entry.savedRecipeId) {
      router.push(`/recipes/${entry.savedRecipeId}`);
      return;
    }

    // A save already in flight is what actually prevents a duplicate row — the
    // id it would dedupe against does not exist until the response lands.
    if (savingKey) return;

    if (!signedIn) {
      Alert.alert('Sign in to save recipes', 'Your session has expired. Sign in and try again.');
      return;
    }

    setSavingKey(key);
    try {
      const savedId = await saveGeneratedRecipe(api, entry.reply);
      patch(key, { savedRecipeId: savedId });
      router.push(`/recipes/${savedId}`);
    } catch (error) {
      // The draft stays on the entry, so the card is still tappable and the
      // user can simply try again.
      Alert.alert('Could not save that recipe', errorMessage(error, 'Try again in a moment.'));
    } finally {
      setSavingKey(null);
    }
  };

  useEffect(() => {
    flatListRef.current?.scrollToEnd({ animated: true });
  }, [entries, isSending]);

  const shown = entries.length ? entries : [greeting];
  const last = entries[entries.length - 1];
  const inFlightKey = isSending ? last?.key : undefined;
  // A clarifying question's answers first, then the reply's follow-ups, then
  // the openers for an empty conversation.
  const chips = liveOptions.length
    ? liveOptions
    : !isSending && last?.reply?.suggestions.length
      ? last.reply.suggestions
      : entries.length
        ? []
        : SUGGESTIONS;

  const canSend = inputText.trim().length > 0 && !isSending;

  const renderEntry = ({ item }: { item: ChatEntry }) => {
    const reply = item.reply;
    // The reply in flight shows nothing until its first words; the footer
    // carries the progress label until then.
    if (item.key === inFlightKey && !item.content) return null;
    const notes = [...(reply?.assumptions ?? []), ...(reply?.compromises ?? [])];

    return (
      <View>
        <ChatMessage role={item.role} content={item.content} timestamp={item.timestamp} />
        {item.failed ? (
          <Text preset="caption" style={styles.note}>
            This reply was cut off. Ask again to get the rest.
          </Text>
        ) : null}
        {/* What Petra decided for them, and what she could not do. */}
        {notes.map((line, i) => (
          <Text key={i} preset="caption" style={styles.note}>
            {line}
          </Text>
        ))}
        {/* A real library recipe always wins: it has photography, ratings
            and a row that already exists. A composed dish is the fallback
            for when nothing in the library fits. */}
        {reply?.recipeId ? (
          <LibraryRecipe recipeId={reply.recipeId} card={reply.recipe} />
        ) : reply?.generatedRecipe ? (
          <RecipeCard
            variant="compact"
            recipe={summaryFromGenerated(item, reply)}
            badge="Invented for you"
            showOpenAffordance
            loading={savingKey === item.key}
            onPress={() => openGeneratedRecipe(item.key)}
            style={styles.recipeCard}
          />
        ) : null}
      </View>
    );
  };

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
        data={shown}
        renderItem={renderEntry}
        keyExtractor={item => item.key}
        style={styles.flex}
        contentContainerStyle={styles.messagesContainer}
        showsVerticalScrollIndicator={false}
        ListFooterComponent={
          isSending && !last?.content ? (
            <View style={styles.loadingBubble}>
              <LoadingDots />
              <Text preset="bodyMd">{progress ?? 'Checking what you have…'}</Text>
            </View>
          ) : null
        }
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={styles.inputContainer}>
          {chips.length ? (
            <FlatList
              horizontal
              data={chips}
              keyExtractor={s => s}
              showsHorizontalScrollIndicator={false}
              style={styles.chipsRow}
              renderItem={({ item }) => (
                <Chip label={item} onPress={() => sendMessage(item)} style={styles.chip} />
              )}
            />
          ) : null}
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
  note: { maxWidth: '84%', paddingHorizontal: space.xs, marginTop: space.xxs },
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
