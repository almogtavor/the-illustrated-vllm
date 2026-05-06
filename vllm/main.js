// =============================================================
// The vLLM tour - interactive illustrations for the four core ideas:
//   1. paged attention
//   2. continuous batching
//   3. prefix caching
//   4. speculative decoding
// Vanilla DOM + SVG, no build step.
// =============================================================

const SVG_NS = "http://www.w3.org/2000/svg";
const BLOCK_SIZE = 16;

function el(tag, attrs = {}, parent = null) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

function svgRoot(parent, vbW, vbH) {
  parent.innerHTML = "";
  const svg = el("svg", {
    viewBox: `0 0 ${vbW} ${vbH}`,
    preserveAspectRatio: "xMidYMid meet",
  }, parent);
  const defs = el("defs", {}, svg);
  const mk = (id, color) => {
    const m = el("marker", {
      id, viewBox: "0 0 10 10",
      refX: 9, refY: 5,
      markerWidth: 7, markerHeight: 7,
      orient: "auto-start-reverse",
    }, defs);
    el("path", { d: "M0,0 L10,5 L0,10 z", fill: color }, m);
  };
  mk("arrow-blue", "var(--hash-a)");
  mk("arrow-soft", "var(--ink-soft)");
  return svg;
}

function txt(svg, x, y, text, klass = "lbl") {
  const t = el("text", { x, y, class: klass }, svg);
  t.textContent = text;
  return t;
}

function setState(id, lines) {
  const node = document.getElementById(id);
  if (!node) return;
  node.textContent = lines.join("\n");
}

// =============================================================
// 1 · PAGED ATTENTION
// Show: a sequence growing token-by-token; each block of 16 tokens
// pulls a physical block from the free pool; the block table maps
// logical block index -> physical block id.
// =============================================================
(function pagedAttention() {
  const container = document.getElementById("viz-paged");
  const slider = document.getElementById("paged-len");
  const lenLabel = document.getElementById("paged-len-label");
  if (!container || !slider) return;

  const TOTAL_PHYSICAL = 12;
  // assignment of logical block -> physical block id (deterministic, scrambled)
  const PHYS_ASSIGN = [3, 7, 0, 9, 5, 1, 8, 11, 2, 6, 4, 10];

  function render(numTokens) {
    const W = 920, H = 360;
    const svg = svgRoot(container, W, H);

    const numLogical = Math.ceil(numTokens / BLOCK_SIZE);

    // --- left: the logical sequence (tokens grouped into blocks) -----------
    txt(svg, 20, 24, "logical sequence (tokens)", "lbl lbl-soft");
    const tokW = 11, tokGap = 1, blockGap = 8, rowGap = 36;
    const blocksPerRow = 2; // 32 tokens per row
    for (let lb = 0; lb < numLogical; lb++) {
      const row = Math.floor(lb / blocksPerRow);
      const col = lb % blocksPerRow;
      const bx = 20 + col * (BLOCK_SIZE * (tokW + tokGap) + blockGap);
      const by = 40 + row * rowGap;
      // block container
      el("rect", {
        x: bx - 3, y: by - 3,
        width: BLOCK_SIZE * (tokW + tokGap) + 4, height: 26,
        rx: 3,
        fill: "none",
        stroke: "var(--blk-stroke)",
        "stroke-width": 1.2,
      }, svg);
      // tokens in block
      const tokensInBlock = Math.min(BLOCK_SIZE, numTokens - lb * BLOCK_SIZE);
      for (let t = 0; t < tokensInBlock; t++) {
        el("rect", {
          x: bx + t * (tokW + tokGap), y: by,
          width: tokW, height: 20,
          class: "tok-rect",
        }, svg);
      }
      // label
      txt(svg, bx, by + 34, `block #${lb}`, "lbl lbl-tiny lbl-soft");
    }

    // --- middle: the block table -------------------------------------------
    const tblX = 360, tblY = 50;
    txt(svg, tblX, 24, "block table (per-request)", "lbl lbl-soft");
    txt(svg, tblX + 10, tblY - 4, "logical", "lbl lbl-tiny lbl-soft");
    txt(svg, tblX + 90, tblY - 4, "physical", "lbl lbl-tiny lbl-soft");

    const rowH = 22;
    // show up to 4 rows to keep things calm
    const tableRows = Math.max(numLogical, 4);
    for (let r = 0; r < tableRows; r++) {
      const inUse = r < numLogical;
      el("rect", {
        x: tblX, y: tblY + r * rowH,
        width: 160, height: rowH,
        class: "block-table-row" + (inUse ? " used" : ""),
      }, svg);
      // separator between cols
      el("line", {
        x1: tblX + 75, y1: tblY + r * rowH,
        x2: tblX + 75, y2: tblY + (r + 1) * rowH,
        stroke: "var(--rule)",
      }, svg);
      txt(svg, tblX + 38, tblY + r * rowH + 15, inUse ? `${r}` : "-", "lbl mono");
      txt(svg, tblX + 117, tblY + r * rowH + 15,
          inUse ? `phys[${PHYS_ASSIGN[r]}]` : "-",
          "lbl mono");
    }

    // --- right: the physical KV pool ---------------------------------------
    const poolX = 580, poolY = 50;
    txt(svg, poolX, 24, "physical KV pool (shared, GPU)", "lbl lbl-soft");
    const cellW = 50, cellH = 36, cellsPerRow = 4;
    const allocated = new Set(PHYS_ASSIGN.slice(0, numLogical));
    for (let p = 0; p < TOTAL_PHYSICAL; p++) {
      const r = Math.floor(p / cellsPerRow);
      const c = p % cellsPerRow;
      const cx = poolX + c * (cellW + 6);
      const cy = poolY + r * (cellH + 6);
      const isAllocated = allocated.has(p);
      el("rect", {
        x: cx, y: cy,
        width: cellW, height: cellH,
        rx: 3,
        class: "physical-pool-cell" + (isAllocated ? " allocated" : ""),
      }, svg);
      txt(svg, cx + cellW / 2, cy + cellH / 2 + 4,
          `phys[${p}]`,
          "lbl lbl-tiny mono");
      if (!isAllocated) {
        txt(svg, cx + cellW / 2, cy + cellH + 12,
            "free",
            "lbl lbl-tiny lbl-soft");
      }
    }

    // --- arrows: block table row -> physical pool cell ---------------------
    for (let r = 0; r < numLogical; r++) {
      const phys = PHYS_ASSIGN[r];
      const fromX = tblX + 160;
      const fromY = tblY + r * rowH + rowH / 2;
      const pr = Math.floor(phys / cellsPerRow);
      const pc = phys % cellsPerRow;
      const toX = poolX + pc * (cellW + 6);
      const toY = poolY + pr * (cellH + 6) + cellH / 2;
      const midX = (fromX + toX) / 2;
      el("path", {
        d: `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`,
        class: "connector",
        "marker-end": "url(#arrow-soft)",
      }, svg);
    }

    // --- caption ----------------------------------------------------------
    const caption = `${numTokens} tokens · ${numLogical} block${numLogical === 1 ? "" : "s"} allocated · ${TOTAL_PHYSICAL - numLogical} free`;
    txt(svg, 20, H - 18, caption, "lbl lbl-soft");

    lenLabel.textContent = `len = ${numTokens}`;
    setState("viz-paged-state", [
      `tokens         : ${numTokens}`,
      `logical blocks : ${numLogical}    (ceil(${numTokens} / ${BLOCK_SIZE}))`,
      `physical pool  : ${allocated.size} / ${TOTAL_PHYSICAL} allocated`,
      `block_table    : [${PHYS_ASSIGN.slice(0, numLogical).join(", ")}]`,
    ]);
  }

  slider.addEventListener("input", () => render(parseInt(slider.value, 10)));
  render(parseInt(slider.value, 10));
})();

// =============================================================
// 2 · CONTINUOUS BATCHING
// Show: 4 request lanes; each iteration each alive lane emits one
// new green token. Requests have different finish times. When one
// finishes, a new one slots in on the very next iteration.
// =============================================================
(function continuousBatching() {
  const container = document.getElementById("viz-batching");
  const stepBtn = document.querySelector('[data-action="batch-step"]');
  const resetBtn = document.querySelector('[data-action="batch-reset"]');
  const iterLabel = document.getElementById("batch-iter-label");
  if (!container) return;

  const LANES = 4;
  const MAX_ITERS = 22;

  // Each request: {id, startIter, length, prefillLen}
  // 'prefillLen' = number of prompt tokens shown as gray prefix on arrival.
  // Static schedule of arriving requests; new ones queue up to fill slots.
  const ARRIVALS = [
    { id: "A", startIter: 0, length: 6, prefillLen: 4 },
    { id: "B", startIter: 0, length: 10, prefillLen: 3 },
    { id: "C", startIter: 0, length: 4, prefillLen: 5 },
    { id: "D", startIter: 0, length: 8, prefillLen: 2 },
    { id: "E", startIter: 99, length: 5, prefillLen: 4 }, // queued
    { id: "F", startIter: 99, length: 7, prefillLen: 3 }, // queued
    { id: "G", startIter: 99, length: 6, prefillLen: 5 }, // queued
  ];
  // helper: for each iteration, decide which request occupies which lane.
  // simulate scheduling deterministically.
  function simulate(uptoIter) {
    const queue = ARRIVALS.map(r => ({ ...r, generated: 0, done: false, lane: -1, finishedAt: -1 }));
    const lanes = new Array(LANES).fill(null);
    const history = []; // history[iter][lane] = { reqId, generatedSoFar, prefillLen, length }

    // initial fill
    let queueIdx = 0;
    for (let l = 0; l < LANES; l++) {
      // find next request not yet assigned
      while (queueIdx < queue.length && queue[queueIdx].lane !== -1) queueIdx++;
      if (queueIdx < queue.length) {
        queue[queueIdx].lane = l;
        queue[queueIdx].startIter = 0;
        lanes[l] = queue[queueIdx];
        queueIdx++;
      }
    }

    for (let it = 0; it <= uptoIter; it++) {
      const snapshot = new Array(LANES).fill(null);
      for (let l = 0; l < LANES; l++) {
        const r = lanes[l];
        if (!r) continue;
        snapshot[l] = {
          reqId: r.id,
          generatedSoFar: r.generated,
          prefillLen: r.prefillLen,
          length: r.length,
        };
      }
      history.push(snapshot);

      // advance: each alive request emits one token
      for (let l = 0; l < LANES; l++) {
        const r = lanes[l];
        if (!r) continue;
        r.generated++;
        if (r.generated >= r.length) {
          r.done = true;
          r.finishedAt = it;
          // next iteration, free the lane and pull from queue
          // we'll do that lazily before snapshotting
        }
      }

      // free finished lanes and pull the next queued request in
      for (let l = 0; l < LANES; l++) {
        const r = lanes[l];
        if (r && r.done) {
          lanes[l] = null;
          // find next queued (lane === -1) request
          for (let q = 0; q < queue.length; q++) {
            if (queue[q].lane === -1) {
              queue[q].lane = l;
              queue[q].startIter = it + 1;
              lanes[l] = queue[q];
              break;
            }
          }
        }
      }
    }
    return history;
  }

  let curIter = 0;

  function render() {
    const history = simulate(curIter);
    const W = 920, H = 320;
    const svg = svgRoot(container, W, H);

    const leftPad = 70;
    const topPad = 36;
    const cellW = 32, cellH = 36, cellGap = 4;
    const laneH = cellH + 14;

    // header: iteration columns
    for (let it = 0; it <= curIter; it++) {
      txt(svg, leftPad + it * (cellW + cellGap) + cellW / 2,
          topPad - 14,
          `${it}`,
          "lbl lbl-tiny lbl-soft");
    }
    txt(svg, leftPad, topPad - 22, "iteration →", "lbl lbl-soft");

    // lanes
    for (let l = 0; l < LANES; l++) {
      const ly = topPad + l * laneH;
      txt(svg, 12, ly + cellH / 2 + 4, `lane ${l}`, "lane-label");

      // iteration cells
      for (let it = 0; it <= curIter; it++) {
        const x = leftPad + it * (cellW + cellGap);
        const snap = history[it] && history[it][l];
        if (!snap) {
          el("rect", {
            x, y: ly,
            width: cellW, height: cellH,
            rx: 3,
            class: "lane-bg done",
          }, svg);
          continue;
        }
        // colored by request id
        const colors = {
          A: "#b8d8e8", B: "#f6c453", C: "#cfe6cf", D: "#e7c4d8",
          E: "#c8d3f0", F: "#f2b9a0", G: "#d4cce0",
        };
        const strokes = {
          A: "#5b8aa3", B: "#b08218", C: "#5e9c5e", D: "#a05d80",
          E: "#5063a0", F: "#a05030", G: "#6f5fa0",
        };
        el("rect", {
          x, y: ly,
          width: cellW, height: cellH,
          rx: 3,
          fill: colors[snap.reqId] || "#ddd",
          stroke: strokes[snap.reqId] || "#888",
          "stroke-width": 1.4,
        }, svg);
        // label: req id
        txt(svg, x + cellW / 2, ly + cellH / 2 - 2,
            snap.reqId, "lbl mono");
        // small subscript: prefill or step
        const isPrefill = snap.generatedSoFar === 0;
        const subLabel = isPrefill ? "pf" : `+${snap.generatedSoFar}`;
        txt(svg, x + cellW / 2, ly + cellH / 2 + 11,
            subLabel, "lbl lbl-tiny lbl-soft");
      }
    }

    // legend
    const legendY = topPad + LANES * laneH + 14;
    txt(svg, 12, legendY, "pf = prefill step · +k = decode step k", "lbl lbl-soft");

    iterLabel.textContent = `iter = ${curIter}`;
    // last snapshot
    const cur = history[curIter] || [];
    const lines = [`iteration: ${curIter}`];
    for (let l = 0; l < LANES; l++) {
      const s = cur[l];
      if (!s) lines.push(`  lane ${l}: idle`);
      else lines.push(`  lane ${l}: ${s.reqId} (${s.generatedSoFar}/${s.length} tokens)`);
    }
    setState("viz-batching-state", lines);
  }

  stepBtn?.addEventListener("click", () => {
    curIter = Math.min(MAX_ITERS, curIter + 1);
    render();
  });
  resetBtn?.addEventListener("click", () => {
    curIter = 0;
    render();
  });
  render();
})();

// =============================================================
// 3 · PREFIX CACHING
// Show: two requests, A and B. Both share the same N-token prefix
// (system prompt). After A runs, the cached blocks light green. B
// arrives with a different suffix; the shared prefix blocks are
// served from cache; only the suffix is computed.
// =============================================================
(function prefixCaching() {
  const container = document.getElementById("viz-prefix");
  const slider = document.getElementById("prefix-suffix");
  const label = document.getElementById("prefix-suffix-label");
  if (!container || !slider) return;

  const PREFIX_LEN = 32; // 2 blocks
  const A_TOTAL = 64;    // request A: prefix + 32 tokens

  function render(bSuffix) {
    const W = 920, H = 320;
    const svg = svgRoot(container, W, H);

    const tokW = 9, tokGap = 1;
    const rowY = [60, 200];
    const rowLabelX = 12;

    // shared block boundaries
    const drawSequence = (seq, y, hits) => {
      const totalTokens = seq.length;
      const totalBlocks = Math.ceil(totalTokens / BLOCK_SIZE);
      const blockW = BLOCK_SIZE * (tokW + tokGap);
      for (let b = 0; b < totalBlocks; b++) {
        const bx = 70 + b * (blockW + 8);
        const isHit = hits[b];
        // block background
        el("rect", {
          x: bx - 3, y: y - 4,
          width: blockW + 4, height: 26,
          rx: 3,
          fill: isHit ? "var(--kv)" : "none",
          stroke: isHit ? "var(--kv-stroke)" : "var(--blk-stroke)",
          "stroke-width": 1.4,
          opacity: isHit ? 0.8 : 1,
        }, svg);
        // tokens
        const tokensInBlock = Math.min(BLOCK_SIZE, totalTokens - b * BLOCK_SIZE);
        for (let t = 0; t < tokensInBlock; t++) {
          const tokenAbs = b * BLOCK_SIZE + t;
          const isPrefix = tokenAbs < PREFIX_LEN;
          let cls = "tok-rect";
          if (isHit) cls = "tok-rect"; // shown via parent fill
          el("rect", {
            x: bx + t * (tokW + tokGap), y,
            width: tokW, height: 18,
            class: cls,
            opacity: isHit ? 0.4 : 1,
          }, svg);
        }
        // block label
        txt(svg, bx + 2, y + 32, isHit ? "cache hit" : "compute",
            "lbl lbl-tiny lbl-soft");
      }
    };

    // --- request A (top) ---------------------------------------------------
    txt(svg, rowLabelX, rowY[0] - 18, "request A", "lbl");
    txt(svg, rowLabelX, rowY[0] - 2,
        `${A_TOTAL} tok`, "lbl lbl-tiny lbl-soft");
    txt(svg, rowLabelX, rowY[0] + 12,
        "(populates cache)", "lbl lbl-tiny lbl-soft");
    const aSeq = new Array(A_TOTAL).fill(0);
    const aBlocks = Math.ceil(A_TOTAL / BLOCK_SIZE);
    drawSequence(aSeq, rowY[0], new Array(aBlocks).fill(false));

    // --- request B (bottom) -----------------------------------------------
    txt(svg, rowLabelX, rowY[1] - 18, "request B", "lbl");
    const bTotal = PREFIX_LEN + bSuffix;
    txt(svg, rowLabelX, rowY[1] - 2,
        `${bTotal} tok`, "lbl lbl-tiny lbl-soft");
    txt(svg, rowLabelX, rowY[1] + 12,
        `prefix ${PREFIX_LEN} + suffix ${bSuffix}`,
        "lbl lbl-tiny lbl-soft");

    const bSeq = new Array(bTotal).fill(0);
    const bBlocks = Math.ceil(bTotal / BLOCK_SIZE);
    // a B-block is a hit if it lies entirely within the shared prefix.
    const hits = new Array(bBlocks).fill(false);
    for (let b = 0; b < bBlocks; b++) {
      const blockStart = b * BLOCK_SIZE;
      const blockEnd = blockStart + BLOCK_SIZE;
      if (blockEnd <= PREFIX_LEN) hits[b] = true;
    }
    drawSequence(bSeq, rowY[1], hits);

    // divider
    el("line", {
      x1: 0, y1: 132, x2: W, y2: 132,
      class: "section-divider",
    }, svg);

    const blocksHit = hits.filter(Boolean).length;
    const blocksCompute = bBlocks - blocksHit;
    const tokensCompute = Math.max(0, bTotal - PREFIX_LEN) +
      // any partial trailing prefix block (none with our block boundaries)
      0;

    label.textContent = `B suffix = ${bSuffix} tok`;
    setState("viz-prefix-state", [
      `request A: ${A_TOTAL} tokens · cached as ${aBlocks} blocks`,
      ``,
      `request B: ${bTotal} tokens (${PREFIX_LEN} shared prefix + ${bSuffix} suffix)`,
      `  cache hits   : ${blocksHit} block${blocksHit === 1 ? "" : "s"}  (${blocksHit * BLOCK_SIZE} tokens served from KV cache)`,
      `  to compute   : ${blocksCompute} block${blocksCompute === 1 ? "" : "s"}  (${tokensCompute} tokens prefilled)`,
    ]);
  }

  slider.addEventListener("input", () => render(parseInt(slider.value, 10)));
  render(parseInt(slider.value, 10));
})();

// =============================================================
// 4 · SPECULATIVE DECODING
// Show: a small draft proposes K tokens, the target verifies in
// one pass, accepts the longest matching prefix, resamples the
// rejection, and the rest of the draft is thrown away.
// Stepper through 3 rounds with different acceptance counts.
// =============================================================
(function speculativeDecoding() {
  const container = document.getElementById("viz-spec");
  const stepBtn = document.querySelector('[data-action="spec-step"]');
  const resetBtn = document.querySelector('[data-action="spec-reset"]');
  if (!container) return;

  const K = 4; // draft proposes 4 tokens at a time
  // round[i] = number of accepted draft tokens. rejection -> resample.
  const ROUNDS = [
    { accepted: 3, draft: ["the", "cat", "sat", "on"], target: ["the", "cat", "sat", "on"], resample: null },
    { accepted: 1, draft: ["the", "rug", "and", "purred"], target: ["the", "mat"], resample: "mat" },
    { accepted: 4, draft: [".", "It", "was", "warm"], target: [".", "It", "was", "warm"], resample: null },
  ];

  let step = 0; // how many "stages" we've stepped through. each round has 3 stages: draft, verify, commit
  // total stages = ROUNDS.length * 3

  function render() {
    const W = 920, H = 360;
    const svg = svgRoot(container, W, H);

    const cellW = 78, cellH = 36, cellGap = 6;
    const padX = 60;

    // committed timeline (cumulative accepted tokens across rounds)
    const committedTokens = [];
    const roundIdx = Math.floor(step / 3);
    const stageInRound = step % 3; // 0 draft, 1 verify, 2 commit

    for (let r = 0; r < roundIdx; r++) {
      const rd = ROUNDS[r];
      for (let i = 0; i < rd.accepted; i++) committedTokens.push(rd.draft[i]);
      if (rd.resample !== null) committedTokens.push(rd.resample);
    }
    // if we're past the commit stage of the current round, commit it too
    if (stageInRound === 2 && roundIdx < ROUNDS.length) {
      const rd = ROUNDS[roundIdx];
      for (let i = 0; i < rd.accepted; i++) committedTokens.push(rd.draft[i]);
      if (rd.resample !== null) committedTokens.push(rd.resample);
    }

    // --- top: committed sequence ----------------------------------------
    txt(svg, padX, 22, "committed output (target-equivalent)", "lbl lbl-soft");
    for (let i = 0; i < committedTokens.length; i++) {
      const x = padX + i * (cellW + cellGap);
      el("rect", {
        x, y: 32,
        width: cellW, height: cellH, rx: 3,
        class: "target-rect",
      }, svg);
      txt(svg, x + cellW / 2, 32 + cellH / 2 + 4,
          committedTokens[i], "lbl mono");
    }

    if (roundIdx >= ROUNDS.length) {
      txt(svg, padX, 200, "all rounds done - output equivalent to plain target sampling.",
          "lbl lbl-soft");
      setState("viz-spec-state", [
        `committed: [${committedTokens.join(", ")}]`,
        `done - every accepted token is bit-identical to a vanilla target-only sample.`,
      ]);
      return;
    }

    // --- mid: current round's draft & target ---------------------------
    const round = ROUNDS[roundIdx];
    const baseY = 130;
    txt(svg, padX, baseY - 14,
        `round ${roundIdx + 1} of ${ROUNDS.length} · stage: ${["draft", "verify", "commit"][stageInRound]}`,
        "lbl lbl-soft");

    // draft row
    txt(svg, 12, baseY + cellH / 2 + 4, "draft", "lane-label");
    for (let i = 0; i < K; i++) {
      const x = padX + i * (cellW + cellGap);
      const showDraft = stageInRound >= 0;
      if (!showDraft) continue;
      const accepted = stageInRound >= 1 && i < round.accepted;
      const rejected = stageInRound >= 1 && i >= round.accepted;
      el("rect", {
        x, y: baseY,
        width: cellW, height: cellH, rx: 3,
        class: "draft-rect" + (rejected ? " rejected" : ""),
        opacity: rejected ? 0.6 : 1,
      }, svg);
      txt(svg, x + cellW / 2, baseY + cellH / 2 + 4,
          round.draft[i], "lbl mono");
      if (accepted) {
        txt(svg, x + cellW / 2, baseY + cellH + 14,
            "✓ accepted", "lbl lbl-tiny lbl-soft");
      } else if (rejected) {
        txt(svg, x + cellW / 2, baseY + cellH + 14,
            "✗ rejected", "lbl lbl-tiny lbl-soft");
      }
    }

    // target row
    const targetY = baseY + cellH + 50;
    txt(svg, 12, targetY + cellH / 2 + 4, "target", "lane-label");
    if (stageInRound >= 1) {
      // target shows verified tokens for accepted positions, plus the resample at the rejection point
      for (let i = 0; i < round.accepted; i++) {
        const x = padX + i * (cellW + cellGap);
        el("rect", {
          x, y: targetY,
          width: cellW, height: cellH, rx: 3,
          class: "target-rect",
        }, svg);
        txt(svg, x + cellW / 2, targetY + cellH / 2 + 4,
            round.target[i], "lbl mono");
      }
      // resample at the first rejection point (if any)
      if (round.resample !== null) {
        const i = round.accepted;
        const x = padX + i * (cellW + cellGap);
        el("rect", {
          x, y: targetY,
          width: cellW, height: cellH, rx: 3,
          class: "target-rect",
          fill: "var(--pic)",
          stroke: "var(--pic-stroke)",
        }, svg);
        txt(svg, x + cellW / 2, targetY + cellH / 2 + 4,
            round.resample, "lbl mono");
        txt(svg, x + cellW / 2, targetY + cellH + 14,
            "resampled", "lbl lbl-tiny lbl-soft");
      }
    } else {
      txt(svg, padX, targetY + cellH / 2 + 4,
          "target hasn't run yet - one forward pass scores all K draft tokens at once.",
          "lbl lbl-soft");
    }

    // explainer line
    const explLines = [
      "draft proposes 4 tokens cheaply.",
      "target runs ONE forward pass → accepts longest matching prefix, resamples the first miss.",
      "accepted tokens commit to output; rejected suffix is discarded.",
    ];
    txt(svg, padX, targetY + cellH + 50,
        explLines[stageInRound], "lbl lbl-soft");

    setState("viz-spec-state", [
      `round ${roundIdx + 1}/${ROUNDS.length} · stage: ${["draft", "verify", "commit"][stageInRound]}`,
      `  draft   : [${round.draft.join(", ")}]`,
      stageInRound >= 1
        ? `  target  : accepted ${round.accepted}/${K}` + (round.resample ? ` (+ resampled "${round.resample}")` : ` (no rejection)`)
        : `  target  : pending`,
      `committed so far: [${committedTokens.join(", ")}]`,
    ]);
  }

  stepBtn?.addEventListener("click", () => {
    if (step < ROUNDS.length * 3) step++;
    render();
  });
  resetBtn?.addEventListener("click", () => {
    step = 0;
    render();
  });
  render();
})();

// =============================================================
// 5 · CHUNKED PREFILL
// Two timelines stacked. Top: a 96-token prefill ("P") runs to
// completion before any decode step can fire. Bottom: same prefill
// is split into chunks of N tokens; decode steps for other in-flight
// requests fire between (or alongside) the prefill chunks.
// =============================================================
(function chunkedPrefill() {
  const container = document.getElementById("viz-chunked");
  const slider = document.getElementById("chunked-size");
  const label = document.getElementById("chunked-size-label");
  if (!container || !slider) return;

  const PREFILL_TOKENS = 96;

  function render(chunkSize) {
    const W = 920, H = 320;
    const svg = svgRoot(container, W, H);

    const padX = 90;
    const cellW = 36, cellH = 32, cellGap = 4;
    const totalIters = 16;

    // Helper: draw a track with cells
    function drawTrack(y, label, cells) {
      txt(svg, 12, y + cellH / 2 + 4, label, "lane-label");
      for (let i = 0; i < cells.length && i < totalIters; i++) {
        const x = padX + i * (cellW + cellGap);
        const c = cells[i];
        if (!c) {
          el("rect", {
            x, y, width: cellW, height: cellH, rx: 3,
            class: "lane-bg done",
          }, svg);
          continue;
        }
        const colors = {
          P: ["#f6c453", "#b08218", "P"],
          D: ["#cfe6cf", "#5e9c5e", "D"],
          idle: ["#fff", "var(--rule)", ""],
        };
        const [fill, stroke, glyph] = colors[c.kind] || colors.idle;
        el("rect", {
          x, y, width: cellW, height: cellH, rx: 3,
          fill, stroke, "stroke-width": 1.4,
        }, svg);
        txt(svg, x + cellW / 2, y + cellH / 2 - 1,
            glyph, "lbl mono");
        if (c.label) {
          txt(svg, x + cellW / 2, y + cellH + 12,
              c.label, "lbl lbl-tiny lbl-soft");
        }
      }
    }

    // header
    txt(svg, padX, 24, "iteration →", "lbl lbl-soft");
    for (let i = 0; i < totalIters; i++) {
      txt(svg, padX + i * (cellW + cellGap) + cellW / 2, 36,
          `${i}`, "lbl lbl-tiny lbl-soft");
    }

    // baseline (top): full prefill blocks, then decodes for the request
    const baseY = 60;
    const baseCells = [];
    // entire 96-token prefill = 1 cell labeled "P×96" but to express the
    // blocking effect, show as 3 consecutive prefill iterations (model has to
    // chunk weight memory anyway, but logically blocks alone).
    // For naive (no chunked prefill): we treat it as 1 fat iteration that
    // *blocks* other requests for that whole time - visualize as 3 cells of
    // big-prefill, then decodes.
    for (let i = 0; i < 3; i++) baseCells.push({ kind: "P", label: i === 1 ? "blocks" : "" });
    for (let i = 3; i < totalIters; i++) baseCells.push({ kind: "D", label: "" });
    drawTrack(baseY, "naive", baseCells);
    txt(svg, padX, baseY - 8, "no chunked prefill - decodes wait until prefill is done", "lbl lbl-soft");

    // chunked (bottom): same 96 tokens split into chunks of `chunkSize`,
    // interleaved with decode steps from other requests.
    const chunkedY = 170;
    const numChunks = Math.ceil(PREFILL_TOKENS / chunkSize);
    const chunkedCells = [];
    let remaining = numChunks;
    let i = 0;
    while (i < totalIters && remaining > 0) {
      // alternate: 1 prefill chunk, then 1 decode iteration (other reqs)
      chunkedCells.push({ kind: "P", label: `${chunkSize}t` });
      remaining--;
      i++;
      if (i < totalIters && remaining > 0) {
        chunkedCells.push({ kind: "D", label: "" });
        i++;
      }
    }
    while (i < totalIters) {
      chunkedCells.push({ kind: "D", label: "" });
      i++;
    }
    drawTrack(chunkedY, "chunked", chunkedCells);
    txt(svg, padX, chunkedY - 8,
        `prefill split into ${numChunks} chunks of ${chunkSize} tokens - decodes interleave`,
        "lbl lbl-soft");

    // legend
    const lY = 280;
    const lx = padX;
    el("rect", { x: lx, y: lY, width: 14, height: 14, rx: 2, fill: "#f6c453", stroke: "#b08218" }, svg);
    txt(svg, lx + 22, lY + 11, "P = prefill step", "lbl lbl-soft");
    el("rect", { x: lx + 150, y: lY, width: 14, height: 14, rx: 2, fill: "#cfe6cf", stroke: "#5e9c5e" }, svg);
    txt(svg, lx + 172, lY + 11, "D = decode step (other in-flight requests)", "lbl lbl-soft");

    label.textContent = `chunk = ${chunkSize}`;
    setState("viz-chunked-state", [
      `prefill            : ${PREFILL_TOKENS} tokens`,
      `chunk size         : ${chunkSize} tokens  →  ${numChunks} chunks`,
      `naive blocking time: ~3 iters (every other request stalls)`,
      `chunked blocking   : 1 iter at a time (decodes interleave)`,
    ]);
  }

  slider.addEventListener("input", () => render(parseInt(slider.value, 10)));
  render(parseInt(slider.value, 10));
})();

// =============================================================
// 6 · TENSOR PARALLELISM
// Per-rank pipeline showing one MLP block: a column-parallel up_proj
// chained into a row-parallel down_proj. Stages:
//   0  idle - weight shards visible, no activations
//   1  input x is already replicated on every rank
//        (left over from the previous block's all-reduce - no broadcast)
//   2  up_proj GEMM - column-parallel, runs in parallel on every rank
//   3  intermediate is SHARDED across ranks (no collective between layers)
//   4  down_proj GEMM - row-parallel, runs in parallel on every rank
//   5  every rank holds a PARTIAL-SUM y (full h_out shape, partial values)
//   6  all-reduce - SYNCHRONIZATION BARRIER (ranks block here)
//   7  y replicated on every rank - ready for the next block
// =============================================================
(function tensorParallel() {
  const container = document.getElementById("viz-tp");
  const select = document.getElementById("tp-size");
  const stepBtn = document.querySelector('[data-action="tp-step"]');
  const resetBtn = document.querySelector('[data-action="tp-reset"]');
  if (!container || !select) return;

  const RANK_COLORS = [
    ["#b8d8e8", "#5b8aa3"],
    ["#f6c453", "#b08218"],
    ["#cfe6cf", "#5e9c5e"],
    ["#e7c4d8", "#a05d80"],
    ["#c8d3f0", "#5063a0"],
    ["#f2b9a0", "#a05030"],
    ["#d4cce0", "#6f5fa0"],
    ["#dde2c0", "#888a55"],
  ];

  // 8 stages, walking through one MLP block (up_proj col-parallel +
  // down_proj row-parallel). The "input is already replicated" fact is
  // an explicit stage so it's visible, not hidden as a dispatch step.
  const STAGE_LABELS = [
    "idle - weight shards loaded, no activations yet",
    "x already on every rank - it's the output of the previous block (e.g. the attention block before this MLP)",
    "up_proj   (col-parallel) - every rank runs its GEMM in parallel",
    "intermediate is sharded across ranks   (NO collective between the two linears)",
    "down_proj (row-parallel) - every rank runs its GEMM in parallel",
    "every rank holds a partial-sum y   (full shape, partial values)",
    "all-reduce   ← SYNC BARRIER · every rank blocks until all arrive",
    "full y replicated - input to the next block, no broadcast needed",
  ];

  let stage = 0;
  let tp = parseInt(select.value, 10);

  function render() {
    // ---------- layout constants -------------------------------------------
    const laneLabelW = 100;
    const padX = laneLabelW + 16;
    const padTop = 110;          // extra headroom so column labels don't touch lanes
    const laneH = tp <= 4 ? 40 : 32;
    const laneGap = 10;
    const footerSpace = 110;     // room for barrier annotation + caption below lanes

    const lanesH = tp * (laneH + laneGap) - laneGap;
    const W = 980;
    const H = padTop + lanesH + footerSpace;
    const svg = svgRoot(container, W, H);

    // 7 slots per lane: x  →  up_proj  →  intermediate  →  down_proj  →  partial  →  all-reduce  →  y
    const COL = [
      { key: "x",      w: 60,  label: "x" },
      { key: "up",     w: 170, label: "up_proj  (col-parallel)" },
      { key: "mid",    w: 80,  label: "shard" },
      { key: "down",   w: 170, label: "down_proj  (row-parallel)" },
      { key: "part",   w: 80,  label: "partial y" },
      { key: "ar",     w: 140, label: "all-reduce" },
      { key: "y",      w: 60,  label: "y" },
    ];
    const colGap = 10;
    let cur = padX;
    const colX = {};
    for (const c of COL) { colX[c.key] = cur; cur += c.w + colGap; }
    const totalW = cur - padX - colGap;

    // helper: which slots are filled at the current stage
    const filled = {
      x:    stage >= 1,
      up:   stage >= 2,
      mid:  stage >= 3,
      down: stage >= 4,
      part: stage >= 5,
      ar:   stage >= 6,
      y:    stage >= 7,
    };
    const active = {
      up:   stage === 2,
      down: stage === 4,
      ar:   stage === 6,
    };

    // ---------- header (time axis) ----------------------------------------
    txt(svg, padX, padTop - 38, "time →", "lbl lbl-soft");
    for (const c of COL) {
      txt(svg, colX[c.key] + c.w / 2, padTop - 18, c.label, "lbl lbl-tiny lbl-soft");
    }

    // ---------- per-rank lanes --------------------------------------------
    for (let r = 0; r < tp; r++) {
      const ly = padTop + r * (laneH + laneGap);
      const [fill, stroke] = RANK_COLORS[r % RANK_COLORS.length];

      // lane label - GPU r + the two weight shards it holds
      txt(svg, 12, ly + laneH / 2 - 5, `GPU ${r}`, "lane-label");
      txt(svg, 12, ly + laneH / 2 + 9,
          `W_up[:,${r}]·W_dn[${r},:]`,
          "lbl lbl-tiny lbl-soft");

      // lane background
      el("rect", {
        x: padX - 4, y: ly,
        width: totalW + 8, height: laneH,
        rx: 4,
        fill: "var(--bg-soft)",
        stroke: "var(--rule)",
        "stroke-width": 1,
      }, svg);

      // ---- slot: x (replicated input) ----
      drawSlot("x", ly, fill, stroke, {
        on: filled.x,
        replicated: true, // every rank shows the same colour for x
        text: filled.x ? "x" : "",
        sub: filled.x && r === 0 && stage === 1 ? "(same on every rank)" : "",
      });

      // ---- slot: up_proj ----
      drawSlot("up", ly, fill, stroke, {
        on: filled.up || active.up,
        active: active.up,
        text: active.up
          ? `GEMM…`
          : filled.up
            ? `x · W_up[:,${r}]`
            : "",
      });

      // ---- slot: mid (sharded intermediate) ----
      drawSlot("mid", ly, fill, stroke, {
        on: filled.mid,
        text: filled.mid ? `mid_${r}` : "",
        sub: filled.mid && r === 0 && stage === 3 ? "(different per rank)" : "",
      });

      // ---- slot: down_proj ----
      drawSlot("down", ly, fill, stroke, {
        on: filled.down || active.down,
        active: active.down,
        text: active.down
          ? `GEMM…`
          : filled.down
            ? `mid_${r} · W_dn[${r},:]`
            : "",
      });

      // ---- slot: partial y ----
      drawSlot("part", ly, fill, stroke, {
        on: filled.part,
        // partial-sum is the SAME shape on every rank but DIFFERENT values
        text: filled.part ? `p_${r}` : "",
        sub: filled.part && r === 0 && stage === 5 ? "(partial-sum)" : "",
      });

      // ---- slot: all-reduce barrier ----
      drawSlot("ar", ly, "var(--gap)", "var(--gap-stroke)", {
        on: filled.ar || active.ar,
        active: active.ar,
        dashed: active.ar,
        text: active.ar ? "↔ all-reduce" : (filled.ar ? "✓ summed" : ""),
      });

      // ---- slot: y (replicated output) ----
      drawSlot("y", ly, "var(--kv)", "var(--kv-stroke)", {
        on: filled.y,
        text: filled.y ? "y" : "",
        sub: filled.y && r === 0 && stage === 7 ? "(replicated again)" : "",
      });
    }

    function drawSlot(key, ly, fill, stroke, opts) {
      const c = COL.find(c => c.key === key);
      const x = colX[key];
      const w = c.w;
      const h = laneH - 8;
      const y = ly + 4;
      const isOn = opts.on;
      el("rect", {
        x, y, width: w, height: h, rx: 3,
        fill: isOn ? fill : "#fff",
        stroke: isOn ? stroke : "var(--rule)",
        "stroke-width": opts.active ? 2 : 1.2,
        "stroke-dasharray": opts.dashed ? "4 3" : "0",
        opacity: isOn ? 1 : 0.55,
      }, svg);
      if (opts.text) {
        txt(svg, x + w / 2, y + h / 2 + 3,
            opts.text,
            opts.text.length > 14 ? "lbl lbl-tiny mono" : "lbl mono");
      }
      // (no per-slot sub-text: that info is already in the stage caption
      // below the lanes - emitting it inline collides with column headers
      // and lane gaps.)
    }

    // ---------- vertical sync barrier marker (stage 6) ------------------
    const arW = COL.find(c => c.key === "ar").w;
    if (stage === 6 && tp > 1) {
      const barX = colX.ar;
      const barY0 = padTop - 4;
      const barY1 = padTop + lanesH + 4;
      el("line", {
        x1: barX, y1: barY0, x2: barX, y2: barY1,
        stroke: "var(--recomp)",
        "stroke-width": 2.5,
        "stroke-dasharray": "5 3",
      }, svg);
      el("line", {
        x1: barX + arW, y1: barY0, x2: barX + arW, y2: barY1,
        stroke: "var(--recomp)",
        "stroke-width": 2.5,
        "stroke-dasharray": "5 3",
      }, svg);

      // cross-rank exchange arrows
      const cxBar = colX.ar + arW / 2;
      for (let i = 0; i < tp; i++) {
        for (let j = 0; j < tp; j++) {
          if (i === j) continue;
          const yi = padTop + i * (laneH + laneGap) + laneH / 2;
          const yj = padTop + j * (laneH + laneGap) + laneH / 2;
          el("path", {
            d: `M ${cxBar - 36} ${yi} Q ${cxBar} ${(yi + yj) / 2}, ${cxBar + 36} ${yj}`,
            fill: "none",
            stroke: "var(--ink-soft)",
            "stroke-width": 1,
            opacity: 0.4,
          }, svg);
        }
      }
    }

    // ---------- caption (below the lanes, no overlap with header) -------
    const belowLanesY = padTop + lanesH;
    if (stage === 6 && tp > 1) {
      txt(svg, colX.ar, belowLanesY + 22,
          "↑ barrier - every rank blocks here until all arrive",
          "lbl lbl-tiny lbl-soft");
    }
    const captionY = belowLanesY + 50;
    txt(svg, padX, captionY,
        `stage ${stage}/${STAGE_LABELS.length - 1}: ${STAGE_LABELS[stage]}`,
        "lbl lbl-soft");

    if (tp === 1) {
      txt(svg, padX, captionY + 22,
          "tp = 1 → no sharding, no collectives, single rank does everything",
          "lbl lbl-soft");
    }

    // ---------- state panel ----------------------------------------------
    const lines = [
      `tensor_parallel_size = ${tp}`,
      `stage                = ${stage} · ${STAGE_LABELS[stage].split("-")[0].trim()}`,
      ``,
    ];
    if (stage === 0) {
      lines.push(`waiting?             : nothing happening yet`);
    } else if (stage === 1) {
      lines.push(`waiting?             : no - x is already on every rank`);
      lines.push(`where did x come from: the PREVIOUS block (e.g. the attention block right`);
      lines.push(`                       before this MLP). that block ended with an all-reduce,`);
      lines.push(`                       which produced an identical y on every rank.`);
      lines.push(`                       that y is the x for THIS block - no broadcast needed.`);
    } else if (stage === 2) {
      lines.push(`waiting?             : no - every rank does its up_proj GEMM in parallel`);
    } else if (stage === 3) {
      lines.push(`collective?          : NO - the col-parallel output is sharded, which is`);
      lines.push(`                       exactly the input shape down_proj wants. nothing to`);
      lines.push(`                       exchange between the two linears.`);
    } else if (stage === 4) {
      lines.push(`waiting?             : no - every rank does its down_proj GEMM in parallel`);
    } else if (stage === 5) {
      lines.push(`partial sum?         : every rank holds full-shape y, but its values are only`);
      lines.push(`                       a partial contribution. summing across ranks gives the`);
      lines.push(`                       true y.`);
    } else if (stage === 6) {
      lines.push(`waiting?             : YES - all ${tp} ranks block at the all-reduce barrier`);
      lines.push(`bytes exchanged      : ~h_out bytes per rank (NCCL all-reduce)`);
      lines.push(`how often            : exactly 1× per MLP block, 1× per attention block`);
    } else if (stage === 7) {
      lines.push(`waiting?             : no - every rank has full y, ready for next block`);
      lines.push(`note                 : "input replicated" for next block is FREE - the`);
      lines.push(`                       all-reduce just produced it.`);
    }
    setState("viz-tp-state", lines);
  }

  select.addEventListener("change", () => {
    tp = parseInt(select.value, 10);
    stage = 0;
    render();
  });
  stepBtn?.addEventListener("click", () => {
    if (stage < STAGE_LABELS.length - 1) stage++;
    render();
  });
  resetBtn?.addEventListener("click", () => {
    stage = 0;
    render();
  });
  render();
})();

// =============================================================
// 7 · DISAGGREGATED PREFILL / DECODE
// 5-stage stepper:
//   0 idle
//   1 request lands on prefill pool
//   2 prefill running (compute-bound)
//   3 KV cache transferring to decode pool
//   4 decode pool streaming tokens
// =============================================================
(function disaggregatedPD() {
  const container = document.getElementById("viz-pd");
  const stepBtn = document.querySelector('[data-action="pd-step"]');
  const resetBtn = document.querySelector('[data-action="pd-reset"]');
  if (!container) return;

  let stage = 0; // 0..4
  const STAGES = [
    { label: "idle", desc: "Two pools sized independently. Prefill pool is compute-rich; decode pool is bandwidth-rich." },
    { label: "request arrives", desc: "Request lands on the prefill pool's queue." },
    { label: "prefilling", desc: "One big forward pass over the whole prompt. Compute-bound." },
    { label: "KV transfer", desc: "KV blocks shipped to a decode worker (NVLink / RDMA / nixl)." },
    { label: "decoding", desc: "Decode pool streams output tokens one at a time. Memory-bandwidth-bound." },
  ];

  function render() {
    const W = 920, H = 340;
    const svg = svgRoot(container, W, H);

    // --- two pools --------------------------------------------------------
    const pY = 70;
    const pH = 200;
    const leftX = 40, leftW = 320;
    const rightX = 560, rightW = 320;

    // left pool: prefill workers
    el("rect", {
      x: leftX, y: pY, width: leftW, height: pH, rx: 6,
      fill: "#fff",
      stroke: stage === 2 ? "var(--pic-stroke)" : "var(--rule)",
      "stroke-width": stage === 2 ? 2.5 : 1.5,
    }, svg);
    txt(svg, leftX + 12, pY - 8, "prefill pool", "lbl");
    txt(svg, leftX + 12, pY + 14, "compute-bound · big forward passes", "lbl lbl-tiny lbl-soft");

    // 2 prefill workers
    for (let w = 0; w < 2; w++) {
      const wx = leftX + 24 + w * 140;
      const wy = pY + 50;
      const isWorking = stage === 2 && w === 0;
      el("rect", {
        x: wx, y: wy, width: 120, height: 60, rx: 4,
        fill: isWorking ? "var(--pic)" : "var(--bg-soft)",
        stroke: isWorking ? "var(--pic-stroke)" : "var(--rule)",
        "stroke-width": 1.4,
      }, svg);
      txt(svg, wx + 60, wy + 28, `P-worker ${w}`, "lbl mono");
      txt(svg, wx + 60, wy + 46,
          isWorking ? "prefilling" : "idle",
          "lbl lbl-tiny lbl-soft");
    }

    // right pool: decode workers
    el("rect", {
      x: rightX, y: pY, width: rightW, height: pH, rx: 6,
      fill: "#fff",
      stroke: stage === 4 ? "var(--kv-stroke)" : "var(--rule)",
      "stroke-width": stage === 4 ? 2.5 : 1.5,
    }, svg);
    txt(svg, rightX + 12, pY - 8, "decode pool", "lbl");
    txt(svg, rightX + 12, pY + 14, "memory-bandwidth-bound · token-by-token", "lbl lbl-tiny lbl-soft");

    for (let w = 0; w < 3; w++) {
      const wx = rightX + 18 + w * 100;
      const wy = pY + 50;
      const isWorking = stage === 4 && w === 0;
      el("rect", {
        x: wx, y: wy, width: 80, height: 60, rx: 4,
        fill: isWorking ? "var(--kv)" : "var(--bg-soft)",
        stroke: isWorking ? "var(--kv-stroke)" : "var(--rule)",
        "stroke-width": 1.4,
      }, svg);
      txt(svg, wx + 40, wy + 28, `D-${w}`, "lbl mono");
      txt(svg, wx + 40, wy + 46,
          isWorking ? "decoding" : "idle",
          "lbl lbl-tiny lbl-soft");
    }

    // --- request arrival arrow (stage 1) ----------------------------------
    if (stage >= 1) {
      el("path", {
        d: `M ${leftX - 28} ${pY + 80} L ${leftX} ${pY + 80}`,
        stroke: "var(--ink)",
        "stroke-width": 2,
        fill: "none",
        "marker-end": "url(#arrow-blue)",
      }, svg);
      txt(svg, leftX - 28, pY + 70, "req", "lbl mono");
    }

    // --- KV transfer arrow (stage 3+) -------------------------------------
    if (stage >= 3) {
      const arrY = pY + 130;
      el("path", {
        d: `M ${leftX + leftW + 4} ${arrY} L ${rightX - 4} ${arrY}`,
        stroke: stage === 3 ? "var(--recomp)" : "var(--ink-soft)",
        "stroke-width": stage === 3 ? 2.5 : 1.5,
        fill: "none",
        "stroke-dasharray": stage === 3 ? "6 3" : "0",
        "marker-end": stage === 3 ? "url(#arrow-blue)" : "url(#arrow-soft)",
      }, svg);
      txt(svg, (leftX + leftW + rightX) / 2, arrY - 6,
          "KV cache transfer (NVLink / RDMA / nixl)",
          "lbl lbl-tiny lbl-soft");
    }

    // --- output stream arrow (stage 4) ------------------------------------
    if (stage >= 4) {
      el("path", {
        d: `M ${rightX + rightW} ${pY + 80} L ${rightX + rightW + 28} ${pY + 80}`,
        stroke: "var(--kv-stroke)",
        "stroke-width": 2,
        fill: "none",
        "marker-end": "url(#arrow-blue)",
      }, svg);
      txt(svg, rightX + rightW + 8, pY + 70, "tok", "lbl mono");
    }

    // --- caption ---------------------------------------------------------
    txt(svg, 40, 310,
        `stage ${stage} of ${STAGES.length - 1}: ${STAGES[stage].label} - ${STAGES[stage].desc}`,
        "lbl lbl-soft");

    setState("viz-pd-state", [
      `stage           : ${stage} (${STAGES[stage].label})`,
      `prefill workers : 2  (compute-rich, e.g. H100 high TP)`,
      `decode workers  : 3  (bandwidth-rich, e.g. lower TP, more replicas)`,
      stage >= 3
        ? `KV transfer     : prefill rank → decode rank, block-by-block`
        : `KV transfer     : not yet`,
    ]);
  }

  stepBtn?.addEventListener("click", () => {
    if (stage < STAGES.length - 1) stage++;
    render();
  });
  resetBtn?.addEventListener("click", () => {
    stage = 0;
    render();
  });
  render();
})();
