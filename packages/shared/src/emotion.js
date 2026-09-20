"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMOTIONS = void 0;
exports.isEmotion = isEmotion;
exports.EMOTIONS = [
    "normal",
    "happy",
    "very-happy",
    "like",
    "very-like",
    "sad",
    "angry",
    "shy",
    "shy-and-indignation",
    "shock",
    "doubt",
    "confused",
    "expect",
    "wry",
    "disdain",
    "resist",
    "resentment",
    "yandere"
];
const EMOTION_SET = new Set(exports.EMOTIONS);
function isEmotion(value) {
    return EMOTION_SET.has(value);
}
