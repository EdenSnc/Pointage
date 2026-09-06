import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  playSuccessChime,
  playWarningBeep,
  playErrorBeep,
  playExactMatchChime,
  playUndoBeep,
  hapticTap,
  isAudioMuted,
  setAudioMuted,
} from './audio';

describe('Multimodal Audio & Haptic Feedback Engine', () => {
  let originalAudioContext: any;
  let originalVibrate: any;

  beforeEach(() => {
    originalAudioContext = (globalThis as any).AudioContext;
    originalVibrate = (globalThis.navigator as any)?.vibrate;
  });

  afterEach(() => {
    (globalThis as any).AudioContext = originalAudioContext;
    if (globalThis.navigator) {
      (globalThis.navigator as any).vibrate = originalVibrate;
    }
  });

  it('runs playSuccessChime safely in headless environment without crashing', () => {
    expect(() => playSuccessChime()).not.toThrow();
  });

  it('runs playWarningBeep safely without crashing', () => {
    expect(() => playWarningBeep()).not.toThrow();
  });

  it('runs playErrorBeep safely without crashing', () => {
    expect(() => playErrorBeep()).not.toThrow();
  });

  it('invokes navigator.vibrate when available', () => {
    const vibrateMock = vi.fn();
    Object.defineProperty(globalThis.navigator, 'vibrate', {
      value: vibrateMock,
      writable: true,
      configurable: true,
    });

    playSuccessChime();
    expect(vibrateMock).toHaveBeenCalledWith(12);

    playWarningBeep();
    expect(vibrateMock).toHaveBeenCalledWith([25, 45, 25]);

    playErrorBeep();
    expect(vibrateMock).toHaveBeenCalledWith([30, 45, 30]);
  });

  it('synthesizes Web Audio oscillator and gain nodes when AudioContext is mocked', () => {
    const setValueAtTimeMock = vi.fn();
    const exponentialRampToValueAtTimeMock = vi.fn();
    const linearRampToValueAtTimeMock = vi.fn();
    const connectMock = vi.fn();
    const startMock = vi.fn();
    const stopMock = vi.fn();

    const mockOscillator = {
      type: 'sine',
      frequency: {
        setValueAtTime: setValueAtTimeMock,
        exponentialRampToValueAtTime: exponentialRampToValueAtTimeMock,
      },
      connect: connectMock,
      start: startMock,
      stop: stopMock,
    };

    const mockGain = {
      gain: {
        setValueAtTime: setValueAtTimeMock,
        linearRampToValueAtTime: linearRampToValueAtTimeMock,
        exponentialRampToValueAtTime: exponentialRampToValueAtTimeMock,
      },
      connect: connectMock,
    };

    class MockAudioContext {
      currentTime = 0;
      state = 'running';
      destination = {};
      createOscillator = vi.fn(() => ({ ...mockOscillator }));
      createGain = vi.fn(() => ({ ...mockGain }));
      resume = vi.fn().mockResolvedValue(undefined);
    }

    (globalThis as any).AudioContext = MockAudioContext;

    expect(() => playSuccessChime()).not.toThrow();
    expect(() => playWarningBeep()).not.toThrow();
    expect(() => playErrorBeep()).not.toThrow();
    expect(() => playExactMatchChime()).not.toThrow();
    expect(() => playUndoBeep()).not.toThrow();
  });

  it('triggers hapticTap with tuned durations for Samsung A54', () => {
    const vibrateMock = vi.fn();
    Object.defineProperty(globalThis.navigator, 'vibrate', {
      value: vibrateMock,
      writable: true,
      configurable: true,
    });

    hapticTap('light');
    expect(vibrateMock).toHaveBeenCalledWith(8);

    hapticTap('medium');
    expect(vibrateMock).toHaveBeenCalledWith(16);

    hapticTap('heavy');
    expect(vibrateMock).toHaveBeenCalledWith(26);
  });

  it('manages audio mute preferences in localStorage', () => {
    setAudioMuted(true);
    expect(isAudioMuted()).toBe(true);

    setAudioMuted(false);
    expect(isAudioMuted()).toBe(false);
  });
});
