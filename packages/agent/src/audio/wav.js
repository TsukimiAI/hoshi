"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodePcm16MonoWav = encodePcm16MonoWav;
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
