import "server-only";
import { randomUUID } from "node:crypto";

// A card build runs as a job that outlives any single connection, so a phone
// that locks its screen or switches apps can reconnect and still get the card.
// One server process, so jobs live in memory.

type Event = Record<string, unknown>;
type Listener = (event: Event | null) => void; // null = job finished

export type Job = {
  id: string;
  events: Event[];
  finished: boolean;
  listeners: Set<Listener>;
  abort: AbortController;
  createdAt: number;
  lastSeen: number;
};

const KEEP_FINISHED_MS = 15 * 60 * 1000;
// Nobody has been connected this long: stop the work and save the quota.
const ABANDONED_MS = 3 * 60 * 1000;
const PING_MS = 10_000;

const jobs = new Map<string, Job>();

setInterval(() => {
  const now = Date.now();
  for (const job of jobs.values()) {
    if (job.finished && now - job.createdAt > KEEP_FINISHED_MS) jobs.delete(job.id);
    else if (!job.finished && job.listeners.size === 0 && now - job.lastSeen > ABANDONED_MS) job.abort.abort();
  }
}, 30_000).unref();

export function createJob(): Job {
  const job: Job = {
    id: randomUUID(),
    events: [],
    finished: false,
    listeners: new Set(),
    abort: new AbortController(),
    createdAt: Date.now(),
    lastSeen: Date.now(),
  };
  jobs.set(job.id, job);
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function emit(job: Job, event: Event) {
  job.events.push(event);
  for (const listener of job.listeners) listener(event);
}

export function finish(job: Job) {
  job.finished = true;
  for (const listener of job.listeners) listener(null);
  job.listeners.clear();
}

// NDJSON stream of a job: a {"type":"job"} line with its id, the events from
// index `from` on, then live events until it finishes. Pings keep proxies and
// mobile networks from treating a quiet model call as a dead connection; they
// are not part of the job's events, so `from` counts only real events.
export function streamJob(job: Job, from = 0): Response {
  const encoder = new TextEncoder();
  let listener: Listener | null = null;
  let ping: ReturnType<typeof setInterval> | null = null;
  const stop = () => {
    if (listener) job.listeners.delete(listener);
    if (ping) clearInterval(ping);
    listener = null;
    ping = null;
    job.lastSeen = Date.now();
  };
  const stream = new ReadableStream({
    start(controller) {
      const write = (event: Event) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          stop();
        }
      };
      write({ type: "job", id: job.id });
      for (const event of job.events.slice(Math.max(0, from))) write(event);
      if (job.finished) {
        controller.close();
        return;
      }
      listener = (event) => {
        if (event) return write(event);
        stop();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      job.listeners.add(listener);
      ping = setInterval(() => write({ type: "ping" }), PING_MS);
    },
    cancel() {
      stop();
    },
  });
  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}
