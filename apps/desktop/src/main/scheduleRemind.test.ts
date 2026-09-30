import { describe, expect, it } from "vitest";
import {
  dueReminders,
  MISS_MS,
  nextFireAt,
  parseScheduleEvents,
  pruneFiredKeys,
  remindSpeech,
  type ScheduleEvent
} from "./scheduleRemind";

const timed: ScheduleEvent = {
  id: "a",
  title: "站会",
  date: "2026-09-30",
  time: "10:00",
  remind: "15"
};

const allDay: ScheduleEvent = {
  id: "b",
  title: "站会",
  date: "2026-09-30",
  remind: "0"
};

describe("nextFireAt", () => {
  it("带时刻减 15 分钟", () => {
    expect(nextFireAt(timed)).toBe(new Date(2026, 8, 30, 9, 45, 0, 0).getTime());
  });

  it("全天按当天 9:00", () => {
    expect(nextFireAt(allDay)).toBe(new Date(2026, 8, 30, 9, 0, 0, 0).getTime());
  });

  it("空 remind 不入队", () => {
    expect(nextFireAt({ ...timed, remind: "" })).toBeNull();
    expect(nextFireAt({ ...timed, remind: undefined })).toBeNull();
  });
});

describe("dueReminders", () => {
  it("过期超过 2 分钟不入队", () => {
    const fireAt = nextFireAt(timed)!;
    const late = fireAt + MISS_MS + 1;
    expect(dueReminders([timed], new Set(), late)).toEqual([]);
  });

  it("窗口内入队", () => {
    const fireAt = nextFireAt(timed)!;
    const due = dueReminders([timed], new Set(), fireAt + 1_000);
    expect(due).toHaveLength(1);
    expect(due[0]?.key).toBe(`a@${fireAt}`);
  });
});

describe("remindSpeech", () => {
  it("带时刻", () => {
    expect(remindSpeech({ ...timed, time: "11:29", title: "下课" })).toBe(
      "您有一项待处理的日常：\n11：29 下课"
    );
  });

  it("带备注", () => {
    expect(remindSpeech({ ...timed, time: "11:29", title: "下课", note: "记得收作业" })).toBe(
      "您有一项待处理的日常：\n11：29 下课\n记得收作业"
    );
  });
});

describe("pruneFiredKeys", () => {
  it("改时刻后丢掉旧 fire key", () => {
    const fireAt = nextFireAt(timed)!;
    const moved = { ...timed, time: "18:00" };
    const kept = pruneFiredKeys([moved], new Set([`a@${fireAt}`]));
    expect([...kept]).toEqual([]);
  });
});

describe("parseScheduleEvents", () => {
  it("读 events 包装", () => {
    const raw = JSON.stringify({
      events: [{ id: "1", title: "A", date: "2026-09-30", remind: "0", note: "带伞" }]
    });
    expect(parseScheduleEvents(raw)).toEqual([
      { id: "1", title: "A", date: "2026-09-30", time: "", remind: "0", note: "带伞" }
    ]);
  });
});
