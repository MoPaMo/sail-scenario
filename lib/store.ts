import { Redis } from "@upstash/redis";
import type { Layout } from "./scenario";

/**
 * Persistence for published scenarios.
 *
 * On Vercel, add "Upstash for Redis" from the Marketplace (Storage tab). It
 * injects KV_REST_API_URL / KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL /
 * UPSTASH_REDIS_REST_TOKEN); either pair works.
 *
 * Without those variables the app keeps scenarios in memory. That is fine for
 * local development, but on Vercel each serverless instance has its own
 * memory, so submissions would vanish. The UI shows a notice in that case.
 */

export interface ScenarioStats {
  columns: number;
  moves: number;
  krakenHits: number;
}

export interface ScenarioRecord {
  id: string;
  title: string;
  author: string;
  notes: string;
  layout: Layout;
  stats: ScenarioStats;
  createdAt: string;
  updatedAt?: string;
  /** SHA-256 of the private edit key, if the author asked for an edit link. Never sent to clients. */
  editKeyHash?: string;
}

export type PublicScenario = Omit<ScenarioRecord, "editKeyHash">;

/** Strip private fields before a record leaves the server. */
export function toPublic(rec: ScenarioRecord): PublicScenario {
  const { editKeyHash: _hidden, ...pub } = rec;
  void _hidden;
  return pub;
}

export interface ScenarioStore {
  kind: "redis" | "memory";
  save(rec: ScenarioRecord): Promise<void>;
  get(id: string): Promise<ScenarioRecord | null>;
  list(offset: number, limit: number): Promise<{ items: ScenarioRecord[]; total: number }>;
  remove(id: string): Promise<boolean>;
  /** Returns false once `key` has used up `max` hits inside the window. */
  hit(key: string, max: number, windowSeconds: number): Promise<boolean>;
}

const PREFIX = "sail";
const k = {
  scenario: (id: string) => `${PREFIX}:scenario:${id}`,
  index: `${PREFIX}:scenarios`,
  rate: (key: string) => `${PREFIX}:rl:${key}`,
};

function redisStore(redis: Redis): ScenarioStore {
  return {
    kind: "redis",
    async save(rec) {
      await redis.set(k.scenario(rec.id), JSON.stringify(rec));
      await redis.zadd(k.index, { score: Date.parse(rec.createdAt), member: rec.id });
    },
    async get(id) {
      const raw = await redis.get<string | ScenarioRecord>(k.scenario(id));
      if (!raw) return null;
      return typeof raw === "string" ? (JSON.parse(raw) as ScenarioRecord) : raw;
    },
    async list(offset, limit) {
      const [ids, total] = await Promise.all([
        redis.zrange<string[]>(k.index, offset, offset + limit - 1, { rev: true }),
        redis.zcard(k.index),
      ]);
      if (ids.length === 0) return { items: [], total };
      const raws = await redis.mget<(string | ScenarioRecord | null)[]>(...ids.map(k.scenario));
      const items = raws
        .filter((r): r is string | ScenarioRecord => !!r)
        .map((r) => (typeof r === "string" ? (JSON.parse(r) as ScenarioRecord) : r));
      return { items, total };
    },
    async remove(id) {
      const removed = await redis.del(k.scenario(id));
      await redis.zrem(k.index, id);
      return removed > 0;
    },
    async hit(key, max, windowSeconds) {
      const count = await redis.incr(k.rate(key));
      if (count === 1) await redis.expire(k.rate(key), windowSeconds);
      return count <= max;
    },
  };
}

interface MemoryState {
  records: Map<string, ScenarioRecord>;
  hits: Map<string, { count: number; resetAt: number }>;
}

function memoryStore(): ScenarioStore {
  const g = globalThis as typeof globalThis & { __sailMemoryStore?: MemoryState };
  const state = (g.__sailMemoryStore ??= { records: new Map(), hits: new Map() });
  return {
    kind: "memory",
    async save(rec) {
      state.records.set(rec.id, rec);
    },
    async get(id) {
      return state.records.get(id) ?? null;
    },
    async list(offset, limit) {
      const all = [...state.records.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return { items: all.slice(offset, offset + limit), total: all.length };
    },
    async remove(id) {
      return state.records.delete(id);
    },
    async hit(key, max, windowSeconds) {
      const now = Date.now();
      const cur = state.hits.get(key);
      if (!cur || cur.resetAt < now) {
        state.hits.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
        return true;
      }
      cur.count += 1;
      return cur.count <= max;
    },
  };
}

let cached: ScenarioStore | null = null;

export function getStore(): ScenarioStore {
  if (cached) return cached;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  cached = url && token ? redisStore(new Redis({ url, token })) : memoryStore();
  return cached;
}

/** Short, URL-safe, unguessable id (10 chars of base36 ≈ 51 bits). */
export function newId(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => (b % 36).toString(36)).join("");
}

export const ID_RE = /^[a-z0-9]{10}$/;
