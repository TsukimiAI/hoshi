import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { EMOTIONS, isEmotion, type Emotion } from "@hoshi/shared";

export interface PersonaConfig {
  id: string;
  name: string;
  systemPrompt: string;
  defaultEmotion: Emotion;
  thinkingEmotion: Emotion;
  emotions: Emotion[];
  sprites: Record<Emotion, string>;
}

export function loadPersona(personaPath: string): PersonaConfig {
  const jsonPath = resolve(personaPath);
  const raw = JSON.parse(readFileSync(jsonPath, "utf8")) as {
    id: string;
    name: string;
    systemPrompt: string;
    defaultEmotion: string;
    thinkingEmotion: string;
    emotions: string[];
    sprites: Record<string, string>;
  };

  if (!isEmotion(raw.defaultEmotion)) {
    throw new Error(`Invalid defaultEmotion: ${raw.defaultEmotion}`);
  }
  if (!isEmotion(raw.thinkingEmotion)) {
    throw new Error(`Invalid thinkingEmotion: ${raw.thinkingEmotion}`);
  }

  const emotions: Emotion[] = raw.emotions.map((value) => {
    if (!isEmotion(value)) {
      throw new Error(`Invalid emotion in list: ${value}`);
    }
    return value;
  });

  if (emotions.length !== EMOTIONS.length) {
    throw new Error(`Emotion list length mismatch: ${emotions.length}`);
  }

  const sprites = {} as Record<Emotion, string>;
  const baseDir = dirname(jsonPath);
  for (const emotion of emotions) {
    const rel = raw.sprites[emotion];
    if (!rel) {
      throw new Error(`Missing sprite mapping: ${emotion}`);
    }
    const absPath = resolve(baseDir, rel);
    if (!existsSync(absPath)) {
      throw new Error(`Sprite file missing: ${emotion} -> ${absPath}`);
    }
    sprites[emotion] = absPath;
  }

  return {
    id: raw.id,
    name: raw.name,
    systemPrompt: raw.systemPrompt,
    defaultEmotion: raw.defaultEmotion,
    thinkingEmotion: raw.thinkingEmotion,
    emotions,
    sprites
  };
}
