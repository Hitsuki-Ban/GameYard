export function createHaptics(navigator) {
  let enabled = true;
  let disposed = false;
  return {
    setEnabled(value) {
      enabled = value === true;
    },
    play(pattern) {
      if (disposed || !enabled || !navigator.vibrate) return;
      navigator.vibrate(pattern);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (navigator.vibrate) navigator.vibrate(0);
    },
  };
}
