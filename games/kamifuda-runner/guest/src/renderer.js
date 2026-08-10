function requireElement(document, id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Kamifuda renderer requires #${id}.`);
  return element;
}

export function createRenderer(document) {
  const canvas = requireElement(document, "gameCanvas");
  const context = canvas.getContext("2d", { alpha: false, desynchronized: true });
  if (!context) throw new Error("Kamifuda requires a Canvas 2D context.");
  let disposed = false;

  return {
    canvas,
    context,
    renderFrame({ width, height, renderTime, shake, screenShake, flash, flashColor }, drawScene) {
      if (disposed) throw new Error("Kamifuda renderer is disposed.");
      const activeShake = screenShake ? shake : 0;
      const offsetX =
        activeShake > 0
          ? Math.sin(renderTime * 61) * activeShake * 0.52 +
            Math.sin(renderTime * 37) * activeShake * 0.2
          : 0;
      const offsetY = activeShake > 0 ? Math.cos(renderTime * 53) * activeShake * 0.37 : 0;
      context.save();
      context.translate(offsetX, offsetY);
      drawScene();
      context.restore();
      if (flash > 0) {
        context.save();
        context.globalAlpha = Math.max(0, Math.min(0.5, flash));
        context.fillStyle = flashColor;
        context.fillRect(0, 0, width, height);
        context.restore();
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      canvas.width = 1;
      canvas.height = 1;
    },
  };
}
