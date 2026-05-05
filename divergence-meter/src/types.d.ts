declare module "gif-encoder-2" {
  class GIFEncoder {
    constructor(
      width: number,
      height: number,
      algorithm?: "neuquant" | "octree",
      useOptimizer?: boolean,
      totalFrames?: number,
    );

    out: {
      getData(): Buffer;
    };

    start(): void;
    addFrame(input: Uint8ClampedArray | Uint8Array): void;
    finish(): void;
    setDelay(ms: number): void;
    setQuality(quality: number): void;
    setRepeat(repeat: number): void;
  }

  export = GIFEncoder;
}

declare module "pngjs" {
  class DecodedPng {
    width: number;
    height: number;
    data: Uint8Array;
  }

  export const PNG: {
    sync: {
      read(buffer: Buffer): DecodedPng;
    };
  };
}
