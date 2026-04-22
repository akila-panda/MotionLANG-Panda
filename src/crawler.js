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

    // ── Mouse simulation ───────────────────────────────────────────
    if (mouse) {
      const steps = 6;
      for (let row = 0; row <= steps; row++) {
        for (let col = 0; col <= steps; col++) {
          await page.mouse.move(
            Math.round((col / steps) * width),
            Math.round((row / steps) * height)
          );
          await page.waitForTimeout(40);
        }
      }
      await page.waitForTimeout(400);
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
      // Method 1: direct window globals (dev mode)
      if (window.__framer_importFromPackage ||
          window.FramerMotion ||
          window.__FRAMER_MOTION__) {
        return { detected: true, method: 'window-global' };
      }

      // Method 2: compiled Next.js / Vite — data-projection-id on motion elements
      const projectionEls = document.querySelectorAll('[data-projection-id]');
      if (projectionEls.length > 0) {
        return { detected: true, method: 'data-projection-id', count: projectionEls.length };
      }

      // Method 3: framer-motion chunk in script src
      const scripts = Array.from(document.scripts);
      const hasFramerChunk = scripts.some(s =>
        s.src && (s.src.includes('framer-motion') || s.src.includes('framer_motion'))
      );
      if (hasFramerChunk) {
        return { detected: true, method: 'script-src' };
      }

      // Method 4: Next.js RSC payload
      const nextData = window.__NEXT_DATA__;
      if (nextData) {
        const str = JSON.stringify(nextData);
        if (str.includes('framer') || str.includes('motion')) {
          return { detected: true, method: 'next-data' };
        }
      }

      // Method 5: --framer- CSS custom properties in stylesheets
      const framerCSSVars = Array.from(document.styleSheets)
        .flatMap(sheet => {
          try { return Array.from(sheet.cssRules); } catch { return []; }
        })
        .some(rule => {
          try {
            const text = rule.cssText || '';
            return text.includes('--framer-') ||
                   text.includes('framer-motion') ||
                   text.includes('data-framer');
          } catch { return false; }
        });
      if (framerCSSVars) {
        return { detected: true, method: 'css-vars' };
      }

      // Method 6: data-framer-* attributes on elements
      const framerInlineEls = document.querySelectorAll(
        '[style*="--framer"], [data-framer-component-type], [data-framer-name]'
      );
      if (framerInlineEls.length > 0) {
        return { detected: true, method: 'data-framer-attr', count: framerInlineEls.length };
      }

      // Method 7: inline script bundle content signatures
      const hasMotionBundle = scripts.some(s => {
        if (!s.src) {
          return s.textContent.includes('framer-motion') ||
                 s.textContent.includes('useMotionValue') ||
                 s.textContent.includes('AnimatePresence') ||
                 s.textContent.includes('motionValue') ||
                 s.textContent.includes('useAnimation');
        }
        return s.src.includes('framer');
      });
      if (hasMotionBundle) {
        return { detected: true, method: 'bundle-content' };
      }

      return null;
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

    return {
      ...rawData,
      gsap: gsapData,
      framer: framerData,
      aos: aosData,
      scrollReveal: scrollRevealData,
      simulationFlags: { scroll, mouse, interactions },
    };

  } finally {
    await browser.close();
  }
}
