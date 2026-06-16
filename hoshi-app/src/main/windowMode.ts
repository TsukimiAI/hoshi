import { app, BrowserWindow, ipcMain, screen } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { readAppPreferences } from './appPreferences'
import type { ShellMode } from '../shared/desktop'

const PET_WIDTH = 380
const PET_HEIGHT = 380
const WORKSTATION_MIN_WIDTH = 960
const WORKSTATION_MIN_HEIGHT = 640
const WORKSTATION_DEFAULT_WIDTH = 1280
const WORKSTATION_DEFAULT_HEIGHT = 800

interface PersistedWindowState {
  mode: ShellMode
  workstationBounds?: Electron.Rectangle
  workstationMaximized?: boolean
  petBounds?: Electron.Rectangle
  alwaysOnTop?: boolean
}

let mainWindow: BrowserWindow | null = null
let currentMode: ShellMode = 'workstation'

function stateFilePath(): string {
  return join(app.getPath('userData'), 'window-state.json')
}

function readState(): PersistedWindowState {
  try {
    const path = stateFilePath()
    if (!existsSync(path)) {
      return { mode: 'workstation', alwaysOnTop: true }
    }
    return JSON.parse(readFileSync(path, 'utf-8')) as PersistedWindowState
  } catch {
    return { mode: 'workstation', alwaysOnTop: true }
  }
}

function writeState(state: PersistedWindowState): void {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(stateFilePath(), JSON.stringify(state, null, 2), 'utf-8')
}

function defaultPetBounds(ignoreSaved = false): Electron.Rectangle {
  if (!ignoreSaved) {
    const saved = readState().petBounds
    if (saved) {
      return saved
    }
  }
  const { workArea } = screen.getPrimaryDisplay()
  return {
    x: workArea.x + workArea.width - PET_WIDTH - 24,
    y: workArea.y + workArea.height - PET_HEIGHT - 24,
    width: PET_WIDTH,
    height: PET_HEIGHT
  }
}

function defaultWorkstationBounds(): Electron.Rectangle {
  const saved = readState().workstationBounds
  if (saved) {
    return saved
  }
  const { workArea } = screen.getPrimaryDisplay()
  return {
    x: workArea.x + Math.max(0, Math.floor((workArea.width - WORKSTATION_DEFAULT_WIDTH) / 2)),
    y: workArea.y + Math.max(0, Math.floor((workArea.height - WORKSTATION_DEFAULT_HEIGHT) / 2)),
    width: WORKSTATION_DEFAULT_WIDTH,
    height: WORKSTATION_DEFAULT_HEIGHT
  }
}

function applyMacWindowChrome(mode: ShellMode): void {
  if (process.platform !== 'darwin' || !mainWindow) {
    return
  }
  mainWindow.setWindowButtonVisibility(mode === 'workstation')
}

function applyPetMode(): void {
  if (!mainWindow) {
    return
  }

  const state = readState()
  if (currentMode === 'workstation') {
    state.workstationBounds = mainWindow.getBounds()
    state.workstationMaximized = mainWindow.isMaximized()
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    }
  }

  const petBounds = defaultPetBounds()
  mainWindow.setResizable(false)
  mainWindow.setMinimumSize(PET_WIDTH, PET_HEIGHT)
  mainWindow.setMaximumSize(PET_WIDTH, PET_HEIGHT)
  mainWindow.setAlwaysOnTop(state.alwaysOnTop !== false)
  mainWindow.setHasShadow(false)
  mainWindow.setIgnoreMouseEvents(true, { forward: true })
  mainWindow.setBounds(petBounds)
  applyMacWindowChrome('pet')

  currentMode = 'pet'
  state.mode = 'pet'
  state.petBounds = petBounds
  writeState(state)
}

function applyWorkstationMode(): void {
  if (!mainWindow) {
    return
  }

  const state = readState()
  if (currentMode === 'pet') {
    state.petBounds = mainWindow.getBounds()
  }

  mainWindow.setAlwaysOnTop(false)
  mainWindow.setHasShadow(true)
  mainWindow.setIgnoreMouseEvents(false)
  mainWindow.setResizable(true)
  mainWindow.setMinimumSize(WORKSTATION_MIN_WIDTH, WORKSTATION_MIN_HEIGHT)
  mainWindow.setMaximumSize(0, 0)

  const bounds = state.workstationBounds ?? defaultWorkstationBounds()
  mainWindow.setBounds(bounds)
  if (state.workstationMaximized) {
    mainWindow.maximize()
  }
  applyMacWindowChrome('workstation')

  currentMode = 'workstation'
  state.mode = 'workstation'
  state.workstationBounds = mainWindow.getBounds()
  writeState(state)
}

function setMode(mode: ShellMode): ShellMode {
  if (mode === 'pet') {
    applyPetMode()
  } else {
    applyWorkstationMode()
  }
  return currentMode
}

export function syncAlwaysOnTopFromPreferences(value: boolean): void {
  const state = readState()
  state.alwaysOnTop = value
  writeState(state)
  if (mainWindow && currentMode === 'pet') {
    mainWindow.setAlwaysOnTop(value)
  }
}

export function registerWindowModeHandlers(window: BrowserWindow): void {
  mainWindow = window
  currentMode = readState().mode === 'pet' ? 'pet' : 'workstation'

  window.on('moved', () => {
    if (!mainWindow) {
      return
    }
    const state = readState()
    const bounds = mainWindow.getBounds()
    if (currentMode === 'pet') {
      state.petBounds = bounds
    } else {
      state.workstationBounds = bounds
    }
    writeState(state)
  })

  ipcMain.handle('hoshi:window:getMode', () => currentMode)

  ipcMain.handle('hoshi:window:setMode', (_event, mode: ShellMode) => {
    if (mode !== 'workstation' && mode !== 'pet') {
      throw new Error('Invalid shell mode')
    }
    return setMode(mode)
  })

  ipcMain.handle('hoshi:window:getBounds', () => {
    if (!mainWindow) {
      return null
    }
    return mainWindow.getBounds()
  })

  ipcMain.handle('hoshi:window:setBounds', (_event, bounds: Electron.Rectangle) => {
    if (!mainWindow) {
      return null
    }
    mainWindow.setBounds(bounds)
    const state = readState()
    if (currentMode === 'pet') {
      state.petBounds = bounds
    } else {
      state.workstationBounds = bounds
    }
    writeState(state)
    return mainWindow.getBounds()
  })

  ipcMain.handle('hoshi:window:getAlwaysOnTop', () => {
    if (!mainWindow) {
      return false
    }
    return mainWindow.isAlwaysOnTop()
  })

  ipcMain.handle('hoshi:window:setAlwaysOnTop', (_event, value: boolean) => {
    if (!mainWindow) {
      return false
    }
    const state = readState()
    state.alwaysOnTop = value
    writeState(state)
    if (currentMode === 'pet') {
      mainWindow.setAlwaysOnTop(value)
    }
    return mainWindow.isAlwaysOnTop()
  })

  ipcMain.handle('hoshi:window:setIgnoreMouseEvents', (_event, ignore: boolean) => {
    if (!mainWindow || currentMode !== 'pet') {
      return
    }
    if (ignore) {
      mainWindow.setIgnoreMouseEvents(true, { forward: true })
    } else {
      mainWindow.setIgnoreMouseEvents(false)
    }
  })

  ipcMain.handle('hoshi:window:resetPetBounds', () => {
    const bounds = defaultPetBounds(true)
    const state = readState()
    state.petBounds = bounds
    writeState(state)
    if (mainWindow && currentMode === 'pet') {
      mainWindow.setBounds(bounds)
    }
    return bounds
  })
}

export function initializeWindowMode(window: BrowserWindow): void {
  mainWindow = window
  const prefs = readAppPreferences()
  const savedMode = readState().mode === 'pet' ? 'pet' : 'workstation'
  const mode: ShellMode =
    prefs.startupMode === 'pet' ? 'pet' : prefs.startupMode === 'last' ? savedMode : 'workstation'

  if (mode === 'pet') {
    applyPetMode()
  } else {
    applyWorkstationMode()
  }
}
