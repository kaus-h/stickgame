"""Create WebP runtime copies for kits 0016 and 0017.

Requires Pillow with WebP support. Source PNGs remain the archival and visual truth.
Kit 0016 applies bounded RGB grid quantization before lossless WebP encoding; kit 0017
is encoded losslessly with exact visible RGB and alpha.
"""

from pathlib import Path

from PIL import Image, features


ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "assets" / "art"
SOURCES = [
    (ASSETS / "kit-0016" / "1x" / name, ASSETS / "kit-0016" / "runtime" / f"{Path(name).stem}.webp")
    for name in ("ledge-top.png", "ink-pool.png")
]
SOURCES.extend(
    (path, ASSETS / "kit-0017" / "runtime" / f"{path.stem}.webp")
    for path in sorted((ASSETS / "kit-0017" / "1x").glob("*.png"))
)
EXPECTED_KIT17_ASSETS = 36
KIT0016_STEPS = {"ledge-top.png": 32, "ink-pool.png": 16}
PAPER = (243, 239, 230)
MAX_COMPOSITE_ERROR = {"ledge-top.png": 4, "ink-pool.png": 8}


def quantized_rgba(source: Image.Image, step: int | None) -> bytes:
    data = bytearray(source.convert("RGBA").tobytes())
    if step is None:
        return bytes(data)
    for offset in range(0, len(data), 4):
        if data[offset + 3] == 0:
            data[offset : offset + 3] = b"\0\0\0"
            continue
        for channel in range(3):
            data[offset + channel] = min(
                255,
                ((data[offset + channel] + step // 2) // step) * step,
            )
    return bytes(data)


def verify_pixels(
    source: Image.Image,
    encoded: Image.Image,
    expected_rgba: bytes,
    max_composite_error: int | None,
) -> tuple[int, float, int, int]:
    if source.size != encoded.size:
        raise ValueError(f"Dimension mismatch: {source.size} != {encoded.size}")
    original = source.convert("RGBA").tobytes()
    actual = encoded.convert("RGBA").tobytes()
    visible = 0
    errors = []
    for offset in range(0, len(expected_rgba), 4):
        before = expected_rgba[offset : offset + 4]
        after = actual[offset : offset + 4]
        if before[3] != after[3]:
            raise ValueError(f"Alpha mismatch at pixel {offset // 4}: {before[3]} != {after[3]}")
        if before[3] > 0:
            visible += 1
            if before[:3] != after[:3]:
                raise ValueError(
                    f"Visible RGB mismatch at pixel {offset // 4}: {before[:3]} != {after[:3]}"
                )
        alpha = original[offset + 3]
        for channel in range(3):
            original_composite = (
                original[offset + channel] * alpha + PAPER[channel] * (255 - alpha) + 127
            ) // 255
            encoded_composite = (
                after[channel] * alpha + PAPER[channel] * (255 - alpha) + 127
            ) // 255
            errors.append(abs(original_composite - encoded_composite))
    errors.sort()
    p95 = errors[(95 * len(errors) + 99) // 100 - 1]
    mean = sum(errors) / len(errors)
    maximum = errors[-1]
    if max_composite_error is not None and maximum > max_composite_error:
        raise ValueError(
            f"Composited color error {maximum} exceeds {max_composite_error} "
            f"for {source.size}"
        )
    return visible, mean, p95, maximum


def main() -> None:
    if not features.check("webp"):
        raise SystemExit("Pillow must be built with WebP support")
    kit17_count = len(SOURCES) - 2
    if kit17_count != EXPECTED_KIT17_ASSETS:
        raise SystemExit(f"Expected {EXPECTED_KIT17_ASSETS} kit 0017 PNGs, found {kit17_count}")

    savings = {"kit-0016": 0, "kit-0017": 0}
    for source_path, output_path in SOURCES:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(source_path) as image:
            source = image.convert("RGBA")
            step = KIT0016_STEPS.get(source_path.name)
            expected = quantized_rgba(source, step)
            runtime_image = Image.frombytes("RGBA", source.size, expected)
            runtime_image.save(
                output_path,
                format="WEBP",
                lossless=True,
                exact=False,
                method=6,
                quality=100,
            )
        with Image.open(output_path) as decoded:
            max_error = MAX_COMPOSITE_ERROR.get(source_path.name) if step is not None else None
            visible_pixels, mean, p95, maximum = verify_pixels(
                source,
                decoded,
                expected,
                max_error,
            )
        source_bytes = source_path.stat().st_size
        output_bytes = output_path.stat().st_size
        kit = "kit-0016" if "kit-0016" in source_path.parts else "kit-0017"
        savings[kit] += source_bytes - output_bytes
        print(
            f"{source_path.name}: {source_bytes:,} -> {output_bytes:,} bytes; "
            f"saved {source_bytes - output_bytes:,}; alpha exact; "
            f"visible pixels {visible_pixels:,}; PAPER error mean/p95/max "
            f"{mean:.3f}/{p95}/{maximum}"
        )

    for kit, saved in savings.items():
        print(f"{kit} total saved: {saved:,} bytes")
    print(f"combined total saved: {sum(savings.values()):,} bytes")


if __name__ == "__main__":
    main()
