# Cacomixtle home variants

Generated with the built-in imagegen tool on 2026-10-15. Style references were `assets/cacomixtle/reference.png` and `apps/web/public/cacomixtle-sprites.png`.

## Rock

Prompt:

> Use case: illustration-story. Asset type: transparent game asset, single low mossy rock. Create one small low rounded stone for the Wawatube cacomixtle home scene. The stone is squat and broad, viewed three-quarters from slightly above, with a muted gray-brown surface and a small patch of soft green moss along the top edge. Keep the stone simple and readable at small UI scale. Genuine transparent background; only one fully contained stone with comfortable padding; natural stylized illustrated children's-book rendering matching the cacomixtle mascot; no animal, feces, acorns, grass, dirt patch, captions, labels, watermark, or border.

Output: `apps/web/public/cacomixtle-rock.png` — 1536×1024 RGBA.

## Pooping atlas

Prompt:

> Use case: illustration-story. Asset type: transparent sprite atlas for a child-friendly game UI. Generate an exact 2048×1024 pixel transparent PNG atlas, strictly two equal square cells in one row (2 columns, 1 row), with no gap and no extra margin. Cell 1 contains a crouched ringtail cacomixtle facing right in side view. Cell 2 contains the same crouched ringtail cacomixtle in the same size and position, turning its head toward the viewer with a surprised wide-eyed expression. The long striped tail must be completely contained inside each cell with generous padding and no center-seam bleed. Match the existing natural illustrated ringtail character, pointed muzzle, warm brown fur, cream markings, and hazel eyes. Genuine transparent alpha only; soft natural stylized children's-book illustration; no visible feces or bodily waste, no scenery, rocks, grass, acorns, captions, labels, watermark, border, or extra objects.

Output: `apps/web/public/cacomixtle-pooping.png` — 1774×887 RGBA, two 887×887 square cells.

## Droppings

Prompt:

> Use case: illustration-story. Asset type: transparent small game UI asset. Use the existing mossy rock illustration only as a style reference. Create a compact ringtail cacomixtle latrine dropping pile as a standalone transparent asset: several clustered small irregular elongated lumpy droppings grouped into one low-profile compact mound, with layered organic bumpy texture and recognizable pale seeds and small fruit fragments embedded throughout. Include two distinct areas within the mound: fresh dark brown/chestnut and aged dry ochre/yellow-beige. Keep it mild and natural stylized, soft hand-painted, readable at 45–72 px wide, compact 3:2-ish or 2:1 framing, fully contained with transparent padding. No face, animal, fly, stink cloud, emoji-like coil, stone, dirt, grass, leaves, background, captions, labels, watermark, border, or vast scattered area.

Initial output: 1536×1024 RGBA. At a visible-alpha threshold of 8/255, the compact mound occupied approximately `(50,251)`–`(1486,789)`; corner alpha was zero. This variant was replaced by the clean-cutout regeneration below.

Targeted clean-cutout regeneration prompt:

> Create a clean isolated transparent illustration of a compact ringtail cacomixtle latrine dropping pile. Show several clustered small irregular elongated lumpy droppings grouped into one low-profile compact mound, with layered bumpy organic texture and recognizable pale seeds and small fruit fragments embedded throughout. Split the mound visually into a fresh dark brown/chestnut region and a separate aged dry ochre/yellow-beige region. Use mild natural stylized children's-book painting with soft warm hand-painted shading, readable at 45–72 px wide. Require genuine transparent alpha, hard clean subject isolation, no glow, halo, mist, cast shadow, dust, texture particles, stray dots, scattered crumbs, or semi-transparent atmospheric pixels outside the droppings. Avoid animal, face, fly, stink cloud, emoji coil, stone, dirt, grass, leaves, background, captions, labels, watermark, border, and vast scattered area.

Final selected output remains `apps/web/public/cacomixtle-droppings.png` — 1536×1024 RGBA; visible-alpha threshold 8/255 bbox `(14,213)`–`(1521,804)` and all four corner alpha values are zero.

