import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { PNG } from "pngjs";

const require = createRequire(import.meta.url);
const GIFEncoder = require("gif-encoder-2") as typeof import("gif-encoder-2");

const CHAR_WIDTH = 130;
const CHAR_HEIGHT = 384;
const DEFAULT_VALUE = "1.048596";
const DIGIT_CHARS = "0123456789";
const OFF_OPACITY = 0.1;

type Sprite = {
  width: number;
  height: number;
  data: Uint8Array;
};

type Options = {
  value: string;
  digits?: number;
  output: string;
  assetsDir: string;
  frames: number;
  introSeconds: number;
  holdFrames: number;
  delay: number;
  repeat: number;
  quality: number;
  scale: number;
  algorithm: "neuquant" | "octree";
};

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = Bun.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);

  const index = Bun.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;

  return Bun.argv[index + 1];
}

function readNumberArg(name: string, fallback: number): number {
  const raw = readArg(name);
  if (raw === undefined) return fallback;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`--${name} must be a number.`);
  }

  return parsed;
}

function parseOptions(): Options {
  const digits = readArg("digits");
  const explicitValue = readArg("value");
  const explicitFrames = readArg("frames");
  const numericDigits =
    digits === undefined ? undefined : readNumberArg("digits", 0);

  if (
    numericDigits !== undefined &&
    (!Number.isInteger(numericDigits) || numericDigits < 1)
  ) {
    throw new Error("--digits must be a positive integer.");
  }

  const value =
    explicitValue ??
    (numericDigits === undefined
      ? DEFAULT_VALUE
      : Array.from({ length: numericDigits }, () => randomDigit()).join(""));

  if (!/^[0-9.]+$/.test(value)) {
    throw new Error("--value can only contain digits and dots, e.g. 1.048596.");
  }

  const delay = readNumberArg("delay", 55);
  const introSeconds = readNumberArg("intro-seconds", 5);
  const holdFrames = readNumberArg("hold-frames", 24);
  const scale = readNumberArg("scale", 1);
  const algorithm = readArg("algorithm") ?? "neuquant";

  if (introSeconds < 0) {
    throw new Error("--intro-seconds must be 0 or greater.");
  }

  if (!Number.isInteger(holdFrames) || holdFrames < 0) {
    throw new Error("--hold-frames must be a whole number greater than or equal to 0.");
  }

  const frames =
    explicitFrames === undefined
      ? Math.max(1, Math.ceil((introSeconds * 1000) / delay) + holdFrames)
      : readNumberArg("frames", 0);

  if (!Number.isInteger(frames) || frames < 1) {
    throw new Error("--frames must be a positive integer.");
  }

  if (scale <= 0 || scale > 1) {
    throw new Error("--scale must be greater than 0 and less than or equal to 1.");
  }

  if (algorithm !== "neuquant" && algorithm !== "octree") {
    throw new Error('--algorithm must be either "neuquant" or "octree".');
  }

  return {
    value,
    digits: numericDigits,
    output: readArg("output") ?? "dist/divergence-meter.gif",
    assetsDir: readArg("assets") ?? "assets",
    frames,
    introSeconds,
    holdFrames,
    delay,
    repeat: readNumberArg("repeat", 1),
    quality: readNumberArg("quality", 10),
    scale,
    algorithm,
  };
}

function randomDigit(): string {
  return DIGIT_CHARS[Math.floor(Math.random() * DIGIT_CHARS.length)]!;
}

async function loadSprite(filePath: string): Promise<Sprite> {
  const bytes = await Bun.file(filePath).arrayBuffer();
  const png = PNG.sync.read(Buffer.from(bytes));

  if (png.width !== CHAR_WIDTH || png.height !== CHAR_HEIGHT) {
    throw new Error(
      `${filePath} is ${png.width}x${png.height}; expected ${CHAR_WIDTH}x${CHAR_HEIGHT}.`,
    );
  }

  return {
    width: png.width,
    height: png.height,
    data: png.data,
  };
}

async function loadSprites(assetsDir: string): Promise<Record<string, Sprite>> {
  const entries = await Promise.all(
    [...DIGIT_CHARS, "."].map(async (char) => {
      const fileName = char === "." ? "point.png" : `${char}.png`;
      return [char, await loadSprite(path.join(assetsDir, fileName))] as const;
    }),
  );

  return Object.fromEntries(entries);
}

function composeFrame(
  chars: string[],
  opacities: number[],
  sprites: Record<string, Sprite>,
  scale: number,
): Uint8ClampedArray {
  const charWidth = Math.max(1, Math.round(CHAR_WIDTH * scale));
  const charHeight = Math.max(1, Math.round(CHAR_HEIGHT * scale));
  const width = chars.length * charWidth;
  const frame = new Uint8ClampedArray(width * charHeight * 4);

  for (let i = 0; i < frame.length; i += 4) {
    frame[i] = 0;
    frame[i + 1] = 0;
    frame[i + 2] = 0;
    frame[i + 3] = 255;
  }

  for (const [charIndex, char] of chars.entries()) {
    const sprite = sprites[char];
    if (!sprite) throw new Error(`No sprite loaded for "${char}".`);
    const opacity = opacities[charIndex] ?? 1;

    if (opacity <= 0) continue;

    for (let y = 0; y < charHeight; y += 1) {
      const sourceY = Math.min(CHAR_HEIGHT - 1, Math.floor(y / scale));

      for (let x = 0; x < charWidth; x += 1) {
        const sourceX = Math.min(CHAR_WIDTH - 1, Math.floor(x / scale));
        const spriteOffset = (sourceY * CHAR_WIDTH + sourceX) * 4;
        const frameOffset = (y * width + charIndex * charWidth + x) * 4;
        const alpha = (sprite.data[spriteOffset + 3]! / 255) * opacity;

        frame[frameOffset] = Math.round(
          sprite.data[spriteOffset]! * alpha +
            frame[frameOffset]! * (1 - alpha),
        );
        frame[frameOffset + 1] = Math.round(
          sprite.data[spriteOffset + 1]! * alpha +
            frame[frameOffset + 1]! * (1 - alpha),
        );
        frame[frameOffset + 2] = Math.round(
          sprite.data[spriteOffset + 2]! * alpha +
            frame[frameOffset + 2]! * (1 - alpha),
        );
        frame[frameOffset + 3] = 255;
      }
    }
  }

  return frame;
}

function easeInCubic(value: number): number {
  return value * value * value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function seededDigit(frameIndex: number, charIndex: number): string {
  let value = (frameIndex + 1) * 374_761_393 + (charIndex + 11) * 668_265_263;
  value = (value ^ (value >>> 13)) * 1_274_126_177;
  value = value ^ (value >>> 16);

  return DIGIT_CHARS[Math.abs(value) % DIGIT_CHARS.length]!;
}

function seededUnit(seed: number): number {
  let value = seed * 374_761_393 + 668_265_263;
  value = (value ^ (value >>> 13)) * 1_274_126_177;
  value = value ^ (value >>> 16);

  return (Math.abs(value) % 10_000) / 10_000;
}

function createIntroChars(
  value: string,
  frameIndex: number,
  introFrames: number,
): string[] {
  const finalChars = [...value];
  const progress = clamp(frameIndex / Math.max(1, introFrames - 1), 0, 1);
  const slowdown = easeInCubic(clamp(progress * 1.45, 0, 1));
  const changeEveryFrames = Math.max(1, Math.round(1 + slowdown * 18));
  const scrambleFrame = Math.floor(frameIndex / changeEveryFrames);
  const settleStart = Math.floor(introFrames * 0.58);
  const settleFrames = Math.max(1, introFrames - settleStart);

  return finalChars.map((char, index) => {
    if (char === ".") return ".";
    const slotOffset = Math.floor(seededUnit(index + 41) * settleFrames * 0.38);
    const slotSettleStart = settleStart + slotOffset;
    if (frameIndex >= slotSettleStart) return char;
    return seededDigit(scrambleFrame, index);
  });
}

function createIntroOpacities(charCount: number, frameIndex: number, introFrames: number): number[] {
  return Array.from({ length: charCount }, (_, index) => {
    const stagger = Math.floor(seededUnit(index + 101) * Math.min(8, Math.max(1, introFrames * 0.12)));
    const localFrame = frameIndex - stagger;
    const firstOnFrames = 1 + Math.floor(seededUnit(index + 211) * 2);
    const offFrames = 1 + Math.floor(seededUnit(index + 307) * 2);

    if (localFrame < 0) return OFF_OPACITY;
    if (localFrame < firstOnFrames) return 1;
    if (localFrame < firstOnFrames + offFrames) return OFF_OPACITY;

    return 1;
  });
}

async function main() {
  const options = parseOptions();
  const sprites = await loadSprites(options.assetsDir);
  const chars = [...options.value];
  const width = chars.length * Math.max(1, Math.round(CHAR_WIDTH * options.scale));
  const height = Math.max(1, Math.round(CHAR_HEIGHT * options.scale));
  const introFrames = Math.min(
    options.frames,
    Math.ceil((options.introSeconds * 1000) / options.delay),
  );

  const encoder = new GIFEncoder(
    width,
    height,
    options.algorithm,
    true,
    options.frames,
  );
  encoder.setRepeat(options.repeat);
  encoder.setDelay(options.delay);
  encoder.setQuality(options.quality);
  encoder.start();

  for (let frameIndex = 0; frameIndex < options.frames; frameIndex += 1) {
    const isIntro = frameIndex < introFrames;
    const frameChars = isIntro
      ? createIntroChars(options.value, frameIndex, introFrames)
      : [...options.value];
    const opacities = isIntro
      ? createIntroOpacities(chars.length, frameIndex, introFrames)
      : chars.map(() => 1);

    encoder.addFrame(composeFrame(frameChars, opacities, sprites, options.scale));
  }

  encoder.finish();

  const outputPath = path.resolve(options.output);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await Bun.write(outputPath, encoder.out.getData());

  console.log(`Created ${outputPath}`);
  console.log(
    `Size: ${width}x${height}, frames: ${options.frames}, intro: ${introFrames} frames, final value: ${options.value}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
