# Illustrated vLLM

Interactive, visual walk-throughs of how [vLLM](https://github.com/vllm-project/vllm) serves large language models.

Live: https://almogtavor.github.io/illustrated-vllm/

## Routes

- `/` — landing page
- `/vllm` — tour: paged attention, continuous batching, prefix caching, speculative decoding, chunked prefill, tensor parallelism, disaggregated P/D
- `/pic` — long-form deep dive into vLLM V1's spans / Legolink KV-cache work

## Stack

Plain HTML, CSS, and vanilla JS. No build step. Each page is a single `index.html` plus a `style.css` and `main.js`. SVG diagrams are drawn imperatively from JS.

## Local dev

Open `index.html` in a browser, or serve the directory:

```sh
python3 -m http.server 8080
# then visit http://localhost:8080/
```

## Deploy

Deployed to GitHub Pages by `.github/workflows/pages.yml` on every push to `main`. Pages must be set to "GitHub Actions" as the source in repo Settings → Pages.

## Inspiration

Visual style modeled on [poloclub/transformer-explainer](https://poloclub.github.io/transformer-explainer/).
