// =============================================================
// PIC / Legolink visualizer
// =============================================================
// Six interactive SVG visualizations, one per test in the spans /
// Legolink suite. No build step, no framework - vanilla DOM + SVG.
// =============================================================

const SVG_NS = "http://www.w3.org/2000/svg";
const BLOCK_SIZE = 16;

// short fake hex hashes, deterministically derived from a string
function fakeHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ("00000000" + (h >>> 0).toString(16)).slice(-8);
}

function el(tag, attrs = {}, parent = null) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    node.setAttribute(k, v);
  }
  if (parent) parent.appendChild(node);
  return node;
}

function svgRoot(parent, vbW, vbH) {
  parent.innerHTML = "";
  const svg = el("svg", {
    viewBox: `0 0 ${vbW} ${vbH}`,
    preserveAspectRatio: "xMidYMid meet",
  }, parent);
  // arrow marker
  const defs = el("defs", {}, svg);
  const m = el("marker", {
    id: "arrow",
    viewBox: "0 0 10 10",
    refX: 9, refY: 5,
    markerWidth: 7, markerHeight: 7,
    orient: "auto-start-reverse",
  }, defs);
  el("path", { d: "M0,0 L10,5 L0,10 z", fill: "var(--hash-a)" }, m);
  return svg;
}

// ----- helpers to draw blocks of tokens -----------------------
function drawTokens(svg, x, y, count, opts = {}) {
  const w = opts.tokW ?? 14;
  const gap = opts.tokGap ?? 1;
  const h = opts.tokH ?? 18;
  for (let i = 0; i < count; i++) {
    el("rect", {
      x: x + i * (w + gap),
      y,
      width: w,
      height: h,
      class: "tok-rect",
    }, svg);
  }
  return { x, y, w: count * (w + gap) - gap, h };
}

function drawBlock(svg, x, y, w, h, kind = "blk", label = null) {
  el("rect", {
    x, y, width: w, height: h,
    rx: 3,
    class: kind + "-rect",
  }, svg);
  if (label) {
    el("text", {
      x: x + w / 2,
      y: y + h / 2 + 4,
      "text-anchor": "middle",
      class: "lbl",
    }, svg).textContent = label;
  }
}

function drawHashPill(svg, cx, cy, hash, klass = "match-a") {
  const w = 78, h = 22;
  el("rect", {
    x: cx - w / 2, y: cy - h / 2,
    width: w, height: h, rx: 11,
    class: "hash-pill " + klass,
  }, svg);
  el("text", {
    x: cx, y: cy + 4,
    "text-anchor": "middle",
    class: "lbl mono",
  }, svg).textContent = hash;
}

function drawText(svg, x, y, text, klass = "lbl") {
  const t = el("text", { x, y, class: klass }, svg);
  t.textContent = text;
  return t;
}

// =============================================================
// Concept widgets (section 0)
// =============================================================
(function conceptWidgets() {
  // Block: 16 tokens grouped together
  const sBlk = svgRoot(document.getElementById("concept-block"), 240, 60);
  drawTokens(sBlk, 4, 12, BLOCK_SIZE, { tokW: 13, tokGap: 1 });
  el("rect", {
    x: 2, y: 8, width: 14 * BLOCK_SIZE + 4, height: 26,
    rx: 4, fill: "none", stroke: "var(--blk-stroke)",
    "stroke-width": 1.5,
  }, sBlk);
  drawText(sBlk, 4, 52, "1 block = 16 tokens", "lbl lbl-soft");

  // PIC: yellow block, hash arrow with no parent
  const sPic = svgRoot(document.getElementById("concept-pic"), 240, 60);
  drawBlock(sPic, 6, 8, 100, 26, "pic", "PIC chunk");
  el("path", { d: "M 110,21 L 150,21", class: "hash-line" }, sPic);
  drawHashPill(sPic, 190, 21, fakeHash("pic"), "match-a");
  drawText(sPic, 6, 52, "no parent → fan-in", "lbl lbl-soft");

  // Span starts: marker on a row of blocks
  const sSpan = svgRoot(document.getElementById("concept-span"), 240, 60);
  for (let i = 0; i < 4; i++) {
    drawBlock(sSpan, 6 + i * 56, 14, 50, 22, i === 2 ? "pic" : "blk");
  }
  el("path", {
    d: "M 116,8 L 116,42",
    stroke: "var(--recomp)",
    "stroke-width": 2,
    "stroke-dasharray": "3 2",
  }, sSpan);
  drawText(sSpan, 100, 52, "span_starts = [32]", "lbl lbl-soft");

  // Legolink: gap interval over blocks
  const sLego = svgRoot(document.getElementById("concept-legolink"), 240, 60);
  for (let i = 0; i < 4; i++) {
    drawBlock(sLego, 6 + i * 56, 14, 50, 22, "blk");
  }
  el("rect", {
    x: 116, y: 10, width: 112, height: 30,
    class: "gap-rect", rx: 3,
  }, sLego);
  drawText(sLego, 6, 52, "gap interval → recompute", "lbl lbl-soft");
})();

// =============================================================
// TEST 1 · pic_chunk_hash_invariant_across_positions
// Two requests, same chunk at different positions, hashes match.
// Toggle PIC on/off to show the difference.
// =============================================================
const T1 = (function () {
  const root = document.getElementById("viz-t1");
  const stateEl = document.getElementById("viz-t1-state");

  let picOn = true;

  function render() {
    const W = 980, H = 400;
    const svg = svgRoot(root, W, H);

    const blkW = 90, blkH = 34, gap = 64;
    const yA = 60, yB = 260;

    // helper: chain link between two adjacent blocks
    // PIC ON  → dashed red line with "✗" in the middle (parent dropped)
    // PIC OFF → solid blue line with "→" glyph in the middle (parent chained)
    const drawChainLink = (xFrom, xTo, y) => {
      const cx = (xFrom + xTo) / 2;
      // base line spans the gap from prefix right-edge to chunk left-edge
      el("path", {
        d: `M ${xFrom + 2},${y} L ${xTo - 2},${y}`,
        fill: "none",
        stroke: picOn ? "var(--recomp)" : "var(--hash-a)",
        "stroke-width": 2,
        "stroke-dasharray": picOn ? "4 3" : "0",
      }, svg);
      if (picOn) {
        // X mark - small white pad behind for legibility
        el("circle", { cx, cy: y, r: 8, fill: "#fff" }, svg);
        const r = 5;
        el("line", {
          x1: cx - r, y1: y - r, x2: cx + r, y2: y + r,
          stroke: "var(--recomp)", "stroke-width": 2.5, "stroke-linecap": "round",
        }, svg);
        el("line", {
          x1: cx - r, y1: y + r, x2: cx + r, y2: y - r,
          stroke: "var(--recomp)", "stroke-width": 2.5, "stroke-linecap": "round",
        }, svg);
      } else {
        // small triangle glyph at midpoint, pointing right
        const r = 5;
        el("polygon", {
          points: `${cx - r},${y - r} ${cx + r},${y} ${cx - r},${y + r}`,
          fill: "var(--hash-a)",
        }, svg);
      }
      const labelText = picOn ? "parent ∅" : "parent →";
      const t = el("text", {
        x: cx, y: y - 14,
        "text-anchor": "middle",
        class: "lbl lbl-tiny lbl-soft",
      }, svg);
      t.textContent = labelText;
    };

    // Request A: 1 prefix block, then chunk at position 16
    drawText(svg, 16, yA - 26, "Request A - prefix (1 block) + chunk", "lbl");
    drawBlock(svg, 16, yA, blkW, blkH, "blk", "[0..15]");
    drawBlock(svg, 16 + (blkW + gap), yA, blkW, blkH, "pic", "chunk");
    drawChainLink(16 + blkW, 16 + blkW + gap, yA + blkH / 2);
    el("path", {
      d: `M ${16 + blkW + gap + blkW / 2},${yA + blkH} L ${16 + blkW + gap + blkW / 2},${yA + 70}`,
      class: "hash-line",
    }, svg);
    const hashChunkA = picOn
      ? fakeHash("chunk-pic")
      : fakeHash("chunk-after-prefixA");
    drawHashPill(svg, 16 + blkW + gap + blkW / 2, yA + 80, hashChunkA, "match-b");

    // Request B: 3 prefix blocks, then chunk at position 48
    drawText(svg, 16, yB - 26, "Request B - prefix (3 blocks, different content) + chunk", "lbl");
    for (let i = 0; i < 3; i++) {
      drawBlock(svg, 16 + i * (blkW + gap), yB, blkW, blkH, "blk", `[${i*16}..${i*16+15}]`);
      // chain link between consecutive prefix blocks (always solid blue - those chain normally)
      if (i > 0) {
        const xFrom = 16 + (i - 1) * (blkW + gap) + blkW;
        const xTo = 16 + i * (blkW + gap);
        const cx = (xFrom + xTo) / 2;
        const cy = yB + blkH / 2;
        el("path", {
          d: `M ${xFrom + 2},${cy} L ${xTo - 2},${cy}`,
          fill: "none",
          stroke: "var(--hash-a)",
          "stroke-width": 2,
        }, svg);
        const r = 5;
        el("polygon", {
          points: `${cx - r},${cy - r} ${cx + r},${cy} ${cx - r},${cy + r}`,
          fill: "var(--hash-a)",
        }, svg);
      }
    }
    drawBlock(svg, 16 + 3 * (blkW + gap), yB, blkW, blkH, "pic", "chunk");
    drawChainLink(16 + 3 * (blkW + gap) - gap + blkW, 16 + 3 * (blkW + gap), yB + blkH / 2);
    el("path", {
      d: `M ${16 + 3 * (blkW + gap) + blkW / 2},${yB + blkH} L ${16 + 3 * (blkW + gap) + blkW / 2},${yB + 70}`,
      class: "hash-line",
    }, svg);
    const hashChunkB = picOn
      ? fakeHash("chunk-pic")
      : fakeHash("chunk-after-prefixB");
    drawHashPill(svg, 16 + 3 * (blkW + gap) + blkW / 2, yB + 80, hashChunkB, "match-b");

    // arc connecting the two chunk-hash pills - routes far right of all blocks
    // so it never crosses Request B's row.
    const pillAx = 16 + blkW + gap + blkW / 2;
    const pillBx = 16 + 3 * (blkW + gap) + blkW / 2;
    const pillAy = yA + 80;        // 140
    const pillBy = yB + 80;        // 340
    const arcX = W - 60;           // 920 - far-right corridor, clear of all blocks
    if (picOn) {
      el("path", {
        d: `M ${pillAx + 42},${pillAy}
            C ${arcX},${pillAy} ${arcX},${pillBy}
              ${pillBx + 42},${pillBy}`,
        fill: "none",
        stroke: "var(--hash-b)",
        "stroke-width": 2,
        "stroke-dasharray": "5 3",
      }, svg);
      const labelT = el("text", {
        x: arcX - 6, y: (pillAy + pillBy) / 2,
        "text-anchor": "end",
        class: "lbl",
      }, svg);
      labelT.textContent = "identical hash";
      const labelT2 = el("text", {
        x: arcX - 6, y: (pillAy + pillBy) / 2 + 16,
        "text-anchor": "end",
        class: "lbl lbl-soft",
      }, svg);
      labelT2.textContent = "(PIC fan-in)";
    } else {
      const labelT = el("text", {
        x: arcX - 6, y: (pillAy + pillBy) / 2,
        "text-anchor": "end",
        class: "lbl",
      }, svg);
      labelT.textContent = "✗ different hashes";
      const labelT2 = el("text", {
        x: arcX - 6, y: (pillAy + pillBy) / 2 + 16,
        "text-anchor": "end",
        class: "lbl lbl-soft",
      }, svg);
      labelT2.textContent = "(chained from different prefixes)";
    }

    // span_starts annotation
    drawText(svg, 16, H - 16,
      picOn
        ? "span_starts = [16] in A, [48] in B  →  chunk's parent dropped before hashing"
        : "span_starts = None  →  chunk hash chains through prefix",
      "lbl lbl-soft");

    stateEl.textContent =
      `req_a.block_hashes[1] = ${hashChunkA}\n` +
      `req_b.block_hashes[3] = ${hashChunkB}\n` +
      `assert ${hashChunkA === hashChunkB ? "PASS" : "FAIL"}  ` +
      `(req_a.block_hashes[1] == req_b.block_hashes[3])`;
  }

  document.querySelector('[data-action="t1-toggle"]').addEventListener("click", () => {
    picOn = !picOn;
    render();
  });

  render();
  return { render };
})();

// =============================================================
// TEST 2 · span_boundary_resets_block_hash_chain_e2e
// 4-block prompt; slider chooses span_starts position.
// Top row: warmup'd chunk slot. Middle row: baseline (no spans) - hashes
// chain through prefix, block at span position MISSES warmup. Bottom row:
// marked - block at span position HITS warmup via PIC reset.
// =============================================================
const T2 = (function () {
  const root = document.getElementById("viz-t2");
  const slider = document.getElementById("t2-slider");
  const label = document.getElementById("t2-pos-label");

  function render() {
    const spanIdx = parseInt(slider.value, 10); // 0..3 → block index for span_starts
    const W = 980, H = 460;
    const svg = svgRoot(root, W, H);

    const blkW = 100, blkH = 36, gap = 12;
    const xs = i => 30 + i * (blkW + gap);
    const yWarmup = 50, yBase = 180, yMarked = 320;

    // The warmup-cached "target chunk" hash — hash(NONE_HASH, target_tokens).
    // This is what the test pre-warms; baseline misses it, marked hits it.
    const warmupHash = fakeHash("warmup-pic|" + spanIdx);

    // === WARMUP row (top) ===
    drawText(svg, 30, yWarmup - 24,
      `step 0: warmup chunk at position ${spanIdx * 16} (standalone request, parent=∅)`,
      "lbl");
    drawBlock(svg, xs(0), yWarmup, blkW, blkH, "pic",
      `[${spanIdx*16}..${spanIdx*16+15}]`);
    drawHashPill(svg, xs(0) + blkW / 2, yWarmup + blkH + 22, warmupHash, "match-b");
    drawText(svg, xs(0) + blkW + 16, yWarmup + blkH / 2 + 4,
      "→ cached as hash(NONE_HASH, chunk_tokens)", "lbl lbl-soft");

    // === BASELINE row (middle) ===
    drawText(svg, 30, yBase - 24, "step 1: baseline run - span_starts = None", "lbl");
    const baseHashes = [];
    for (let i = 0; i < 4; i++) {
      drawBlock(svg, xs(i), yBase, blkW, blkH, "blk", `[${i*16}..${i*16+15}]`);
      const parent = i === 0 ? "∅" : baseHashes[i - 1];
      const h = fakeHash("base|" + parent + "|" + i);
      baseHashes.push(h);
      drawHashPill(svg, xs(i) + blkW / 2, yBase + blkH + 22, h, "match-a");
      if (i > 0) {
        el("path", {
          d: `M ${xs(i - 1) + blkW},${yBase + blkH / 2} L ${xs(i)},${yBase + blkH / 2}`,
          class: "hash-line",
        }, svg);
      }
    }
    // Annotate baseline block at spanIdx position — does it match warmup hash?
    const baseBlockMiss = baseHashes[spanIdx] !== warmupHash;  // always true
    drawText(svg, xs(spanIdx), yBase + blkH + 50,
      `block ${spanIdx}: ${baseBlockMiss ? "✗ MISS" : "HIT"} on warmup`,
      "lbl");
    drawText(svg, xs(spanIdx), yBase + blkH + 66,
      "(chained hash ≠ warmup hash)", "lbl lbl-tiny lbl-soft");

    // === MARKED row (bottom) ===
    drawText(svg, 30, yMarked - 24,
      `step 2: marked run - span_starts = [${spanIdx * 16}]`, "lbl");
    const markedHashes = [];
    for (let i = 0; i < 4; i++) {
      const isPic = i === spanIdx;
      drawBlock(svg, xs(i), yMarked, blkW, blkH,
        isPic ? "pic" : "blk",
        `[${i*16}..${i*16+15}]`);
      let parent;
      if (i === 0) parent = "∅";
      else if (i === spanIdx) parent = "∅"; // chain reset via PIC
      else parent = markedHashes[i - 1];
      // At the span block, use the warmup hash so it visually matches.
      const h = isPic ? warmupHash : fakeHash("marked|" + parent + "|" + i);
      markedHashes.push(h);
      drawHashPill(svg, xs(i) + blkW / 2, yMarked + blkH + 22, h,
        isPic ? "match-b" : "match-a");
      if (i > 0) {
        el("path", {
          d: `M ${xs(i - 1) + blkW},${yMarked + blkH / 2} L ${xs(i)},${yMarked + blkH / 2}`,
          class: "hash-line" + (i === spanIdx ? " cut" : ""),
        }, svg);
      }
    }

    // span_starts marker arrow above marked row
    const markerX = xs(spanIdx);
    el("path", {
      d: `M ${markerX},${yMarked - 8} L ${markerX},${yMarked - 50}`,
      stroke: "var(--recomp)",
      "stroke-width": 2,
      "stroke-dasharray": "3 2",
    }, svg);
    drawText(svg, markerX + 6, yMarked - 36,
      `span_starts = [${spanIdx * 16}]  →  PIC reset here`, "lbl");

    // Connect warmup pill to marked block at spanIdx position
    const warmupX = xs(0) + blkW / 2;
    const warmupY = yWarmup + blkH + 22;
    const markedPicX = xs(spanIdx) + blkW / 2;
    const markedPicY = yMarked + blkH + 22;
    el("path", {
      d: `M ${warmupX},${warmupY}
          C ${warmupX},${(warmupY + markedPicY) / 2}
            ${markedPicX},${(warmupY + markedPicY) / 2}
            ${markedPicX},${markedPicY}`,
      fill: "none",
      stroke: "var(--hash-b)",
      "stroke-width": 1.6,
      "stroke-dasharray": "5 3",
    }, svg);
    drawText(svg, (warmupX + markedPicX) / 2 - 40, (warmupY + markedPicY) / 2 - 4,
      "PIC fan-in → HIT", "lbl");

    // Bottom takeaway
    drawText(svg, 30, H - 18,
      `baseline block ${spanIdx}: chain hash ≠ warmup hash → MISS → fresh K/V written  ·  ` +
      `marked block ${spanIdx}: PIC hash = warmup hash → HIT → cached K/V reused`,
      "lbl lbl-soft");

    label.textContent = `span_starts = [${spanIdx * 16}]`;
  }

  slider.addEventListener("input", render);
  render();
  return { render };
})();

// =============================================================
// TEST 3 · same_pic_chunk_hashes_match_across_requests_no_recompute
// Two requests, different prefixes, same chunk → fan-in.
// =============================================================
const T3 = (function () {
  const root = document.getElementById("viz-t3");
  let prefixSeed = 0;

  function render() {
    const W = 980, H = 280;
    const svg = svgRoot(root, W, H);

    const blkW = 110, blkH = 36, gap = 14;

    const drawRow = (label, y, prefixLabel, prefixSeedStr) => {
      drawText(svg, 30, y - 24, label, "lbl");
      drawBlock(svg, 30, y, blkW, blkH, "blk", prefixLabel);
      drawBlock(svg, 30 + blkW + gap, y, blkW, blkH, "pic", "chunk [500..515]");
      const prefixHash = fakeHash("prefix|" + prefixSeedStr);
      const chunkHash = fakeHash("pic-chunk|500-515");
      drawHashPill(svg, 30 + blkW / 2, y + blkH + 22, prefixHash, "match-a");
      drawHashPill(svg, 30 + blkW + gap + blkW / 2, y + blkH + 22, chunkHash, "match-b");
      return { prefixHash, chunkHash };
    };

    const a = drawRow("Request A - prefix [0..15] + chunk", 60,
      "[0..15]", "0-15-" + prefixSeed);
    const b = drawRow("Request B - prefix [900..915] + chunk", 180,
      "[900..915]", "900-915-" + prefixSeed);

    // Connect chunk pills
    el("path", {
      d: `M ${30 + blkW + gap + blkW / 2 + 40},${60 + blkH + 22}
          C ${500},${60 + blkH + 22} ${500},${180 + blkH + 22}
            ${30 + blkW + gap + blkW / 2 + 40},${180 + blkH + 22}`,
      fill: "none",
      stroke: "var(--hash-b)",
      "stroke-width": 2,
      "stroke-dasharray": "5 3",
    }, svg);
    drawText(svg, 540, (60 + 180) / 2 + blkH + 26,
      "fan-in: identical hash → cache hit on the chunk", "lbl");

    // Connect prefix pills (X - different)
    drawText(svg, 30, H - 30,
      `req_a.block_hashes[0] = ${a.prefixHash}   ≠   req_b.block_hashes[0] = ${b.prefixHash}`,
      "lbl lbl-soft");
    drawText(svg, 30, H - 14,
      `req_a.block_hashes[1] = ${a.chunkHash}   ==   req_b.block_hashes[1] = ${b.chunkHash}   ✓`,
      "lbl");
  }

  document.querySelector('[data-action="t3-shuffle"]').addEventListener("click", () => {
    prefixSeed++;
    render();
  });
  render();
  return { render };
})();

// =============================================================
// TEST 4 · pic_spans_preserve_prefix_caching_across_requests
// Three rows, one per request:
//   req_A = prefix_X + chunk + suffix
//   req_B = prefix_X + chunk + suffix   (identical to A)
//   req_C = prefix_Y + chunk + suffix   (different prefix, same chunk + tail)
// Each row shows 6 blocks + their hash pills. Pills are color-coded by
// equivalence class so cache reuse is read-off-able:
//   green pill - hash matches across all three requests
//   blue pill  - hash matches in A & B only
//   pink pill  - C-specific hash (differs from A & B)
// Toggle PIC on/off to show how the chain reset turns chunk + tail green.
// =============================================================
const T4 = (function () {
  const root = document.getElementById("viz-t4");
  const stateEl = document.getElementById("viz-t4-state");
  let picOn = true;

  // 6 blocks: 2 prefix · 1 PIC chunk · 3 suffix
  const SPAN_AT_BLOCK = 2;
  const NUM_BLOCKS = 6;

  // helper: tag string for each (request, block) - modelling the actual hash chain
  // - prefix blocks (i < SPAN_AT_BLOCK): hash depends on prefix tokens only.
  //   Same regardless of picOn - toggling PIC does not change pre-span hashes.
  // - span block + downstream:
  //     PIC ON  → chain reset at span; hash depends only on chunk + tail content,
  //               not on prefix → identical across A, B, C
  //     PIC OFF → chain continues through prefix; hash depends on prefix → A=B but ≠ C
  function blockHashTag(req, i) {
    const prefix = req === "C" ? "Y" : "X";
    if (i < SPAN_AT_BLOCK) {
      // pre-span: prefix-only chain, never depends on picOn
      return `prefix_${prefix}|i=${i}`;
    }
    if (picOn) {
      // chain reset at span boundary → only depends on block index (chunk + tail content)
      return `picreset|i=${i}`;
    }
    // no PIC: chain continues from prefix
    return `chained|prefix_${prefix}|i=${i}`;
  }

  // colour class: "all" | "ab" | "c"
  function pillClass(i) {
    const ha = fakeHash(blockHashTag("A", i));
    const hb = fakeHash(blockHashTag("B", i));
    const hc = fakeHash(blockHashTag("C", i));
    if (ha === hb && hb === hc) return "all";
    if (ha === hb) return "ab";
    return "c";
  }

  function render() {
    const W = 980, H = 480;
    const svg = svgRoot(root, W, H);

    // --- layout ----------------------------------------------------------
    const blkW = 100, blkH = 34, gap = 14;
    const labelCol = 220;        // left column for "Request A:" labels - wide enough for sublabels
    const xs = i => labelCol + i * (blkW + gap);
    const rowSpacing = 130;
    const rowYs = { A: 60, B: 60 + rowSpacing, C: 60 + 2 * rowSpacing };

    // --- column headers (block tokens) ----------------------------------
    const headerY = 30;
    const colTitles = [
      "prefix[0]", "prefix[1]", "chunk (PIC)",
      "suffix[0]", "suffix[1]", "suffix[2]",
    ];
    for (let i = 0; i < NUM_BLOCKS; i++) {
      const t = el("text", {
        x: xs(i) + blkW / 2, y: headerY,
        "text-anchor": "middle",
        class: "lbl lbl-tiny lbl-soft",
      }, svg);
      t.textContent = colTitles[i];
    }
    // span boundary marker (between block 1 and block 2)
    const spanLineX = xs(SPAN_AT_BLOCK) - gap / 2;
    el("path", {
      d: `M ${spanLineX},${headerY + 8} L ${spanLineX},${rowYs.C + blkH + 50}`,
      stroke: "var(--recomp)",
      "stroke-width": 1.5,
      "stroke-dasharray": "4 3",
    }, svg);
    const spanT = el("text", {
      x: spanLineX, y: headerY + 16,
      "text-anchor": "middle",
      class: "lbl lbl-tiny",
      fill: "var(--recomp)",
    }, svg);
    spanT.textContent = "span_starts = [32]";

    // --- helper: pill styling by class ----------------------------------
    function drawPillForClass(cx, cy, hash, klass) {
      const w = 78, h = 22;
      let stroke = "var(--hash-a)";
      let fill = "#fff";
      if (klass === "all") { stroke = "var(--kv-stroke)"; fill = "var(--kv)"; }
      else if (klass === "ab") { stroke = "var(--hash-a)"; fill = "#fff"; }
      else if (klass === "c") { stroke = "var(--hash-b)"; fill = "#fff"; }
      el("rect", {
        x: cx - w / 2, y: cy - h / 2, width: w, height: h, rx: 11,
        fill, stroke, "stroke-width": 1.4,
      }, svg);
      const t = el("text", {
        x: cx, y: cy + 4,
        "text-anchor": "middle",
        class: "lbl mono",
      }, svg);
      t.textContent = hash;
    }

    // --- draw each request row ------------------------------------------
    function drawRow(req, label, sublabel) {
      const y = rowYs[req];
      // row label
      const lbl1 = el("text", {
        x: 12, y: y + blkH / 2 - 2,
        class: "lbl",
      }, svg);
      lbl1.textContent = label;
      const lbl2 = el("text", {
        x: 12, y: y + blkH / 2 + 14,
        class: "lbl lbl-tiny lbl-soft",
      }, svg);
      lbl2.textContent = sublabel;

      // blocks
      for (let i = 0; i < NUM_BLOCKS; i++) {
        // is this a prefix block (its content depends on req=A/B vs C)?
        const isPic = i === SPAN_AT_BLOCK;
        const isPrefix = i < SPAN_AT_BLOCK;
        const usesPrefY = req === "C" && isPrefix;
        let kind = isPic ? "pic" : "blk";
        let txt;
        // absolute token positions in the prompt - prevents the "S[32..47]
        // overlaps the chunk?" confusion that relative offsets caused
        const tokStart = i * 16;
        const tokEnd = tokStart + 15;
        if (isPrefix) {
          txt = usesPrefY ? `Y[${tokStart}..${tokEnd}]` : `X[${tokStart}..${tokEnd}]`;
        } else if (isPic) {
          txt = `chunk[${tokStart}..${tokEnd}]`;
        } else {
          txt = `tail[${tokStart}..${tokEnd}]`;
        }
        drawBlock(svg, xs(i), y, blkW, blkH, kind, txt);
        // pill below block
        const klass = pillClass(i);
        // for the pill colouring of req row, we want to render each request's
        // own pill - but since A == B by construction, and C may differ from
        // them, every row uses the same colour CLASS per column except that
        // C uses "c" where klass is "ab". Translate:
        let rowClass = klass;
        if (klass === "ab" && req === "C") rowClass = "c";
        const myHash = fakeHash(blockHashTag(req, i));
        drawPillForClass(xs(i) + blkW / 2, y + blkH + 24, myHash, rowClass);
      }
    }

    drawRow("A", "Request A", "prefix_X + chunk + tail");
    drawRow("B", "Request B", "= A (different request_id)");
    drawRow("C", "Request C", "prefix_Y + chunk + tail");

    // --- A↔B equality bars (always full match) --------------------------
    for (let i = 0; i < NUM_BLOCKS; i++) {
      el("line", {
        x1: xs(i) + blkW / 2, y1: rowYs.A + blkH + 36,
        x2: xs(i) + blkW / 2, y2: rowYs.B + blkH - 12,
        stroke: "var(--kv-stroke)",
        "stroke-width": 2,
      }, svg);
      // small "=" glyph
      const eqT = el("text", {
        x: xs(i) + blkW / 2 + 6,
        y: (rowYs.A + rowYs.B) / 2 + blkH / 2 + 8,
        class: "lbl lbl-tiny",
        fill: "var(--kv-stroke)",
      }, svg);
      eqT.textContent = "=";
    }

    // --- B↔C equality / divergence indicators --------------------------
    for (let i = 0; i < NUM_BLOCKS; i++) {
      const klass = pillClass(i);
      const matches = klass === "all";
      const cx = xs(i) + blkW / 2;
      const y1 = rowYs.B + blkH + 36;
      const y2 = rowYs.C + blkH - 12;
      if (matches) {
        el("line", {
          x1: cx, y1, x2: cx, y2,
          stroke: "var(--kv-stroke)",
          "stroke-width": 2,
        }, svg);
        const eqT = el("text", {
          x: cx + 6, y: (y1 + y2) / 2 + 4,
          class: "lbl lbl-tiny",
          fill: "var(--kv-stroke)",
        }, svg);
        eqT.textContent = "=";
      } else {
        // dashed red, with ✗
        el("line", {
          x1: cx, y1, x2: cx, y2,
          stroke: "var(--recomp)",
          "stroke-width": 2,
          "stroke-dasharray": "4 3",
        }, svg);
        const cy = (y1 + y2) / 2;
        el("circle", { cx, cy, r: 8, fill: "#fff" }, svg);
        const r = 5;
        el("line", {
          x1: cx - r, y1: cy - r, x2: cx + r, y2: cy + r,
          stroke: "var(--recomp)", "stroke-width": 2,
          "stroke-linecap": "round",
        }, svg);
        el("line", {
          x1: cx - r, y1: cy + r, x2: cx + r, y2: cy - r,
          stroke: "var(--recomp)", "stroke-width": 2,
          "stroke-linecap": "round",
        }, svg);
      }
    }

    // --- bottom annotations --------------------------------------------
    // Stack layout: pills (rowYs.C+blkH+~36) → annotation → @-arc → caveat
    const annotY = rowYs.C + blkH + 70;
    const t = el("text", {
      x: labelCol, y: annotY,
      class: "lbl",
      fill: picOn ? "var(--ink)" : "var(--recomp)",
    }, svg);
    t.textContent = picOn
      ? "→ chunk + tail block hashes collide across A, B, C  ·  the cache reuses A's stored K/V bytes for those 4 lookups"
      : "✗ without spans: every block downstream of the prefix change has a different hash, no cross-request reuse";

    // --- state readout --------------------------------------------------
    const aHashes = Array.from({length: NUM_BLOCKS}, (_, i) => fakeHash(blockHashTag("A", i)));
    const bHashes = Array.from({length: NUM_BLOCKS}, (_, i) => fakeHash(blockHashTag("B", i)));
    const cHashes = Array.from({length: NUM_BLOCKS}, (_, i) => fakeHash(blockHashTag("C", i)));
    const det = JSON.stringify(aHashes) === JSON.stringify(bHashes);
    const fanIn = aHashes[2] === cHashes[2];
    const tailShare = JSON.stringify(aHashes.slice(2)) === JSON.stringify(cHashes.slice(2));
    const scopedDiv = aHashes.slice(0, 2).every((h, i) => h !== cHashes[i]);

    const ok = (b) => b ? "✓ PASS" : "✗ FAIL";
    const header = picOn
      ? "spans: ON   VLLM_V1_SPANS_ENABLED=True · span_starts=[32]   ← what the test runs"
      : "spans: OFF  VLLM_V1_SPANS_ENABLED=False / no span_starts    ← shown for contrast (test does not run this branch)";
    stateEl.textContent =
      header + "\n" +
      "\n" +
      "structural test (block-hash equality):\n" +
      `  req_a.block_hashes == req_b.block_hashes             ${ok(det)}\n` +
      `  req_a.block_hashes[2] == req_c.block_hashes[2]       ${ok(fanIn)}    (chunk)\n` +
      `  req_a.block_hashes[2:] == req_c.block_hashes[2:]     ${ok(tailShare)}    (chunk + tail)\n` +
      `  req_a.block_hashes[0:2] != req_c.block_hashes[0:2]   ${ok(scopedDiv)}    (prefixes differ)\n` +
      "\n" +
      "e2e test (regression-pin · CURRENTLY FAILS) — H100, Qwen3-0.6B:\n" +
      "  test_pic_chunk_warmup_then_three_requests\n" +
      (picOn
        ? "  step 0: warmup the chunk alone (llm.generate({prompt_token_ids: chunk}, max_tokens=1))\n" +
          "    → cache gains 3 K/V slots (chunk + 2 decode-step blocks)\n" +
          "  then req_A → req_B → req_C in mode SPANS-PC:\n" +
          "    |warmup|=3 · |A|=10 · |B|=10 · |C|=13\n" +
          "    A == B   ✓ (identical prompt → full reuse)\n" +
          "    warmup ⊆ A, B, C   ✓ (chunk slot survives)\n" +
          "    A ⊆ C    ✓ (no eviction)\n" +
          "    |C \\ A| >= 5   ✗ FAIL  (observed: 3)\n" +
          "      → req_C should add 2 prefix_Y blocks PLUS 3 fresh tail blocks\n" +
          "        (tail K/V must NOT be reused across different prefixes -\n" +
          "         cross-attention sees prefix_Y, not prefix_X).\n" +
          "      → observed 3 new slots means vLLM silently reuses A's tail K/V\n" +
          "        for C. The test is RED on purpose: it pins the correctness\n" +
          "        gap until the cache lookup is fixed (cut hash chain at every\n" +
          "        block, or force gap-policy recompute on cross-prefix hits)."
        : "  spans off → no hash collision → C fills its own slots end-to-end, no reuse");

    // flip button label so it always describes the action (the *other* state)
    const btn = document.getElementById("t4-toggle-btn");
    if (btn) btn.textContent = picOn ? "show with spans off" : "show with spans on";
  }

  document.querySelector('[data-action="t4-toggle"]').addEventListener("click", () => {
    picOn = !picOn;
    render();
  });
  render();
  return { render };
})();

// =============================================================
// TEST 5 · legolink_partial_recompute_within_gap_interval
// 6 blocks (2 prefix + 1 PIC span + 3 chain). Gap = (32, 64) covers
// blocks 2 + 3. Blocks 4 + 5 stay cached - not recomputed.
// =============================================================
const T5 = (function () {
  const root = document.getElementById("viz-t5");
  const stateEl = document.getElementById("viz-t5-state");
  let step = 0;
  const STEPS = [
    "step 0 · cold cache, prompt arrives (6 blocks, span at position 32)",
    "step 1 · run #1 cold prefill → K/V written into 6 fresh slots",
    "step 2 · snap_after_1 captured",
    "step 3 · run #2 same prompt → prefix-cache HIT, gap_length=32 fires gap (32, 64)",
    "step 4 · virtual gap req inherits parent's block_ids for the 2 in-gap slots",
    "step 5 · blocks 2-3 recomputed in place; blocks 0, 1, 4, 5 unchanged",
  ];

  const NUM_BLOCKS = 6;
  // Logical roles:  0=prefix 1=prefix 2=PIC-span 3=chain 4=chain 5=chain
  // Gap interval covers blocks 2 + 3 (positions 32-63).
  const GAP_FROM = 2, GAP_TO = 4;  // half-open [from, to)

  function render() {
    const W = 980, H = 360;
    const svg = svgRoot(root, W, H);

    const blkW = 90, blkH = 50, gap = 10;
    const xs = i => 40 + i * (blkW + gap);
    const yPrompt = 50, yKV = 180;

    drawText(svg, 40, yPrompt - 22, "prompt blocks", "lbl");
    drawText(svg, 40, yKV - 22, "KV cache (physical slots)", "lbl");

    // prompt blocks - label by role
    const ROLE_KINDS = ["blk", "blk", "pic", "blk", "blk", "blk"];
    const ROLE_LABELS = ["prefix", "prefix", "PIC span", "chain", "chain", "chain"];
    for (let i = 0; i < NUM_BLOCKS; i++) {
      drawBlock(svg, xs(i), yPrompt, blkW, blkH, ROLE_KINDS[i], ROLE_LABELS[i]);
    }

    // KV slots
    for (let i = 0; i < NUM_BLOCKS; i++) {
      let kind = "tok";
      let label = "(empty)";
      const inGap = i >= GAP_FROM && i < GAP_TO;
      if (step >= 1) { kind = "kv"; label = "K/V #1"; }
      if (step >= 5 && inGap) { kind = "recomp"; label = "K/V #2"; }
      drawBlock(svg, xs(i), yKV, blkW, blkH, kind, label);
      drawText(svg, xs(i) + 4, yKV + blkH + 16,
        `block_id=${100 + i}`, "lbl lbl-tiny lbl-soft");
    }

    // arrows from prompt to KV
    if (step === 1) {
      // cold prefill: all 6 blocks
      for (let i = 0; i < NUM_BLOCKS; i++) {
        el("path", {
          d: `M ${xs(i) + blkW / 2},${yPrompt + blkH} L ${xs(i) + blkW / 2},${yKV - 4}`,
          class: "hash-line",
          stroke: "var(--hash-a)",
          "stroke-width": 2,
        }, svg);
      }
    } else if (step === 5) {
      // gap-recompute: only in-gap blocks
      for (let i = GAP_FROM; i < GAP_TO; i++) {
        el("path", {
          d: `M ${xs(i) + blkW / 2},${yPrompt + blkH} L ${xs(i) + blkW / 2},${yKV - 4}`,
          class: "hash-line",
          stroke: "var(--recomp)",
          "stroke-width": 2,
        }, svg);
      }
    }

    // gap interval shadow at step 3-5 (covers only blocks 2-3)
    if (step >= 3) {
      el("rect", {
        x: xs(GAP_FROM) - 4, y: yPrompt - 6,
        width: (GAP_TO - GAP_FROM) * (blkW + gap) - gap + 8,
        height: blkH + 12,
        class: "gap-rect", rx: 4,
      }, svg);
      drawText(svg, xs(GAP_FROM), yPrompt - 32,
        "gap = (32, 64)  ·  only blocks 2 + 3", "lbl");
    }

    // snapshot pills
    if (step >= 2) {
      drawText(svg, 40, H - 60, "snap_after_1:", "lbl");
      for (let i = 0; i < NUM_BLOCKS; i++) {
        drawHashPill(svg, xs(i) + blkW / 2, H - 50, fakeHash("kv1-" + i), "match-a");
      }
    }
    if (step >= 5) {
      drawText(svg, 40, H - 24, "snap_after_2:", "lbl");
      for (let i = 0; i < NUM_BLOCKS; i++) {
        const inGap = i >= GAP_FROM && i < GAP_TO;
        // recomputed in deterministic mode -> same bytes -> same hash pill colour
        drawHashPill(svg, xs(i) + blkW / 2, H - 14, fakeHash("kv1-" + i),
          inGap ? "match-b" : "match-a");
      }
    }

    stateEl.textContent = STEPS[step] +
      (step >= 5
        ? "\n\nassert SpanAwareGapPolicy(gap_length=32).get_gaps(req) == [(32, 64)]   ✓\n" +
          "assert |new K/V byte-hashes between runs| <= 4   ✓ (gap bounds at 2 blocks + decode slack)\n\n" +
          "real run on H100, Qwen3-0.6B, LL-32 mode:\n" +
          "  structural · gaps = [(32, 64)]              ✓ PASS\n" +
          "  e2e        · |s1|=9, |s2|=9, |new|=0       ✓ PASS\n" +
          "  (deterministic model + temp=0 → recompute reproduces identical bytes;\n" +
          "   the meaningful claim is the upper bound, not the actual diff.)"
        : "");
  }

  document.querySelector('[data-action="t5-step"]').addEventListener("click", () => {
    step = (step + 1) % STEPS.length;
    render();
  });
  document.querySelector('[data-action="t5-reset"]').addEventListener("click", () => {
    step = 0;
    render();
  });
  render();
  return { render };
})();

// =============================================================
// TEST 6 · legolink_gap_huge_equals_full_recompute
// Two pipelines side-by-side. Animate prefill on both;
// LL-FULL pipeline does a second run that re-prefills.
// Output text + top-K logprobs match.
// =============================================================
const T6 = (function () {
  const root = document.getElementById("viz-t6");
  const stateEl = document.getElementById("viz-t6-state");
  let phase = 0; // 0 idle · 1 FR prefill · 2 LL run #1 · 3 LL run #2 (recompute) · 4 compare

  const NUM_BLOCKS = 4;

  function render() {
    const W = 980, H = 380;
    const svg = svgRoot(root, W, H);

    // separator
    el("line", {
      x1: W / 2, y1: 30, x2: W / 2, y2: H - 30,
      class: "section-divider",
    }, svg);

    // Headers
    drawText(svg, 40, 30, "FR pipeline (full recompute)", "lbl");
    drawText(svg, W / 2 + 40, 30, "LL-FULL pipeline (Legolink)", "lbl");

    const blkW = 90, blkH = 36, gap = 8;

    function drawPipeline(originX, kind, runNum) {
      // prompt row
      const yP = 70;
      for (let i = 0; i < NUM_BLOCKS; i++) {
        drawBlock(svg, originX + i * (blkW + gap), yP, blkW, blkH, "blk", `blk ${i}`);
      }
      // KV row
      const yK = 170;
      for (let i = 0; i < NUM_BLOCKS; i++) {
        let k = "tok", label = "(empty)";
        if (kind === "fr-prefill" || (kind === "ll-run1" && phase >= 2) || kind === "ll-run2") {
          k = "kv"; label = "K/V";
        }
        if (kind === "ll-run2") { k = "recomp"; label = "K/V′"; }
        drawBlock(svg, originX + i * (blkW + gap), yK, blkW, blkH, k, label);
      }
      // arrows
      const showArrows =
        (kind === "fr-prefill" && phase >= 1) ||
        (kind === "ll-run1" && phase >= 2) ||
        (kind === "ll-run2" && phase >= 3);
      if (showArrows) {
        for (let i = 0; i < NUM_BLOCKS; i++) {
          el("path", {
            d: `M ${originX + i * (blkW + gap) + blkW / 2},${yP + blkH}
                L ${originX + i * (blkW + gap) + blkW / 2},${yK - 4}`,
            stroke: kind === "ll-run2" ? "var(--recomp)" : "var(--hash-a)",
            "stroke-width": 2,
            class: "hash-line",
          }, svg);
        }
      }
      // gap interval for LL-FULL run #2
      if (kind === "ll-run2" && phase >= 3) {
        el("rect", {
          x: originX - 4, y: yP - 6,
          width: NUM_BLOCKS * (blkW + gap) - gap + 8,
          height: blkH + 12,
          class: "gap-rect", rx: 4,
        }, svg);
      }
      drawText(svg, originX, yK + blkH + 18, runNum, "lbl lbl-soft");
    }

    // FR side
    drawPipeline(40, "fr-prefill", "single run");
    // LL-FULL side: show second run state (collapsed view)
    if (phase < 3) {
      drawPipeline(W / 2 + 40, "ll-run1", phase >= 2 ? "run #1 - cache populated" : "run #1 - cold");
    } else {
      drawPipeline(W / 2 + 40, "ll-run2", "run #2 - cache hit, gap policy re-prefills");
    }

    // Output pills
    const yOut = 290;
    drawText(svg, 40, yOut, "output (top-K logprobs):", "lbl");
    drawText(svg, W / 2 + 40, yOut, "output (top-K logprobs):", "lbl");
    if (phase >= 1) {
      drawHashPill(svg, 220, yOut + 16, fakeHash("fr-out"), "match-b");
    }
    if (phase >= 3) {
      drawHashPill(svg, W / 2 + 220, yOut + 16, fakeHash("fr-out"), "match-b");
    } else if (phase >= 2) {
      drawHashPill(svg, W / 2 + 220, yOut + 16, fakeHash("ll-run1-out"), "match-a");
    }

    // Verdict
    if (phase >= 4) {
      drawText(svg, 40, H - 16,
        "assert replay_text == ref_text   ✓     assert replay_top == ref_top   ✓",
        "lbl");
    }

    const phaseLines = [
      "phase 0 · five LLM configurations, idle",
      "phase 1 · mode FR captures reference next-token top-K",
      "phase 2 · modes SPANS+no_sp, SPANS+sp[0] run (no PIC fan-in, no gap fires)",
      "phase 3 · modes LL-FULL+no_sp, LL-FULL+sp[0] run cold then replay; on the sp[0] mode the gap policy fires (0, num_computed) and re-prefills the entire prompt",
      "phase 4 · all five modes' top-K logprobs compared to FR",
    ];
    let txt = phaseLines[phase];
    if (phase >= 4) {
      txt += "\n\n" +
        "real run on H100, Qwen3-0.6B, tokenized 4-block prompt (no padding):\n" +
        "  mode             text==FR?  top10==FR?  max-Δlogprob   top-1\n" +
        "  ----             ---------  ----------  ------------   -----\n" +
        "  FR               True       True        0.00e+00       id=90  lp=-1.190595\n" +
        "  SPANS+no_sp      True       True        0.00e+00       id=90  lp=-1.190595\n" +
        "  SPANS+sp[0]      True       True        0.00e+00       id=90  lp=-1.190595\n" +
        "  LL-FULL+no_sp    True       True        0.00e+00       id=90  lp=-1.190595\n" +
        "  LL-FULL+sp[0]    True       True        0.00e+00       id=90  lp=-1.190595\n" +
        "\n" +
        "  → all five configurations produce bit-identical next-token distributions\n" +
        "  → in particular, gap-recompute on the LL-FULL+sp[0] path is numerically\n" +
        "    bit-identical to a cold prefill, when the span covers the whole prompt";
    }
    stateEl.textContent = txt;
  }

  document.querySelector('[data-action="t6-run"]').addEventListener("click", () => {
    if (phase >= 4) phase = 0;
    const tick = () => {
      phase = Math.min(phase + 1, 4);
      render();
      if (phase < 4) setTimeout(tick, 800);
    };
    tick();
  });
  document.querySelector('[data-action="t6-reset"]').addEventListener("click", () => {
    phase = 0;
    render();
  });
  render();
  return { render };
})();

// =============================================================
// Re-render on resize so SVGs scale crisply with viewBox
// =============================================================
let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    T1.render();
    T2.render();
    T3.render();
    T4.render();
    T5.render();
    T6.render();
  }, 120);
});
