const MAX_STITCH_CANVAS_DIMENSION = 32767;
const MAX_STITCH_CANVAS_AREA = 268435456; // 2^28, avoid oversized canvas OOM

function createProgressReporter(onProgress) {
  let lastPercent = -1;
  let lastLabel = '';
  return (percent, label) => {
    if (typeof onProgress !== 'function') return;
    const p = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    const l = String(label || '');
    if (p === lastPercent && l === lastLabel) return;
    lastPercent = p;
    lastLabel = l;
    try { onProgress({ percent: p, label: l }); } catch (_) { }
  };
}

async function readPngSize(blob) {
  if (!blob || typeof blob.arrayBuffer !== 'function') throw new Error('Invalid PNG blob');
  const header = await blob.slice(0, 24).arrayBuffer();
  if (header.byteLength < 24) throw new Error('PNG header too short');
  const view = new DataView(header);
  const sigOk = (
    view.getUint8(0) === 0x89 &&
    view.getUint8(1) === 0x50 &&
    view.getUint8(2) === 0x4E &&
    view.getUint8(3) === 0x47
  );
  if (!sigOk) throw new Error('Invalid PNG signature');
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  if (!width || !height) throw new Error('Invalid PNG dimensions');
  return { width, height };
}

function loadImageFromObjectUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode PNG segment'));
    img.src = url;
  });
}

async function loadDrawableFromBlob(blob) {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    return {
      drawable: bitmap,
      dispose: () => {
        try { if (typeof bitmap.close === 'function') bitmap.close(); } catch (_) { }
      }
    };
  }

  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImageFromObjectUrl(url);
    return {
      drawable: img,
      dispose: () => {
        try { URL.revokeObjectURL(url); } catch (_) { }
      }
    };
  } catch (err) {
    try { URL.revokeObjectURL(url); } catch (_) { }
    throw err;
  }
}

export async function stitchPngBlobsVertically(blobs, backgroundColor, options = {}) {
  const reportProgress = createProgressReporter(options?.onProgress);
  reportProgress(2, '准备拼接…');
  if (!Array.isArray(blobs) || !blobs.length) throw new Error('No PNG blobs to stitch');
  if (blobs.length === 1) return {
    blob: blobs[0],
    scale: 1,
    segmentCount: 1
  };

  const sizes = await Promise.all(blobs.map(readPngSize));
  reportProgress(8, '计算拼接尺寸…');
  const sourceWidth = Math.max(...sizes.map(s => s.width));
  const sourceHeight = sizes.reduce((sum, s) => sum + s.height, 0);
  if (!sourceWidth || !sourceHeight) throw new Error('Invalid stitched dimensions');

  const byW = MAX_STITCH_CANVAS_DIMENSION / sourceWidth;
  const byH = MAX_STITCH_CANVAS_DIMENSION / sourceHeight;
  const byArea = Math.sqrt(MAX_STITCH_CANVAS_AREA / (sourceWidth * sourceHeight));
  const scale = Math.min(1, byW, byH, byArea);
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('Cannot compute stitch scale');

  const outWidth = Math.max(1, Math.floor(sourceWidth * scale));
  const outHeight = Math.max(1, Math.floor(sourceHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = outWidth;
  canvas.height = outHeight;

  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) throw new Error('Canvas 2D unavailable');
  ctx.imageSmoothingEnabled = scale < 1;

  if (backgroundColor && backgroundColor !== 'rgba(0, 0, 0, 0)') {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, outWidth, outHeight);
  }

  let y = 0;
  for (let i = 0; i < blobs.length; i++) {
    reportProgress(10 + Math.round((i / Math.max(1, blobs.length)) * 82), `拼接分段 ${i + 1}/${blobs.length}…`);
    const blob = blobs[i];
    const size = sizes[i];
    let loaded = null;
    try {
      loaded = await loadDrawableFromBlob(blob);
      const drawY = Math.round(y * scale);
      const drawW = Math.max(1, Math.round(size.width * scale));
      const drawH = Math.max(1, Math.round(size.height * scale));
      ctx.drawImage(loaded.drawable, 0, drawY, drawW, drawH);
    } finally {
      try { loaded?.dispose?.(); } catch (_) { }
    }
    y += size.height;
  }

  reportProgress(95, '生成最终 PNG…');
  const stitchedBlob = await new Promise(resolve => {
    try { canvas.toBlob(resolve, 'image/png'); } catch (_) { resolve(null); }
  });
  if (!stitchedBlob || !stitchedBlob.size) throw new Error('Failed to create stitched PNG blob');
  reportProgress(100, '拼接完成');

  return {
    blob: stitchedBlob,
    scale,
    segmentCount: blobs.length
  };
}
