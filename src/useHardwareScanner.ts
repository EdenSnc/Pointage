// ============================================================
// POINTAGE — Hardware Bluetooth & Wedge Laser Scanner Hook
// Intercepts rapid barcode scanner keystroke bursts (<45ms/char)
// Supports global hardware keyboard shortcuts (Space, Ctrl+Z, +/-)
// ============================================================

import { useEffect, useRef } from 'react';

export interface UseHardwareScannerOptions {
  onScan: (scannedCode: string) => void;
  onSpace?: () => void;
  onUndo?: () => void;
  onIncrement?: () => void;
  onDecrement?: () => void;
  onQuickExport?: () => void;
  enabled?: boolean;
  maxInterKeyDelay?: number; // default 45ms for hardware laser bursts
  minBarcodeLength?: number; // default 3
}

export function useHardwareScanner({
  onScan,
  onSpace,
  onUndo,
  onIncrement,
  onDecrement,
  onQuickExport,
  enabled = true,
  maxInterKeyDelay = 45,
  minBarcodeLength = 3,
}: UseHardwareScannerOptions) {
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);

  // Keep latest callbacks in refs to avoid re-attaching listeners
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const onSpaceRef = useRef(onSpace);
  onSpaceRef.current = onSpace;

  const onUndoRef = useRef(onUndo);
  onUndoRef.current = onUndo;

  const onIncrementRef = useRef(onIncrement);
  onIncrementRef.current = onIncrement;

  const onDecrementRef = useRef(onDecrement);
  onDecrementRef.current = onDecrement;

  const onQuickExportRef = useRef(onQuickExport);
  onQuickExportRef.current = onQuickExport;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInputFocused =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      const now = performance.now();
      const timeSinceLastKey = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // 1. Hardware Laser Barcode Burst Detection
      if (e.key === 'Enter') {
        const buffered = bufferRef.current.trim();
        // If buffer has enough characters and was typed rapidly
        if (buffered.length >= minBarcodeLength) {
          e.preventDefault();
          e.stopPropagation();
          const code = buffered;
          bufferRef.current = '';
          onScanRef.current(code);
          return;
        }
        bufferRef.current = '';
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // If gap is too long between characters, reset buffer (it's human typing)
        if (timeSinceLastKey > maxInterKeyDelay) {
          bufferRef.current = e.key;
        } else {
          bufferRef.current += e.key;
        }
      } else if (e.key === 'Escape') {
        bufferRef.current = '';
      }

      // 2. Hardware Keyboard Accelerators (when NOT actively typing inside an input)
      if (isInputFocused) return;

      // Space: Toggle / Open Camera Scanner
      if (e.key === ' ' || e.code === 'Space') {
        if (onSpaceRef.current) {
          e.preventDefault();
          onSpaceRef.current();
        }
        return;
      }

      // Ctrl+Z or Cmd+Z: Instant Reversible Undo
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        if (onUndoRef.current) {
          e.preventDefault();
          onUndoRef.current();
        }
        return;
      }

      // Ctrl+Enter or Cmd+Enter: Quick Export / Summary
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (onQuickExportRef.current) {
          e.preventDefault();
          onQuickExportRef.current();
        }
        return;
      }

      // + or = or NumpadAdd: Quick Increment
      if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') {
        if (onIncrementRef.current) {
          e.preventDefault();
          onIncrementRef.current();
        }
        return;
      }

      // - or _ or NumpadSubtract: Quick Decrement
      if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract') {
        if (onDecrementRef.current) {
          e.preventDefault();
          onDecrementRef.current();
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [enabled, maxInterKeyDelay, minBarcodeLength]);
}
