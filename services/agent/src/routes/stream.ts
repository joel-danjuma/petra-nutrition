import type { Request, Response } from 'express';
import { chatRequestSchema, type ChatRequest } from '@petra/agent-contract';

import { runChatTurnStreaming } from '../orchestrator';
import { logger } from '../utils/logger';

/** Keeps proxies and mobile radios from dropping a connection that is merely
 *  waiting on a slow first token. */
const HEARTBEAT_MS = 15_000;

const send = (res: Response, event: string, data: unknown) => {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
};

/**
 * Stream one chat turn as Server-Sent Events.
 *
 * Three things here are load-bearing:
 *
 * - The headers disable buffering everywhere it can happen. `X-Accel-Buffering`
 *   is for nginx; `flushHeaders` gets the 200 out before the first token, which
 *   is what lets the client show a cursor rather than a spinner.
 * - An `error` frame exists because once the first chunk is out the status line
 *   is already 200. A mid-stream failure cannot be an HTTP error, and without
 *   an agreed frame the client would just hang.
 * - `close` aborts the model call. A user navigating away used to leave Groq
 *   generating tokens nobody would ever read, billed against a 200k/day budget.
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
  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);

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
      chunk => send(res, 'chunk', { content: chunk }),
      controller.signal
    );

    send(res, 'done', response);

    logger.info('Chat stream served', {
      userId: request.user.id,
      model: response.model,
      tokensUsed: response.tokensUsed,
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
    send(res, 'error', { code: 'AGENT_STREAM_FAILED', message });
  } finally {
    cleanup();
    if (!res.writableEnded) res.end();
  }
};
