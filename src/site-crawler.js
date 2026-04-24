// Multi-page site crawl orchestrator.
// Wraps the existing single-page extractMotionLanguage() pipeline in a loop
// over internal links discovered from the starting URL.
// src/site-crawler.js

import { extractMotionLanguage } from './index.js';

/**
 * Crawl a site starting from `url`, following internal links up to
 * `depth` levels deep and `maxPages` total pages.
 *
 * @param {string} startUrl - Starting URL
 * @param {object} options  - Crawl options
 * @param {object} extractOptions - Options passed to extractMotionLanguage()
 * @param {function} [onProgress] - Called with (pageUrl, index, total) after each page
 * @returns {Promise<SiteCrawlResult>}
 *
 * @typedef {{
 *   startUrl: string,
 *   crawledUrls: string[],
 *   skippedUrls: string[],
 *   motionSpecs: object[],
 *   errors: Array<{url: string, error: string}>,
 *   options: object
 * }} SiteCrawlResult
 */
export async function crawlSite(startUrl, options = {}, extractOptions = {}, onProgress = null) {
  const {
    depth      = 3,
    maxPages   = 20,
    crawlDelay = 1000,
  } = options;

  const origin = getOrigin(startUrl);
  if (!origin) throw new Error(`Invalid URL: ${startUrl}`);

  const visited    = new Set();
  const queue      = [{ url: normaliseUrl(startUrl), depth: 0 }];
  const motionSpecs = [];
  const errors     = [];
  const skippedUrls = [];

  while (queue.length > 0 && visited.size < maxPages) {
    const { url, depth: currentDepth } = queue.shift();

    if (visited.has(url)) continue;
    visited.add(url);

    if (onProgress) {
      onProgress(url, visited.size, Math.min(maxPages, visited.size + queue.length));
    }

    let spec = null;
    try {
      spec = await extractMotionLanguage(url, extractOptions);
      spec._crawlMeta = { url, depth: currentDepth, crawledAt: new Date().toISOString() };
      motionSpecs.push(spec);
    } catch (err) {
      errors.push({ url, error: err.message });
    }

    // Discover internal links if we haven't hit depth limit
    if (currentDepth < depth && spec) {
      const links = discoverLinks(spec, url, origin);
      for (const link of links) {
        if (!visited.has(link) && !queue.some(q => q.url === link)) {
          queue.push({ url: link, depth: currentDepth + 1 });
        }
      }
    }

    // Respect crawl delay between requests
    if (queue.length > 0 && visited.size < maxPages) {
      await sleep(crawlDelay);
    }
  }

  // Track skipped (discovered but not crawled due to maxPages)
  for (const { url } of queue) {
    if (!visited.has(url)) skippedUrls.push(url);
  }

  return {
    startUrl,
    crawledUrls: [...visited],
    skippedUrls,
    motionSpecs,
    errors,
    options: { depth, maxPages, crawlDelay },
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function normaliseUrl(url) {
  try {
    const u = new URL(url);
    // Strip hash and trailing slash for dedup
    u.hash = '';
    let href = u.href;
    if (href.endsWith('/') && u.pathname !== '/') href = href.slice(0, -1);
    return href;
  } catch {
    return url;
  }
}

/**
 * Extract internal links from a motionSpec's raw data.
 * Falls back to empty array if rawData doesn't have links.
 */
function discoverLinks(spec, currentUrl, origin) {
  // The motionSpec doesn't store discovered links, but the crawler might.
  // We'll use a fallback: if the spec has a raw.links array, use it.
  // Otherwise return empty (links need browser-level discovery).
  const rawLinks = spec?.raw?.discoveredLinks || [];
  const links = [];

  for (const href of rawLinks) {
    try {
      const resolved = new URL(href, currentUrl).href;
      const norm = normaliseUrl(resolved);
      const u = new URL(norm);
      // Internal only, no assets
      if (u.origin === origin && !isAsset(u.pathname)) {
        links.push(norm);
      }
    } catch {
      // skip invalid URLs
    }
  }

  return links;
}

function isAsset(pathname) {
  return /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|pdf|zip|xml|json)$/i.test(pathname);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}