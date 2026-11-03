import { describe, expect, it } from "vitest";
import {
  BARGE_HOLD_MS,
  BARGE_RMS,
  createBargeGate,
  decideAsrFinal,
  nextTurnFromFinally,
  playbackWatchdogMs,
  shouldAcceptTtsEnd,
  tickBargeGate
} from "./turn";

describe("playbackWatchdogMs", () => {
  it("按 PCM 时长加余量，不截成 12 秒", () => {
    const ms = playbackWatchdogMs(22050 * 2 * 20, 22050, 3000);
    expect(ms).toBe(23000);
  });

  it("最短 800ms", () => {
    expect(playbackWatchdogMs(0, 22050, 0)).toBe(800);
  });
});

describe("decideAsrFinal", () => {
  it("空闲时开新轮", () => {
    expect(
      decideAsrFinal({ turnBusy: false, ttsPlaying: false, awaitingDrain: false, barged: false })
    ).toBe("start");
  });

  it("生成或播放中未打断则丢掉", () => {
    expect(
      decideAsrFinal({ turnBusy: true, ttsPlaying: false, awaitingDrain: false, barged: false })
    ).toBe("drop");
    expect(
      decideAsrFinal({ turnBusy: false, ttsPlaying: true, awaitingDrain: false, barged: false })
    ).toBe("drop");
    expect(
      decideAsrFinal({ turnBusy: false, ttsPlaying: false, awaitingDrain: true, barged: false })
    ).toBe("drop");
  });

  it("已打断则只排队最新一句", () => {
    expect(
      decideAsrFinal({ turnBusy: true, ttsPlaying: true, awaitingDrain: false, barged: true })
    ).toBe("queue");
  });
});

describe("shouldAcceptTtsEnd", () => {
  it("只接受当前世代的自然播完", () => {
    expect(shouldAcceptTtsEnd({ awaitingDrain: true, epoch: 3, msgEpoch: 3 })).toBe(true);
    expect(shouldAcceptTtsEnd({ awaitingDrain: true, epoch: 3, msgEpoch: 2 })).toBe(false);
    expect(shouldAcceptTtsEnd({ awaitingDrain: false, epoch: 3, msgEpoch: 3 })).toBe(false);
  });
});

describe("nextTurnFromFinally", () => {
  it("有排队文本时只开这一句", () => {
    expect(
      nextTurnFromFinally({
        myEpoch: 1,
        currentEpoch: 2,
        pendingFinal: "下一句",
        ttsPlaying: false,
        awaitingDrain: false
      })
    ).toEqual({ start: "下一句", clearBusy: false, enterListening: false });
  });

  it("旧世代 finally 不能再开一轮或回聆听", () => {
    expect(
      nextTurnFromFinally({
        myEpoch: 1,
        currentEpoch: 2,
        pendingFinal: null,
        ttsPlaying: false,
        awaitingDrain: false
      })
    ).toEqual({ start: null, clearBusy: false, enterListening: false });
  });

  it("本轮结束且不在播放时回聆听", () => {
    expect(
      nextTurnFromFinally({
        myEpoch: 4,
        currentEpoch: 4,
        pendingFinal: null,
        ttsPlaying: false,
        awaitingDrain: false
      })
    ).toEqual({ start: null, clearBusy: true, enterListening: true });
  });

  it("仍在等播完时不回聆听", () => {
    expect(
      nextTurnFromFinally({
        myEpoch: 4,
        currentEpoch: 4,
        pendingFinal: null,
        ttsPlaying: false,
        awaitingDrain: true
      })
    ).toEqual({ start: null, clearBusy: false, enterListening: false });
  });
});

describe("tickBargeGate", () => {
  it("短促超阈值不送音频也不打断", () => {
    const gate = createBargeGate();
    const tick = tickBargeGate(gate, BARGE_RMS, 80, true);
    expect(tick).toEqual({ send: false, barge: false });
  });

  it("连续约 500ms 才打断，停播前样本不进入待发送", () => {
    const gate = createBargeGate();
    let barge = false;
    let send = false;
    for (let i = 0; i < 6; i += 1) {
      const tick = tickBargeGate(gate, BARGE_RMS, 100, true);
      if (tick.send) {
        send = true;
      }
      if (tick.barge) {
        barge = true;
      }
    }
    expect(send).toBe(false);
    expect(barge).toBe(true);
    expect(BARGE_HOLD_MS).toBe(500);
  });

  it("未持麦时直通", () => {
    const gate = createBargeGate();
    expect(tickBargeGate(gate, 0, 20, false)).toEqual({ send: true, barge: false });
  });
});
