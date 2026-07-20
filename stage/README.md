# Stage assets

Vartan ships a **procedural hooded dancer** (built in code) so Stage works offline with zero downloads.

## Optional Mixamo swap

To replace with a Mixamo character later:

1. Export a humanoid from [Mixamo](https://www.mixamo.com) as GLB (same skeleton for all clips).
2. Include loops named or remapped to: `sway`, `groove`, `bounce`, `stomp`.
3. Include accents: `hit`, `jump`, `headbang`.
4. Place the file at `public/stage/dancer.glb`.
5. Set `USE_EXTERNAL_GLB = true` in `src/visuals/worlds/StageWorld.ts`.

Mixamo animations are free for personal/dev use; keep attribution in project docs.
