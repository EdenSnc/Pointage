import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { playSuccessChime, playWarningBeep, playErrorBeep } from './audio';

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
    expect(vibrateMock).toHaveBeenCalledWith(55);

    playWarningBeep();
    expect(vibrateMock).toHaveBeenCalledWith([70, 50, 70]);

    playErrorBeep();
    expect(vibrateMock).toHaveBeenCalledWith(140);
  });

  it('synthesizes Web Audio oscillator and gain nodes when AudioContext is mocked', () => {
    const setValueAtTimeMock = vi.fn();
    const exponentialRampToValueAtTimeMock = vi.fn();
    const connectMock = vi.fn();
    const startMock = vi.fn();
    const stopMock = vi.fn();

    const mockOscillator = {
      type: 'sine',
      frequency: { setValueAtTime: setValueAtTimeMock },
      connect: connectMock,
      start: startMock,
      stop: stopMock,
    };

    const mockGain = {
      gain: {
        setValueAtTime: setValueAtTimeMock,
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
  });
});
