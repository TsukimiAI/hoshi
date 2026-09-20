"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadPersona = loadPersona;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const shared_1 = require("@hoshi/shared");
function loadPersona(personaPath) {
    const jsonPath = (0, node_path_1.resolve)(personaPath);
    const raw = JSON.parse((0, node_fs_1.readFileSync)(jsonPath, "utf8"));
    if (!(0, shared_1.isEmotion)(raw.defaultEmotion)) {
        throw new Error(`Invalid defaultEmotion: ${raw.defaultEmotion}`);
    }
    if (!(0, shared_1.isEmotion)(raw.thinkingEmotion)) {
        throw new Error(`Invalid thinkingEmotion: ${raw.thinkingEmotion}`);
    }
    const emotions = raw.emotions.map((value) => {
        if (!(0, shared_1.isEmotion)(value)) {
            throw new Error(`Invalid emotion in list: ${value}`);
        }
        return value;
    });
    if (emotions.length !== shared_1.EMOTIONS.length) {
        throw new Error(`Emotion list length mismatch: ${emotions.length}`);
    }
    const sprites = {};
    const baseDir = (0, node_path_1.dirname)(jsonPath);
    for (const emotion of emotions) {
        const rel = raw.sprites[emotion];
        if (!rel) {
            throw new Error(`Missing sprite mapping: ${emotion}`);
        }
        const absPath = (0, node_path_1.resolve)(baseDir, rel);
        if (!(0, node_fs_1.existsSync)(absPath)) {
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
