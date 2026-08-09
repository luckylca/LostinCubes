# v0.4.7 stability rollback

This release deliberately rolls back the v0.4.3 runtime expansion after real-browser reports of ~600 MB tab memory and severe main-thread stalls.

Runtime changes removed/disabled:
- pause-menu runtime installation and render-quality event layer
- idle/menu render-loop throttling changes
- bow charge / ballistics runtime installation
- inventory presentation runtime installation and extra static equipment DOM
- secondary CreatureVisualRuntime model/template layer

Kept:
- v0.4.2 16x8x16 section meshing for block edits
- bounded recent-chunk cache
- bounded world scheduled ticks from v0.4.5
- chunk column memoization from v0.4.6

The goal is to return to the last user-confirmed playable runtime baseline before reintroducing features one at a time with explicit memory/frame-time budgets.
