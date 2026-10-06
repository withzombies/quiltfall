# Context
Existing app embeds all assets in Rust. Old motion 240ms/330ms, all effect groups
run together, final board rendered first. Quilt nth-child(3n) creates stripes.
Effect.from/to alone cannot distinguish adult graduation from off-bed return.
Native Web Animations supports keyframe motion and cancellation. Previous docs:
https://developer.mozilla.org/en-US/docs/Web/API/Element/animate
https://developer.mozilla.org/en-US/docs/Web/API/Animation/cancel
https://developer.mozilla.org/en-US/docs/Web/API/KeyframeEffect/getKeyframes
User chose extra bouncy. Implement whole approved plan, with incremental commits.

Implementation: server Motion enum serializes place/nudge/graduate in transient
effects; saves contain GameState only. Actual native animation tests pause and
seek timelines, inspect coordinates and use native finish() to move stages.
Quilt RED: 3 colors instead of 2. Motion RED: 240ms instead of 650ms.
Graduation/edge/navigation/reduced-motion tests exercise actual snapshots/DOM.
Right-edge overflow RED in Chromium; body overflow-x:clip did not resolve it.
Scoped motion-viewport wrapper clips at the phone edge while leaving room beyond
the frame, preserving vertical pool returns. Both engines pass edge regression.
User also reported Copy link not copying. RED: it only selected text. Added
legacy native copy only when secure API is unavailable/refused, preserving full
selection and explicit blocked notice if fallback fails. Real copy-and-paste
checks pass in both engines (not just success-message tests).
References researched before implementation:
https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API/Tips
https://github.com/animate-css/animate.css/blob/main/source/bouncing_entrances/bounceIn.css
https://developer.mozilla.org/en-US/docs/Web/API/Document/execCommand
https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText
https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API

Final verification (October 6, 2026): 27 Rust tests, six Node UI tests and
28 mobile Chromium/WebKit browser tests passed. Fresh cargo build/test/fmt/Clippy
(warnings denied), npm test/lint (warnings denied)/format and Playwright pass.
Reviewed final board and mid-graduation screenshots. Intermediate native frame
assertions cover all eight exits, both kinds, simultaneous pushes, stage ordering,
node survival, graduation, duplicate responses, navigation, reduced motion and
visibility cancellation/reconnect. Headless visibility event is simulated; no
physical phone check is claimed. No new dependency or DB migration needed.
Implementation review matches the approved plan and additional copy request;
no TODO/placeholder code. Existing game saves retained on local restart.
