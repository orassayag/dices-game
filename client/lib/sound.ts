const WIN_CHIME_NOTES_HZ: number[] = [523.25, 659.25, 783.99, 1046.5];
const WIN_CHIME_NOTE_DURATION_SECONDS: number = 0.18;
const WIN_CHIME_NOTE_GAP_SECONDS: number = 0.12;
const WIN_CHIME_PEAK_GAIN: number = 0.15;
const WIN_CHIME_ATTACK_SECONDS: number = 0.02;
// Silence floor for the exponential decay ramp — exponentialRampToValueAtTime rejects 0.
const WIN_CHIME_DECAY_FLOOR: number = 0.0001;

// Safari (including recent versions) only exposes the constructor under this prefixed
// name; there's no standard type for it, so this is a narrow, documented DOM interop cast
// rather than a validated-boundary one.
interface WindowWithWebkitAudioContext extends Window {
  webkitAudioContext?: typeof AudioContext;
}

// No-ops silently where AudioContext is unavailable, since a missing win sound must
// never break the win flow itself.
export function playWinSound(): void {
  const AudioContextClass: typeof AudioContext | undefined =
    window.AudioContext ?? (window as WindowWithWebkitAudioContext).webkitAudioContext;
  if (!AudioContextClass) {
    return;
  }

  const context = new AudioContextClass();
  WIN_CHIME_NOTES_HZ.forEach((frequencyHz, index) => {
    const startTime: number = context.currentTime + index * WIN_CHIME_NOTE_GAP_SECONDS;
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(frequencyHz, startTime);
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(
      WIN_CHIME_PEAK_GAIN,
      startTime + WIN_CHIME_ATTACK_SECONDS,
    );
    gainNode.gain.exponentialRampToValueAtTime(
      WIN_CHIME_DECAY_FLOOR,
      startTime + WIN_CHIME_NOTE_DURATION_SECONDS,
    );
    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + WIN_CHIME_NOTE_DURATION_SECONDS);
  });

  const totalDurationMs: number =
    (WIN_CHIME_NOTES_HZ.length * WIN_CHIME_NOTE_GAP_SECONDS + WIN_CHIME_NOTE_DURATION_SECONDS) *
    1000;
  window.setTimeout(() => {
    void context.close();
  }, totalDurationMs);
}
