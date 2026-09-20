"use strict";
const presentation = {
    maxAssistantBubbles: 3,
    fadeDelayMs: 4000,
    panelIdleCloseMs: 12000,
    typeCharMs: 38,
    sentenceGapMs: 220
};
function applyPresentation(next) {
    presentation.maxAssistantBubbles = next.maxAssistantBubbles;
    presentation.fadeDelayMs = next.fadeDelayMs;
    presentation.panelIdleCloseMs = next.panelIdleCloseMs;
    presentation.typeCharMs = next.typeCharMs;
    presentation.sentenceGapMs = next.sentenceGapMs;
}
async function setPetEmotion(hoshi, imgElement, emotion, spriteCache) {
    if (!spriteCache.has(emotion)) {
        const dataUrl = await hoshi.getSpriteData(emotion);
        spriteCache.set(emotion, dataUrl);
    }
    const src = spriteCache.get(emotion);
    if (src) {
        imgElement.src = src;
        imgElement.alt = emotion;
    }
}
function consumeEvent(event, handlers) {
    if (event.event === "sentence") {
        handlers.onSentence({ text: event.data.text, emotion: event.data.emotion });
        return;
    }
    if (event.event === "emotion") {
        handlers.onEmotion(event.data.emotion);
        return;
    }
    if (event.event === "done") {
        handlers.onDone();
        return;
    }
    handlers.onError(event.data.message);
}
function hideDock(dock) {
    dock.classList.remove("dock-enter", "dock-leave");
    dock.classList.add("dock-hidden");
    dock.setAttribute("aria-hidden", "true");
}
function openDock(dock) {
    dock.classList.remove("dock-hidden", "dock-leave");
    dock.classList.add("dock-enter");
    dock.setAttribute("aria-hidden", "false");
}
function closeDock(dock, state) {
    state.panelOpen = false;
    dock.classList.remove("dock-enter");
    dock.classList.add("dock-leave");
    dock.setAttribute("aria-hidden", "true");
    window.setTimeout(() => {
        if (!state.panelOpen) {
            hideDock(dock);
        }
    }, 200);
}
function fadeAllBubbles(replies) {
    const nodes = Array.from(replies.querySelectorAll(".reply-bubble"));
    if (nodes.length === 0) {
        return;
    }
    for (const node of nodes) {
        node.classList.add("reply-fade-all");
    }
}
function cancelFadeAllBubbles(replies) {
    const nodes = Array.from(replies.querySelectorAll(".reply-bubble"));
    for (const node of nodes) {
        node.classList.remove("reply-fade-all");
    }
}
function enqueueTypingBubble(replies) {
    const bubble = document.createElement("div");
    bubble.className = "reply-bubble reply-enter";
    replies.appendChild(bubble);
    const assistantBubbles = Array.from(replies.querySelectorAll(".reply-bubble"));
    if (assistantBubbles.length > presentation.maxAssistantBubbles) {
        const oldest = assistantBubbles[0];
        oldest.classList.add("reply-leave");
        window.setTimeout(() => oldest.remove(), 220);
    }
    replies.scrollTop = replies.scrollHeight;
    return bubble;
}
function appendTypingChar(bubble, char) {
    const span = document.createElement("span");
    span.className = "reply-char-pop";
    span.textContent = char;
    bubble.appendChild(span);
}
function appendStaticBubble(replies, text) {
    const bubble = enqueueTypingBubble(replies);
    bubble.textContent = text;
}
function confirmDeleteSession() {
    return window.confirm("确定删除该会话？");
}
function createSessionRow(input) {
    const row = document.createElement("div");
    row.className = `session-row${input.active ? " active" : ""}`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "session-item";
    button.textContent = input.title;
    button.addEventListener("click", input.onOpen);
    const del = document.createElement("button");
    del.type = "button";
    del.className = "session-delete";
    del.textContent = "删除";
    del.addEventListener("click", (event) => {
        event.stopPropagation();
        input.onDelete();
    });
    row.appendChild(button);
    row.appendChild(del);
    return row;
}
function waitMs(ms) {
    return new Promise((resolve) => {
        window.setTimeout(resolve, ms);
    });
}
const PTT_SAMPLE_RATE = 16000;
const PTT_MAX_SECONDS = 18;
const PTT_MIN_SECONDS = 0.4;
const PTT_SILENCE_RMS = 0.008;
function resampleLinear(input, fromRate, toRate) {
    if (fromRate === toRate || input.length === 0) {
        return input;
    }
    const outLen = Math.max(1, Math.round((input.length * toRate) / fromRate));
    const out = new Float32Array(outLen);
    if (outLen === 1) {
        out[0] = input[0];
        return out;
    }
    const ratio = (input.length - 1) / (outLen - 1);
    for (let i = 0; i < outLen; i += 1) {
        const x = i * ratio;
        const i0 = Math.floor(x);
        const i1 = Math.min(i0 + 1, input.length - 1);
        const f = x - i0;
        out[i] = input[i0] * (1 - f) + input[i1] * f;
    }
    return out;
}
function floatToPcm16(samples) {
    const out = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i += 1) {
        const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
        out[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
    }
    return out;
}
function pcmRms(samples) {
    if (samples.length === 0) {
        return 0;
    }
    const windowSize = 3200;
    let max = 0;
    for (let start = 0; start < samples.length; start += windowSize) {
        const end = Math.min(start + windowSize, samples.length);
        let sum = 0;
        for (let i = start; i < end; i += 1) {
            const v = samples[i] ?? 0;
            sum += v * v;
        }
        const rms = Math.sqrt(sum / (end - start));
        if (rms > max) {
            max = rms;
        }
    }
    return max;
}
function encodePcm16MonoWav(pcm, sampleRate) {
    const dataSize = pcm.byteLength;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    const writeAscii = (offset, text) => {
        for (let i = 0; i < text.length; i += 1) {
            view.setUint8(offset + i, text.charCodeAt(i));
        }
    };
    writeAscii(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeAscii(8, "WAVE");
    writeAscii(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeAscii(36, "data");
    view.setUint32(40, dataSize, true);
    const bytes = new Uint8Array(buffer);
    bytes.set(new Uint8Array(pcm.buffer, pcm.byteOffset, dataSize), 44);
    return bytes;
}
function u8ToBase64(bytes) {
    let binary = "";
    const chunk = 0x2000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
}
const HOSHI_CAP_WORKLET = `
class HoshiCap extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = new Float32Array(2048);
    this._n = 0;
    this.port.onmessage = (e) => {
      if (e.data === "flush") {
        this.flush();
      }
    };
  }
  flush() {
    if (this._n === 0) {
      return;
    }
    this.port.postMessage(this._buf.slice(0, this._n));
    this._n = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) {
      return true;
    }
    let i = 0;
    while (i < ch.length) {
      const take = Math.min(ch.length - i, this._buf.length - this._n);
      this._buf.set(ch.subarray(i, i + take), this._n);
      this._n += take;
      i += take;
      if (this._n >= this._buf.length) {
        this.flush();
      }
    }
    return true;
  }
}
registerProcessor("hoshi-cap", HoshiCap);
`;
async function openMicCapture(onFrame) {
    const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 }
    });
    const context = new AudioContext();
    if (context.state === "suspended") {
        await context.resume();
    }
    const source = context.createMediaStreamSource(stream);
    const mute = context.createGain();
    mute.gain.value = 0;
    let worklet = null;
    let processor = null;
    try {
        const blob = new Blob([HOSHI_CAP_WORKLET], { type: "application/javascript" });
        const url = URL.createObjectURL(blob);
        await context.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);
        worklet = new AudioWorkletNode(context, "hoshi-cap");
        worklet.port.onmessage = (event) => {
            const data = event.data;
            onFrame(new Float32Array(data));
        };
        source.connect(worklet);
        worklet.connect(mute);
    }
    catch {
        processor = context.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (event) => {
            onFrame(new Float32Array(event.inputBuffer.getChannelData(0)));
        };
        source.connect(processor);
        processor.connect(mute);
    }
    mute.connect(context.destination);
    return { stream, context, source, mute, worklet, processor, sampleRate: context.sampleRate };
}
async function closeMicCapture(cap) {
    if (!cap) {
        return;
    }
    if (cap.processor) {
        cap.processor.onaudioprocess = null;
        cap.processor.disconnect();
    }
    if (cap.worklet) {
        try {
            cap.worklet.port.postMessage("flush");
        }
        catch {
            // ignore
        }
        cap.worklet.port.onmessage = null;
        cap.worklet.disconnect();
    }
    cap.source.disconnect();
    cap.mute.disconnect();
    cap.stream.getTracks().forEach((track) => track.stop());
    await cap.context.close();
}
