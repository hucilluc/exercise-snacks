# Body Bright

A gentle daily movement app built around exercise snacks and the Body Bright
figure.

Each day offers six small movement suggestions — one per domain (cardio &
circulation, strength, core & posture, balance & stability, mobility &
recovery, rehab) — arranged as a practical sequence through the day. Marking
them Done or Tried brightens the matching zone of the Body Bright figure
across the week. No streaks, no scores, no accounts: a dimmer week is not a
failure.

Local-first: all data lives in the browser's localStorage as a single
portable profile capsule designed for export, LLM-assisted review, and
re-import.

## Development

```sh
npm install
npm run dev      # local dev server
npm run build    # production build (deployed via Netlify)
npm run lint
```

Exercise illustrations are generated from
`scripts/generate-illustrations.mjs` into `public/images/`, one transparent
PNG per exercise id. Any image can be replaced by a same-named file without
code changes. To regenerate:

```sh
npm i --no-save sharp
node scripts/generate-illustrations.mjs
```

Note: the GitHub repository keeps its original name (`exercise-snacks`)
because the Netlify deployment is linked to it.
