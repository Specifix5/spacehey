# divergence-meter

To install dependencies:

```bash
bun install
```

Create a GIF:

```bash
bun run gif
```

Useful options:

```bash
# pick an exact meter value
bun run gif -- --value 1.048596 --output dist/sg.gif

# create a meter with any number of numeric columns
bun run gif -- --digits 10 --output dist/ten-digits.gif

# u can set some settings
bun run gif -- --value 1.048596 --intro-seconds 5 --delay 45 --hold-frames 30

# smaller GIF for web/profile use
bun run gif -- --scale 0.5 --delay 80 --hold-frames 8 --algorithm octree
```

Options:

- `--value`: final text to settle on. Supports digits and `.`.
- `--digits`: generate this many random numeric columns when `--value` is not provided.
- `--output`: output GIF path. Default: `dist/divergence-meter.gif`.
- `--assets`: asset folder. Default: `assets`.
- `--frames`: total number of animation frames. Overrides the `--intro-seconds` + `--hold-frames` default.
- `--intro-seconds`: seconds spent flickering, scrambling, slowing, and settling. Default: `5`.
- `--hold-frames`: static target-number frames after the intro. Default: `24`.
- `--delay`: milliseconds per frame. Default: `55`.
- `--repeat`: GIF loop count; `1` means play once, `0` means forever. Default: `1`.
- `--quality`: encoder quality setting. Default: `10`.
- `--scale`: output scale from `0` to `1`. Use `0.5` for `520x192`. Default: `1`.
- `--algorithm`: GIF quantizer, either `neuquant` or `octree`. `octree` can be smaller. Default: `neuquant`.

Each character asset is expected to be `130x384`. Digit assets are loaded from `0.png` through `9.png`, and the decimal point is loaded from `point.png`.
