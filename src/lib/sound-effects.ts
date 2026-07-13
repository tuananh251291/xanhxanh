// Âm thanh được tổng hợp trực tiếp bằng Web Audio API (không dùng file âm thanh có sẵn/bản quyền).

let sharedContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedContext) sharedContext = new Ctor();
  if (sharedContext.state === "suspended") sharedContext.resume();
  return sharedContext;
}

function playTone(
  audioCtx: AudioContext,
  freq: number,
  startOffset: number,
  duration: number,
  gainPeak: number,
  type: OscillatorType
) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const startTime = audioCtx.currentTime + startOffset;
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(gainPeak, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.05);
}

function playNotes(notes: { freq: number; offset: number; duration: number }[], gainPeak: number, type: OscillatorType) {
  const audioCtx = getContext();
  if (!audioCtx) return;
  for (const note of notes) {
    playTone(audioCtx, note.freq, note.offset, note.duration, gainPeak, type);
  }
}

/** Nhiệm vụ phụ vừa hoàn thành — 2 nốt ngắn đi lên. */
export function playTaskCompleteSound() {
  playNotes(
    [
      { freq: 880, offset: 0, duration: 0.15 },
      { freq: 1174.66, offset: 0.08, duration: 0.18 },
    ],
    0.14,
    "sine"
  );
}

/** Mở khoá huy hiệu mới — hợp âm 4 nốt rải. */
export function playBadgeUnlockSound() {
  playNotes(
    [
      { freq: 523.25, offset: 0, duration: 0.25 },
      { freq: 659.25, offset: 0.09, duration: 0.25 },
      { freq: 783.99, offset: 0.18, duration: 0.25 },
      { freq: 1046.5, offset: 0.27, duration: 0.3 },
    ],
    0.13,
    "triangle"
  );
}

/** Lên cấp — fanfare 5 nốt. */
export function playLevelUpSound() {
  playNotes(
    [
      { freq: 523.25, offset: 0, duration: 0.3 },
      { freq: 659.25, offset: 0.07, duration: 0.3 },
      { freq: 783.99, offset: 0.14, duration: 0.3 },
      { freq: 1046.5, offset: 0.21, duration: 0.35 },
      { freq: 1318.5, offset: 0.28, duration: 0.4 },
    ],
    0.15,
    "triangle"
  );
}

/** Hoàn thành mọi nhiệm vụ trong ngày — chuỗi 6 nốt mừng lớn nhất. */
export function playPerfectDaySound() {
  playNotes(
    [
      { freq: 523.25, offset: 0, duration: 0.35 },
      { freq: 659.25, offset: 0.06, duration: 0.35 },
      { freq: 783.99, offset: 0.12, duration: 0.35 },
      { freq: 1046.5, offset: 0.18, duration: 0.35 },
      { freq: 1318.5, offset: 0.24, duration: 0.4 },
      { freq: 1568.0, offset: 0.3, duration: 0.45 },
    ],
    0.15,
    "triangle"
  );
}
