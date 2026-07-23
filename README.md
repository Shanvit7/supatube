<p align="center">
  <img src="apps/web/public/logo.svg" width="72" alt="Poiesis logo" />
  <h1 align="center">Poiesis</h1>
  <p align="center">
    <a href="https://github.com/Shanvit7/poiesis/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-C62C5A?style=flat-square" alt="License: MIT" /></a>
    <img src="https://img.shields.io/badge/status-early_access-C62C5A?style=flat-square" alt="Status" />
    <a href="https://aistudio.google.com/app/apikey"><img src="https://img.shields.io/badge/Gemini_API-optional-4285F4?style=flat-square&logo=google&logoColor=white" alt="Gemini optional" /></a>
  </p>
</p>

> Point it at a tutorial. It builds the project. You understand why.

Poiesis watches a YouTube coding tutorial chapter by chapter, writes the code, and explains every decision in real time — so you finish knowing not just what was built, but why.

---

## How it works

1. **Ingest** — Poiesis reads the video: chapters, stack, concepts, and prereqs.
2. **Guide** — Your AI becomes a knowledgeable companion for this specific video. It surfaces key patterns, flags outdated choices, and checks your understanding as it goes.
3. **Build** — Poiesis codes through each chapter, narrating every decision. You follow along, ask questions, and actually understand the project being made.

---

## Get started

Currently ships as a **[pi](https://pi.dev) extension**.

```bash
pi install npm:@shanvit7/poiesis
```

Optionally set a Gemini API key for richer video analysis:

```bash
export GEMINI_API_KEY=your-key-here   # optional — get one free at aistudio.google.com
```

Without a key, Poiesis falls back to YouTube transcript extraction, which works for any video that has captions.

> **Note:** The Gemini API free tier is genuinely free (no credit card), but Google uses your prompts to improve their models. For private or sensitive codebases, use the paid tier or skip the key entirely and rely on transcript extraction.

Full docs: [`apps/pi-extension/README.md`](./apps/pi-extension/README.md).

---

## Roadmap

- Claude Code plugin

---

## Contributing

See [`docs/CONTRIBUTING.md`](./docs/CONTRIBUTING.md).

---

## License

MIT
