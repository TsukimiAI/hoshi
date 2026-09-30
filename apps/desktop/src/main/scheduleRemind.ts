import { pluginKvGet, pluginKvSet } from "@hoshi/agent";
import { closeRemindToast, refreshRemindToast, showRemindToast, showingRemindEventId } from "./remindToast";

const HOST_SCHEDULE_ID = "hoshi_schedule";

export type ScheduleEvent = {
  id: string;
  title: string;
  date: string;
  time?: string;
  note?: string;
  remind?: string;
};

export type DueReminder = {
  key: string;
  event: ScheduleEvent;
  fireAt: number;
};

export const MISS_MS = 2 * 60 * 1000;
export const TICK_MS = 20_000;
const ALLDAY_HOUR = 9;
const LOG_MAX = 200;

let storageDir = "";
let timer: ReturnType<typeof setInterval> | null = null;

function pad2(n: number): string {
  return (n < 10 ? "0" : "") + n;
}

export function parseYmd(s: string): { y: number; m: number; d: number } | null {
  const p = String(s || "").split("-");
  if (p.length !== 3) return null;
  const y = Number(p[0]);
  const m = Number(p[1]);
  const d = Number(p[2]);
  if (!y || !m || !d) return null;
  return { y, m, d };
}

export function parseTime(raw: string | undefined): { h: number; min: number } | null {
  const m = String(raw || "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return { h, min };
}

export function nextFireAt(event: ScheduleEvent): number | null {
  if (event.remind !== "0" && event.remind !== "15") return null;
  const day = parseYmd(event.date);
  if (!day) return null;
  const offset = event.remind === "15" ? 15 : 0;
  const clock = parseTime(event.time) ?? { h: ALLDAY_HOUR, min: 0 };
  const start = new Date(day.y, day.m - 1, day.d, clock.h, clock.min, 0, 0).getTime();
  return start - offset * 60_000;
}

export function parseScheduleEvents(raw: string | null): ScheduleEvent[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    const list = Array.isArray(data)
      ? data
      : data && typeof data === "object" && Array.isArray((data as { events?: unknown }).events)
        ? (data as { events: unknown[] }).events
        : [];
    return list
      .map((item): ScheduleEvent | null => {
        if (!item || typeof item !== "object") return null;
        const rec = item as Record<string, unknown>;
        const id = rec.id ? String(rec.id) : "";
        const title = rec.title ? String(rec.title).slice(0, 80) : "";
        const date = rec.date ? String(rec.date) : "";
        if (!id || !title || !parseYmd(date)) return null;
        const remind = rec.remind === "0" || rec.remind === "15" ? rec.remind : "";
        const time = parseTime(typeof rec.time === "string" ? rec.time : "")
          ? String(rec.time)
          : "";
        const note = rec.note ? String(rec.note).trim().slice(0, 400) : "";
        return { id, title, date, time, remind, note };
      })
      .filter((item): item is ScheduleEvent => Boolean(item));
  } catch {
    return [];
  }
}

export function parseRemindLog(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    const ids = Array.isArray(data)
      ? data
      : data && typeof data === "object" && Array.isArray((data as { ids?: unknown }).ids)
        ? (data as { ids: unknown[] }).ids
        : [];
    return ids.map((item) => String(item ?? "")).filter(Boolean);
  } catch {
    return [];
  }
}

export function dueReminders(events: ScheduleEvent[], fired: Set<string>, nowMs: number): DueReminder[] {
  const out: DueReminder[] = [];
  for (const event of events) {
    const fireAt = nextFireAt(event);
    if (fireAt == null) continue;
    const key = `${event.id}@${fireAt}`;
    if (fired.has(key)) continue;
    if (fireAt <= nowMs && nowMs - fireAt <= MISS_MS) {
      out.push({ key, event, fireAt });
    }
  }
  return out;
}

export function remindSpeech(event: ScheduleEvent): string {
  const clock = parseTime(event.time);
  const when = clock ? `${pad2(clock.h)}：${pad2(clock.min)} ${event.title}` : event.title;
  const note = String(event.note || "").trim();
  return note ? `您有一项待处理的日常：\n${when}\n${note}` : `您有一项待处理的日常：\n${when}`;
}

export function reminderKey(event: ScheduleEvent): string | null {
  const fireAt = nextFireAt(event);
  return fireAt == null ? null : `${event.id}@${fireAt}`;
}

export function pruneFiredKeys(events: ScheduleEvent[], fired: Set<string>): Set<string> {
  const keep = new Set<string>();
  for (const event of events) {
    const key = reminderKey(event);
    if (key && fired.has(key)) keep.add(key);
  }
  return keep;
}

function sameFired(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const key of a) {
    if (!b.has(key)) return false;
  }
  return true;
}

function syncOpenToast(events: ScheduleEvent[]): void {
  const id = showingRemindEventId();
  if (!id) return;
  const event = events.find((item) => item.id === id);
  if (!event) {
    closeRemindToast();
    return;
  }
  refreshRemindToast({ title: "日程", body: remindSpeech(event), eventId: event.id });
}

function readFired(): Set<string> {
  return new Set(parseRemindLog(pluginKvGet(storageDir, HOST_SCHEDULE_ID, "remind-log")));
}

function writeFired(fired: Set<string>): void {
  const ids = [...fired].slice(-LOG_MAX);
  pluginKvSet(storageDir, HOST_SCHEDULE_ID, "remind-log", { ids });
}

export function tickScheduleReminders(nowMs = Date.now()): void {
  if (!storageDir) return;
  const events = parseScheduleEvents(pluginKvGet(storageDir, HOST_SCHEDULE_ID, "events"));
  const prev = readFired();
  const fired = pruneFiredKeys(events, prev);
  const due = dueReminders(events, fired, nowMs);
  for (const item of due) {
    fired.add(item.key);
    const text = remindSpeech(item.event);
    showRemindToast({ title: "日程", body: text, eventId: item.event.id });
  }
  if (!due.length) syncOpenToast(events);
  if (!sameFired(prev, fired)) writeFired(fired);
}

export function onScheduleEventsChanged(pluginId: string, key: string): void {
  if (pluginId === HOST_SCHEDULE_ID && key === "events") {
    tickScheduleReminders();
  }
}

export function startScheduleReminders(input: { storageDir: string }): void {
  stopScheduleReminders();
  storageDir = input.storageDir;
  tickScheduleReminders();
  timer = setInterval(() => tickScheduleReminders(), TICK_MS);
}

export function stopScheduleReminders(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  closeRemindToast();
}
