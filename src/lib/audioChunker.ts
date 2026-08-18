export const CHUNK_SECONDS = 300; // 每段 5 分鐘，確保遠低於 Whisper API 25MB 上傳限制
export const TARGET_SAMPLE_RATE = 16000; // Whisper 內部會重新取樣，16kHz mono 已足夠且檔案小

export interface AudioChunk {
  blob: Blob;
  offsetSeconds: number;
}

async function decodeAudioFile(file: File): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer();
  const AudioContextClass =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioContextClass();
  try {
    return await audioCtx.decodeAudioData(arrayBuffer);
  } finally {
    await audioCtx.close();
  }
}

async function resampleToMono(buffer: AudioBuffer, targetSampleRate: number): Promise<Float32Array> {
  const targetLength = Math.ceil(buffer.duration * targetSampleRate);
  const offlineCtx = new OfflineAudioContext(1, targetLength, targetSampleRate);
  const source = offlineCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(offlineCtx.destination);
  source.start();
  const rendered = await offlineCtx.startRendering();
  return rendered.getChannelData(0);
}

function floatTo16BitPCM(view: DataView, offset: number, input: Float32Array) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
}

function encodeWavPCM16(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * bytesPerSample, true);
  floatTo16BitPCM(view, 44, samples);

  return new Blob([view], { type: "audio/wav" });
}

/** 解碼音檔、降到 16kHz mono，並切成約 5 分鐘一段的 WAV blob（含在原始音檔中的起始秒數）。*/
export async function decodeAndChunkAudio(file: File): Promise<AudioChunk[]> {
  const audioBuffer = await decodeAudioFile(file);
  const mono = await resampleToMono(audioBuffer, TARGET_SAMPLE_RATE);

  const chunkSamples = CHUNK_SECONDS * TARGET_SAMPLE_RATE;
  const chunks: AudioChunk[] = [];
  for (let start = 0; start < mono.length; start += chunkSamples) {
    const slice = mono.subarray(start, Math.min(start + chunkSamples, mono.length));
    chunks.push({
      blob: encodeWavPCM16(slice, TARGET_SAMPLE_RATE),
      offsetSeconds: start / TARGET_SAMPLE_RATE,
    });
  }
  return chunks;
}
