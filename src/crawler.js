// src/crawler.js
import { chromium } from 'playwright';

const MAX_ELEMENTS = 3000;

async function gotoWithRetry(page, url, opts, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await page.goto(url, opts);
      return;
    } catch (err) {
      if (i === retries - 1) throw err;
      await page.waitForTimeout(2000 * (i + 1));
    }
  }
}

export async function crawlPage(url, options = {}) {
  const {
    width = 1280, height = 800, wait = 0,
    scroll = false, mouse = false, interactions = false,
    section = null, executablePath, cookies, headers,
    insecure = false, userAgent,
  } = options;

  const browser = await chromium.launch({
    headless: true,
    ...(executablePath && { executablePath }),
    args: ['--disable-dev-shm-usage'],
  });

  try {
    const context = await browser.newContext({
      viewport: { width, height },
      ignoreHTTPSErrors: insecure,
      ...(userAgent && { userAgent }),
      ...(headers && { extraHTTPHeaders: headers }),
    });

    if (cookies?.length > 0) {
      await context.addCookies(cookies.map(c => {
        if (typeof c === 'string') {
          const [name, ...rest] = c.split('=');
          return { name, value: rest.join('='), url };
        }
        return c;
      }));
    }

    const page = await context.newPage();
    await gotoWithRetry(page, url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('networkidle').catch(() => {});
    if (wait > 0) await page.waitForTimeout(wait);
    await page.evaluate(() => document.fonts.ready).catch(() => {});

    // ── Scroll simulation ──────────────────────────────────────────
    if (scroll) {
      await page.evaluate(async () => {
        await new Promise(resolve => {
          const distance = 120, delay = 80;
          let scrolled = 0;
          const total = document.body.scrollHeight;
          const timer = setInterval(() => {
            window.scrollBy(0, distance);
            scrolled += distance;
            if (scrolled >= total) {
              clearInterval(timer);
              window.scrollTo(0, 0);
              resolve();
            }
          }, delay);
        });
      });
      await page.waitForTimeout(600);
    }

    // ── Mouse simulation + interaction capture ───────────────────
    let mouseInteractionsData = null;
    if (mouse) {
      // Snapshot transforms before traversal
      const before = await page.evaluate(() =>
        Array.from(document.querySelectorAll('*')).slice(0, 2000).map(el => ({
          tag: el.tagName.toLowerCase(),
          id: el.id || null,
          classes: Array.from(el.classList).slice(0, 4).join(' '),
          transform: window.getComputedStyle(el).transform,
          background: window.getComputedStyle(el).backgroundImage,
        }))
      );

      // Grid traversal — 8×8 for thorough coverage
      const steps = 8;
      for (let row = 0; row <= steps; row++) {
        for (let col = 0; col <= steps; col++) {
          await page.mouse.move(
            Math.round((col / steps) * width),
            Math.round((row / steps) * height)
          );
          await page.waitForTimeout(30);
        }
      }
      await page.waitForTimeout(500);

      // Snapshot transforms after traversal
      const after = await page.evaluate(() =>
        Array.from(document.querySelectorAll('*')).slice(0, 2000).map(el => ({
          tag: el.tagName.toLowerCase(),
          id: el.id || null,
          classes: Array.from(el.classList).slice(0, 4).join(' '),
          transform: window.getComputedStyle(el).transform,
          background: window.getComputedStyle(el).backgroundImage,
        }))
      );

      // Diff — find elements whose transform or background changed
      const changed = [];
      for (let i = 0; i < Math.min(before.length, after.length); i++) {
        const b = before[i], a = after[i];
        if (b.transform !== a.transform || b.background !== a.background) {
          changed.push({
            element: `${a.tag}${a.id ? '#' + a.id : ''}${a.classes ? '.' + a.classes.split(' ')[0] : ''}`,
            transformBefore: b.transform,
            transformAfter:  a.transform,
            backgroundChanged: b.background !== a.background,
          });
        }
      }

      // Classify changed elements into mouse interaction patterns
      const parallaxLayers = [];
      const spotlightEls   = [];
      const tiltEls        = [];

      for (const el of changed) {
        if (el.backgroundChanged) {
          spotlightEls.push({ element: el.element, selector: el.element, technique: 'background-gradient', radius: null, color: null });
          continue;
        }
        // Parse matrix to detect rotation vs translation
        const m = el.transformAfter;
        if (m && m !== 'none') {
          const vals = m.match(/matrix(?:3d)?\(([^)]+)\)/)?.[1]?.split(',').map(Number);
          if (vals) {
            if (vals.length === 16) {
              // matrix3d — likely tilt/rotation: extract rotateX/Y from matrix elements
              // matrix3d: [m0..m15], rotateX from vals[6]/vals[10], rotateY from vals[2]/vals[10]
              const rotXRad = Math.atan2(vals[6], vals[10]);
              const rotYRad = Math.atan2(-vals[2], Math.sqrt(vals[6]*vals[6] + vals[10]*vals[10]));
              const maxRotateX = Math.round(Math.abs(rotXRad * 180 / Math.PI) * 10) / 10;
              const maxRotateY = Math.round(Math.abs(rotYRad * 180 / Math.PI) * 10) / 10;
              tiltEls.push({
                element: el.element,
                selector: el.element,
                maxRotateX: maxRotateX || null,
                maxRotateY: maxRotateY || null,
                perspective: null,  // can't read from computed transform
              });
            } else if (vals.length === 6) {
              // matrix(a,b,c,d,tx,ty) — translation = parallax
              // Intensity = px moved per full viewport traversal (approx)
              const txPx = vals[4] ? Math.round(Math.abs(vals[4]) * 10) / 10 : null;
              const tyPx = vals[5] ? Math.round(Math.abs(vals[5]) * 10) / 10 : null;
              // Depth: normalise against viewport — larger movement = shallower depth index
              const depth = tyPx != null ? Math.round((1 - Math.min(tyPx / height, 1)) * 100) / 100 : null;
              parallaxLayers.push({
                element: el.element,
                intensityX: txPx,
                intensityY: tyPx,
                direction: (txPx && tyPx) ? 'both' : txPx ? 'x' : 'y',
                depth,
              });
            }
          }
        }
      }

      // Detect cursor follower — element that closely tracks cursor position
      // Move cursor to a known position, then measure element position offset to estimate lag
      const cursorFollower = await page.evaluate(() => {
        const selectors = [
          '.cursor', '.cursor-dot', '.cursor-ring', '.cursor-follower',
          '[class*="cursor"]', '[class*="follower"]', '[data-cursor]',
        ];
        for (const sel of selectors) {
          try {
            const el = document.querySelector(sel);
            if (!el) continue;
            const cs = window.getComputedStyle(el);
            // Cursor followers are typically position:fixed, small, and have pointer-events:none
            const isFixed     = cs.position === 'fixed';
            const isSmall     = el.offsetWidth < 80 && el.offsetHeight < 80;
            const noPointer   = cs.pointerEvents === 'none';
            if (!isFixed) continue;

            // Estimate lag factor from transition-duration (higher duration = more lag)
            const transitionDuration = cs.transitionDuration;
            let lagFactor = null;
            if (transitionDuration && transitionDuration !== '0s') {
              const ms = parseFloat(transitionDuration) * (transitionDuration.endsWith('ms') ? 1 : 1000);
              // Normalise: 0ms=0 lag, 500ms+=1.0 lag
              lagFactor = Math.min(Math.round((ms / 500) * 100) / 100, 1.0);
            }

            // Detect style type from size and shape
            let style = 'custom';
            if (isSmall && el.offsetWidth <= 12) style = 'dot';
            else if (isSmall && cs.borderRadius === '50%') style = 'ring';

            return {
              detected: true,
              selector: sel,
              element: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className ? '.' + String(el.className).split(' ')[0] : ''),
              style,
              lagFactor,
              isFixed,
              size: { width: el.offsetWidth, height: el.offsetHeight },
            };
          } catch { /* ignore */ }
        }
        return null;
      });

      // Detect magnetic cursor — estimate pull radius from element bounding box + padding
      const magneticEls = await page.evaluate(() => {
        const selectors = ['[data-magnetic]', '[data-cursor-magnetic]', '[class*="magnetic"]'];
        const found = [];
        for (const sel of selectors) {
          try {
            document.querySelectorAll(sel).forEach(el => {
              const rect = el.getBoundingClientRect();
              const cs   = window.getComputedStyle(el);
              // Pull radius: typically 1.5–2× the element's larger dimension
              const largerDim  = Math.max(rect.width, rect.height);
              const pullRadius = largerDim > 0 ? Math.round(largerDim * 1.5) : null;
              // Pull strength: read from data attribute if present, else default 0.3
              const pullStrength = el.dataset.magneticStrength
                ? parseFloat(el.dataset.magneticStrength)
                : 0.3;
              found.push({
                element:  el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className ? '.' + String(el.className).split(' ')[0] : ''),
                selector: sel,
                pullRadius,
                pullStrength,
              });
            });
          } catch { /* ignore */ }
        }
        return found;
      });

      mouseInteractionsData = {
        parallax: parallaxLayers.length > 0
          ? { detected: true, layers: parallaxLayers }
          : null,
        spotlight: spotlightEls.length > 0
          ? { detected: true, elements: spotlightEls }
          : null,
        tilt: tiltEls.length > 0
          ? { detected: true, elements: tiltEls }
          : null,
        cursorFollower: cursorFollower || null,
        magnetic: magneticEls.length > 0
          ? { detected: true, elements: magneticEls }
          : null,
        changedElements: changed.length,
      };
    }

    // ── Interaction simulation ─────────────────────────────────────
    if (interactions) {
      for (const sel of ['button', 'a', 'input', '[role="button"]']) {
        const elements = await page.$$(sel);
        for (const el of elements.slice(0, 20)) {
          try {
            await el.hover({ timeout: 500 });
            await page.waitForTimeout(120);
          } catch { /* not visible */ }
        }
      }
      await page.waitForTimeout(400);
    }

    // ── Extract raw data from page ─────────────────────────────────
    const rawData = await page.evaluate(({ maxElements, sectionSelector }) => {
      const root = sectionSelector
        ? document.querySelector(sectionSelector)
        : document.documentElement;
      if (!root) return { error: `Section not found: ${sectionSelector}` };

      const allElements = Array.from(root.querySelectorAll('*')).slice(0, maxElements);

      const computedStyles = allElements.map(el => {
        const cs = window.getComputedStyle(el);
        return {
          tag: el.tagName.toLowerCase(),
          id: el.id || null,
          classes: Array.from(el.classList).slice(0, 6).join(' '),
          transition: cs.transition,
          animation: cs.animation,
          transform: cs.transform,
          opacity: cs.opacity,
          willChange: cs.willChange,
        };
      }).filter(el =>
        (el.transition && el.transition !== 'none' && el.transition !== 'all 0s ease 0s') ||
        (el.animation && el.animation !== 'none' &&
         el.animation !== 'none 0s ease 0s 1 normal none running') ||
        el.willChange !== 'auto'
      );

      // CSS @keyframes
      const keyframes = [];
      try {
        for (const sheet of Array.from(document.styleSheets)) {
          try {
            for (const rule of Array.from(sheet.cssRules || [])) {
              if (rule instanceof CSSKeyframesRule) {
                keyframes.push({
                  name: rule.name,
                  steps: Array.from(rule.cssRules).map(step => ({
                    offset: step.keyText,
                    style: step.style.cssText,
                  })),
                });
              }
            }
          } catch { /* cross-origin */ }
        }
      } catch { /* ignore */ }

      // Live Web Animations API
      const liveAnimations = [];
      try {
        for (const el of allElements) {
          for (const anim of (el.getAnimations?.() || [])) {
            liveAnimations.push({
              id: anim.id || null,
              playState: anim.playState,
              currentTime: anim.currentTime,
              duration: anim.effect?.getTiming?.()?.duration ?? null,
              delay: anim.effect?.getTiming?.()?.delay ?? null,
              easing: anim.effect?.getTiming?.()?.easing ?? null,
              fill: anim.effect?.getTiming?.()?.fill ?? null,
              iterations: anim.effect?.getTiming?.()?.iterations ?? null,
              target: {
                tag: el.tagName.toLowerCase(),
                id: el.id || null,
                classes: Array.from(el.classList).slice(0, 4).join(' '),
              },
            });
          }
        }
      } catch { /* ignore */ }

      // Motion CSS custom properties
      const motionVariables = {};
      try {
        const allProps = Array.from(document.styleSheets)
          .flatMap(sheet => { try { return Array.from(sheet.cssRules); } catch { return []; } })
          .filter(r => r.selectorText === ':root')
          .flatMap(r => Array.from(r.style));
        const rootStyles = window.getComputedStyle(document.documentElement);
        for (const prop of allProps) {
          if (/duration|ease|delay|transition|motion|animation|spring|timing/.test(prop)) {
            motionVariables[prop] = rootStyles.getPropertyValue(prop).trim();
          }
        }
      } catch { /* ignore */ }

      // prefers-reduced-motion support
      const reducedMotionSupport = (() => {
        try {
          for (const sheet of Array.from(document.styleSheets)) {
            try {
              for (const rule of Array.from(sheet.cssRules || [])) {
                if (rule instanceof CSSMediaRule &&
                    rule.conditionText?.includes('prefers-reduced-motion')) return true;
              }
            } catch { /* cross-origin */ }
          }
        } catch { /* ignore */ }
        return false;
      })();

      return {
        url: window.location.href,
        title: document.title,
        elementCount: allElements.length,
        computedStyles,
        keyframes,
        liveAnimations,
        motionVariables,
        reducedMotionSupport,
      };
    }, { maxElements: MAX_ELEMENTS, sectionSelector: section });

    // ── GSAP detection ─────────────────────────────────────────────
    const gsapData = await page.evaluate(() => {
      if (!window.gsap) return null;
      try {
        const tweens = [];
        const tl = window.gsap.globalTimeline;
        if (tl?.getChildren) {
          for (const child of tl.getChildren(true, true, false)) {
            tweens.push({
              targets: child.targets?.().map(t => ({
                tag: t?.tagName?.toLowerCase?.() || null,
                id: t?.id || null,
                classes: t?.className || null,
              })) || [],
              duration: child.duration?.() ?? null,
              delay: child.delay?.() ?? null,
              vars: {
                ease: child.vars?.ease || null,
                stagger: child.vars?.stagger || null,
                x: child.vars?.x ?? null,
                y: child.vars?.y ?? null,
                opacity: child.vars?.opacity ?? null,
                scale: child.vars?.scale ?? null,
              },
            });
          }
        }
        const scrollTriggers = [];
        if (window.ScrollTrigger?.getAll) {
          for (const st of window.ScrollTrigger.getAll()) {
            scrollTriggers.push({
              trigger: st.vars?.trigger || null,
              start: st.vars?.start || null,
              end: st.vars?.end || null,
              scrub: st.vars?.scrub ?? null,
              pin: st.vars?.pin ?? null,
            });
          }
        }
        return { detected: true, version: window.gsap.version, tweens, scrollTriggers };
      } catch {
        return { detected: true, version: window.gsap?.version, tweens: [], scrollTriggers: [] };
      }
    });

    // ── Framer Motion detection ────────────────────────────────────
    const framerData = await page.evaluate(() => {
      const scripts = Array.from(document.scripts);

      // ── Presence detection (7 methods) ──────────────────────────
      let detected = false;
      let method = null;

      if (window.__framer_importFromPackage || window.FramerMotion || window.__FRAMER_MOTION__) {
        detected = true; method = 'window-global';
      }
      if (!detected && document.querySelectorAll('[data-projection-id]').length > 0) {
        detected = true; method = 'data-projection-id';
      }
      if (!detected && scripts.some(s => s.src && (s.src.includes('framer-motion') || s.src.includes('framer_motion')))) {
        detected = true; method = 'script-src';
      }
      if (!detected && window.__NEXT_DATA__) {
        const str = JSON.stringify(window.__NEXT_DATA__);
        if (str.includes('framer') || str.includes('motion')) { detected = true; method = 'next-data'; }
      }
      if (!detected) {
        const hasFramerCSS = Array.from(document.styleSheets)
          .flatMap(sheet => { try { return Array.from(sheet.cssRules); } catch { return []; } })
          .some(rule => { try { const t = rule.cssText || ''; return t.includes('--framer-') || t.includes('data-framer'); } catch { return false; } });
        if (hasFramerCSS) { detected = true; method = 'css-vars'; }
      }
      if (!detected && document.querySelectorAll('[style*="--framer"], [data-framer-component-type], [data-framer-name]').length > 0) {
        detected = true; method = 'data-framer-attr';
      }
      if (!detected && scripts.some(s => !s.src && (
        s.textContent.includes('useMotionValue') || s.textContent.includes('AnimatePresence') ||
        s.textContent.includes('motionValue') || s.textContent.includes('framer-motion')
      ))) {
        detected = true; method = 'bundle-content';
      }

      if (!detected) return null;

      // ── Deep extraction: motion elements from DOM ────────────────
      // data-projection-id marks every <motion.X> element in compiled output
      const projectionEls = Array.from(document.querySelectorAll('[data-projection-id]'));

      const variants = [];
      const springs  = [];

      for (const el of projectionEls.slice(0, 60)) {
        const cs   = window.getComputedStyle(el);
        const tag  = el.tagName.toLowerCase();
        const id   = el.id || null;
        const cls  = Array.from(el.classList).slice(0, 4).join(' ');
        const selector = tag + (id ? `#${id}` : cls ? `.${cls.split(' ')[0]}` : '');

        // Read transition timing from computed style
        const transition   = cs.transition;
        const animation    = cs.animation;
        const opacity      = parseFloat(cs.opacity);
        const transform    = cs.transform;

        // Read --framer-* CSS custom properties for spring/timing tokens
        const style = el.style;
        const springDamping   = style.getPropertyValue('--framer-spring-damping')   || null;
        const springStiffness = style.getPropertyValue('--framer-spring-stiffness') || null;
        const springMass      = style.getPropertyValue('--framer-spring-mass')      || null;
        const duration        = style.getPropertyValue('--framer-duration')         || null;
        const ease            = style.getPropertyValue('--framer-ease')             || null;

        // Infer initial/animate values from current visible state
        const hasTranslate = transform && transform !== 'none' && transform !== 'matrix(1, 0, 0, 1, 0, 0)';
        const isHidden     = opacity < 0.05;
        const isHidden50   = opacity < 0.5;

        // Only include elements that show animation signals
        if (!transition || transition === 'none' || transition === 'all 0s ease 0s') continue;

        const variant = {
          selector,
          transition: transition || null,
          animation:  animation  || null,
          opacity:    cs.opacity,
          transform:  transform  || null,
          ease:       ease       || extractEaseFromTransition(transition),
          duration:   duration   || extractDurationFromTransition(transition),
          initial: isHidden  ? { opacity: 0, y: 20 }
                 : hasTranslate ? { opacity: 0, transform }
                 : null,
          animate: { opacity: isHidden ? 0 : 1 },
        };
        variants.push(variant);

        // Spring detection from --framer- custom properties
        if (springDamping || springStiffness) {
          springs.push({
            selector,
            damping:   springDamping   ? parseFloat(springDamping)   : null,
            stiffness: springStiffness ? parseFloat(springStiffness) : null,
            mass:      springMass      ? parseFloat(springMass)      : null,
          });
        }
      }

      // ── whileInView elements: look for viewport-entering animations ──
      // Elements using IntersectionObserver + Framer typically have
      // data-framer-appear-id or are inside a [data-framer-component-type]
      const whileInViewEls = Array.from(document.querySelectorAll(
        '[data-framer-appear-id], [data-framer-component-type="scroll"] *'
      )).slice(0, 20);
      const whileInView = whileInViewEls.map(el => ({
        selector: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : ''),
        threshold: 0.2, // Framer default
      }));

      // Helper functions (must be defined inline for page.evaluate scope)
      function extractEaseFromTransition(t) {
        if (!t) return null;
        const m = t.match(/cubic-bezier\([^)]+\)/);
        return m ? m[0] : null;
      }
      function extractDurationFromTransition(t) {
        if (!t) return null;
        const m = t.match(/([\d.]+)s/);
        return m ? `${parseFloat(m[1]) * 1000}ms` : null;
      }

      return {
        detected,
        method,
        variants: variants.slice(0, 40),
        springs:  springs.slice(0, 20),
        whileInView: whileInView.slice(0, 20),
        counts: {
          projectionElements: projectionEls.length,
          variants:    variants.length,
          springs:     springs.length,
          whileInView: whileInView.length,
        },
      };
    });

    // ── AOS detection ──────────────────────────────────────────────
    const aosData = await page.evaluate(() => {
      const extractAosElements = () =>
        Array.from(document.querySelectorAll('[data-aos]')).map(el => ({
          selector: el.tagName.toLowerCase() +
                    (el.id ? `#${el.id}` : '') +
                    (el.className ? `.${String(el.className).split(' ')[0]}` : ''),
          animation: el.dataset.aos,
          duration: el.dataset.aosDuration || null,
          delay: el.dataset.aosDelay || null,
          easing: el.dataset.aosEasing || null,
          once: el.dataset.aosOnce || null,
        }));

      // Method 1: window.AOS runtime object
      if (window.AOS) {
        return {
          detected: true,
          method: 'window-AOS',
          version: window.AOS?.version || null,
          elements: extractAosElements(),
        };
      }

      // Method 2: data-aos attributes present without runtime
      const aosEls = document.querySelectorAll('[data-aos]');
      if (aosEls.length > 0) {
        return {
          detected: true,
          method: 'data-aos-attrs',
          version: null,
          elements: extractAosElements(),
        };
      }

      return null;
    });


    // ── ScrollReveal detection ─────────────────────────────────────────
    const scrollRevealData = await page.evaluate(() => {
      // Method 1: window.sr or window.ScrollReveal runtime object
      const srInstance = window.sr || (window.ScrollReveal && window.ScrollReveal());
      if (srInstance?.store?.elements) {
        const elements = Object.values(srInstance.store.elements).map(entry => ({
          selector: entry.target
            ? entry.target.tagName.toLowerCase() +
              (entry.target.id ? `#${entry.target.id}` : '') +
              (entry.target.className
                ? `.${String(entry.target.className).split(' ')[0]}`
                : '')
            : null,
          duration: entry.config?.duration || null,
          delay:    entry.config?.delay    || null,
          distance: entry.config?.distance || null,
          origin:   entry.config?.origin   || null,
          opacity:  entry.config?.opacity  ?? null,
          easing:   entry.config?.easing   || null,
          reset:    entry.config?.reset    || false,
        }));
        return { detected: true, method: 'sr-store', elements };
      }

      // Method 2: data-sr-id attributes stamped by ScrollReveal on elements
      const srEls = document.querySelectorAll('[data-sr-id]');
      if (srEls.length > 0) {
        return {
          detected: true,
          method: 'data-sr-id',
          elements: Array.from(srEls).map(el => ({
            selector: el.tagName.toLowerCase() +
                      (el.id ? `#${el.id}` : '') +
                      (el.className ? `.${String(el.className).split(' ')[0]}` : ''),
            duration: null, delay: null, distance: null,
            origin: null, opacity: null, easing: null, reset: false,
          })),
        };
      }

      return null;
    });


    // ── CDP Animation domain ───────────────────────────────────────────
    // Captures ALL animations via Chrome DevTools Protocol — cross-library
    // fallback that catches what DOM-based detectors miss.
    let cdpAnimationsData = null;
    try {
      const cdpSession = await context.newCDPSession(page);
      await cdpSession.send('Animation.enable');

      const captured = [];

      cdpSession.on('Animation.animationCreated', (event) => {
        // event.id is the animation id — fetch details below
        captured.push({ id: event.id });
      });

      // Brief settle to collect any animations that fired on load
      await page.waitForTimeout(400);

      // Fetch full details for each captured animation
      const detailed = [];
      for (const { id } of captured.slice(0, 200)) {
        try {
          const detail = await cdpSession.send('Animation.getPlaybackRate');
          const animDetail = await cdpSession.send('Animation.resolveAnimation', { animationId: id });
          detailed.push({
            id,
            playbackRate: detail.playbackRate,
            ...animDetail,
          });
        } catch { /* animation may have finished */ }
      }

      // Also use getAllAnimations if available (Chrome 116+)
      let allAnimations = [];
      try {
        const result = await page.evaluate(() => {
          const anims = [];
          document.getAnimations?.()?.forEach(a => {
            anims.push({
              id: a.id || null,
              name: a.animationName || (a.effect?.target ? 'unnamed' : null),
              type: a.constructor?.name || 'WebAnimation',
              playState: a.playState,
              target: a.effect?.target
                ? {
                    tag: a.effect.target.tagName?.toLowerCase(),
                    id: a.effect.target.id || null,
                    classes: Array.from(a.effect.target.classList || []).slice(0, 4).join(' '),
                  }
                : null,
              source: {
                timing: {
                  duration:   a.effect?.getTiming?.()?.duration ?? null,
                  delay:      a.effect?.getTiming?.()?.delay ?? null,
                  easing:     a.effect?.getTiming?.()?.easing ?? null,
                  fill:       a.effect?.getTiming?.()?.fill ?? null,
                  iterations: a.effect?.getTiming?.()?.iterations ?? null,
                  direction:  a.effect?.getTiming?.()?.direction ?? null,
                },
                keyframesRule: {
                  keyframes: a.effect?.getKeyframes?.()?.map(kf => ({
                    offset: kf.computedOffset,
                    easing: kf.easing,
                  })) || [],
                },
              },
            });
          });
          return anims;
        });
        allAnimations = result;
      } catch { /* getAnimations not available */ }

      await cdpSession.send('Animation.disable');
      await cdpSession.detach();

      if (allAnimations.length > 0 || detailed.length > 0) {
        cdpAnimationsData = {
          detected: true,
          animations: allAnimations.length > 0 ? allAnimations : detailed,
        };
      }
    } catch { /* CDP not available or blocked */ }

    return {
      ...rawData,
      gsap: gsapData,
      framer: framerData,
      aos: aosData,
      scrollReveal: scrollRevealData,
      cdpAnimations: cdpAnimationsData,
      mouseInteractions: mouseInteractionsData,
      simulationFlags: { scroll, mouse, interactions },
    };

  } finally {
    await browser.close();
  }
}