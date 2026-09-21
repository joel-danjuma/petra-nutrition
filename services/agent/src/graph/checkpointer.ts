import {
  BaseCheckpointSaver,
  MemorySaver,
  copyCheckpoint,
  type Checkpoint,
  type CheckpointMetadata,
  type CheckpointTuple,
} from '@langchain/langgraph';
import {
  WRITES_IDX_MAP,
  type CheckpointListOptions,
  type PendingWrite,
} from '@langchain/langgraph-checkpoint';
import type { RunnableConfig } from '@langchain/core/runnables';
import type Redis from 'ioredis';

import { config } from '../config';
import { getRedis } from '../cache';
import { logger } from '../utils/logger';

/**
 * Graph state in Redis, with a TTL.
 *
 * Two decisions worth stating, because both look like shortcuts and are not:
 *
 * **Why not `@langchain/langgraph-checkpoint-redis`.** The official saver is
 * built on node-redis and RediSearch, and this stack runs `redis:7-alpine` —
 * plain Redis, no search module. Adopting it means either running Redis Stack
 * (a second Redis, for checkpoints alone) or discovering at boot that
 * `FT.CREATE` is an unknown command. The state this graph checkpoints is a
 * handful of small JSON channels keyed by thread, which needs `SETEX` and a
 * sorted set, not a search index.
 *
 * **Why a TTL at all.** Because this is working memory and nothing more. The
 * API owns the durable transcript; what lives here is one conversation's
 * in-flight channels, useful for resuming a turn a user is still in and
 * worthless an hour later. Without an expiry, every abandoned conversation
 * accumulates in a cache nobody prunes — and the agent, which is stateless
 * about user data by design, quietly becomes the thing holding the most of it.
 *
 * Every key written gets the TTL refreshed, so an active conversation stays
 * alive and an abandoned one falls out on its own.
 */

const PREFIX = 'graph';

/** Serde hands back `[type, Uint8Array]`; Redis wants a string. */
const encode = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');
const decode = (text: string): Uint8Array => new Uint8Array(Buffer.from(text, 'base64'));

interface StoredCheckpoint {
  checkpoint: string;
  metadata: string;
  parent?: string;
}

/**
 * Reject the keys that would let a caller escape their own namespace.
 *
 * `thread_id` arrives from the API, which derives it from a chat session id, so
 * a colon in it would let one thread's keys collide with another's. Cheap to
 * check and the kind of thing that is very hard to notice later.
 */
function assertKeySafe(field: string, value: unknown, allowEmpty = false): string {
  if (typeof value !== 'string') {
    throw new Error(`Checkpointer requires a string ${field}, got ${typeof value}`);
  }
  if (!allowEmpty && value === '') {
    throw new Error(`Checkpointer requires a non-empty ${field}`);
  }
  if (value.includes(':') || value.includes('*')) {
    throw new Error(`Checkpointer ${field} must not contain ':' or '*'`);
  }
  return value;
}

export class RedisSaver extends BaseCheckpointSaver {
  private readonly ttl: number;

  constructor(ttlSeconds: number = config.GRAPH_STATE_TTL_SECONDS) {
    super();
    this.ttl = ttlSeconds;
  }

  /* ------------------------------------------------------------- keys */

  private checkpointKey(thread: string, ns: string, id: string): string {
    return `${PREFIX}:cp:${thread}:${ns}:${id}`;
  }

  private writesKey(thread: string, ns: string, id: string): string {
    return `${PREFIX}:cpw:${thread}:${ns}:${id}`;
  }

  /** Newest-first ordering, without needing to SCAN for a thread's ids. */
  private indexKey(thread: string, ns: string): string {
    return `${PREFIX}:cpx:${thread}:${ns}`;
  }

  /**
   * Every key this thread owns.
   *
   * Kept so `deleteThread` is a read and a DEL rather than a `SCAN` over the
   * whole keyspace — which on a shared Redis is both slow and rude.
   */
  private threadKey(thread: string): string {
    return `${PREFIX}:threads:${thread}`;
  }

  private async track(redis: Redis, thread: string, keys: string[]): Promise<void> {
    const registry = this.threadKey(thread);
    await redis.sadd(registry, ...keys);
    await redis.expire(registry, this.ttl);
  }

  /* ------------------------------------------------------------- reads */

  async getTuple(config_: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const redis = await getRedis();
    if (!redis) return undefined;

    const thread = config_.configurable?.thread_id;
    if (typeof thread !== 'string' || !thread) return undefined;
    const ns = assertKeySafe('checkpoint_ns', config_.configurable?.checkpoint_ns ?? '', true);

    let id = config_.configurable?.checkpoint_id as string | undefined;
    if (!id) {
      const [newest] = await redis.zrevrange(this.indexKey(thread, ns), 0, 0);
      if (!newest) return undefined;
      id = newest;
    }

    const raw = await redis.get(this.checkpointKey(thread, ns, id));
    if (!raw) return undefined;

    const stored = JSON.parse(raw) as StoredCheckpoint;
    const checkpoint = (await this.serde.loadsTyped('json', decode(stored.checkpoint))) as Checkpoint;
    const metadata = (await this.serde.loadsTyped(
      'json',
      decode(stored.metadata)
    )) as CheckpointMetadata;

    const pendingWrites = await this.readWrites(redis, thread, ns, id);

    return {
      config: { configurable: { thread_id: thread, checkpoint_ns: ns, checkpoint_id: id } },
      checkpoint,
      metadata,
      pendingWrites,
      ...(stored.parent
        ? {
            parentConfig: {
              configurable: { thread_id: thread, checkpoint_ns: ns, checkpoint_id: stored.parent },
            },
          }
        : {}),
    };
  }

  private async readWrites(
    redis: Redis,
    thread: string,
    ns: string,
    id: string
  ): Promise<CheckpointTuple['pendingWrites']> {
    const hash = await redis.hgetall(this.writesKey(thread, ns, id));
    const entries = Object.entries(hash);
    if (!entries.length) return [];

    // Sorted by the composite field key so replay order matches write order.
    entries.sort(([a], [b]) => a.localeCompare(b));

    const writes: [string, string, unknown][] = [];
    for (const [, value] of entries) {
      const [taskId, channel, payload] = JSON.parse(value) as [string, string, string];
      writes.push([taskId, channel, await this.serde.loadsTyped('json', decode(payload))]);
    }
    return writes;
  }

  async *list(
    config_: RunnableConfig,
    options?: CheckpointListOptions
  ): AsyncGenerator<CheckpointTuple> {
    const redis = await getRedis();
    if (!redis) return;

    const thread = config_.configurable?.thread_id;
    if (typeof thread !== 'string' || !thread) return;
    const ns = assertKeySafe('checkpoint_ns', config_.configurable?.checkpoint_ns ?? '', true);

    const ids = await redis.zrevrange(this.indexKey(thread, ns), 0, -1);
    const before = options?.before?.configurable?.checkpoint_id as string | undefined;
    let remaining = options?.limit;

    for (const id of ids) {
      if (before && id >= before) continue;
      if (remaining !== undefined) {
        if (remaining <= 0) return;
        remaining -= 1;
      }

      const tuple = await this.getTuple({
        configurable: { thread_id: thread, checkpoint_ns: ns, checkpoint_id: id },
      });
      if (!tuple) continue;

      if (
        options?.filter &&
        !Object.entries(options.filter).every(
          ([key, value]) => (tuple.metadata as Record<string, unknown>)?.[key] === value
        )
      ) {
        continue;
      }

      yield tuple;
    }
  }

  /* ------------------------------------------------------------ writes */

  async put(
    config_: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata
  ): Promise<RunnableConfig> {
    const thread = assertKeySafe('thread_id', config_.configurable?.thread_id);
    const ns = assertKeySafe('checkpoint_ns', config_.configurable?.checkpoint_ns ?? '', true);
    const id = assertKeySafe('checkpoint_id', checkpoint.id);

    const next: RunnableConfig = {
      configurable: { thread_id: thread, checkpoint_ns: ns, checkpoint_id: id },
    };

    const redis = await getRedis();
    // No Redis is a supported state, not an error. The run continues in
    // memory; only resumption is lost, and the API still has the transcript.
    if (!redis) return next;

    const [[, serializedCheckpoint], [, serializedMetadata]] = await Promise.all([
      this.serde.dumpsTyped(copyCheckpoint(checkpoint)),
      this.serde.dumpsTyped(metadata),
    ]);

    const stored: StoredCheckpoint = {
      checkpoint: encode(serializedCheckpoint),
      metadata: encode(serializedMetadata),
      ...(config_.configurable?.checkpoint_id
        ? { parent: config_.configurable.checkpoint_id as string }
        : {}),
    };

    const key = this.checkpointKey(thread, ns, id);
    const index = this.indexKey(thread, ns);

    await redis
      .multi()
      .setex(key, this.ttl, JSON.stringify(stored))
      // Scored by wall clock rather than by id, so `zrevrange` is newest-first
      // without relying on the id's lexical ordering staying monotonic.
      .zadd(index, Date.now(), id)
      .expire(index, this.ttl)
      .exec();

    await this.track(redis, thread, [key, index]);

    return next;
  }

  async putWrites(
    config_: RunnableConfig,
    writes: PendingWrite[],
    taskId: string
  ): Promise<void> {
    const thread = assertKeySafe('thread_id', config_.configurable?.thread_id);
    const ns = assertKeySafe('checkpoint_ns', config_.configurable?.checkpoint_ns ?? '', true);
    const id = assertKeySafe('checkpoint_id', config_.configurable?.checkpoint_id);

    const redis = await getRedis();
    if (!redis) return;

    const key = this.writesKey(thread, ns, id);
    const fields: Record<string, string> = {};

    for (let idx = 0; idx < writes.length; idx++) {
      const [channel, value] = writes[idx];
      const [, serialized] = await this.serde.dumpsTyped(value);
      // Special channels map to negative indices so they cannot collide with
      // ordinary writes; padded so lexical field order matches numeric order.
      const position = WRITES_IDX_MAP[channel] ?? idx;
      const field = `${taskId}:${String(position).padStart(4, '0')}`;
      fields[field] = JSON.stringify([taskId, channel, encode(serialized)]);
    }

    if (!Object.keys(fields).length) return;

    await redis.multi().hset(key, fields).expire(key, this.ttl).exec();
    await this.track(redis, thread, [key]);
  }

  async deleteThread(threadId: string): Promise<void> {
    const thread = assertKeySafe('thread_id', threadId);
    const redis = await getRedis();
    if (!redis) return;

    const registry = this.threadKey(thread);
    const keys = await redis.smembers(registry);
    if (keys.length) await redis.del(...keys);
    await redis.del(registry);
  }
}

/**
 * The checkpointer the graph compiles with.
 *
 * Resolved once, at first use. When `REDIS_URL` is unset — a local `pnpm dev`,
 * or a test — this is `MemorySaver`, and everything behaves identically within
 * a process. When Redis is configured but unreachable, `RedisSaver`'s own
 * operations degrade to no-ops via `getRedis`, so the graph still runs: state
 * simply isn't durable, which is the correct trade for a service whose job is
 * to answer the question in front of it.
 */
let saver: BaseCheckpointSaver | null = null;

export function checkpointer(): BaseCheckpointSaver {
  if (!saver) {
    saver = config.REDIS_URL ? new RedisSaver() : new MemorySaver();
    logger.info('Graph checkpointer ready', {
      backend: config.REDIS_URL ? 'redis' : 'memory',
      ttlSeconds: config.REDIS_URL ? config.GRAPH_STATE_TTL_SECONDS : null,
    });
  }
  return saver;
}

/** Test seam: force a backend, or clear the resolved one. */
export function setCheckpointer(next: BaseCheckpointSaver | null): void {
  saver = next;
}
