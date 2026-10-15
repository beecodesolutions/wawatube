# Root-covered farewell cave

Generated 2026-10-15 with the built-in ImageGen tool. Final asset:
`apps/web/public/cacomixtle-cave-roots.png` (1536 × 1024, RGBA).

## References and provenance

- User-supplied local photographs: `/tmp/codex-clipboard-466c15af-fcab-4c02-b8bb-fda8e572c10d.png` and `/tmp/codex-clipboard-89676601-3d80-4e2c-af66-43bf19aeb512.png`. Used only for porous gray stone, intertwined roots, vines and small green plants. People were excluded.
- Existing `cacomixtle-cave-dark.png` and `cacomixtle-forest.png`: painting style, central entrance and low/wide framing references.
- Generated source retained at `/home/faloi/.codex/generated_images/01a140b4-1117-7912-842c-b2fbb0a89d1b/exec-3adb4ad4-985d-4320-b6c7-97b482763b89.png`. Copied without pixel or alpha modifications.

## Prompt

Use case: illustration-story. Create one transparent PNG game scene asset, landscape 1536x1024, for a preschool child's farewell screen. Inputs 1 and 2 are ONLY natural-material references: dark gray porous volcanic stone, massive intertwined gray-brown tree roots wrapping rock, thin hanging vines and small fresh green leaves. Ignore ALL people in reference photographs; no people or animals in output. Inputs 3 and 4 are ONLY style and framing references: softly painted storybook illustration, warm gentle natural shading, believable hand-painted texture, wide low isolated scene. Reimagine input 3 cave with the stone/root character of photos 1 and 2. Large inviting very dark central cave opening, organic arch framed by interwoven thick roots and irregular porous charcoal-gray rocks; sparse small green climbing plants and tiny ferns. Cozy rather than frightening, subtle warm brown ground at entrance, dark opaque interior so a small mascot can disappear into it. Keep entrance unobstructed centrally, centered around x=50%, arch top around y=38%, ground around y=79%; opening spans approximately x=34% to 66%. Side roots and boulders overlap entrance edges to provide foreground occlusion. Entire scene wide low mound roughly x=5%..95%, y=20%..83%, fully visible with generous transparent margin. True transparent background outside silhouette, no scenery backdrop, no sky, no rectangular background, no glow or haze around silhouette. Interior cave is dark paint, NOT transparent. No text, no people, no animals, no mushrooms, no door or furnishings. Match gentle painterly children's illustration of input 3, not photorealism.

## Verification and integration geometry

Visual inspection confirms centered dark entrance, porous stone, intertwined roots, small plants, soft painted texture and no people/text/animals. Actual painted mound is approximately x=12–1524, y=130–887; opening is approximately x=560–1060, y=375–815. Central dark interior around (768, 550) has RGBA (8, 3, 4, 251).

Pillow confirms RGBA, alpha range 0–254 and 739,949 fully transparent pixels (47.0%). Corner alpha values (top-left, top-right, bottom-left, bottom-right) are 0, 0, 1, 0. Soft semitransparent colored edge haze is present, consistent with supplied style assets; the outer alpha bounding box spans the canvas. Alpha was preserved exactly.

For animation, use center near (800, 650) as the deep entrance target. Thick roots at x≈500–620 and x≈1000–1150 plus base boulders provide visible side occlusion. This is a single flattened image: rendering a mascot above it does not automatically occlude the mascot. Reuse the integration's existing foreground mask/layer approach, or create a separately masked foreground from this exact asset if true root overlap is needed. No separate foreground layer generated; no code changed or browser integration checked.
