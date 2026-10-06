# Rematches with the same partner

Replace result CTA with Play again with {partner}; send persisted offer.
Sender sees Waiting for {partner} and Cancel offer; recipient sees {name} wants
another round with Play again / Not now. Controls on celebration/final quilt.
Decline/cancel restores offer button. Acceptance creates one fresh game with
same seats/colors, 8 kittens each, random starter and opens it on both phones
viewing original game. History preserves old board/result/stats. Reopening an
accepted old game shows Open next game instead of redirecting.

POST /api/games/{id}/rematch {revision,action:request|accept|decline|cancel}
returns original-game snapshot with game.rematch {requested_by:seat|null,
game_id:string|null}. SQLite migration nullable requester/next-game columns.
Finished games and members only; recipient accept/decline, sender cancel.
Acceptance transaction links exactly one child. Updates increment parent revision
and use existing SSE. Duplicate accepts reuse child, stale changes return409/current.
Simultaneous offers leave one pending offer for explicit acceptance.
Preserve mounted dance across revisions; patch only controls. Navigation closes
old stream and guards stale replies. Controls disabled pending/disconnected,
existing error notices/recovery. Pending offers persist with no expiry, no home
or push notification. No rule changes/dependencies.

RED server/browser tests for complete flow, authorization, stale/duplicates/races,
persistence, SSE, refresh/reconnect/navigation and repeat rematches. Verify both
finished views, names/320px, reduced motion/axe in Chromium/WebKit and full gates.
Commit, archive, restart existing local server preserving saves.
