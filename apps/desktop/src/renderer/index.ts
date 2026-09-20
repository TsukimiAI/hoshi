async function bootstrap() {
  const pet = document.getElementById("pet") as HTMLImageElement;
  const petAnchor = document.getElementById("pet-anchor") as HTMLButtonElement;
  const scene = document.getElementById("scene") as HTMLElement;
  const fanMenu = document.getElementById("fan-menu") as HTMLDivElement;
  const fanSessionBtn = document.getElementById("fan-session-btn") as HTMLButtonElement;
  const fanSettingsBtn = document.getElementById("fan-settings-btn") as HTMLButtonElement;
  const dock = document.getElementById("dock") as HTMLDivElement;
  const sessionPanel = document.getElementById("session-panel") as HTMLDivElement;
  const sessionsList = document.getElementById("sessions-list") as HTMLDivElement;
  const newSessionBtn = document.getElementById("new-session-btn") as HTMLButtonElement;
  const replies = document.getElementById("replies") as HTMLDivElement;
  const form = document.getElementById("chat-form") as HTMLFormElement;
  const input = document.getElementById("chat-input") as HTMLInputElement;
  const status = document.getElementById("status") as HTMLSpanElement;
  const statusRow = document.getElementById("status-row") as HTMLDivElement;
  const sendBtn = document.getElementById("send-btn") as HTMLButtonElement;
  const pttBtn = document.getElementById("ptt-btn") as HTMLButtonElement;
  const liveBtn = document.getElementById("live-btn") as HTMLButtonElement;
  const hoshi = (window as Window & { hoshi?: HoshiApi }).hoshi;

  if (!hoshi) {
    status.textContent = "错误: preload 未就绪";
    return;
  }

  const config = await hoshi.getConfig();
  if (config.presentation) {
    applyPresentation(config.presentation);
  }
  hoshi.onSettingsUpdated((next) => {
    applyPresentation(next.presentation);
    const voice = (next as { voice?: { ttsEnabled?: boolean } }).voice;
    if (voice) {
      ttsEnabled = voice.ttsEnabled !== false;
    }
  });
  let ttsEnabled = true;
  try {
    ttsEnabled =
      ((await hoshi.getSettings()) as { voice?: { ttsEnabled?: boolean } }).voice?.ttsEnabled !==
      false;
  } catch {
    ttsEnabled = true;
  }
  let ttsAwaiting = false;
  const sessionsState = {
    items: [] as SessionItem[],
    activeId: "" as string
  };
  const spriteCache = new Map<Emotion, string>();
  const typewriterState: TypewriterState = {
    queue: [],
    running: false,
    doneReceived: false,
    sessionId: 0
  };
  let activeRunId = 0;
  const FADE_ANIMATION_MS = 1800;
  let currentIgnoreMouse = true;
  let activePointerId: number | null = null;
  let activePointerCanToggle = false;
  let dragMoved = false;
  let startPointerX = 0;
  let startPointerY = 0;
  let lastPointerX = 0;
  let lastPointerY = 0;
  let topHideOffset = 0;
  const TOP_HIDE_TRIGGER_Y = 120;
  const TOP_HIDE_MAX = 300;
  const state: RendererState = {
    fadeTimerId: null,
    panelIdleCloseTimerId: null,
    panelOpen: false
  };
  let fadeClearTimerId: number | null = null;
  let fadeGeneration = 0;
  let pttBusy = false;
  let liveActive = false;
  let pttFinishing = false;
  let pttPointerId: number | null = null;
  let pttSetupGen = 0;
  let pttSpeakNext = false;
  let pttRecording: {
    capture: MicCapture;
    chunks: Float32Array[];
    maxTimer: number;
  } | null = null;

  const setIgnoreMouse = (ignore: boolean): void => {
    if (currentIgnoreMouse === ignore) {
      return;
    }
    currentIgnoreMouse = ignore;
    void hoshi.setIgnoreMouseEvents(ignore);
  };

  const clearFadeTimer = (): void => {
    fadeGeneration += 1;
    if (state.fadeTimerId !== null) {
      window.clearTimeout(state.fadeTimerId);
      state.fadeTimerId = null;
    }
    if (fadeClearTimerId !== null) {
      window.clearTimeout(fadeClearTimerId);
      fadeClearTimerId = null;
    }
    cancelFadeAllBubbles(replies);
  };
  const clearPanelIdleCloseTimer = (): void => {
    if (state.panelIdleCloseTimerId !== null) {
      window.clearTimeout(state.panelIdleCloseTimerId);
      state.panelIdleCloseTimerId = null;
    }
  };
  const dialogHasText = (): boolean => {
    if (sendBtn.disabled || pttBusy || pttPointerId !== null || liveActive) {
      return true;
    }
    if (typewriterState.running || typewriterState.queue.length > 0) {
      return true;
    }
    if (input.value.trim()) {
      return true;
    }
    return replies.querySelector(".reply-bubble") !== null;
  };
  const resetPanelIdleCloseTimer = (): void => {
    clearPanelIdleCloseTimer();
    if (!state.panelOpen) {
      return;
    }
    if (isChatVisible() && dialogHasText()) {
      return;
    }
    state.panelIdleCloseTimerId = window.setTimeout(() => {
      if (isChatVisible() && dialogHasText()) {
        return;
      }
      closePanel();
    }, presentation.panelIdleCloseMs);
  };
  const openPanel = (): void => {
    state.panelOpen = true;
    fanMenu.classList.remove("fan-hidden");
    fanMenu.classList.add("fan-open");
    fanMenu.setAttribute("aria-hidden", "false");
    hideDock(dock);
    sessionPanel.classList.add("hidden");
    setChatAreaVisible(false);
    resetPanelIdleCloseTimer();
  };
  const closePanel = (): void => {
    if (!state.panelOpen) {
      return;
    }
    clearPanelIdleCloseTimer();
    fanMenu.classList.remove("fan-open");
    fanMenu.classList.add("fan-hidden");
    fanMenu.setAttribute("aria-hidden", "true");
    sessionPanel.classList.add("hidden");
    closeDock(dock, state);
  };
  const retractFanMenu = (): void => {
    fanMenu.classList.remove("fan-open");
    fanMenu.classList.add("fan-hidden");
    fanMenu.setAttribute("aria-hidden", "true");
  };
  const setChatAreaVisible = (visible: boolean): void => {
    replies.style.display = visible ? "flex" : "none";
    form.style.display = visible ? "flex" : "none";
    statusRow.style.display = visible ? "block" : "none";
  };
  const showSessionPanel = (): void => {
    state.panelOpen = true;
    retractFanMenu();
    openDock(dock);
    setChatAreaVisible(false);
    sessionPanel.classList.remove("hidden");
  };
  const showChatPanel = (): void => {
    state.panelOpen = true;
    retractFanMenu();
    openDock(dock);
    sessionPanel.classList.add("hidden");
    setChatAreaVisible(true);
    window.setTimeout(() => input.focus(), 80);
  };
  const isDockHidden = (): boolean => dock.classList.contains("dock-hidden");
  const isChatVisible = (): boolean => form.style.display !== "none";
  const isFanVisible = (): boolean => !fanMenu.classList.contains("fan-hidden");
  const runPanelAction = (action: "showChat" | "showFan" | "closeAll"): void => {
    if (action === "showChat") {
      showChatPanel();
      resetPanelIdleCloseTimer();
      return;
    }
    if (action === "showFan") {
      openPanel();
      return;
    }
    closePanel();
  };
  const applyTopHideOffset = (): void => {
    scene.style.transform = `translateY(${-topHideOffset}px)`;
  };
  const scheduleFadeAll = (onFadeStart?: () => void): void => {
    clearFadeTimer();
    const currentGeneration = fadeGeneration;
    state.fadeTimerId = window.setTimeout(() => {
      if (currentGeneration !== fadeGeneration) {
        return;
      }
      onFadeStart?.();
      fadeAllBubbles(replies);
      fadeClearTimerId = window.setTimeout(() => {
        if (currentGeneration !== fadeGeneration) {
          return;
        }
        replies.innerHTML = "";
        fadeClearTimerId = null;
        resetPanelIdleCloseTimer();
      }, FADE_ANIMATION_MS);
      state.fadeTimerId = null;
    }, presentation.fadeDelayMs);
  };
  const finalizeDoneIfReady = async (sessionId: number): Promise<void> => {
    if (typewriterState.sessionId !== sessionId) {
      return;
    }
    if (typewriterState.running || typewriterState.queue.length > 0) {
      return;
    }
    if (!typewriterState.doneReceived) {
      return;
    }
    if (ttsAwaiting) {
      return;
    }
    typewriterState.doneReceived = false;
    status.textContent = "就绪";
    scheduleFadeAll(() => {
      void setPetEmotion(hoshi, pet, config.defaultEmotion, spriteCache);
    });
  };
  const processTypewriterQueue = async (sessionId: number): Promise<void> => {
    if (typewriterState.running || typewriterState.sessionId !== sessionId) {
      return;
    }
    typewriterState.running = true;
    while (typewriterState.queue.length > 0 && typewriterState.sessionId === sessionId) {
      const task = typewriterState.queue.shift();
      if (!task) {
        break;
      }
      await setPetEmotion(hoshi, pet, task.emotion, spriteCache);
      const bubble = enqueueTypingBubble(replies);
      for (const ch of Array.from(task.text)) {
        if (typewriterState.sessionId !== sessionId) {
          typewriterState.running = false;
          return;
        }
        appendTypingChar(bubble, ch);
        await waitMs(presentation.typeCharMs);
      }
      await waitMs(presentation.sentenceGapMs);
    }
    typewriterState.running = false;
    await finalizeDoneIfReady(sessionId);
  };

  const updateMouseIgnoreByTarget = (target: EventTarget | null): void => {
    if (activePointerId !== null) {
      setIgnoreMouse(false);
      return;
    }
    const node = target instanceof Node ? target : null;
    if (!node) {
      setIgnoreMouse(true);
      return;
    }
    const dockVisible = !dock.classList.contains("dock-hidden");
    const fanVisible = !fanMenu.classList.contains("fan-hidden");
    if (
      petAnchor.contains(node) ||
      (dockVisible && dock.contains(node)) ||
      (fanVisible && fanMenu.contains(node))
    ) {
      setIgnoreMouse(false);
      return;
    }
    setIgnoreMouse(true);
  };
  const openSession = async (sessionId: string): Promise<void> => {
    sessionsState.activeId = sessionId;
    renderSessions();
    clearFadeTimer();
    replies.innerHTML = "";
    try {
      const detail = await hoshi.listSessionMessages(sessionId);
      const lastAssistant = detail.messages
        .filter((msg) => msg.role === "assistant")
        .slice(-3);
      for (const message of lastAssistant) {
        appendStaticBubble(replies, message.content);
      }
      status.textContent = "就绪";
      showChatPanel();
    } catch {
      status.textContent = "错误: 会话读取失败";
    }
  };
  const renderSessions = (): void => {
    sessionsList.innerHTML = "";
    for (const session of sessionsState.items) {
      sessionsList.appendChild(
        createSessionRow({
          title: session.title,
          active: session.id === sessionsState.activeId,
          onOpen: () => {
            void openSession(session.id);
          },
          onDelete: () => {
            void (async () => {
              if (!confirmDeleteSession()) {
                return;
              }
              try {
                await hoshi.deleteSession(session.id);
                const wasActive = sessionsState.activeId === session.id;
                if (wasActive) {
                  sessionsState.activeId = "";
                  replies.innerHTML = "";
                }
                await refreshSessions();
                if (wasActive) {
                  const nextId = sessionsState.items[0]?.id;
                  if (nextId) {
                    sessionsState.activeId = nextId;
                    renderSessions();
                  } else {
                    await ensureSession();
                  }
                }
              } catch {
                status.textContent = "错误: 删除会话失败";
              }
            })();
          }
        })
      );
    }
  };
  const refreshSessions = async (): Promise<void> => {
    sessionsState.items = await hoshi.listSessions();
    if (!sessionsState.activeId && sessionsState.items.length > 0) {
      sessionsState.activeId = sessionsState.items[0].id;
    }
    renderSessions();
  };
  const ensureSession = async (): Promise<string> => {
    if (sessionsState.activeId) {
      return sessionsState.activeId;
    }
    const created = await hoshi.createSession("新会话");
    sessionsState.activeId = created.id;
    await refreshSessions();
    return created.id;
  };

  document.addEventListener("pointerdown", (event) => {
    if (!state.panelOpen) {
      return;
    }
    const target = event.target as Node | null;
    if (!target || dock.contains(target) || petAnchor.contains(target) || fanMenu.contains(target)) {
      return;
    }
    if (isChatVisible() && dialogHasText()) {
      return;
    }
    closePanel();
  });

  fanSessionBtn.addEventListener("click", async () => {
    showSessionPanel();
    resetPanelIdleCloseTimer();
    try {
      await refreshSessions();
    } catch {
      status.textContent = "错误: 会话列表读取失败";
    }
  });

  fanSettingsBtn.addEventListener("click", () => {
    retractFanMenu();
    closePanel();
    void hoshi.openSettings();
  });

  newSessionBtn.addEventListener("click", async () => {
    try {
      const created = await hoshi.createSession("新会话");
      sessionsState.activeId = created.id;
      await refreshSessions();
      replies.innerHTML = "";
      status.textContent = "就绪";
      resetPanelIdleCloseTimer();
    } catch {
      status.textContent = "错误: 新建会话失败";
    }
  });

  document.addEventListener("mousemove", (event) => {
    updateMouseIgnoreByTarget(event.target);
  });

  petAnchor.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    unlockTtsCtx();
    activePointerId = event.pointerId;
    activePointerCanToggle = true;
    dragMoved = false;
    startPointerX = event.screenX;
    startPointerY = event.screenY;
    lastPointerX = event.screenX;
    lastPointerY = event.screenY;
    petAnchor.classList.add("is-dragging");
    petAnchor.setPointerCapture(event.pointerId);
    setIgnoreMouse(false);
  });

  const finishDrag = (pointerId: number | null, toggleOnClick: boolean): void => {
    if (pointerId === null) {
      return;
    }
    try {
      if (petAnchor.hasPointerCapture(pointerId)) {
        petAnchor.releasePointerCapture(pointerId);
      }
    } catch {
      // ignore
    }
    petAnchor.classList.remove("is-dragging");
    activePointerId = null;
    const canToggle = activePointerCanToggle;
    activePointerCanToggle = false;

    if (toggleOnClick && canToggle && !dragMoved) {
      runPanelAction(
        resolveLeftClickAction({
          fanVisible: isFanVisible(),
          dockVisible: !isDockHidden(),
          chatVisible: isChatVisible()
        })
      );
    }
    dragMoved = false;
  };

  petAnchor.addEventListener("pointermove", (event) => {
    if (activePointerId !== event.pointerId) {
      return;
    }
    if ((event.buttons & 1) === 0) {
      finishDrag(activePointerId, false);
      updateMouseIgnoreByTarget(event.target);
      return;
    }
    const dx = event.screenX - lastPointerX;
    const dy = event.screenY - lastPointerY;
    if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
      let effectiveDy = dy;

      if (dy < 0 && event.screenY <= TOP_HIDE_TRIGGER_Y) {
        const grow = Math.min(TOP_HIDE_MAX - topHideOffset, -dy);
        if (grow > 0) {
          topHideOffset += grow;
          applyTopHideOffset();
          effectiveDy += grow;
        }
      } else if (dy > 0 && topHideOffset > 0) {
        const shrink = Math.min(topHideOffset, dy);
        topHideOffset -= shrink;
        applyTopHideOffset();
        effectiveDy -= shrink;
      }

      if (dx !== 0 || effectiveDy !== 0) {
        void hoshi.moveWindowBy(dx, effectiveDy);
      }
      if (
        Math.abs(event.screenX - startPointerX) > 4 ||
        Math.abs(event.screenY - startPointerY) > 4
      ) {
        dragMoved = true;
      }
      lastPointerX = event.screenX;
      lastPointerY = event.screenY;
    }
  });

  petAnchor.addEventListener("pointerup", (event) => {
    if (activePointerId !== event.pointerId) {
      return;
    }
    finishDrag(activePointerId, event.button === 0);
    updateMouseIgnoreByTarget(event.target);
  });

  petAnchor.addEventListener("pointercancel", (event) => {
    if (activePointerId !== event.pointerId) {
      return;
    }
    finishDrag(activePointerId, false);
    updateMouseIgnoreByTarget(event.target);
  });

  petAnchor.addEventListener("lostpointercapture", () => {
    finishDrag(activePointerId, false);
    setIgnoreMouse(true);
  });

  petAnchor.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    runPanelAction(
      resolveRightClickAction({
        fanVisible: isFanVisible(),
        dockVisible: !isDockHidden(),
        chatVisible: isChatVisible()
      })
    );
  });

  const stopMicGraph = async (): Promise<Float32Array | null> => {
    const rec = pttRecording;
    pttRecording = null;
    pttPointerId = null;
    pttBtn.classList.remove("is-recording");
    if (!rec) {
      return null;
    }
    window.clearTimeout(rec.maxTimer);
    await closeMicCapture(rec.capture);
    const total = rec.chunks.reduce((n, chunk) => n + chunk.length, 0);
    const merged = new Float32Array(total);
    let offset = 0;
    for (const chunk of rec.chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    return resampleLinear(merged, rec.capture.sampleRate, PTT_SAMPLE_RATE);
  };

  const finishPtt = async (): Promise<void> => {
    if (pttBusy || pttFinishing) {
      return;
    }
    pttFinishing = true;
    pttSetupGen += 1;
    const capturedId = pttPointerId;
    if (capturedId !== null) {
      try {
        if (pttBtn.hasPointerCapture(capturedId)) {
          pttBtn.releasePointerCapture(capturedId);
        }
      } catch {
        // ignore
      }
    }
    try {
      const samples = await stopMicGraph();
      if (!samples) {
        return;
      }
      const duration = samples.length / PTT_SAMPLE_RATE;
      if (duration < PTT_MIN_SECONDS || pcmRms(samples) < PTT_SILENCE_RMS) {
        status.textContent = "未识别到语音";
        resetPanelIdleCloseTimer();
        return;
      }
      pttBusy = true;
      sendBtn.disabled = true;
      pttBtn.disabled = true;
      status.textContent = "识别中";
      let submitted = false;
      try {
        const wav = encodePcm16MonoWav(floatToPcm16(samples), PTT_SAMPLE_RATE);
        const text = await hoshi.transcribe(u8ToBase64(wav), sessionsState.activeId);
        if (!text) {
          status.textContent = "未识别到语音";
          resetPanelIdleCloseTimer();
          return;
        }
        input.value = text;
        submitted = true;
        pttSpeakNext = true;
        form.requestSubmit();
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          status.textContent = "识别超时";
          resetPanelIdleCloseTimer();
          return;
        }
        const msg = error instanceof Error ? error.message : "识别失败";
        status.textContent = `错误: ${msg}`;
        resetPanelIdleCloseTimer();
      } finally {
        pttBusy = false;
        if (!submitted) {
          pttBtn.disabled = false;
          sendBtn.disabled = false;
        }
      }
    } finally {
      pttFinishing = false;
    }
  };

  let liveReconnects = 0;
  let liveTtsPlaying = false;
  let liveTtsStartedAt = 0;
  let liveTtsCtx: AudioContext | null = null;
  let liveMic: MicCapture | null = null;
  let liveVoiceWs: WebSocket | null = null;
  let pttTtsWs: WebSocket | null = null;
  const SILENT_WAV =
    "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";

  const agentWs = (path: string): string => {
    const base = `${config.agentBaseUrl.replace(/^http/, "ws")}${path}`;
    const token = encodeURIComponent(config.agentToken ?? "");
    return `${base}${path.includes("?") ? "&" : "?"}token=${token}`;
  };

  const followDefaultSink = (target: object): void => {
    const withSink = target as { setSinkId?: (id: string) => Promise<void> };
    if (typeof withSink.setSinkId === "function") {
      void withSink.setSinkId("");
    }
  };

  const unlockTtsCtx = (): AudioContext | null => {
    const Ctor =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      return null;
    }
    if (!liveTtsCtx || liveTtsCtx.state === "closed") {
      try {
        liveTtsCtx = new Ctor({ sinkId: "" } as AudioContextOptions);
      } catch {
        liveTtsCtx = new Ctor();
      }
      followDefaultSink(liveTtsCtx);
    }
    if (liveTtsCtx.state === "suspended") {
      void liveTtsCtx.resume();
    }
    const ping = new Audio(SILENT_WAV);
    ping.volume = 0.01;
    followDefaultSink(ping);
    void ping.play().catch(() => {});
    return liveTtsCtx;
  };

  if (navigator.mediaDevices?.addEventListener) {
    navigator.mediaDevices.addEventListener("devicechange", () => {
      if (liveTtsCtx && liveTtsCtx.state !== "closed") {
        followDefaultSink(liveTtsCtx);
      }
    });
  }

  const stopLiveTts = (): void => {
    liveTtsPlaying = false;
    liveTtsStartedAt = 0;
  };

  const playLivePcm = (data: ArrayBuffer | Blob | Uint8Array): void => {
    const n =
      data instanceof Uint8Array
        ? data.byteLength
        : data instanceof ArrayBuffer
          ? data.byteLength
          : 2;
    if (n < 2) {
      return;
    }
    liveTtsPlaying = true;
    if (!liveTtsStartedAt) {
      liveTtsStartedAt = Date.now();
    }
  };

  const stopLiveMic = async (): Promise<void> => {
    const rec = liveMic;
    liveMic = null;
    await closeMicCapture(rec);
  };

  const stopLive = async (): Promise<void> => {
    liveActive = false;
    liveReconnects = 0;
    liveBtn.classList.remove("is-live");
    stopLiveTts();
    if (liveVoiceWs) {
      if (liveVoiceWs.readyState === WebSocket.OPEN) {
        try {
          liveVoiceWs.send(JSON.stringify({ type: "stop" }));
        } catch {
          // ignore
        }
      }
      liveVoiceWs.close();
      liveVoiceWs = null;
    }
    await stopLiveMic();
    if (status.textContent.startsWith("实时:")) {
      status.textContent = "就绪";
    }
  };

  const startLiveMic = async (): Promise<void> => {
    await stopLiveMic();
    let sampleRate = 48000;
    const capture = await openMicCapture((inputData) => {
      if (!liveActive) {
        return;
      }
      const resampled = resampleLinear(inputData, sampleRate, PTT_SAMPLE_RATE);
      if (liveTtsPlaying && Date.now() - liveTtsStartedAt < 800) {
        return;
      }
      if (liveTtsPlaying) {
        if (pcmRms(resampled) < 0.06) {
          return;
        }
        if (liveVoiceWs && liveVoiceWs.readyState === WebSocket.OPEN) {
          liveVoiceWs.send(JSON.stringify({ type: "barge" }));
        }
        stopLiveTts();
      }
      const pcm = floatToPcm16(resampled);
      if (liveVoiceWs && liveVoiceWs.readyState === WebSocket.OPEN) {
        liveVoiceWs.send(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength));
      }
    });
    if (!liveActive) {
      await closeMicCapture(capture);
      return;
    }
    sampleRate = capture.sampleRate;
    liveMic = capture;
  };

  const markTtsDone = (): void => {
    if (!ttsAwaiting) {
      return;
    }
    ttsAwaiting = false;
    void finalizeDoneIfReady(typewriterState.sessionId);
  };

  const feedLiveEvent = (event: AgentEvent): void => {
    consumeEvent(event, {
      onSentence: ({ text, emotion }) => {
        clearFadeTimer();
        typewriterState.queue.push({ text, emotion });
        void processTypewriterQueue(typewriterState.sessionId);
      },
      onEmotion: (emotion) => {
        void setPetEmotion(hoshi, pet, emotion, spriteCache);
      },
      onDone: () => {
        typewriterState.doneReceived = true;
        void finalizeDoneIfReady(typewriterState.sessionId);
        void refreshSessions();
      },
      onError: (msg) => {
        status.textContent = `实时: ${msg}`;
      }
    });
  };

  const b64ToBytes = (b64: string): Uint8Array => {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) {
      out[i] = bin.charCodeAt(i);
    }
    return out;
  };

  const handleVoicePayload = (event: MessageEvent): void => {
    if (event.data instanceof ArrayBuffer) {
      playLivePcm(new Uint8Array(event.data));
      return;
    }
    if (typeof Blob !== "undefined" && event.data instanceof Blob) {
      playLivePcm(event.data);
      return;
    }
    if (typeof event.data !== "string") {
      return;
    }
    let rec: Record<string, unknown>;
    try {
      rec = JSON.parse(event.data) as Record<string, unknown>;
    } catch {
      return;
    }
    if (rec.type === "pcm" && typeof rec.b64 === "string") {
      playLivePcm(b64ToBytes(rec.b64));
      return;
    }
    if (rec.type === "status") {
      const phase = String(rec.phase ?? "");
      if (phase === "idle_stop") {
        void stopLive();
        return;
      }
      if (phase === "generating") {
        activeRunId += 1;
        typewriterState.sessionId = activeRunId;
        typewriterState.doneReceived = false;
        typewriterState.queue = [];
        ttsAwaiting = ttsEnabled;
      }
      if (phase === "listening") {
        const asr = String(rec.asr ?? "");
        status.textContent = asr === "whisper" ? "实时: 聆听中（本机）" : "实时: 聆听中（云端流式）";
        return;
      }
      const map: Record<string, string> = {
        generating: "实时: 生成中",
        speaking: "实时: 说话中"
      };
      status.textContent = map[phase] ?? `实时: ${phase}`;
      return;
    }
    if (rec.type === "tts_done") {
      markTtsDone();
      return;
    }
    if (rec.type === "error") {
      status.textContent = `实时: ${String(rec.message ?? "错误")}`;
      markTtsDone();
      return;
    }
    if (rec.event === "emotion" || rec.event === "sentence" || rec.event === "done" || rec.event === "error") {
      feedLiveEvent(rec as AgentEvent);
    }
  };

  const bindVoiceSession = async (sessionId: string): Promise<void> => {
    if (liveVoiceWs) {
      liveVoiceWs.close();
      liveVoiceWs = null;
    }
    const socket = new WebSocket(agentWs("/v1/voice"));
    socket.binaryType = "arraybuffer";
    liveVoiceWs = socket;
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => {
        socket.send(JSON.stringify({ type: "start", sessionId }));
        resolve();
      });
      socket.addEventListener("error", () => reject(new Error("voice ws failed")));
    });
    socket.addEventListener("message", handleVoicePayload);
    socket.addEventListener("close", () => {
      if (liveVoiceWs === socket) {
        liveVoiceWs = null;
      }
      if (!liveActive) {
        return;
      }
      if (liveReconnects < 1) {
        liveReconnects += 1;
        void (async () => {
          try {
            const sid = await ensureSession();
            await bindVoiceSession(sid);
          } catch {
            await stopLive();
            status.textContent = "实时: 连接失败";
          }
        })();
        return;
      }
      void stopLive();
      status.textContent = "实时: 已断开";
    });
  };

  const startLive = async (): Promise<void> => {
    if (liveActive) {
      await stopLive();
      return;
    }
    pttSetupGen += 1;
    await stopMicGraph();
    showChatPanel();
    clearPanelIdleCloseTimer();
    liveActive = true;
    liveReconnects = 0;
    liveBtn.classList.add("is-live");
    status.textContent = "实时: 连接中";
    try {
      const sessionId = await ensureSession();
      await bindVoiceSession(sessionId);
      await startLiveMic();
      status.textContent = "实时: 聆听中";
    } catch (error) {
      await stopLive();
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "NotFoundError" || name === "SecurityError") {
        status.textContent = "请在系统设置中允许麦克风";
      } else {
        status.textContent = "实时: 启动失败";
      }
    }
  };

  const startPtt = async (pointerId: number): Promise<void> => {
    if (pttBusy || sendBtn.disabled || pttPointerId !== null) {
      return;
    }
    if (liveActive) {
      await stopLive();
    }
    pttSetupGen += 1;
    const gen = pttSetupGen;
    pttPointerId = pointerId;
    pttBtn.setPointerCapture(pointerId);
    pttBtn.classList.add("is-recording");
    clearPanelIdleCloseTimer();
    status.textContent = "录音中";
    try {
      const chunks: Float32Array[] = [];
      let collected = 0;
      let sampleRate = 48000;
      const capture = await openMicCapture((inputData) => {
        const maxSamples = Math.ceil(PTT_MAX_SECONDS * sampleRate);
        if (collected >= maxSamples) {
          return;
        }
        const take = Math.min(inputData.length, maxSamples - collected);
        chunks.push(new Float32Array(inputData.subarray(0, take)));
        collected += take;
        if (collected >= maxSamples) {
          void finishPtt();
        }
      });
      if (gen !== pttSetupGen) {
        await closeMicCapture(capture);
        return;
      }
      sampleRate = capture.sampleRate;
      const maxTimer = window.setTimeout(() => {
        void finishPtt();
      }, PTT_MAX_SECONDS * 1000);
      pttRecording = {
        capture,
        chunks,
        maxTimer
      };
    } catch (error) {
      try {
        if (pttBtn.hasPointerCapture(pointerId)) {
          pttBtn.releasePointerCapture(pointerId);
        }
      } catch {
        // ignore
      }
      pttPointerId = null;
      pttBtn.classList.remove("is-recording");
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "NotFoundError" || name === "SecurityError") {
        status.textContent = "请在系统设置中允许麦克风";
      } else {
        status.textContent = "错误: 无法录音";
      }
      resetPanelIdleCloseTimer();
    }
  };

  pttBtn.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    unlockTtsCtx();
    void startPtt(event.pointerId);
  });
  pttBtn.addEventListener("pointerup", (event) => {
    if (pttPointerId !== event.pointerId && !pttRecording) {
      pttSetupGen += 1;
      return;
    }
    void finishPtt();
  });
  pttBtn.addEventListener("pointercancel", () => {
    void finishPtt();
  });
  pttBtn.addEventListener("lostpointercapture", () => {
    if (pttRecording || pttPointerId !== null) {
      void finishPtt();
    }
  });

  liveBtn.addEventListener("click", () => {
    unlockTtsCtx();
    void startLive();
  });

  await setPetEmotion(hoshi, pet, config.defaultEmotion, spriteCache);
  pet.onerror = () => {
    status.textContent = `错误: 立绘加载失败(${pet.alt})`;
  };
  status.textContent = "就绪";
  hideDock(dock);
  fanMenu.classList.add("fan-hidden");
  fanMenu.setAttribute("aria-hidden", "true");
  sessionPanel.classList.add("hidden");
  setChatAreaVisible(true);
  applyTopHideOffset();
  setIgnoreMouse(true);
  try {
    await refreshSessions();
    await ensureSession();
  } catch {
    status.textContent = "错误: 初始化会话失败";
  }

  form.addEventListener("submit", async (evt) => {
    evt.preventDefault();
    unlockTtsCtx();
    if (liveActive) {
      await stopLive();
    }
    const message = input.value.trim();
    if (!message) {
      return;
    }

    const shouldSpeak =
      pttSpeakNext &&
      ((await hoshi.getSettings()) as { voice?: { ttsEnabled?: boolean } }).voice?.ttsEnabled !==
        false;
    pttSpeakNext = false;
    input.value = "";
    showChatPanel();
    clearFadeTimer();
    clearPanelIdleCloseTimer();
    activeRunId += 1;
    const runId = activeRunId;
    typewriterState.sessionId = runId;
    typewriterState.doneReceived = false;
    typewriterState.queue = [];
    ttsAwaiting = shouldSpeak;
    sendBtn.disabled = true;
    pttBtn.disabled = true;
    status.textContent = "生成中";
    let sessionId = "";

    try {
      sessionId = await ensureSession();
      if (shouldSpeak) {
        if (pttTtsWs) {
          pttTtsWs.close();
          pttTtsWs = null;
        }
        const socket = new WebSocket(agentWs("/v1/tts"));
        socket.binaryType = "arraybuffer";
        pttTtsWs = socket;
        await new Promise<void>((resolve, reject) => {
          socket.addEventListener("open", () => resolve());
          socket.addEventListener("error", () => reject(new Error("tts ws failed")));
        });
        socket.addEventListener("message", (event) => {
          if (event.data instanceof ArrayBuffer) {
            playLivePcm(new Uint8Array(event.data));
            return;
          }
          if (typeof Blob !== "undefined" && event.data instanceof Blob) {
            playLivePcm(event.data);
            return;
          }
          if (typeof event.data !== "string") {
            return;
          }
          try {
            const rec = JSON.parse(event.data) as Record<string, unknown>;
            if (rec.type === "pcm" && typeof rec.b64 === "string") {
              playLivePcm(b64ToBytes(rec.b64));
            }
            if (rec.type === "error") {
              status.textContent = `语音: ${String(rec.message ?? "错误")}`;
              markTtsDone();
            }
            if (rec.type === "tts_done") {
              markTtsDone();
            }
          } catch {
            // ignore
          }
        });
      }
      await hoshi.chat({ message, sessionId }, (event: AgentEvent) => {
        consumeEvent(event, {
          onSentence: ({ text, emotion }) => {
            clearFadeTimer();
            typewriterState.queue.push({ text, emotion });
            void processTypewriterQueue(runId);
            if (shouldSpeak && pttTtsWs && pttTtsWs.readyState === WebSocket.OPEN) {
              pttTtsWs.send(JSON.stringify({ type: "speak", text }));
            }
          },
          onEmotion: (emotion) => {
            void setPetEmotion(hoshi, pet, emotion, spriteCache);
          },
          onDone: () => {
            typewriterState.doneReceived = true;
            void finalizeDoneIfReady(runId);
            void refreshSessions();
            if (shouldSpeak && pttTtsWs && pttTtsWs.readyState === WebSocket.OPEN) {
              pttTtsWs.send(JSON.stringify({ type: "finish" }));
            }
          },
          onError: (msg) => {
            status.textContent = `错误: ${msg}`;
            typewriterState.doneReceived = false;
            typewriterState.queue = [];
            typewriterState.sessionId = activeRunId + 1;
            activeRunId = typewriterState.sessionId;
            void setPetEmotion(hoshi, pet, config.defaultEmotion, spriteCache);
            resetPanelIdleCloseTimer();
            markTtsDone();
            if (shouldSpeak) {
              pttTtsWs?.close();
              pttTtsWs = null;
            }
          }
        });
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "未知错误";
      status.textContent = `错误: ${msg}`;
      void setPetEmotion(hoshi, pet, config.defaultEmotion, spriteCache);
      markTtsDone();
      if (shouldSpeak) {
        pttTtsWs?.close();
        pttTtsWs = null;
      }
    } finally {
      sendBtn.disabled = false;
      pttBtn.disabled = false;
    }
  });

  input.addEventListener("input", () => {
    resetPanelIdleCloseTimer();
  });
}

void bootstrap();
