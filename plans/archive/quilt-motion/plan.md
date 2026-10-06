# Balanced quilt and extra-bouncy cats
Approved: cream/sage checkerboard; extra-bouncy movement, ordinary moves ~1.4s.
Use existing Web Animations API and CSS libraries. Keep previous board piece
nodes mounted through placement (650ms), simultaneous nudges (750ms), then
optional graduation (600ms). Off-bed motion follows push vector, rotating/falling
beyond frame before fading. Graduation shows adult appearance and pool return.
Add motion=place/nudge/graduate to Rust effects; no saved-state migration.
Disable controls during animation. Duplicate responses must not interrupt it.
Navigation/page hiding cancels safely. Reduced motion/reconnect/refresh/skipped
revisions show final state immediately. No new animation dependency.
Acceptance: failing tests first; inspect intermediate positions, colors, bounce,
every edge/diagonal, graduation, cancellation, duplicate responses and reduced
motion in Chromium/WebKit. Run compile/test/fmt/lint gates and restart local app.

Additional user request: Copy invite link must actually copy on local HTTP.
Use secure Clipboard API first, native legacy copy fallback if unavailable or
refused, explicit blocked notice with full selection if neither succeeds.
Verify copying by pasting the actual clipboard contents in both engines.
