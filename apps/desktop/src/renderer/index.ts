const CHAT_IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const CHAT_IMAGE_MAX_BYTES = 1_350_000;
const CHAT_IMAGE_MAX_DATA_CHARS = 1_800_000;

function normalizePetMime(mime: string): string {
  const value = mime.trim().toLowerCase();
  return value === "image/jpg" ? "image/jpeg" : value;
}

async function readPetImage(
  file: File
): Promise<{ mime: string; data: string; preview: string } | { error: string }> {
  const mime = normalizePetMime(file.type);
  if (!CHAT_IMAGE_MIMES.has(mime)) {
    return { error: "只支持 png、jpeg、webp、gif" };
  }
  if (file.size > CHAT_IMAGE_MAX_BYTES) {
    return { error: "单张图片太大" };
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("读图失败"));
    reader.readAsDataURL(file);
  });
  const comma = dataUrl.indexOf(",");
  const data = dataUrl.slice(comma + 1).replace(/\s+/g, "");
  if (!data || data.length > CHAT_IMAGE_MAX_DATA_CHARS) {
    return { error: "单张图片太大" };
  }
  return { mime, data, preview: dataUrl };
}

async function bootstrap() {
  const pet = document.getElementById("pet") as HTMLImageElement;
  const petAnchor = document.getElementById("pet-anchor") as HTMLButtonElement;
  const scene = document.getElementById("scene") as HTMLElement;
  const fanMenu = document.getElementById("fan-menu") as HTMLDivElement;
  const fanSessionBtn = document.getElementById("fan-session-btn") as HTMLButtonElement;
  const fanWorkbenchBtn = document.getElementById("fan-workbench-btn") as HTMLButtonElement;
  const fanSettingsBtn = document.getElementById("fan-settings-btn") as HTMLButtonElement;
  const fanAppsBtn = document.getElementById("fan-apps-btn") as HTMLButtonElement;
  const dock = document.getElementById("dock") as HTMLDivElement;
  const sessionPanel = document.getElementById("session-panel") as HTMLDivElement;
  const sessionsList = document.getElementById("sessions-list") as HTMLDivElement;
  const newSessionBtn = document.getElementById("new-session-btn") as HTMLButtonElement;
  const replies = document.getElementById("replies") as HTMLDivElement;
  const form = document.getElementById("chat-form") as HTMLFormElement;
  const input = document.getElementById("chat-input") as HTMLInputElement;
  const petFile = document.getElementById("pet-file") as HTMLInputElement;
  const petAttachBtn = document.getElementById("pet-attach-btn") as HTMLButtonElement;
  const petAttachRow = document.getElementById("pet-attach-row") as HTMLDivElement;
  const status = document.getElementById("status") as HTMLSpanElement;
  const statusRow = document.getElementById("status-row") as HTMLDivElement;
  const sendBtn = document.getElementById("send-btn") as HTMLButtonElement;
  const pttBtn = document.getElementById("ptt-btn") as HTMLButtonElement;
  const liveBtn = document.getElementById("live-btn") as HTMLButtonElement;
  const soundBar = document.getElementById("sound-bar") as HTMLDivElement;
  const soundPlay = document.getElementById("sound-play") as HTMLButtonElement;
  const soundVol = document.getElementById("sound-vol") as HTMLInputElement;
  const hoshi = (window as Window & { hoshi?: HoshiApi }).hoshi;
  const pendingImages: Array<{ mime: string; data: string; preview: string }> = [];

  if (!hoshi) {
    status.textContent = "错误: preload 未就绪";
    return;
  }

  const config = await hoshi.getConfig();
  if (config.presentation) {
    applyPresentation(config.presentation);
  }
  const paintTheme = async (): Promise<void> => {
    if (!hoshi.getTheme) return;
    applyHoshiTheme((await hoshi.getTheme())?.tokens);
  };
  let themeAudio: HTMLAudioElement | null = null;
  const ensureThemeAudio = (): HTMLAudioElement => {
    if (!themeAudio) {
      themeAudio = new Audio();
      themeAudio.loop = false;
      themeAudio.volume = Number(soundVol.value) / 100;
      themeAudio.addEventListener("play", () => {
        soundPlay.textContent = "⏸";
      });
      themeAudio.addEventListener("pause", () => {
        soundPlay.textContent = "▶";
      });
      themeAudio.addEventListener("ended", () => {
        soundPlay.textContent = "▶";
      });
    }
    return themeAudio;
  };
  const loadThemeSound = async (): Promise<void> => {
    if (!hoshi.getThemeSound) {
      soundBar.hidden = true;
      return;
    }
    try {
      const url = await hoshi.getThemeSound();
      if (url) {
        const audio = ensureThemeAudio();
        audio.src = url;
        soundBar.hidden = false;
        soundPlay.textContent = "▶";
      } else {
        soundBar.hidden = true;
      }
    } catch {
      soundBar.hidden = true;
    }
  };
    try {
      await paintTheme();
    } catch {
      /* 主题失败不影响立绘 */
    }
    try {
      await loadThemeSound();
    } catch {
      /* 音效失败不影响立绘 */
    }
  try {
    const vol = (await hoshi.getSettings()).presentation?.soundVolume;
    if (typeof vol === "number" && Number.isFinite(vol)) {
      soundVol.value = String(Math.round(vol * 100));
      ensureThemeAudio().volume = vol;
    }
  } catch {
    /* 用默认 80 */
  }
  soundPlay.addEventListener("click", () => {
    const audio = ensureThemeAudio();
    if (!audio.src) return;
    if (audio.paused) {
      void audio.play().catch(() => undefined);
    } else {
      audio.pause();
    }
  });
  let soundVolTimer: ReturnType<typeof setTimeout> | null = null;
  soundVol.addEventListener("input", () => {
    const volume = Number(soundVol.value) / 100;
    ensureThemeAudio().volume = volume;
    if (soundVolTimer) {
      clearTimeout(soundVolTimer);
    }
    soundVolTimer = setTimeout(() => {
      soundVolTimer = null;
      void (async () => {
        try {
          const settings = await hoshi.getSettings();
          await hoshi.saveSettings({
            ...settings,
            presentation: { ...settings.presentation, soundVolume: volume }
          });
        } catch {
          /* ignore */
        }
      })();
    }, 300);
  });
  hoshi.onSettingsUpdated((next) => {
    applyPresentation(next.presentation);
    void paintTheme();
    void loadThemeSound();
    const voice = (next as { voice?: { ttsEnabled?: boolean } }).voice;
    if (voice) {
      ttsEnabled = voice.ttsEnabled !== false;
    }
    syncPetScreen(next.screen?.enabled === true);
  });
  hoshi.onThemePreview?.((tokens) => {
    if (tokens) {
      applyHoshiTheme(tokens);
    } else {
      void paintTheme();
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
  let currentIgnoreMouse: boolean | null = true;
  let lastMouseX = -1;
  let lastMouseY = -1;
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
  let screenEnabled = false;
  let screenArm: number | null = null;
  let screenTimer: number | null = null;
  let screenCaptureBusy = false;
  let screenMemory = { sessionId: "", hash: "" };
  let screenSpokenAt = 0;
  let petLimits: { intervalMs: number; cooldownMs: number } | null = null;
  let glanceBusy = false;
  let glanceEpoch = 0;
  let glanceRunId = 0;
  let glanceOwnsTts = false;
  let ttsSocketGen = 0;

  const setIgnoreMouse = (ignore: boolean): void => {
    if (currentIgnoreMouse === ignore) {
      return;
    }
    currentIgnoreMouse = ignore;
    void hoshi.setIgnoreMouseEvents(ignore);
  };
  const syncMouseIgnore = (): void => {
    currentIgnoreMouse = null;
    if (lastMouseX < 0 || lastMouseY < 0) {
      setIgnoreMouse(true);
      return;
    }
    updateMouseIgnoreByTarget(document.elementFromPoint(lastMouseX, lastMouseY));
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
    if (liveActive) {
      return;
    }
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
    dropPetGlance();
    sessionsState.activeId = sessionId;
    renderSessions();
    clearFadeTimer();
    replies.innerHTML = "";
    pendingImages.splice(0, pendingImages.length);
    paintPetAttach();
    try {
      const detail = await hoshi.listSessionMessages(sessionId);
      const lastAssistant = detail.messages
        .filter((msg) => msg.role === "assistant")
        .slice(-3);
      for (const message of lastAssistant) {
        appendStaticBubble(replies, stripVisibleEmotionMarks(message.content));
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
                  dropPetGlance();
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

  fanWorkbenchBtn.addEventListener("click", () => {
    retractFanMenu();
    closePanel();
    void hoshi.openWorkbench();
  });

  fanSettingsBtn.addEventListener("click", () => {
    retractFanMenu();
    closePanel();
    void hoshi.openSettings();
  });

  fanAppsBtn.addEventListener("click", () => {
    retractFanMenu();
    closePanel();
    void hoshi.openAppBox();
  });

  hoshi.onSettingsUpdated(() => {
    spriteCache.clear();
    void setPetEmotion(hoshi, pet, config.defaultEmotion, spriteCache);
  });

  newSessionBtn.addEventListener("click", async () => {
    try {
      const created = await hoshi.createSession("新会话");
      dropPetGlance();
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
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;
    updateMouseIgnoreByTarget(event.target);
  });
  document.addEventListener("mouseout", (event) => {
    if (event.relatedTarget) {
      return;
    }
    lastMouseX = -1;
    lastMouseY = -1;
    setIgnoreMouse(true);
  });
  hoshi.onPetMouseReset(() => {
    syncMouseIgnore();
  });
  form.addEventListener("pointerdown", () => {
    setIgnoreMouse(false);
    window.setTimeout(() => input.focus(), 0);
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
  let liveHoldMic = false;
  let liveEpoch = 0;
  let livePlayGen = 0;
  let liveQueueAt = 0;
  let liveSources: AudioBufferSourceNode[] = [];
  let liveDrainTimer: number | null = null;
  let liveDropTailUntil = 0;
  let liveTtsRate = 22050;
  let liveFlushEpoch = -1;
  let liveBargeGate = createLiveBargeGate();
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

  const clearLiveDrain = (): void => {
    if (liveDrainTimer !== null) {
      window.clearTimeout(liveDrainTimer);
      liveDrainTimer = null;
    }
  };

  const stopLivePlayback = (natural: boolean): void => {
    livePlayGen += 1;
    clearLiveDrain();
    for (const src of liveSources) {
      try {
        src.stop();
      } catch {
        // ignore
      }
    }
    liveSources = [];
    if (liveTtsCtx && liveTtsCtx.state !== "closed") {
      liveQueueAt = liveTtsCtx.currentTime;
    } else {
      liveQueueAt = 0;
    }
    if (!natural) {
      liveHoldMic = false;
    }
  };

  const scheduleLiveDrain = (playGen: number, epoch: number): void => {
    clearLiveDrain();
    const ctx = liveTtsCtx;
    if (!ctx || ctx.state === "closed") {
      return;
    }
    const remainMs = Math.max(40, (liveQueueAt - ctx.currentTime) * 1000 + 40);
    liveDrainTimer = window.setTimeout(() => {
      liveDrainTimer = null;
      if (playGen !== livePlayGen || epoch !== liveEpoch) {
        return;
      }
      liveHoldMic = false;
      if (liveVoiceWs && liveVoiceWs.readyState === WebSocket.OPEN) {
        liveVoiceWs.send(JSON.stringify({ type: "tts_end", epoch }));
      }
    }, remainMs);
  };

  const playLivePcm = (data: ArrayBuffer | Blob | Uint8Array): void => {
    const bytes =
      data instanceof Uint8Array
        ? data
        : data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : null;
    if (!bytes || bytes.byteLength < 2) {
      return;
    }
    if (!liveActive) {
      return;
    }
    const ctx = unlockTtsCtx();
    if (!ctx) {
      return;
    }
    const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const pcm = new Int16Array(copy);
    if (pcm.length === 0) {
      return;
    }
    const floats = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i += 1) {
      floats[i] = pcm[i] / 32768;
    }
    const buffer = ctx.createBuffer(1, floats.length, liveTtsRate || 22050);
    buffer.copyToChannel(floats, 0);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    const startAt = Math.max(ctx.currentTime, liveQueueAt);
    src.start(startAt);
    liveQueueAt = startAt + buffer.duration;
    liveSources.push(src);
    src.onended = () => {
      liveSources = liveSources.filter((item) => item !== src);
    };
    liveHoldMic = true;
    if (liveFlushEpoch === liveEpoch) {
      scheduleLiveDrain(livePlayGen, liveEpoch);
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
    liveHoldMic = false;
    liveDropTailUntil = 0;
    stopLivePlayback(false);
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
      if (Date.now() < liveDropTailUntil) {
        return;
      }
      const frameMs = (resampled.length / PTT_SAMPLE_RATE) * 1000;
      const tick = tickLiveBargeGate(liveBargeGate, pcmRms(resampled), frameMs, liveHoldMic);
      if (tick.barge) {
        stopLivePlayback(false);
        liveDropTailUntil = Date.now() + LIVE_BARGE_TAIL_MS;
        liveHoldMic = false;
        liveBargeGate = createLiveBargeGate();
        if (liveVoiceWs && liveVoiceWs.readyState === WebSocket.OPEN) {
          liveVoiceWs.send(JSON.stringify({ type: "barge" }));
        }
        return;
      }
      if (!tick.send) {
        return;
      }
      const pcm = floatToPcm16(resampled);
      if (liveVoiceWs && liveVoiceWs.readyState === WebSocket.OPEN) {
        liveVoiceWs.send(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength));
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
      void event.data.arrayBuffer().then((buf) => {
        playLivePcm(new Uint8Array(buf));
      });
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
      if (typeof rec.epoch === "number") {
        liveEpoch = rec.epoch;
      }
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
        liveFlushEpoch = -1;
        liveHoldMic = true;
        liveBargeGate = createLiveBargeGate();
        stopLivePlayback(false);
        liveHoldMic = true;
      }
      if (phase === "listening") {
        liveHoldMic = false;
        liveDropTailUntil = 0;
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
    if (rec.type === "tts_format" && typeof rec.sampleRate === "number" && rec.sampleRate > 0) {
      liveTtsRate = rec.sampleRate;
      return;
    }
    if (rec.type === "tts_flush") {
      if (typeof rec.epoch === "number") {
        liveEpoch = rec.epoch;
      }
      liveFlushEpoch = liveEpoch;
      liveHoldMic = true;
      scheduleLiveDrain(livePlayGen, liveEpoch);
      return;
    }
    if (rec.type === "final" && typeof rec.text === "string") {
      const spoken = rec.text.trim();
      if (spoken) {
        appendStaticBubble(replies, spoken);
      }
      return;
    }
    if (rec.type === "tts_done") {
      liveHoldMic = false;
      markTtsDone();
      return;
    }
    if (rec.type === "error") {
      status.textContent = `实时: ${String(rec.message ?? "错误")}`;
      liveHoldMic = false;
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
    dropPetGlance();
    pttSetupGen += 1;
    await stopMicGraph();
    showChatPanel();
    clearPanelIdleCloseTimer();
    liveActive = true;
    liveReconnects = 0;
    liveHoldMic = false;
    liveEpoch = 0;
    liveDropTailUntil = 0;
    liveBargeGate = createLiveBargeGate();
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
    dropPetGlance();
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

  try {
    await setPetEmotion(hoshi, pet, config.defaultEmotion, spriteCache);
  } catch {
    status.textContent = "错误: 立绘加载失败";
    dock.classList.remove("dock-hidden");
  }
  let spriteRetried = false;
  pet.onerror = () => {
    if (spriteRetried) {
      status.textContent = `错误: 立绘加载失败(${pet.alt})`;
      dock.classList.remove("dock-hidden");
      return;
    }
    spriteRetried = true;
    spriteCache.delete(config.defaultEmotion);
    window.setTimeout(() => {
      void setPetEmotion(hoshi, pet, config.defaultEmotion, spriteCache).catch(() => {
        status.textContent = "错误: 立绘加载失败";
        dock.classList.remove("dock-hidden");
      });
    }, 80);
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

  const attachTtsSocket = (): Promise<void> => {
    ttsSocketGen += 1;
    const socketGen = ttsSocketGen;
    if (pttTtsWs) {
      pttTtsWs.close();
      pttTtsWs = null;
    }
    const socket = new WebSocket(agentWs("/v1/tts"));
    socket.binaryType = "arraybuffer";
    pttTtsWs = socket;
    socket.addEventListener("message", (event) => {
      if (socketGen !== ttsSocketGen) {
        return;
      }
      if (event.data instanceof ArrayBuffer) {
        playLivePcm(new Uint8Array(event.data));
        return;
      }
      if (typeof Blob !== "undefined" && event.data instanceof Blob) {
        void event.data.arrayBuffer().then((buf) => {
          playLivePcm(new Uint8Array(buf));
        });
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
    return new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve());
      socket.addEventListener("error", () => reject(new Error("tts ws failed")));
    });
  };

  const paintPetAttach = (): void => {
    petAttachRow.hidden = pendingImages.length === 0;
    petAttachRow.replaceChildren();
    pendingImages.forEach((image, index) => {
      const wrap = document.createElement("span");
      wrap.className = "pet-thumb-wrap";
      const img = document.createElement("img");
      img.className = "pet-thumb";
      img.src = image.preview;
      img.alt = "附件";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "pet-thumb-remove";
      remove.textContent = "×";
      remove.title = "移除";
      remove.addEventListener("click", () => {
        pendingImages.splice(index, 1);
        paintPetAttach();
      });
      wrap.append(img, remove);
      petAttachRow.appendChild(wrap);
    });
  };

  const addPetFiles = async (files: FileList | File[]): Promise<void> => {
    let rejected = "";
    for (const file of Array.from(files)) {
      if (pendingImages.length >= 4) {
        rejected = "最多 4 张图片";
        break;
      }
      let read: { mime: string; data: string; preview: string } | { error: string };
      try {
        read = await readPetImage(file);
      } catch {
        rejected = "读图失败";
        continue;
      }
      if ("error" in read) {
        rejected = read.error;
        continue;
      }
      pendingImages.push(read);
    }
    paintPetAttach();
    if (rejected) {
      status.textContent = rejected;
    }
  };

  const runAssistantTurn = async (
    message: string,
    images: Array<{ mime: string; data: string }>,
    speak: boolean,
    focusInput: boolean
  ): Promise<void> => {
    const trimmed = message.trim();
    if (!trimmed && images.length === 0) {
      return;
    }
    unlockTtsCtx();
    if (liveActive) {
      await stopLive();
    }
    if (focusInput) {
      showChatPanel();
    } else {
      state.panelOpen = true;
      retractFanMenu();
      openDock(dock);
      sessionPanel.classList.add("hidden");
      setChatAreaVisible(true);
    }
    clearFadeTimer();
    clearPanelIdleCloseTimer();
    activeRunId += 1;
    const runId = activeRunId;
    typewriterState.sessionId = runId;
    typewriterState.doneReceived = false;
    typewriterState.queue = [];
    ttsAwaiting = speak;
    sendBtn.disabled = true;
    pttBtn.disabled = true;
    status.textContent = "生成中";
    let openedTts = false;
    try {
      const sessionId = await ensureSession();
      if (screenEnabled && trimmed) {
        try {
          const join = await hoshi.glanceWillJoin(sessionId, trimmed);
          if (join) {
            const shot = await hoshi.captureScreen();
            if (shot.ok) {
              await hoshi.putPetScreen({
                sessionId,
                mime: shot.mime,
                data: shot.data,
                hash: shot.hash
              });
              screenMemory = commitPetScreenUpload(screenMemory, { ok: true, sessionId, hash: shot.hash });
            }
          }
        } catch {
          /* 截不到就沿用槽里已有的画面 */
        }
      }
      if (speak) {
        openedTts = true;
        await attachTtsSocket();
      }
      await hoshi.chat({ message: trimmed, sessionId, images }, (event: AgentEvent) => {
        consumeEvent(event, {
          onSentence: ({ text, emotion }) => {
            clearFadeTimer();
            typewriterState.queue.push({ text, emotion });
            void processTypewriterQueue(runId);
            if (speak && pttTtsWs && pttTtsWs.readyState === WebSocket.OPEN) {
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
            if (speak && pttTtsWs && pttTtsWs.readyState === WebSocket.OPEN) {
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
            if (openedTts) {
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
      if (openedTts) {
        pttTtsWs?.close();
        pttTtsWs = null;
      }
    } finally {
      sendBtn.disabled = false;
      pttBtn.disabled = false;
    }
  };

  form.addEventListener("submit", async (evt) => {
    evt.preventDefault();
    dropPetGlance();
    const message = input.value.trim();
    if (!message && pendingImages.length === 0) {
      return;
    }
    const shouldSpeak =
      pttSpeakNext &&
      ((await hoshi.getSettings()) as { voice?: { ttsEnabled?: boolean } }).voice?.ttsEnabled !==
        false;
    pttSpeakNext = false;
    const images = pendingImages.map(({ mime, data }) => ({ mime, data }));
    input.value = "";
    pendingImages.splice(0, pendingImages.length);
    paintPetAttach();
    await runAssistantTurn(message, images, shouldSpeak, true);
  });

  petAttachBtn.addEventListener("click", () => {
    petFile.click();
  });
  petFile.addEventListener("change", () => {
    if (petFile.files) void addPetFiles(petFile.files);
    petFile.value = "";
  });
  input.addEventListener("paste", (event) => {
    const files = event.clipboardData?.files;
    if (files && files.length) {
      event.preventDefault();
      void addPetFiles(files);
    }
  });
  let fileDragDepth = 0;
  const draggingFiles = (event: DragEvent): boolean =>
    Boolean(event.dataTransfer?.types.includes("Files"));
  const clearFileDrag = (): void => {
    fileDragDepth = 0;
    dock.classList.remove("is-file-drop");
  };
  dock.addEventListener("dragenter", (event) => {
    if (!isChatVisible() || !draggingFiles(event)) {
      return;
    }
    event.preventDefault();
    fileDragDepth += 1;
    dock.classList.add("is-file-drop");
    setIgnoreMouse(false);
  });
  dock.addEventListener("dragover", (event) => {
    if (!isChatVisible() || !draggingFiles(event)) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
    dock.classList.add("is-file-drop");
  });
  dock.addEventListener("dragleave", (event) => {
    if (!draggingFiles(event)) {
      return;
    }
    fileDragDepth = Math.max(0, fileDragDepth - 1);
    if (fileDragDepth === 0) {
      dock.classList.remove("is-file-drop");
    }
  });
  dock.addEventListener("drop", (event) => {
    const files = event.dataTransfer?.files;
    clearFileDrag();
    if (!isChatVisible() || !files || files.length === 0) {
      return;
    }
    event.preventDefault();
    void addPetFiles(files);
  });
  window.addEventListener("dragend", () => {
    clearFileDrag();
  });

  function repairPetSprite(): void {
    if (!hoshi) {
      return;
    }
    if (pet.alt !== "pet" && pet.complete && pet.naturalWidth > 0) {
      return;
    }
    const emotion = (pet.alt && pet.alt !== "pet" ? pet.alt : config.defaultEmotion) as Emotion;
    spriteCache.delete(emotion);
    void setPetEmotion(hoshi, pet, emotion, spriteCache).catch(() => undefined);
  }

  function screenMaySetStatus(): boolean {
    return !sendBtn.disabled && !pttBusy && pttPointerId === null && !pttRecording && !pttFinishing && !liveActive;
  }

  function stopScreenLoop(): void {
    if (screenArm !== null) {
      window.clearTimeout(screenArm);
      screenArm = null;
    }
    if (screenTimer !== null) {
      window.clearInterval(screenTimer);
      screenTimer = null;
    }
  }

  function dropPetGlance(): void {
    if (!hoshi) {
      return;
    }
    glanceEpoch += 1;
    glanceBusy = false;
    hoshi.abortGlance();
    if (glanceRunId !== 0 && typewriterState.sessionId === glanceRunId) {
      activeRunId += 1;
      typewriterState.sessionId = activeRunId;
      typewriterState.queue = [];
      typewriterState.doneReceived = false;
      glanceRunId = 0;
    }
    if (glanceOwnsTts) {
      glanceOwnsTts = false;
      ttsSocketGen += 1;
      pttTtsWs?.close();
      pttTtsWs = null;
      ttsAwaiting = false;
    }
  }

  function openGlanceDock(): void {
    state.panelOpen = true;
    retractFanMenu();
    openDock(dock);
    sessionPanel.classList.add("hidden");
    setChatAreaVisible(true);
    clearFadeTimer();
    clearPanelIdleCloseTimer();
  }

  async function speakGlance(sessionId: string): Promise<void> {
    if (!hoshi) {
      return;
    }
    glanceEpoch += 1;
    const epoch = glanceEpoch;
    glanceBusy = true;
    let spoke = false;
    let runId = 0;
    const pendingSpeak: string[] = [];
    let ttsReady = false;
    let ttsOpening: Promise<void> | null = null;
    const sendSpeak = (text: string): void => {
      if (pttTtsWs && pttTtsWs.readyState === WebSocket.OPEN) {
        pttTtsWs.send(JSON.stringify({ type: "speak", text }));
      }
    };
    const ensureGlanceTts = (): Promise<void> => {
      if (!ttsEnabled) {
        return Promise.resolve();
      }
      if (!ttsOpening) {
        glanceOwnsTts = true;
        ttsAwaiting = true;
        ttsOpening = attachTtsSocket()
          .then(() => {
            if (epoch !== glanceEpoch) {
              return;
            }
            ttsReady = true;
            for (const text of pendingSpeak.splice(0, pendingSpeak.length)) {
              sendSpeak(text);
            }
          })
          .catch(() => {
            if (epoch !== glanceEpoch) {
              return;
            }
            glanceOwnsTts = false;
            ttsAwaiting = false;
          });
      }
      return ttsOpening;
    };
    try {
      await hoshi.glance(sessionId, (event) => {
        if (epoch !== glanceEpoch) {
          return;
        }
        consumeEvent(event, {
          onSentence: ({ text, emotion }) => {
            if (!spoke) {
              spoke = true;
              screenSpokenAt = notePetScreenSpoken(screenSpokenAt, true, Date.now());
              openGlanceDock();
              activeRunId += 1;
              runId = activeRunId;
              glanceRunId = runId;
              typewriterState.sessionId = runId;
              typewriterState.doneReceived = false;
              typewriterState.queue = [];
            }
            clearFadeTimer();
            typewriterState.queue.push({ text, emotion });
            void processTypewriterQueue(runId);
            if (!ttsEnabled) {
              return;
            }
            if (ttsReady) {
              sendSpeak(text);
              return;
            }
            pendingSpeak.push(text);
            void ensureGlanceTts();
          },
          onEmotion: (emotion) => {
            void setPetEmotion(hoshi, pet, emotion, spriteCache);
          },
          onDone: () => {
            if (!spoke) {
              return;
            }
            typewriterState.doneReceived = true;
            void finalizeDoneIfReady(runId);
            if (!ttsEnabled) {
              return;
            }
            void ensureGlanceTts().then(() => {
              if (epoch !== glanceEpoch || !pttTtsWs || pttTtsWs.readyState !== WebSocket.OPEN) {
                return;
              }
              pttTtsWs.send(JSON.stringify({ type: "finish" }));
            });
          },
          onError: (message) => {
            if (screenMaySetStatus()) {
              status.textContent = message;
            }
            if (glanceOwnsTts) {
              glanceOwnsTts = false;
              ttsSocketGen += 1;
              pttTtsWs?.close();
              pttTtsWs = null;
              ttsAwaiting = false;
            }
          }
        });
      });
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      if (epoch !== glanceEpoch || aborted) {
        return;
      }
      if (screenMaySetStatus()) {
        status.textContent = error instanceof Error ? error.message : "看桌面失败";
      }
    } finally {
      if (epoch === glanceEpoch) {
        glanceBusy = false;
      }
    }
  }

  async function runScreenTick(): Promise<void> {
    if (!hoshi || !screenEnabled || screenCaptureBusy) {
      return;
    }
    screenCaptureBusy = true;
    let glanceSession = "";
    let wantGlance = false;
    try {
      let shot: Awaited<ReturnType<HoshiApi["captureScreen"]>>;
      try {
        shot = await hoshi.captureScreen();
      } catch {
        shot = { ok: false, reason: "failed" };
      }
      repairPetSprite();
      const sessionId = await ensureSession();
      const limits = await hoshi.petScreenLimits();
      petLimits = limits;
      const pictureSame =
        shot.ok && screenMemory.hash !== ""
          ? await hoshi.petScreenUnchanged(screenMemory.hash, shot.hash)
          : false;
      const plan = planPetScreenTick({
        enabled: screenEnabled,
        shot,
        sessionId,
        lastSessionId: screenMemory.sessionId,
        lastHash: screenMemory.hash,
        unchanged: () => pictureSame,
        now: Date.now(),
        lastSpokenAt: screenSpokenAt,
        cooldownMs: limits.cooldownMs,
        busy: {
          live: liveActive,
          holding: pttBusy || pttFinishing || pttPointerId !== null || pttRecording !== null,
          draft: input.value.trim().length > 0,
          generating: sendBtn.disabled,
          typing: typewriterState.running || typewriterState.queue.length > 0,
          speaking: ttsAwaiting,
          glancing: glanceBusy
        }
      });
      if (shot.ok && screenMaySetStatus() && isPetScreenFailureText(status.textContent)) {
        status.textContent = "就绪";
      } else if (plan.status && screenMaySetStatus()) {
        status.textContent = plan.status;
      }
      if (plan.upload && shot.ok) {
        try {
          await hoshi.putPetScreen({
            sessionId,
            mime: shot.mime,
            data: shot.data,
            hash: shot.hash
          });
          screenMemory = commitPetScreenUpload(screenMemory, { ok: true, sessionId, hash: shot.hash });
        } catch {
          return;
        }
      }
      wantGlance = plan.glance;
      glanceSession = sessionId;
    } finally {
      screenCaptureBusy = false;
    }
    if (wantGlance && screenEnabled && !glanceBusy) {
      await speakGlance(glanceSession);
    }
  }

  function armScreenLoop(): void {
    if (!hoshi) {
      return;
    }
    stopScreenLoop();
    void hoshi.setScreenExcluded(true).then(() => {
      repairPetSprite();
    });
    screenArm = window.setTimeout(() => {
      void (async () => {
        screenArm = null;
        if (!screenEnabled || !hoshi) {
          return;
        }
        const limits = petLimits ?? (await hoshi.petScreenLimits());
        petLimits = limits;
        void runScreenTick();
        screenTimer = window.setInterval(() => {
          void runScreenTick();
        }, limits.intervalMs);
      })();
    }, 300);
  }

  function syncPetScreen(enabled: boolean): void {
    if (enabled) {
      if (screenEnabled && (screenTimer !== null || screenArm !== null)) {
        return;
      }
      screenEnabled = true;
      armScreenLoop();
      return;
    }
    screenEnabled = false;
    stopScreenLoop();
    dropPetGlance();
  }

  try {
    syncPetScreen((await hoshi.getSettings()).screen.enabled === true);
  } catch {
    syncPetScreen(false);
  }

  input.addEventListener("input", () => {
    resetPanelIdleCloseTimer();
  });
}

void bootstrap();
