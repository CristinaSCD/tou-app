# Idea Pipeline

React + TypeScript + Vite app. No backend: data is seeded from `src/domain/seed.ts` and saved in the browser's localStorage.

## Run it

Requires Node.js 18+.

```bash
npm install
npm run dev      # open http://localhost:5173
```

Other commands:

- `npm test` runs the unit tests (Vitest)
- `npm run build` type-checks and builds a static site into `dist/`
- `npm run preview` serves the built `dist/` folder
