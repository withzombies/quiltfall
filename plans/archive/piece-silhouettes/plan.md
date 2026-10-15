# Recognizable cat and kitten silhouettes

Approved direction: squat, round kittens and taller seated adult cats with a
bold collar. Preserve the cozy style and peach/sage owner colors.

Redraw web/cat.svg and web/adult.svg in their existing 100x100 view boxes.
Target about 65 units of visible kitten height and 88 units of adult height,
with paws near the current bottom baseline and padding around tails/ears.
Give kittens a broad round head, compact body, short paws and no collar.
Give adults a smaller head relative to an elongated torso, visible front legs,
a thick dark collar and enlarged gold bell. Keep existing URLs and CSS sizing.
Shared assets must work in board pieces, picker, graduation, rules and finale.
No API, rules, saved-data, dependency or deployment changes.

Acceptance:
- A failing browser test first measures visible (alpha >= 128) SVG pixels on
  equal 100x100 canvases; adult height must be at least 1.35 times kitten height.
- Seed both kinds for both owners on both quilt colors; check loaded assets,
  coordinate labels, cell fit and screenshots at 320px and 390px.
- Inspect color/grayscale boards, highlights, picker, graduation, rules and
  celebration in mobile Chromium and WebKit, including reduced motion.
- Rust build/tests/fmt/Clippy and npm tests/lint/format/browser checks pass
  without warnings; fix failures without disabling tests.
- Review the diff, archive verified task docs, and commit with a why message.

Study sources: Lichess Cburnett pawn/queen SVG implementations, Atlassian
iconography, and Carbon icon sizing/design examples (links in context.md).
