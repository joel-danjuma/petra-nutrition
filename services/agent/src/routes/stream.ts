import type { Request, Response } from 'express';
import {
  chatRequestSchema,
  encodeFrame,
  HEARTBEAT_FRAME,
  type ChatRequest,
  type StreamEventInput,
} from '@petra/agent-contract';

import { runChatTurnStreaming } from '../orchestrator';
import { logger } from '../utils/logger';

/** Keeps proxies and mobile radios from dropping a connection that is merely
 *  waiting on a slow first token. */
const HEARTBEAT_MS = 15_000;

/**
 * Write one frame. The wire format lives in the contract beside the decoder
 * that reads it, so the two ends cannot drift; typing the event here means a
 * payload the contract would reject does not compile.
 */
const send = (res: Response, event: StreamEventInput) => {
  res.write(encodeFrame(event));
};

/**
 * Stream one chat turn as Server-Sent Events.
 *
 * Four things here are load-bearing:
 *
 * - The headers disable buffering everywhere it can happen. `X-Accel-Buffering`
 *   is for nginx; `flushHeaders` gets the 200 out before the first token, which
 *   is what lets the client show a cursor rather than a spinner.
 * - An `error` frame exists because once the first chunk is out the status line
 *   is already 200. A mid-stream failure cannot be an HTTP error, and without
 *   an agreed frame the client would just hang.
 * - `close` aborts the model call. A user navigating away used to leave Groq
 *   generating tokens nobody would ever read, billed against a 200k/day budget.
 * - `node` frames go out before any `chunk`. A turn that composes a recipe and
 *   then computes macros spends several seconds doing work with nothing on
 *   screen, and a bare spinner for that long reads as a hang. They are
 *   advisory: a client that ignores them sees the stream it saw before.
 */
export const streamChat = async (req: Request, res: Response): Promise<void> => {
  const parsed = chatRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid agent request body',
        details: parsed.error.flatten(),
        timestamp: new Date().toISOString(),
      },
    });
    return;
  }

  const request: ChatRequest = parsed.data;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  const controller = new AbortController();
  const heartbeat = setInterval(
    () => res.write(HEARTBEAT_FRAME),
    HEARTBEAT_MS
  );

  const cleanup = () => {
    clearInterval(heartbeat);
  };

  // `res.on('close')`, not `req.on('close')`. The request emits close as soon
  // as its body has been read — which for a buffered POST is immediately — so
  // listening there aborts every stream the instant it starts. The response
  // emits close when the socket actually goes away, which is the event we want.
  res.on('close', () => {
    if (!res.writableEnded) {
      controller.abort();
      logger.info('Client disconnected mid-stream; aborted the model call', {
        userId: request.user.id,
      });
    }
    cleanup();
  });

  const started = Date.now();

  try {
    const response = await runChatTurnStreaming(
      request,
      chunk => send(res, { event: 'chunk', data: { content: chunk } }),
      controller.signal,
      {
        onNode: (node, label) =>
          send(res, { event: 'node', data: { node, label } }),
        onInterrupt: (question, options) =>
          send(res, { event: 'interrupt', data: { question, options } }),
      }
    );

    send(res, { event: 'done', data: response });

    logger.info('Chat stream served', {
      userId: request.user.id,
      model: response.model,
      tokensUsed: response.tokensUsed,
      responseType: response.type,
      generated: !!response.generatedRecipe,
      durationMs: Date.now() - started,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      // The client is already gone; there is nobody to tell.
      cleanup();
      res.end();
      return;
    }

    const message =
      error instanceof Error ? error.message : 'AI streaming service is unavailable';

    logger.error('Chat stream failed', { message });
    send(res, {
      event: 'error',
      data: { code: 'AGENT_STREAM_FAILED', message },
    });
  } finally {
    cleanup();
    if (!res.writableEnded) res.end();
  }
};
