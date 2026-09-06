// ============================================================
// POINTAGE — Multimodal Audio & Haptic Feedback Engine
// High-Frequency Synthesized Chimes via Web Audio API (100% Offline)
// ============================================================

let audioCtx: AudioContext | null = null;
let ambientFlashTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Triggers an ambient screen perimeter flash (peripheral visual confirmation)
 * Success: High-contrast emerald green vignette
 * Warning / Duplicate: Warm amber glow
 * Error / Unrecognized: High-contrast ruby red flash
 * Designed for warehouse peripheral vision confirmation without direct screen gaze.
 */
export function triggerAmbientFlash(type: 'success' | 'warning' | 'error') {
  if (typeof document === 'undefined') return;

  try {
    let el = document.getElementById('ambient-perimeter-flash');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ambient-perimeter-flash';
      el.className = 'ambient-perimeter-flash';
      el.setAttribute('aria-hidden', 'true');
      document.body.appendChild(el);
    }

    if (ambientFlashTimeout) {
      clearTimeout(ambientFlashTimeout);
      ambientFlashTimeout = null;
    }
    el.classList.remove('flash-success', 'flash-warning', 'flash-error');

    // Force DOM reflow to re-trigger animation cleanly
    void el.offsetWidth;

    el.classList.add(`flash-${type}`);

    ambientFlashTimeout = setTimeout(() => {
      if (el) {
        el.classList.remove(`flash-${type}`);
      }
      ambientFlashTimeout = null;
    }, 280);
  } catch {}
}

/**
 * Lazily initialize or resume Web Audio Context on user gesture
 */
function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx) {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        audioCtx = new AudioCtxClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
}

/**
 * Instant sensory confirmation for a successful barcode scan or count increment:
 * Crisp ascending two-tone chime (D5 587.33 Hz -> A5 880 Hz) + 12ms tactile micro-pulse + emerald perimeter flash
 */
export function playSuccessChime() {
  // 1. Ambient peripheral visual confirmation (emerald green)
  triggerAmbientFlash('success');

  // 2. Tactile haptic pulse (crisp mechanical switch feel on Samsung A54)
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate(12);
    } catch {}
  }

  // 3. Synthesized acoustic-like chime (soft attack to eliminate pops)
  if (isAudioMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;

    // First tone (D5 - 587.33 Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.linearRampToValueAtTime(0.12, now + 0.005);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.08);

    // Second harmonic chime (A5 - 880 Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.05);
    gain2.gain.setValueAtTime(0.001, now + 0.05);
    gain2.gain.linearRampToValueAtTime(0.14, now + 0.055);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.20);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.05);
    osc2.stop(now + 0.20);
  } catch {}
}

/**
 * Cautionary amber tone (370 Hz warm prompt) for duplicate/overfill warning
 * Haptic: distinct double pulse [25ms, 45ms, 25ms]
 */
export function playWarningBeep() {
  triggerAmbientFlash('warning');
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate([25, 45, 25]);
    } catch {}
  }

  if (isAudioMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(370, now);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.20);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.20);
  } catch {}
}

/**
 * Micro-tactile click for keypad taps, chip selections, and stepper adjustments
 * Specially tuned for Samsung Galaxy A54 5G linear resonant haptic motor
 */
export function hapticTap(intensity: 'light' | 'medium' | 'heavy' = 'light') {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate(intensity === 'light' ? 8 : intensity === 'medium' ? 16 : 26);
    } catch {}
  }
}

let memoryMuted = false;

/**
 * Checks whether sound effects are muted by user preference
 */
export function isAudioMuted(): boolean {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem) {
      const val = localStorage.getItem('pointage_audio_muted');
      if (val !== null) return val === 'true';
    }
  } catch {}
  return memoryMuted;
}

/**
 * Sets sound effects mute preference
 */
export function setAudioMuted(muted: boolean): void {
  memoryMuted = muted;
  try {
    if (typeof localStorage !== 'undefined' && localStorage.setItem) {
      localStorage.setItem('pointage_audio_muted', muted ? 'true' : 'false');
    }
  } catch {}
}

/**
 * Glorious major chord celebration chime (C6 -> E6 -> G6)
 * Triggered when a product line hits 100% exact target count!
 * Haptic: triumphant rhythmic sequence [12ms, 35ms, 18ms]
 */
export function playExactMatchChime() {
  triggerAmbientFlash('success');
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate([12, 35, 18]);
    } catch {}
  }

  if (isAudioMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const freqs = [1046.5, 1318.51, 1567.98]; // C6, E6, G6 major triad
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = now + idx * 0.045;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(0.13, startTime + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.32);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.32);
    });
  } catch {}
}

/**
 * Descending subtle chime (520 Hz -> 370 Hz) for undo or reset operations
 * Haptic: 14ms crisp release
 */
export function playUndoBeep() {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate(14);
    } catch {}
  }

  if (isAudioMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(370, now + 0.10);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  } catch {}
}

/**
 * Refined low dual thud alert tone (180 Hz -> 120 Hz) for unrecognized barcodes or errors
 * Haptic: crisp alert pattern [30ms, 45ms, 30ms] (replaces harsh 140ms continuous buzz)
 */
export function playErrorBeep() {
  triggerAmbientFlash('error');
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate([30, 45, 30]);
    } catch {}
  }

  if (isAudioMuted()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.18);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.22);
  } catch {}
}


