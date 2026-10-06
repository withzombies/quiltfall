# Context

Inspected web/style.css quilt/square rules and celebration floor, web/hero.svg
pattern and existing browser checkerboard test. Old board tan/sage approximated
both cat colors. Add quilt-specific CSS tokens rather than altering player colors.

Studied three primary implementations before coding: color roles/tints and
contrast examples from GOV.UK, Adobe Spectrum and Bootstrap:
- https://design-system.service.gov.uk/styles/colour/
- https://spectrum.adobe.com/foundations/color/colors
- https://getbootstrap.com/docs/5.3/customize/color/

RED: updated palette check failed with old tan/sage computed colors.
Implementation: two cooler quilt tokens, coordinated border/stitches/selection,
celebration gradient and SVG pattern. Mobile Chromium board/home screenshots
inspected: both peach and sage kittens stand apart on dusty blue; cozy style fits.

Verification: fresh cargo build/test/fmt --check/clippy --all-targets -D warnings,
npm test/lint/format:check, git diff --check passed. 27 Rust + 6 Node + 42 mobile
Chromium/WebKit scenarios = 75 passing tests. Checkerboard assertion verifies
both new colors on the rendered grid. Existing accessibility checks pass for the
home, game and celebration scenes; 320px layout and graduation controls pass.
Reviewed against scope: all quilt surfaces match; cats and rules untouched.
Local server restarted with existing SQLite saves, /health returns ok.
