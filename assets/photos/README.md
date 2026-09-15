# Cached place photos

These previews contain resized JPEG photos (at most 720 × 560 pixels) inside static SVG image containers. Each file is self-contained, has a name derived from its source preview and contains no script or external subresources. Keeping previews on the same host avoids slow third-party image requests on phones.

The encrypted place records preserve the original image URL, source page, credit, alt text and intrinsic dimensions. The gallery links to the original photo for full-size viewing and shows the source credit below every image. Only load a selected place's gallery; do not preload every place.

When changing a preview, use a new content-derived filename and update the record's `src`, `width` and `height`. Preserve `original_src`, `source` and `credit`. Publish preview assets and the encrypted dataset in the same commit. Both travel sites use these shared assets.
