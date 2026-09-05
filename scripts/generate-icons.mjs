/**
 * Generates the PWA icon set.
 *
 * Two modes:
 *
 *   pnpm icons                  uses assets/icon-source.* if present,
 *                               otherwise draws the built in mark
 *   pnpm icons path/to/photo.jpg   uses that file
 *
 * The built in mark needs no dependency at all: the rasteriser below is a few
 * dozen lines and Node already ships zlib, which is all a PNG needs. A photo
 * source goes through sharp, which is a devDependency, so a clone that only
 * wants to build the app never pays for it.
 */

import { deflateSync } from "node:zlib";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const BACKGROUND = [79, 70, 229]; // #4f46e5, the app accent
const FOREGROUND = [255, 255, 255];

/** Fallback behind the maskable icon when the source has no obvious colour. */
const MASKABLE_BACKDROP = { r: 11, g: 13, b: 18, alpha: 1 }; // #0b0d12

/* -------------------------------------------------------------------------- */
/* PNG encoding (used by the built in mark)                                   */
/* -------------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);

  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));

  return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // truecolour with alpha
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter type "none"
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function roundedRectCoverage(x, y, rect) {
  const { left, top, right, bottom, radius } = rect;
  if (x < left || x > right || y < top || y > bottom) return false;
  if (radius <= 0) return true;

  const cx =
    x < left + radius ? left + radius : x > right - radius ? right - radius : x;
  const cy =
    y < top + radius ? top + radius : y > bottom - radius ? bottom - radius : y;

  if (cx === x && cy === y) return true;

  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

/** Three ascending bars, read as growth. */
function drawMark(size, { cornerRadius, inset }) {
  const rgba = Buffer.alloc(size * size * 4);
  const samples = 3;

  const backdrop = {
    left: 0,
    top: 0,
    right: size,
    bottom: size,
    radius: cornerRadius * size,
  };

  const content = size * (1 - inset * 2);
  const originX = size * inset;
  const baseline = originX + content * 0.82;

  const barWidth = content * 0.2;
  const gap = (content - barWidth * 3) / 2;
  const heights = [0.34, 0.56, 0.8];

  const bars = heights.map((height, index) => ({
    left: originX + index * (barWidth + gap),
    right: originX + index * (barWidth + gap) + barWidth,
    top: baseline - content * height,
    bottom: baseline,
    radius: barWidth * 0.32,
  }));

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let inBackdrop = 0;
      let inBar = 0;

      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const px = x + (sx + 0.5) / samples;
          const py = y + (sy + 0.5) / samples;

          if (roundedRectCoverage(px, py, backdrop)) inBackdrop += 1;
          if (bars.some((bar) => roundedRectCoverage(px, py, bar))) inBar += 1;
        }
      }

      const total = samples * samples;
      const alpha = inBackdrop / total;
      const barMix = inBar / total;

      const offset = (y * size + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        rgba[offset + channel] = Math.round(
          BACKGROUND[channel] * (1 - barMix) + FOREGROUND[channel] * barMix,
        );
      }
      rgba[offset + 3] = Math.round(alpha * 255);
    }
  }

  return encodePng(size, size, rgba);
}

/* -------------------------------------------------------------------------- */
/* Photo source                                                               */
/* -------------------------------------------------------------------------- */

const SOURCE_CANDIDATES = [
  "assets/icon-source.png",
  "assets/icon-source.jpg",
  "assets/icon-source.jpeg",
  "assets/icon-source.webp",
];

/**
 * The generated icons are not committed, so a deployment needs the artwork from
 * somewhere. ICON_SOURCE_URL lets a personal deploy point at its own hosted
 * image without that image ever entering the repository. A clone without it
 * simply gets the built-in mark, which is the right default for a fork.
 */
async function fetchRemoteSource(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`responded ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const path = join(ROOT, "assets", "icon-source.remote");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, buffer);
    return path;
  } catch (error) {
    // A flaky network should cost the deployment its custom icon, not the
    // whole build: fall through to the built-in mark.
    console.warn(
      `warning: could not fetch ICON_SOURCE_URL (${error.message}), falling back to the built-in mark`,
    );
    return null;
  }
}

async function findSource() {
  const fromArgs = process.argv[2];
  if (fromArgs) {
    const path = resolve(process.cwd(), fromArgs);
    if (!existsSync(path)) {
      throw new Error(`Source image not found: ${path}`);
    }
    return path;
  }

  for (const candidate of SOURCE_CANDIDATES) {
    const path = join(ROOT, candidate);
    if (existsSync(path)) return path;
  }

  if (process.env.ICON_SOURCE_URL) {
    return fetchRemoteSource(process.env.ICON_SOURCE_URL);
  }

  return null;
}

/**
 * Crops the photo to a square around whatever sharp judges to be the subject,
 * which on a portrait is the face. Landscape publicity stills put the head off
 * centre often enough that a plain centre crop cuts an ear off.
 */
async function photoIcon(sharp, source, size, { maskable = false } = {}) {
  const square = await sharp(source)
    .resize(size, size, { fit: "cover", position: sharp.strategy.attention })
    .toBuffer();

  if (!maskable) return sharp(square).png().toBuffer();

  // A maskable icon may be cropped to a circle of 80% of the canvas, so the
  // photo is inset to keep the whole face inside that circle.
  const inner = Math.round(size * 0.78);
  const innerImage = await sharp(source)
    .resize(inner, inner, { fit: "cover", position: sharp.strategy.attention })
    .toBuffer();

  // Filling with the artwork's own dominant colour makes the inset invisible:
  // the icon reads as one tile instead of a picture floating on a mat.
  const backdrop = await sharp(source)
    .stats()
    .then((stats) =>
      stats.dominant ? { ...stats.dominant, alpha: 1 } : MASKABLE_BACKDROP,
    )
    .catch(() => MASKABLE_BACKDROP);

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: backdrop,
    },
  })
    .composite([
      {
        input: innerImage,
        top: Math.round((size - inner) / 2),
        left: Math.round((size - inner) / 2),
      },
    ])
    .png()
    .toBuffer();
}

/* -------------------------------------------------------------------------- */

const TARGETS = [
  { file: "public/icons/icon-192.png", size: 192, cornerRadius: 0.22, inset: 0.2 },
  { file: "public/icons/icon-512.png", size: 512, cornerRadius: 0.22, inset: 0.2 },
  {
    file: "public/icons/icon-maskable-512.png",
    size: 512,
    cornerRadius: 0,
    inset: 0.29,
    maskable: true,
  },
  // iOS applies its own rounding and does not like transparency.
  { file: "public/icons/apple-touch-icon.png", size: 180, cornerRadius: 0, inset: 0.2 },
  { file: "src/app/icon.png", size: 64, cornerRadius: 0.22, inset: 0.16 },
];

const source = await findSource();
const sharp = source ? (await import("sharp")).default : null;

if (source) {
  console.log(`source: ${source}`);
} else {
  console.log("source: built-in mark (no assets/icon-source.* and no ICON_SOURCE_URL)");
}

for (const target of TARGETS) {
  const path = join(ROOT, target.file);
  mkdirSync(dirname(path), { recursive: true });

  const png = source
    ? await photoIcon(sharp, source, target.size, { maskable: target.maskable })
    : drawMark(target.size, target);

  writeFileSync(path, png);
  console.log(`  ${target.file} (${target.size}px)`);
}
