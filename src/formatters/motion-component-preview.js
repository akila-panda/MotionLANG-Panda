// src/formatters/motion-component-preview.js
//
// Generates a self-contained HTML file that reconstructs the ACTUAL component
// from the live site — real HTML, real computed styles, GSAP animations wired
// from the motion spec.
//
// Requires a `snapshot` object produced by crawler.captureComponentSnapshot().

const GSAP_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js';

/**
 * @param {object} motionSpec
 * @param {object} snapshot  — from captureComponentSnapshot()
 * @returns {string}          — complete self-contained HTML document
 */
export function formatComponentPreview(motionSpec, snapshot) {
  const { meta, fingerprint, animations, tokens } = motionSpec;
  const comp = meta.component;

  const title     = comp?.label || meta.title || 'Component Preview';
  const url       = snapshot.pageUrl || meta.url || '';
  const selector  = snapshot.selector || comp?.selector || '';
  const pageBg    = snapshot.pageBg   || '#ffffff';
  const pageColor = snapshot.pageColor || '#000000';
  const pageFontFamily = snapshot.pageFontFamily || 'sans-serif';

  // CSS custom properties captured from the site
  const cssVarsBlock = Object.entries(snapshot.cssVars || {})
    .map(([k, v]) => `  ${escHtml(k)}: ${escHtml(v)};`)
    .join('\n');

  // Build the GSAP animation script from the spec
  const gsapScript = buildGsapScript(animations, selector);

  // Spec pill data
  const specPills = buildSpecPills(animations, tokens, fingerprint);

  // Health badge
  const score  = motionSpec.health?.score ?? null;
  const grade  = motionSpec.health?.grade ?? null;
  const gradeColor = grade === 'A' ? '#0F6E56' : grade === 'B' ? '#185FA5'
    : grade === 'C' ? '#854F0B' : '#A32D2D';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Component Preview — ${escHtml(title)}</title>
  <base href="${escHtml(url)}">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    /* Site CSS custom properties */
    :root {
${cssVarsBlock}
    }

    body {
      font-family: ${escHtml(pageFontFamily)};
      background: #111;
      color: ${escHtml(pageColor)};
      min-height: 100vh;
      line-height: 1.5;
    }

    /* ── Chrome bar ── */
    .ml-bar {
      background: #1a1a22;
      border-bottom: 1px solid #2e2e3a;
      padding: 10px 20px;
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .ml-bar-title { font-size: 12px; font-weight: 600; color: #e8e8f0; }
    .ml-bar-url   { font-size: 11px; color: #666; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ml-pill {
      font-size: 10px;
      font-family: 'SF Mono', 'Fira Code', monospace;
      padding: 2px 7px;
      border-radius: 100px;
      background: #252530;
      color: #888;
      border: 1px solid #2e2e3a;
      white-space: nowrap;
    }
    .ml-pill-purple { background: rgba(127,119,221,0.15); color: #AFA9EC; border-color: rgba(127,119,221,0.3); }
    .ml-pill-warn   { background: rgba(186,117,23,0.15);  color: #EF9F27; border-color: rgba(186,117,23,0.3); }
    .ml-pill-danger { background: rgba(226,75,74,0.15);   color: #F09595; border-color: rgba(226,75,74,0.3); }
    .ml-pill-ok     { background: rgba(29,158,117,0.15);  color: #5DCAA5; border-color: rgba(29,158,117,0.3); }

    /* ── Controls bar ── */
    .ml-controls {
      background: #131318;
      border-bottom: 1px solid #2e2e3a;
      padding: 8px 20px;
      display: flex;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .ml-btn {
      background: #252530;
      color: #e8e8f0;
      border: 1px solid #2e2e3a;
      padding: 5px 13px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
    }
    .ml-btn:hover { background: #2e2e3a; }
    .ml-btn-primary { background: rgba(127,119,221,0.2); color: #AFA9EC; border-color: rgba(127,119,221,0.4); }
    .ml-label { font-size: 11px; color: #666; display: flex; align-items: center; gap: 6px; }
    .ml-controls input[type="range"] { width: 90px; accent-color: #7F77DD; }
    .ml-grade {
      font-size: 11px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 100px;
      background: ${gradeColor}22;
      color: ${gradeColor};
      border: 1px solid ${gradeColor}44;
      margin-left: auto;
    }

    /* ── Stage — uses the site's background ── */
    .ml-stage {
      background: ${escHtml(pageBg)};
      padding: 60px 40px;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 320px;
      overflow: hidden;
      position: relative;
    }

    /* Isolate the component — prevent interference from outer GSAP inline styles */
    .ml-component-wrap {
      width: 100%;
      max-width: ${Math.min(snapshot.elWidth || 1200, 1200)}px;
    }

    /* ── Annotation overlay (shown on hover) ── */
    .ml-annotations {
      display: none;
      position: absolute;
      top: 10px;
      right: 10px;
      background: rgba(10,10,20,0.9);
      border: 1px solid #2e2e3a;
      border-radius: 8px;
      padding: 12px 14px;
      font-size: 11px;
      color: #888;
      font-family: 'SF Mono', monospace;
      max-width: 220px;
      line-height: 1.8;
      z-index: 100;
    }
    .ml-stage:hover .ml-annotations { display: block; }
    .ml-ann-val { color: #AFA9EC; }

    /* ── Spec table ── */
    .ml-spec {
      background: #0d0d14;
      border-top: 1px solid #2e2e3a;
      padding: 16px 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .ml-spec-title { font-size: 10px; font-weight: 600; color: #444; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px; }
    .ml-spec-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 8px;
    }
    .ml-spec-item { }
    .ml-spec-key { font-size: 10px; color: #555; }
    .ml-spec-val { font-size: 12px; color: #e8e8f0; font-family: 'SF Mono', monospace; }

    @media (prefers-reduced-motion: reduce) {
      .ml-component-wrap * { animation: none !important; transition: none !important; }
    }
  </style>
</head>
<body>

<!-- ── Info bar ── -->
<div class="ml-bar">
  <span class="ml-bar-title">Component preview</span>
  <span class="ml-bar-url">${escHtml(url)} → <strong style="color:#e8e8f0">${escHtml(selector)}</strong></span>
  ${specPills}
  ${grade ? `<span class="ml-grade">Grade ${escHtml(grade)} · ${score}/100</span>` : ''}
</div>

<!-- ── Controls ── -->
<div class="ml-controls">
  <button class="ml-btn ml-btn-primary" id="mlReplay">&#9654; Replay</button>
  <button class="ml-btn" id="mlPause">&#9646;&#9646; Pause</button>
  <label class="ml-label">
    Speed
    <input type="range" id="mlSpeed" min="10" max="300" value="100" step="10">
    <span id="mlSpeedVal">1.0×</span>
  </label>
  <label class="ml-label">
    <input type="checkbox" id="mlReducedMotion">
    Reduced motion
  </label>
</div>

<!-- ── Stage: the real component ── -->
<div class="ml-stage" id="mlStage">
  <div class="ml-component-wrap" id="mlWrap">
    ${snapshot.html}
  </div>
  <div class="ml-annotations" id="mlAnnotations">
    <!-- populated by JS after GSAP runs -->
  </div>
</div>

<!-- ── Spec strip ── -->
<div class="ml-spec">
  <div class="ml-spec-title">Motion spec — ${escHtml(comp?.label || selector)}</div>
  <div class="ml-spec-grid" id="mlSpecGrid"></div>
</div>

<script src="${GSAP_CDN}"></script>
<script>
(function () {
  const wrap       = document.getElementById('mlWrap');
  const stage      = document.getElementById('mlStage');
  const replayBtn  = document.getElementById('mlReplay');
  const pauseBtn   = document.getElementById('mlPause');
  const speedRange = document.getElementById('mlSpeed');
  const speedLabel = document.getElementById('mlSpeedVal');
  const rmCheck    = document.getElementById('mlReducedMotion');
  const specGrid   = document.getElementById('mlSpecGrid');
  const annotations = document.getElementById('mlAnnotations');

  let speedMult  = 1;
  let tl         = null;
  let paused     = false;

  // ── Spec data from motionlang ──────────────────────────────────────────
  const SPEC = ${buildSpecJson(animations, tokens)};

  // ── Build spec grid ────────────────────────────────────────────────────
  function buildSpecGrid() {
    const items = [
      { key: 'selector',  val: ${JSON.stringify(selector)} },
      { key: 'animations',val: SPEC.animations.length },
      { key: 'pattern',   val: SPEC.dominantPattern || '—' },
      { key: 'library',   val: SPEC.library || '—' },
      ...SPEC.durations.map((d, i) => ({ key: \`duration-\${i + 1}\`, val: d + 'ms' })),
      ...SPEC.easings.map((e, i)   => ({ key: \`easing-\${i + 1}\`,   val: e })),
    ];
    specGrid.innerHTML = items.map(it =>
      \`<div class="ml-spec-item">
        <div class="ml-spec-key">\${it.key}</div>
        <div class="ml-spec-val">\${it.val}</div>
      </div>\`
    ).join('');
  }

  buildSpecGrid();

  // ── GSAP timeline ──────────────────────────────────────────────────────
  ${gsapScript}

  // ── Replay ────────────────────────────────────────────────────────────
  function replay() {
    paused = false;
    pauseBtn.textContent = '⏸ Pause';
    if (tl) { tl.kill(); }
    // Reset all children to pre-animation state
    gsap.set(wrap.querySelectorAll('*'), { clearProps: 'opacity,transform,y,x,scale' });
    tl = buildTimeline(speedMult);
  }

  replayBtn.addEventListener('click', replay);

  pauseBtn.addEventListener('click', () => {
    if (!tl) return;
    paused = !paused;
    paused ? tl.pause() : tl.resume();
    pauseBtn.textContent = paused ? '▶ Resume' : '⏸ Pause';
  });

  speedRange.addEventListener('input', () => {
    speedMult = parseFloat(speedRange.value) / 100;
    speedLabel.textContent = speedMult.toFixed(1) + '×';
    replay();
  });

  rmCheck.addEventListener('change', () => {
    if (rmCheck.checked) {
      if (tl) tl.kill();
      gsap.set(wrap.querySelectorAll('*'), { clearProps: 'all' });
    } else {
      replay();
    }
  });

  // Autoplay on load
  window.addEventListener('load', () => { setTimeout(replay, 150); });
})();
</script>
</body>
</html>`;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Build the GSAP `buildTimeline(speedMult)` function body from the spec.
 * Returns a JS string that defines `buildTimeline` and uses it.
 */
function buildGsapScript(animations, selector) {
  // Group animations by pattern and stagger config
  const anims = animations.filter(a => a.duration > 0);
  if (anims.length === 0) {
    return `function buildTimeline() {
      return gsap.timeline();
    }`;
  }

  const lines = [];
  lines.push(`function buildTimeline(speedMult = 1) {`);
  lines.push(`  const tl = gsap.timeline();`);
  lines.push(`  const s  = 1 / speedMult; // duration scale`);
  lines.push(`  const wrap = document.getElementById('mlWrap');`);
  lines.push(``);

  // Deduplicate by pattern+duration+easing to build sensible tween groups
  const seen = new Set();
  let timeOffset = 0;

  for (const anim of anims) {
    const dur     = (anim.duration / 1000).toFixed(3);
    const delay   = ((anim.delay   || 0) / 1000).toFixed(3);
    const easing  = gsapEase(anim);
    const pattern = anim.pattern || 'fade-in';
    const stagger = anim.stagger;
    const key     = `${pattern}|${dur}|${easing}`;

    if (seen.has(key)) continue;
    seen.add(key);

    const { fromVars, toVars } = patternVars(pattern);
    const toConfig = {
      ...toVars,
      duration: `${dur} * s`,
      ease: JSON.stringify(easing),
      delay: `${delay} * s`,
    };

    if (stagger) {
      const each = typeof stagger === 'object' ? (stagger.each || 0.05) : (stagger || 0.05);
      const from = typeof stagger === 'object' ? (stagger.from || 'start') : 'start';
      toConfig.stagger = `{ each: ${each} * s, from: "${from}" }`;
    }

    // Target: elements matching the component selector, or direct children
    const target = `wrap.querySelectorAll('${escapeSelectorJs(selector)} > *, ${escapeSelectorJs(selector)}')`

    lines.push(`  // ${pattern} — ${dur}s — ${easing}`);
    lines.push(`  gsap.set(${target}, ${JSON.stringify(fromVars)});`);

    // Build the to() call — stringify then fixup the raw JS expressions
    const toStr = jsonToGsapArgs({
      ...toVars,
      duration: `__RAW__${dur} * s`,
      ease: easing,
      delay: `__RAW__${delay} * s`,
      ...(stagger ? { stagger: `__RAW__{ each: ${(typeof stagger === 'object' ? (stagger.each || 0.05) : stagger)} * s, from: "${typeof stagger === 'object' ? (stagger.from || 'start') : 'start'}" }` } : {}),
    });

    lines.push(`  tl.to(${target}, ${toStr}, ${timeOffset.toFixed(2)});`);
    lines.push(``);
    timeOffset += parseFloat(delay);
  }

  lines.push(`  return tl;`);
  lines.push(`}`);

  return lines.join('\n');
}

function buildSpecJson(animations, tokens) {
  return JSON.stringify({
    animations: animations.map(a => ({ id: a.id, pattern: a.pattern, duration: a.duration, easing: a.easing })),
    dominantPattern: animations[0]?.pattern || null,
    library: animations[0]?.source || null,
    durations: [...new Set(animations.map(a => Math.round(a.duration)).filter(Boolean))].sort((a, b) => a - b),
    easings: (tokens?.easings || []).map(e => e.value || e.name).filter(Boolean).slice(0, 4),
  });
}

function buildSpecPills(animations, tokens, fingerprint) {
  const pills = [];
  const lib = fingerprint?.dominantLibrary;
  if (lib) pills.push(`<span class="ml-pill ml-pill-purple">${escHtml(lib)}</span>`);

  const pattern = fingerprint?.dominantPattern;
  if (pattern) pills.push(`<span class="ml-pill">${escHtml(pattern)}</span>`);

  const durs = [...new Set(animations.map(a => Math.round(a.duration)).filter(Boolean))].sort((a, b) => a - b);
  if (durs.length) pills.push(`<span class="ml-pill">${durs.join(' / ')}ms</span>`);

  if (!fingerprint?.reducedMotionSupport) {
    pills.push(`<span class="ml-pill ml-pill-warn">no reduced-motion</span>`);
  }

  return pills.join('\n  ');
}

function patternVars(pattern) {
  switch (pattern) {
    case 'fade-in':
    case 'fade':
      return { fromVars: { opacity: 0 }, toVars: { opacity: 1 } };
    case 'stagger':
    case 'slide-up':
      return { fromVars: { opacity: 0, y: 24 }, toVars: { opacity: 1, y: 0 } };
    case 'slide-down':
      return { fromVars: { opacity: 0, y: -24 }, toVars: { opacity: 1, y: 0 } };
    case 'slide-left':
      return { fromVars: { opacity: 0, x: 32 }, toVars: { opacity: 1, x: 0 } };
    case 'slide-right':
      return { fromVars: { opacity: 0, x: -32 }, toVars: { opacity: 1, x: 0 } };
    case 'scale-up':
    case 'spring':
      return { fromVars: { opacity: 0, scale: 0.85 }, toVars: { opacity: 1, scale: 1 } };
    case 'scale-down':
      return { fromVars: { opacity: 0, scale: 1.1 }, toVars: { opacity: 1, scale: 1 } };
    case 'rotate':
      return { fromVars: { opacity: 0, rotation: -6, scale: 0.9 }, toVars: { opacity: 1, rotation: 0, scale: 1 } };
    default:
      return { fromVars: { opacity: 0 }, toVars: { opacity: 1 } };
  }
}

function gsapEase(anim) {
  const raw = anim.easing || '';
  if (!raw) return 'power2.out';
  if (raw.startsWith('cubic-bezier')) return raw; // GSAP accepts CSS cubic-bezier strings
  const named = ['ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear'];
  if (named.includes(raw)) return raw;
  // GSAP named easings pass through as-is
  if (raw.includes('.')) return raw; // e.g. power1.inOut, expo.out
  return 'power2.out';
}

function escapeSelectorJs(sel) {
  return sel.replace(/'/g, "\\'");
}

/**
 * Convert a plain object to a GSAP args string, hoisting __RAW__ values as
 * raw JS expressions (not JSON strings).
 */
function jsonToGsapArgs(obj) {
  const parts = Object.entries(obj).map(([k, v]) => {
    if (typeof v === 'string' && v.startsWith('__RAW__')) {
      return `${k}: ${v.slice(7)}`;
    }
    return `${k}: ${JSON.stringify(v)}`;
  });
  return `{ ${parts.join(', ')} }`;
}