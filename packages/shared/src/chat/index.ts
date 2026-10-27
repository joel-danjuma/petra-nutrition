/**
 * The chat turn, client side: one module both apps stream through.
 *
 * Not re-exported from `core.ts`. It needs no React, but it is a network
 * client, and Server Components have no business running chat turns.
 */
export {
  messageRole,
  messageText,
  replyFromMessageResponse,
  replyFromResponse,
  replyFromStoredMessage,
  type ChatReply,
} from './reply';
export {
  ChatTurnError,
  saveGeneratedRecipe,
  startChatTurn,
  type ChatTurnApi,
  type ChatTurnOptions,
  type ChatTurnResult,
} from './turn';
