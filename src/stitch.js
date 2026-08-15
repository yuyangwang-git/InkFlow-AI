const MAX_CANVAS_DIMENSION = 32767;
const MAX_CANVAS_PIXELS = 64 * 1024 * 1024;
const MAX_PNG_DIMENSION = 0xFFFFFFFF;
const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
const TRANSPARENT_BG = 'rgba(0, 0, 0, 0)';

let crcTable = null;

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

function yieldToMainThread(delayMs = 0) {
  return new Promise(resolve => setTimeout(resolve, delayMs));
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

function normalizeBackgroundColor(color) {
  return (color && color !== TRANSPARENT_BG) ? color : '';
}

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
}

function crc32Update(crc, bytes) {
  if (!crcTable) crcTable = makeCrcTable();
  let c = crc >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    c = crcTable[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  }
  return c >>> 0;
}

function typeBytes(type) {
  return new Uint8Array([
    type.charCodeAt(0),
    type.charCodeAt(1),
    type.charCodeAt(2),
    type.charCodeAt(3)
  ]);
}

function makePngChunk(type, data = new Uint8Array(0)) {
  const payload = data instanceof Uint8Array ? data : new Uint8Array(data);
  const t = typeBytes(type);
  const chunk = new Uint8Array(12 + payload.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, payload.length, false);
  chunk.set(t, 4);
  chunk.set(payload, 8);
  let crc = crc32Update(0xFFFFFFFF, t);
  crc = crc32Update(crc, payload) ^ 0xFFFFFFFF;
  view.setUint32(8 + payload.length, crc >>> 0, false);
  return chunk;
}

function makeIhdrData(width, height) {
  const data = new Uint8Array(13);
  const view = new DataView(data.buffer);
  view.setUint32(0, width, false);
  view.setUint32(4, height, false);
  data[8] = 8; // bit depth
  data[9] = 6; // RGBA
  data[10] = 0;
  data[11] = 0;
  data[12] = 0;
  return data;
}

function makePngBlob(width, height, compressedChunks) {
  const parts = [
    PNG_SIGNATURE,
    makePngChunk('IHDR', makeIhdrData(width, height))
  ];

  for (const chunk of compressedChunks) {
    if (chunk && chunk.byteLength) parts.push(makePngChunk('IDAT', chunk));
  }

  parts.push(makePngChunk('IEND'));
  return new Blob(parts, { type: 'image/png' });
}

function assertOutputPngDimensions(width, height) {
  if (width > MAX_PNG_DIMENSION || height > MAX_PNG_DIMENSION) {
    throw new Error('PNG dimensions exceed the format limit');
  }
}

function canUseCanvasStitch(width, height) {
  return (
    width <= MAX_CANVAS_DIMENSION &&
    height <= MAX_CANVAS_DIMENSION &&
    width * height <= MAX_CANVAS_PIXELS
  );
}

async function stitchWithCanvasNoScale(blobs, sizes, width, height, backgroundColor, reportProgress) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) throw new Error('Canvas 2D unavailable');

  const bg = normalizeBackgroundColor(backgroundColor);
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
  }

  let y = 0;
  for (let i = 0; i < blobs.length; i++) {
    reportProgress(10 + Math.round((i / Math.max(1, blobs.length)) * 82), `拼接分段 ${i + 1}/${blobs.length}…`);
    let loaded = null;
    try {
      loaded = await loadDrawableFromBlob(blobs[i]);
      ctx.drawImage(loaded.drawable, 0, y, sizes[i].width, sizes[i].height);
    } finally {
      try { loaded?.dispose?.(); } catch (_) { }
    }
    y += sizes[i].height;
    await yieldToMainThread();
  }

  reportProgress(95, '生成最终 PNG…');
  const blob = await new Promise(resolve => {
    try { canvas.toBlob(resolve, 'image/png'); } catch (_) { resolve(null); }
  });
  canvas.width = 0;
  canvas.height = 0;
  if (!blob || !blob.size) throw new Error('Failed to create stitched PNG blob');
  return blob;
}

async function collectCompressedPngRows(writeRows) {
  if (typeof CompressionStream !== 'function') throw new Error('CompressionStream unavailable');

  const compressedChunks = [];
  const stream = new CompressionStream('deflate');
  const reader = stream.readable.getReader();
  const writer = stream.writable.getWriter();
  const readTask = (async () => {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value && value.byteLength) compressedChunks.push(value instanceof Uint8Array ? value : new Uint8Array(value));
    }
  })();

  try {
    await writeRows(writer);
    await writer.close();
    await readTask;
  } catch (err) {
    try { await writer.abort(err); } catch (_) { }
    throw err;
  }

  return compressedChunks;
}

async function writeImageDataToPngStream(writer, imageData, width, height, rowOffset, totalHeight, reportProgress, label) {
  const rowBytes = width * 4 + 1;
  const rowsPerChunk = Math.max(1, Math.min(64, Math.floor((1024 * 1024) / rowBytes) || 1));
  const batch = new Uint8Array(rowBytes * rowsPerChunk);
  const pixels = imageData.data;
  let row = 0;

  while (row < height) {
    const count = Math.min(rowsPerChunk, height - row);
    let cursor = 0;
    for (let i = 0; i < count; i++) {
      const srcStart = (row + i) * width * 4;
      batch[cursor] = 0;
      batch.set(pixels.subarray(srcStart, srcStart + width * 4), cursor + 1);
      cursor += rowBytes;
    }
    await writer.write(batch.slice(0, cursor));
    row += count;

    const doneRows = rowOffset + row;
    const percent = 10 + Math.round((doneRows / Math.max(1, totalHeight)) * 82);
    reportProgress(percent, label);
  }
}

async function encodeStreamingPngOnMain(blobs, sizes, width, height, backgroundColor, reportProgress) {
  if (typeof CompressionStream !== 'function') throw new Error('CompressionStream unavailable');

  const canvas = document.createElement('canvas');
  canvas.width = width;
  const bg = normalizeBackgroundColor(backgroundColor);
  let outputRows = 0;

  try {
    const compressedChunks = await collectCompressedPngRows(async writer => {
      for (let i = 0; i < blobs.length; i++) {
        const size = sizes[i];
        reportProgress(10 + Math.round((outputRows / Math.max(1, height)) * 82), `编码分段 ${i + 1}/${blobs.length}…`);

        canvas.height = size.height;
        const ctx = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
        if (!ctx) throw new Error('Canvas 2D unavailable');
        if (bg) {
          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, width, size.height);
        } else {
          ctx.clearRect(0, 0, width, size.height);
        }

        let loaded = null;
        try {
          loaded = await loadDrawableFromBlob(blobs[i]);
          ctx.drawImage(loaded.drawable, 0, 0, size.width, size.height);
        } finally {
          try { loaded?.dispose?.(); } catch (_) { }
        }

        const imageData = ctx.getImageData(0, 0, width, size.height);
        await writeImageDataToPngStream(
          writer,
          imageData,
          width,
          size.height,
          outputRows,
          height,
          reportProgress,
          `编码分段 ${i + 1}/${blobs.length}…`
        );
        outputRows += size.height;
        await yieldToMainThread();
      }
    });

    reportProgress(95, '生成最终 PNG…');
    return makePngBlob(width, height, compressedChunks);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

function createWorkerSource() {
  return `
const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
const TRANSPARENT_BG = 'rgba(0, 0, 0, 0)';
let crcTable = null;

function normalizeBackgroundColor(color) {
  return (color && color !== TRANSPARENT_BG) ? color : '';
}

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
}

function crc32Update(crc, bytes) {
  if (!crcTable) crcTable = makeCrcTable();
  let c = crc >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    c = crcTable[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  }
  return c >>> 0;
}

function typeBytes(type) {
  return new Uint8Array([
    type.charCodeAt(0),
    type.charCodeAt(1),
    type.charCodeAt(2),
    type.charCodeAt(3)
  ]);
}

function makePngChunk(type, data = new Uint8Array(0)) {
  const payload = data instanceof Uint8Array ? data : new Uint8Array(data);
  const t = typeBytes(type);
  const chunk = new Uint8Array(12 + payload.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, payload.length, false);
  chunk.set(t, 4);
  chunk.set(payload, 8);
  let crc = crc32Update(0xFFFFFFFF, t);
  crc = crc32Update(crc, payload) ^ 0xFFFFFFFF;
  view.setUint32(8 + payload.length, crc >>> 0, false);
  return chunk;
}

function makeIhdrData(width, height) {
  const data = new Uint8Array(13);
  const view = new DataView(data.buffer);
  view.setUint32(0, width, false);
  view.setUint32(4, height, false);
  data[8] = 8;
  data[9] = 6;
  data[10] = 0;
  data[11] = 0;
  data[12] = 0;
  return data;
}

function makePngBlob(width, height, compressedChunks) {
  const parts = [
    PNG_SIGNATURE,
    makePngChunk('IHDR', makeIhdrData(width, height))
  ];
  for (const chunk of compressedChunks) {
    if (chunk && chunk.byteLength) parts.push(makePngChunk('IDAT', chunk));
  }
  parts.push(makePngChunk('IEND'));
  return new Blob(parts, { type: 'image/png' });
}

async function collectCompressedPngRows(writeRows) {
  if (typeof CompressionStream !== 'function') throw new Error('CompressionStream unavailable');
  const compressedChunks = [];
  const stream = new CompressionStream('deflate');
  const reader = stream.readable.getReader();
  const writer = stream.writable.getWriter();
  const readTask = (async () => {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value && value.byteLength) compressedChunks.push(value instanceof Uint8Array ? value : new Uint8Array(value));
    }
  })();
  try {
    await writeRows(writer);
    await writer.close();
    await readTask;
  } catch (err) {
    try { await writer.abort(err); } catch (_) { }
    throw err;
  }
  return compressedChunks;
}

async function writeImageDataToPngStream(writer, imageData, width, height, rowOffset, totalHeight, label) {
  const rowBytes = width * 4 + 1;
  const rowsPerChunk = Math.max(1, Math.min(64, Math.floor((1024 * 1024) / rowBytes) || 1));
  const batch = new Uint8Array(rowBytes * rowsPerChunk);
  const pixels = imageData.data;
  let row = 0;
  while (row < height) {
    const count = Math.min(rowsPerChunk, height - row);
    let cursor = 0;
    for (let i = 0; i < count; i++) {
      const srcStart = (row + i) * width * 4;
      batch[cursor] = 0;
      batch.set(pixels.subarray(srcStart, srcStart + width * 4), cursor + 1);
      cursor += rowBytes;
    }
    await writer.write(batch.slice(0, cursor));
    row += count;
    const doneRows = rowOffset + row;
    const percent = 10 + Math.round((doneRows / Math.max(1, totalHeight)) * 82);
    self.postMessage({ type: 'progress', percent, label });
  }
}

self.onmessage = async event => {
  try {
    if (typeof OffscreenCanvas !== 'function') throw new Error('OffscreenCanvas unavailable');
    if (typeof createImageBitmap !== 'function') throw new Error('createImageBitmap unavailable');

    const { blobs, sizes, width, height, backgroundColor } = event.data || {};
    const bg = normalizeBackgroundColor(backgroundColor);
    const canvas = new OffscreenCanvas(width, 1);
    let outputRows = 0;

    const compressedChunks = await collectCompressedPngRows(async writer => {
      for (let i = 0; i < blobs.length; i++) {
        const size = sizes[i];
        self.postMessage({
          type: 'progress',
          percent: 10 + Math.round((outputRows / Math.max(1, height)) * 82),
          label: \`编码分段 \${i + 1}/\${blobs.length}…\`
        });

        canvas.height = size.height;
        const ctx = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
        if (!ctx) throw new Error('OffscreenCanvas 2D unavailable');
        if (bg) {
          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, width, size.height);
        } else {
          ctx.clearRect(0, 0, width, size.height);
        }

        const bitmap = await createImageBitmap(blobs[i]);
        try {
          ctx.drawImage(bitmap, 0, 0, size.width, size.height);
        } finally {
          try { bitmap.close(); } catch (_) { }
        }

        const imageData = ctx.getImageData(0, 0, width, size.height);
        await writeImageDataToPngStream(
          writer,
          imageData,
          width,
          size.height,
          outputRows,
          height,
          \`编码分段 \${i + 1}/\${blobs.length}…\`
        );
        outputRows += size.height;
      }
    });

    self.postMessage({ type: 'progress', percent: 95, label: '生成最终 PNG…' });
    const blob = makePngBlob(width, height, compressedChunks);
    self.postMessage({ type: 'done', blob });
  } catch (err) {
    self.postMessage({
      type: 'error',
      error: err && err.message ? err.message : String(err)
    });
  }
};
`;
}

async function encodeStreamingPngInWorker(blobs, sizes, width, height, backgroundColor, reportProgress) {
  if (typeof Worker !== 'function' || typeof URL?.createObjectURL !== 'function') {
    throw new Error('Worker unavailable');
  }

  const workerBlob = new Blob([createWorkerSource()], { type: 'text/javascript' });
  const workerUrl = URL.createObjectURL(workerBlob);
  let worker = null;

  try {
    worker = new Worker(workerUrl);
    return await new Promise((resolve, reject) => {
      worker.onmessage = event => {
        const msg = event.data || {};
        if (msg.type === 'progress') {
          reportProgress(msg.percent, msg.label);
          return;
        }
        if (msg.type === 'done') {
          resolve(msg.blob);
          return;
        }
        if (msg.type === 'error') {
          reject(new Error(msg.error || 'PNG worker failed'));
        }
      };
      worker.onerror = event => {
        reject(new Error(event?.message || 'PNG worker failed'));
      };
      worker.postMessage({ blobs, sizes, width, height, backgroundColor });
    });
  } finally {
    try { worker?.terminate?.(); } catch (_) { }
    try { URL.revokeObjectURL(workerUrl); } catch (_) { }
  }
}

export async function stitchPngBlobsVertically(blobs, backgroundColor, options = {}) {
  const reportProgress = createProgressReporter(options?.onProgress);
  reportProgress(2, '准备拼接…');
  if (!Array.isArray(blobs) || !blobs.length) throw new Error('No PNG blobs to stitch');
  if (blobs.length === 1) return {
    blob: blobs[0],
    scale: 1,
    segmentCount: 1,
    encoder: 'single'
  };

  const sizes = await Promise.all(blobs.map(readPngSize));
  reportProgress(8, '计算拼接尺寸…');
  const sourceWidth = Math.max(...sizes.map(s => s.width));
  const sourceHeight = sizes.reduce((sum, s) => sum + s.height, 0);
  if (!sourceWidth || !sourceHeight) throw new Error('Invalid stitched dimensions');
  assertOutputPngDimensions(sourceWidth, sourceHeight);

  let stitchedBlob = null;
  let encoder = 'stream';

  try {
    reportProgress(10, '启动后台 PNG 编码…');
    stitchedBlob = await encodeStreamingPngInWorker(
      blobs,
      sizes,
      sourceWidth,
      sourceHeight,
      backgroundColor,
      reportProgress
    );
    encoder = 'worker-stream';
  } catch (workerErr) {
    console.warn('[latex-copy] Worker PNG 编码不可用，切换主线程流式编码:', workerErr);
    try {
      reportProgress(10, '后台编码不可用，改用流式编码…');
      stitchedBlob = await encodeStreamingPngOnMain(
        blobs,
        sizes,
        sourceWidth,
        sourceHeight,
        backgroundColor,
        reportProgress
      );
      encoder = 'main-stream';
    } catch (streamErr) {
      if (!canUseCanvasStitch(sourceWidth, sourceHeight)) throw streamErr;
      console.warn('[latex-copy] 流式 PNG 编码不可用，回退到小图 canvas 拼接:', streamErr);
      reportProgress(10, '流式编码不可用，改用兼容拼接…');
      stitchedBlob = await stitchWithCanvasNoScale(
        blobs,
        sizes,
        sourceWidth,
        sourceHeight,
        backgroundColor,
        reportProgress
      );
      encoder = 'canvas';
    }
  }

  if (!stitchedBlob || !stitchedBlob.size) throw new Error('Failed to create stitched PNG blob');
  reportProgress(100, '拼接完成');

  return {
    blob: stitchedBlob,
    scale: 1,
    segmentCount: blobs.length,
    encoder
  };
}
