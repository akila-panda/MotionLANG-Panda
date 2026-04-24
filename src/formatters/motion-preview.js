// Generates a self-contained HTML animation preview file.
// No framework dependencies — CSS @keyframes + vanilla JS only.
// Recreates detected animations on mock element blocks.

/**
 * Generate a self-contained HTML preview file for motionSpec.
 *
 * @param {object} motionSpec
 * @returns {string} - complete HTML document
 */
export function formatPreview(motionSpec) {
  const { meta, fingerprint, animations, tokens, components } = motionSpec;
  const title = meta.title || 'Motion Preview';
  const url   = meta.url || '';

  // Only include animations that have enough data to preview
  const previewable = animations.filter(a => a.duration != null && a.duration > 0);

  const componentList = components || [];
  const hasComponents  = componentList.length > 0;

  // Build CSS keyframes and animation rules
  const keyframesBlock = buildKeyframes(previewable);
  const animationRules = buildAnimationRules(previewable);

  // Build the mock blocks HTML
  const blocksHtml = buildMockBlocks(previewable, componentList);

  // Component filter options
  const filterOptions = hasComponents
    ? componentList.map(c =>
        `<option value="${escHtml(c.id)}">${escHtml(c.label)} (${c.animationIds.length})</option>`
      ).join('\n          ')
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Motion Preview — ${escHtml(title)}</title>
  <style>
    /* ── Reset & base ── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #0f0f13;
      --surface: #1a1a22;
      --border: #2e2e3a;
      --text: #e8e8f0;
      --text-muted: #888899;
      --accent: #6c63ff;
      --accent2: #00d4aa;
      --warn: #f5a623;
      --radius: 8px;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      line-height: 1.5;
    }

    /* ── Header ── */
    .header {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 16px 24px;
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }
    .header-title { font-size: 14px; font-weight: 600; }
    .header-url   { font-size: 12px; color: var(--text-muted); flex: 1; }
    .badge {
      background: var(--accent);
      color: #fff;
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 100px;
    }
    .badge-green { background: var(--accent2); color: #000; }

    /* ── Controls bar ── */
    .controls {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 12px 24px;
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }
    .btn {
      background: var(--accent);
      color: #fff;
      border: none;
      padding: 7px 16px;
      border-radius: var(--radius);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.15s;
    }
    .btn:hover { opacity: 0.85; }
    .btn-ghost {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text);
    }

    label { font-size: 12px; color: var(--text-muted); }

    input[type="range"] {
      width: 120px;
      accent-color: var(--accent);
    }

    select {
      background: var(--surface);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 5px 10px;
      font-size: 12px;
    }

    .toggle-label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      cursor: pointer;
    }

    /* ── Stage ── */
    .stage {
      padding: 32px 24px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    /* ── Mock blocks ── */
    .anim-block {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 16px 20px;
      display: flex;
      align-items: center;
      gap: 16px;
      position: relative;
      overflow: hidden;
    }
    .anim-block.hidden { display: none; }

    .anim-block-bar {
      width: 48px;
      height: 48px;
      border-radius: 6px;
      background: linear-gradient(135deg, var(--accent), var(--accent2));
      flex-shrink: 0;
    }

    .anim-block-info { flex: 1; }
    .anim-id   { font-size: 13px; font-weight: 600; margin-bottom: 2px; }
    .anim-meta { font-size: 11px; color: var(--text-muted); }

    .anim-block-timing {
      text-align: right;
      font-size: 11px;
      color: var(--text-muted);
    }
    .anim-block-timing strong { color: var(--text); font-size: 13px; display: block; }

    /* ── Timeline bar at bottom of each block ── */
    .timeline-track {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: var(--border);
    }
    .timeline-fill {
      height: 100%;
      background: var(--accent);
      transform-origin: left;
      transform: scaleX(0);
    }

    /* ── Stats row ── */
    .stats-row {
      padding: 16px 24px;
      display: flex;
      gap: 24px;
      flex-wrap: wrap;
      border-top: 1px solid var(--border);
    }
    .stat { font-size: 12px; }
    .stat strong { display: block; font-size: 18px; color: var(--accent); }

    /* ── Reduced motion override ── */
    .reduced-motion .anim-block-bar {
      animation: none !important;
      transition: opacity 0.3s !important;
      opacity: 0.5;
    }
    .reduced-motion .timeline-fill { display: none; }

${keyframesBlock}
${animationRules}

    @media (prefers-reduced-motion: reduce) {
      .anim-block-bar { animation: none !important; }
      .timeline-fill  { display: none; }
    }
  </style>
</head>
<body>

<div class="header">
  <span class="header-title">🎬 Motion Preview</span>
  <span class="header-url">${escHtml(url)}</span>
  <span class="badge">${previewable.length} animations</span>
  <span class="badge badge-green">${escHtml(fingerprint.feel || 'unknown')} feel</span>
  ${fingerprint.reducedMotionSupport ? '<span class="badge badge-green">♿ reduced-motion</span>' : ''}
</div>

<div class="controls">
  <button class="btn" id="replayBtn">▶ Replay</button>
  <button class="btn btn-ghost" id="pauseBtn">⏸ Pause</button>

  <label>
    Speed
    <input type="range" id="speedSlider" min="10" max="300" value="100" step="10">
    <span id="speedVal">1×</span>
  </label>

  ${hasComponents ? `
  <label>
    Component
    <select id="componentFilter">
      <option value="all">All components</option>
      ${filterOptions}
    </select>
  </label>` : ''}

  <label class="toggle-label">
    <input type="checkbox" id="reducedMotionToggle">
    Reduced motion
  </label>
</div>

<div class="stage" id="stage">
  ${blocksHtml}
</div>

<div class="stats-row">
  <div class="stat"><strong>${previewable.length}</strong>Animations</div>
  <div class="stat"><strong>${escHtml(fingerprint.dominantPattern || '—')}</strong>Dominant pattern</div>
  <div class="stat"><strong>${escHtml(fingerprint.dominantLibrary || '—')}</strong>Library</div>
  <div class="stat"><strong>${tokens.durations.length}</strong>Duration tokens</div>
  <div class="stat"><strong>${tokens.easings.length}</strong>Easing tokens</div>
</div>

<script>
  const blocks       = Array.from(document.querySelectorAll('.anim-block'));
  const fills        = Array.from(document.querySelectorAll('.timeline-fill'));
  const replayBtn    = document.getElementById('replayBtn');
  const pauseBtn     = document.getElementById('pauseBtn');
  const speedSlider  = document.getElementById('speedSlider');
  const speedVal     = document.getElementById('speedVal');
  const rmToggle     = document.getElementById('reducedMotionToggle');
  const stage        = document.getElementById('stage');
  const compFilter   = document.getElementById('componentFilter');

  let paused = false;

  // ── Replay ──
  function replay() {
    paused = false;
    blocks.forEach(block => {
      const bar = block.querySelector('.anim-block-bar');
      bar.style.animation = 'none';
      void bar.offsetWidth; // reflow
      bar.style.animation = '';
    });
    fills.forEach(fill => {
      fill.style.transition = 'none';
      fill.style.transform  = 'scaleX(0)';
      void fill.offsetWidth;
      fill.style.transition = '';
      fill.style.transform  = 'scaleX(1)';
    });
  }

  replayBtn.addEventListener('click', replay);

  // ── Pause ──
  pauseBtn.addEventListener('click', () => {
    paused = !paused;
    stage.style.animationPlayState = paused ? 'paused' : 'running';
    blocks.forEach(b => {
      b.querySelector('.anim-block-bar').style.animationPlayState = paused ? 'paused' : 'running';
    });
    pauseBtn.textContent = paused ? '▶ Resume' : '⏸ Pause';
  });

  // ── Speed ──
  speedSlider.addEventListener('input', () => {
    const pct  = parseInt(speedSlider.value);
    const mult = (pct / 100).toFixed(1);
    speedVal.textContent = mult + '×';
    document.documentElement.style.setProperty('--speed-mult', mult);
    blocks.forEach(b => {
      b.querySelector('.anim-block-bar').style.animationDuration =
        (b.dataset.baseDuration / pct * 100) + 'ms';
    });
  });

  // ── Reduced motion toggle ──
  rmToggle.addEventListener('change', () => {
    stage.classList.toggle('reduced-motion', rmToggle.checked);
    if (!rmToggle.checked) replay();
  });

  // ── Component filter ──
  if (compFilter) {
    compFilter.addEventListener('change', () => {
      const val = compFilter.value;
      blocks.forEach(block => {
        if (val === 'all' || block.dataset.componentId === val) {
          block.classList.remove('hidden');
        } else {
          block.classList.add('hidden');
        }
      });
    });
  }

  // Auto-start fills on load
  window.addEventListener('load', () => {
    fills.forEach(fill => { fill.style.transform = 'scaleX(1)'; });
  });
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

function durationTransition(fill, ms) {
  return `${fill.style.transition = `transform ${ms}ms linear`}`;
}

/**
 * Build a CSS @keyframes block for each animation based on its pattern.
 */
function buildKeyframes(animations) {
  const seen = new Set();
  const lines = [];

  for (const anim of animations) {
    const kfName = keyframeName(anim);
    if (seen.has(kfName)) continue;
    seen.add(kfName);

    const kf = patternKeyframe(anim.pattern);
    lines.push(`    @keyframes ${kfName} {`);
    for (const [pct, props] of Object.entries(kf)) {
      const propsStr = Object.entries(props).map(([k, v]) => `${k}: ${v}`).join('; ');
      lines.push(`      ${pct} { ${propsStr} }`);
    }
    lines.push(`    }`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Build per-animation CSS rules scoped to [data-anim-id="..."] .anim-block-bar
 */
function buildAnimationRules(animations) {
  const lines = [];

  for (const anim of animations) {
    const id       = anim.id;
    const kfName   = keyframeName(anim);
    const duration = Math.round(anim.duration);
    const delay    = Math.round(anim.delay || 0);
    const easing   = cssEasing(anim);
    const iter     = anim.pattern === 'scroll-linked' ? 'infinite' : '1';

    lines.push(`    [data-anim-id="${escHtml(id)}"] .anim-block-bar {`);
    lines.push(`      animation: ${kfName} ${duration}ms ${easing} ${delay}ms ${iter} both;`);
    lines.push(`    }`);
    lines.push(`    [data-anim-id="${escHtml(id)}"] .timeline-fill {`);
    lines.push(`      transition: transform ${duration + delay}ms linear ${0}ms;`);
    lines.push(`    }`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Build the HTML for mock animation blocks.
 */
function buildMockBlocks(animations, components) {
  if (animations.length === 0) {
    return '<p style="color:var(--text-muted);padding:16px">No previewable animations detected.</p>';
  }

  // Build component lookup
  const compById = {};
  for (const c of components) {
    for (const animId of (c.animationIds || [])) {
      compById[animId] = c;
    }
  }

  return animations.map(anim => {
    const comp       = compById[anim.id];
    const compId     = comp ? comp.id : 'none';
    const compLabel  = comp ? comp.label : '';
    const duration   = Math.round(anim.duration);
    const delay      = Math.round(anim.delay || 0);
    const easing     = anim.easingName || anim.easing || '—';
    const pattern    = anim.pattern || '—';
    const rm         = anim.reducedMotion === 'supported' ? '✅' : '⚠️';

    return `  <div class="anim-block" data-anim-id="${escHtml(anim.id)}" data-component-id="${escHtml(compId)}" data-base-duration="${duration}">
    <div class="anim-block-bar"></div>
    <div class="anim-block-info">
      <div class="anim-id">${escHtml(anim.id)}</div>
      <div class="anim-meta">${escHtml(pattern)} · ${escHtml(easing)}${compLabel ? ` · ${escHtml(compLabel)}` : ''} · ${rm} reduced-motion</div>
    </div>
    <div class="anim-block-timing">
      <strong>${duration}ms</strong>
      ${delay > 0 ? `delay ${delay}ms` : 'no delay'}
    </div>
    <div class="timeline-track"><div class="timeline-fill"></div></div>
  </div>`;
  }).join('\n');
}

function keyframeName(anim) {
  // Unique keyframe name per pattern type so shared patterns reuse frames
  const safe = (anim.pattern || 'generic').replace(/[^a-z0-9]/gi, '-');
  return `ml-${safe}`;
}

/**
 * Map a detected pattern to CSS keyframe stops.
 */
function patternKeyframe(pattern) {
  switch (pattern) {
    case 'fade-in':
    case 'fade':
      return { '0%': { opacity: '0' }, '100%': { opacity: '1' } };

    case 'slide-up':
    case 'stagger':
      return {
        '0%':   { opacity: '0', transform: 'translateY(24px)' },
        '100%': { opacity: '1', transform: 'translateY(0)' },
      };

    case 'slide-down':
      return {
        '0%':   { opacity: '0', transform: 'translateY(-24px)' },
        '100%': { opacity: '1', transform: 'translateY(0)' },
      };

    case 'slide-left':
      return {
        '0%':   { opacity: '0', transform: 'translateX(24px)' },
        '100%': { opacity: '1', transform: 'translateX(0)' },
      };

    case 'slide-right':
      return {
        '0%':   { opacity: '0', transform: 'translateX(-24px)' },
        '100%': { opacity: '1', transform: 'translateX(0)' },
      };

    case 'scale-up':
    case 'spring':
      return {
        '0%':   { opacity: '0', transform: 'scale(0.8)' },
        '100%': { opacity: '1', transform: 'scale(1)' },
      };

    case 'scale-down':
      return {
        '0%':   { opacity: '0', transform: 'scale(1.1)' },
        '100%': { opacity: '1', transform: 'scale(1)' },
      };

    case 'rotate':
      return {
        '0%':   { transform: 'rotate(-8deg) scale(0.9)', opacity: '0' },
        '100%': { transform: 'rotate(0deg) scale(1)',    opacity: '1' },
      };

    case 'scroll-linked':
      return {
        '0%':   { transform: 'translateY(0px)', opacity: '0.4' },
        '50%':  { opacity: '1' },
        '100%': { transform: 'translateY(-20px)', opacity: '0.4' },
      };

    case 'parallax':
      return {
        '0%':   { transform: 'translateY(0px)'  },
        '50%':  { transform: 'translateY(-10px)' },
        '100%': { transform: 'translateY(0px)'  },
      };

    case 'state-change':
    case 'hover':
      return {
        '0%':   { filter: 'brightness(1)'   },
        '50%':  { filter: 'brightness(1.3)' },
        '100%': { filter: 'brightness(1)'   },
      };

    default:
      return {
        '0%':   { opacity: '0.3' },
        '100%': { opacity: '1'   },
      };
  }
}

/**
 * Convert extracted easing to a valid CSS easing value.
 */
function cssEasing(anim) {
  const raw = anim.easing || '';
  if (!raw || raw === 'unknown') return 'ease-out';
  if (raw.startsWith('cubic-bezier')) return raw;
  // Named CSS easings pass through
  const named = ['ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear', 'step-start', 'step-end'];
  if (named.includes(raw)) return raw;
  return 'ease-out';
}