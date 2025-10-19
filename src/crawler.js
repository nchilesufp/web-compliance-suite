/**
 * Web Crawler for Accessibility Auditing
 * Crawls websites and extracts URLs for accessibility testing
 */

export class WebCrawler {
  constructor(browser, options = {}) {
    this.includeExternal = options.includeExternal || false;
    this.browser = browser;
    this.maxDepth = options.maxDepth || 2;
    this.maxPages = options.maxPages || 10;
    this.spaDiscovery = !!options.spaDiscovery;
    this.rescanWait = typeof options.rescanWait === 'number' ? options.rescanWait : 1500;
    this.keepQuery = !!options.keepQuery;
  this.includeSubdomains = !!options.includeSubdomains;
  this.extraDiscovery = !!options.extraDiscovery;
    this.navPrefetch = !!options.navPrefetch;
    this.visitedUrls = new Set();
    this.urlsToVisit = [];
    this.baseDomain = '';
    this.baseHost = '';
    this.baseHostNormalized = '';
    this.results = [];
    this.timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : 30000;
  this.linkWaitMs = typeof options.linkWaitMs === 'number' ? options.linkWaitMs : 3000;
  }

  /**
   * Start crawling from a given URL
   * @param {string} startUrl - URL to start crawling from
   * @returns {Array} Array of URLs to audit
   */
  async crawl(startUrl) {
    try {
      const base = new URL(startUrl);
      this.baseDomain = base.origin;
      this.baseHost = base.hostname;
      this.baseHostNormalized = this._normalizeHost(this.baseHost);
      // Normalize the starting URL so root pages are consistent (always include trailing slash)
      const cleanStart = this._cleanUrl(startUrl);
      this.urlsToVisit = [{ url: cleanStart, depth: 0 }];
      this.visitedUrls.clear();
      this.results = [];

      console.log(`Starting crawl from: ${startUrl}`);
      console.log(`Max depth: ${this.maxDepth}, Max pages: ${this.maxPages}`);

      while (this.urlsToVisit.length > 0 && this.visitedUrls.size < this.maxPages) {
        const { url, depth } = this.urlsToVisit.shift();
        const normalized = this._cleanUrl(url);

        if (this.visitedUrls.has(normalized) || depth > this.maxDepth) {
          continue;
        }

        try {
          const page = await this.browser.newPage();
          const pageData = await this.crawlPage(page, normalized, depth);
          this.results.push(pageData);
          this.visitedUrls.add(normalized);
          await page.close();
        } catch (error) {
          console.warn(`Error crawling ${url}:`, error.message);
          this.results.push({
            url: normalized,
            depth,
            error: error.message,
            links: [],
            title: 'Error'
          });
        }
      }

      console.log(`Crawl complete. Found ${this.visitedUrls.size} pages.`);
      return Array.from(this.visitedUrls);
    } catch (error) {
      console.error('Crawl failed:', error);
      throw error;
    }
  }

  /**
   * Seed the crawl queue with URLs (e.g., from sitemap)
   * @param {string[]} urls
   */
  seedUrls(urls = []) {
    for (const u of urls) {
      try {
        const nu = new URL(u);
        const sameSite = this.includeExternal || this._normalizeHost(nu.hostname) === this.baseHostNormalized;
        if (!sameSite) continue;
        const clean = this._cleanUrl(nu);
        if (!this.visitedUrls.has(clean) && !this.urlsToVisit.some(i => i.url === clean)) {
          this.urlsToVisit.push({ url: clean, depth: 1 });
        }
      } catch {}
    }
  }

  /**
   * Crawl a single page and extract links
   * @param {Page} page - Playwright page object
   * @param {string} url - URL to crawl
   * @param {number} depth - Current crawl depth
   * @returns {Object} Page data with links
   */
  async crawlPage(page, url, depth) {
    try {
      // Try strictest wait first; fall back if the site never reaches networkidle
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: this.timeoutMs });
      } catch (e1) {
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: Math.max(5000, Math.floor(this.timeoutMs / 2)) });
        } catch (e2) {
          // Final fallback to 'load'
          await page.goto(url, { waitUntil: 'load', timeout: Math.max(5000, Math.floor(this.timeoutMs / 2)) });
        }
      }

      // Get page title
      let title = 'Untitled';
      try {
        title = await page.title();
      } catch {}

        // Attempt to accept cookie/consent banners to reveal nav/content
        try {
          await page.evaluate(() => {
            const texts = /^(accept|agree|allow all|accept all|ok|got it|i agree|continue)/i;
            const candidates = Array.from(document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]'));
            for (const el of candidates) {
              const t = (el.textContent || el.value || '').trim();
              if (texts.test(t)) {
                el.click();
                break;
              }
            }
          });
          // Small delay after clicking consent
          await page.waitForTimeout(500);
        } catch {}

      // Optional rescan wait to allow SPA hydration
      if (this.rescanWait > 0) {
        try { await page.waitForTimeout(this.rescanWait); } catch {}
      }

      // Try opening common nav/menu toggles before extracting links
      try {
        const toggles = ['button[aria-controls]', 'button[aria-expanded="false"]', '.menu-toggle', '.navbar-toggler'];
        for (const sel of toggles) {
          const has = await page.$(sel);
          if (has) {
            try { await has.click({ timeout: 2000 }); } catch {}
          }
        }
      } catch {}

      // Extract all internal links (anchors plus SPA patterns if enabled)
      let links = [];
      let snapshotPath = '';
      try {
        links = await page.evaluate(async (baseDomain, baseHostNormalized, includeExternal, spaDiscovery, keepQuery, includeSubdomains, extraDiscovery, linkWaitMs) => {
        const normalizeHost = (host) => host.replace(/^www\./i, '');
        const sameSite = (u) => {
          if (includeExternal) return true;
          if (u.origin === baseDomain) return true;
          const h = normalizeHost(u.hostname);
          const baseHost = baseHostNormalized;
          if (h === baseHost) return true;
          if (includeSubdomains && h.endsWith('.' + baseHost)) return true;
          return false;
        };
        const clean = (u) => {
          try {
            const urlObj = typeof u === 'string' ? new URL(u) : u;
            if (!keepQuery) { urlObj.search = ''; }
            urlObj.hash = '';
            return `${urlObj.origin}${urlObj.pathname}${keepQuery ? urlObj.search : ''}`;
          } catch { return null; }
        };

        const addIfSameSite = (set, u) => {
          try {
            const baseUri = document.baseURI || window.location.href;
            const uu = typeof u === 'string' ? new URL(u, baseUri) : u;
            if (!sameSite(uu)) return;
            const c = clean(uu);
            if (c) set.add(c);
          } catch {}
        };

          const internalLinks = new Set();

          const scanDocument = (doc) => {
            // a[href]
            doc.querySelectorAll('a[href]').forEach(a => {
              const href = a.getAttribute('href');
              if (!href) return;
              if (/^(mailto:|tel:|javascript:)/i.test(href)) return;
              addIfSameSite(internalLinks, href);
            });
            if (spaDiscovery) {
              doc.querySelectorAll('[role="link"][data-href]').forEach(el => {
                const h = el.getAttribute('data-href');
                if (h) addIfSameSite(internalLinks, h);
              });
              doc.querySelectorAll('[onclick]').forEach(el => {
                const js = el.getAttribute('onclick') || '';
                const m = js.match(/location\.(href|assign|replace)\s*=\s*['\"]([^'\"]+)['\"]/i);
                if (m && m[2]) addIfSameSite(internalLinks, m[2]);
              });
            }
            // Traverse shadow roots
            const walker = doc.createTreeWalker(doc, NodeFilter.SHOW_ELEMENT);
            let node;
            while ((node = walker.nextNode())) {
              if (node.shadowRoot) {
                scanDocument(node.shadowRoot);
              }
            }
          };

          // Extra discovery: scroll + hover to reveal menus/lazy links
          if (extraDiscovery) {
            try {
              window.scrollTo(0, document.body.scrollHeight);
              window.scrollTo(0, 0);
            } catch {}
            try {
              document.querySelectorAll('nav a, nav button, .menu, .menu *').forEach(el => {
                el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
              });
            } catch {}
          }

          // Scan main document
          scanDocument(document);

          // Same-origin iframes
          document.querySelectorAll('iframe').forEach(iframe => {
            try {
              const idoc = iframe.contentDocument;
              if (idoc) scanDocument(idoc);
            } catch {}
          });

          // Parse noscript anchors
          if (extraDiscovery) {
            document.querySelectorAll('noscript').forEach(ns => {
              try {
                const tmp = document.createElement('div');
                tmp.innerHTML = ns.textContent || '';
                tmp.querySelectorAll('a[href]').forEach(a => {
                  const href = a.getAttribute('href');
                  if (!href) return;
                  if (/^(mailto:|tel:|javascript:)/i.test(href)) return;
                  addIfSameSite(internalLinks, href);
                });
              } catch {}
            });
          }

          // Fallback: regex-scan HTML for href attributes if nothing found yet
          if (extraDiscovery && internalLinks.size === 0) {
            try {
              const html = document.documentElement ? document.documentElement.innerHTML : document.body.innerHTML;
              const re = /href\s*=\s*(["'])(.*?)\1/gi;
              let m;
              while ((m = re.exec(html)) !== null) {
                const href = m[2];
                if (!href || /^(mailto:|tel:|javascript:|#)/i.test(href)) continue;
                addIfSameSite(internalLinks, href);
              }
            } catch {}
          }

          // If nothing yet, poll briefly for anchors to appear
          if (internalLinks.size === 0 && linkWaitMs > 0) {
            const end = Date.now() + linkWaitMs;
            while (Date.now() < end && internalLinks.size === 0) {
              await new Promise(r => setTimeout(r, 200));
              scanDocument(document);
            }
          }

          // Use canonical href as a hint
          try {
            const can = document.querySelector('link[rel="canonical"][href]');
            if (can) addIfSameSite(internalLinks, can.getAttribute('href'));
          } catch {}

          // As a final fallback, use document.links
          if (internalLinks.size === 0) {
            try {
              Array.from(document.links).forEach(a => {
                const href = a.getAttribute('href') || a.href;
                if (!href || /^(mailto:|tel:|javascript:)/i.test(href)) return;
                addIfSameSite(internalLinks, href);
              });
            } catch {}
          }

        return Array.from(internalLinks);
        }, this.baseDomain, this.baseHostNormalized, this.includeExternal, this.spaDiscovery, this.keepQuery, this.includeSubdomains, this.extraDiscovery, this.linkWaitMs);
      } catch (e) {
        // Keep page success; just record zero links
        links = [];
      }

      // Optional nav-prefetch: collect obvious navigation anchors early
      if (this.navPrefetch) {
        try {
          const navHrefs = await page.$$eval(
            'header a[href], nav a[href], [role="navigation"] a[href], .nav a[href], .navbar a[href], .menu a[href], footer a[href]'
          , els => els.map(a => a.getAttribute('href') || a.href).filter(Boolean));
          const prefetch = await this._filterAndNormalizeHrefs(page, navHrefs);
          links = Array.from(new Set([...(links || []), ...prefetch]));
        } catch {}
      }

      // If still no links, fallback to a direct anchor scrape outside the page sandbox
      if (!links || links.length === 0) {
        try {
          const rawAnchors = await page.$$eval('a[href]', els => els.map(a => a.getAttribute('href') || a.href).filter(Boolean));
          const anchorLinks = await this._filterAndNormalizeHrefs(page, rawAnchors);
          links = Array.from(new Set(anchorLinks));
        } catch {}
      }

      // If still no links, save a tiny HTML snapshot for debugging (verbose callers will print path)
      if (links.length === 0) {
        try {
          const html = await page.content();
          const safeHost = this.baseHostNormalized || 'page';
          const fileName = `crawl_debug_${safeHost}_${Date.now()}.html`;
          const fs = await import('fs');
          fs.writeFileSync(fileName, html.slice(0, 200000));
          snapshotPath = fileName;
        } catch {}
      }

      // Add new links to visit queue
      links.forEach(linkUrl => {
        if (!this.visitedUrls.has(linkUrl) && !this.urlsToVisit.some(item => item.url === linkUrl)) {
          this.urlsToVisit.push({ url: linkUrl, depth: depth + 1 });
        }
      });

      return {
        url,
        depth,
        title,
        links,
        linkCount: links.length,
        linkSamples: links.slice(0, 3),
        snapshotPath: snapshotPath || undefined,
        status: 'success'
      };
    } catch (error) {
      return {
        url,
        depth,
        title: 'Error',
        links: [],
        linkCount: 0,
        status: 'error',
        error: error.message
      };
    }
  }

  /**
   * Get crawl statistics
   * @returns {Object} Crawl statistics
   */
  getStatistics() {
    const successful = this.results.filter(r => r.status === 'success').length;
    const errors = this.results.filter(r => r.status === 'error').length;
    const totalLinks = this.results.reduce((sum, r) => sum + r.linkCount, 0);

    return {
      totalPages: this.visitedUrls.size,
      successfulPages: successful,
      errorPages: errors,
      totalLinksFound: totalLinks,
      averageLinksPerPage: totalLinks / Math.max(successful, 1),
      baseDomain: this.baseDomain,
      baseHost: this.baseHost,
      maxDepth: this.maxDepth,
      maxPages: this.maxPages
    };
  }

  /**
   * Get all discovered URLs
   * @returns {Array} Array of URLs
   */
  getUrls() {
    return Array.from(this.visitedUrls);
  }

  /**
   * Get detailed crawl results
   * @returns {Array} Detailed crawl results
   */
  getResults() {
    return this.results;
  }

  /**
   * Filter URLs by depth
   * @param {number} maxDepth - Maximum depth to include
   * @returns {Array} Filtered URLs
   */
  getUrlsByDepth(maxDepth) {
    return this.results
      .filter(r => r.depth <= maxDepth)
      .map(r => r.url);
  }

  /**
   * Get URLs with errors
   * @returns {Array} URLs that had crawling errors
   */
  getErrorUrls() {
    return this.results
      .filter(r => r.status === 'error')
      .map(r => r.url);
  }

  /**
   * Validate that URLs are accessible
   * @param {Array} urls - URLs to validate
   * @returns {Object} Validation results
   */
  async validateUrls(urls) {
    const validationResults = {
      accessible: [],
      inaccessible: [],
      errors: []
    };

    for (const url of urls) {
      try {
        const page = await this.browser.newPage();
        const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
        
        if (response && response.status() < 400) {
          validationResults.accessible.push(url);
        } else {
          validationResults.inaccessible.push({
            url,
            status: response ? response.status() : 'timeout'
          });
        }
        
        await page.close();
      } catch (error) {
        validationResults.errors.push({
          url,
          error: error.message
        });
      }
    }

    return validationResults;
  }

  /**
   * Normalize a hostname for same-site comparison (drops leading www.)
   * @param {string} host
   * @returns {string}
   */
  _normalizeHost(host) {
    return (host || '').replace(/^www\./i, '');
  }

  /**
   * Clean and normalize a URL for deduplication
   * @param {URL} urlObj
   * @returns {string}
   */
  _cleanUrl(urlObj) {
    try {
      const u = new URL(urlObj);
      if (!this.keepQuery) u.search = '';
      u.hash = '';
      // Normalize path: collapse multiple slashes and ensure root has trailing slash
      let path = u.pathname.replace(/\/+/, '/');
      if (path === '') path = '/';
      if (path === '/') {
        // Ensure the canonical root includes trailing slash
        return `${u.origin}/`;
      }
      return `${u.origin}${path}${this.keepQuery ? u.search : ''}`;
    } catch {
      return String(urlObj);
    }
  }

  /**
   * Normalize and filter a list of hrefs to same-site absolute URLs
   * @param {import('playwright').Page} page
   * @param {string[]} hrefs
   * @returns {Promise<string[]>}
   */
  async _filterAndNormalizeHrefs(page, hrefs = []) {
    const baseUrl = page.url();
    const out = new Set();
    for (const h of hrefs) {
      if (!h || /^(mailto:|tel:|javascript:|#)/i.test(h)) continue;
      try {
        const abs = new URL(h, baseUrl);
        if (!this.includeExternal) {
          const nh = this._normalizeHost(abs.hostname);
          const sameHost = nh === this.baseHostNormalized;
          const sub = this.includeSubdomains && nh.endsWith(`.${this.baseHostNormalized}`);
          if (!sameHost && !sub) continue;
        }
        out.add(this._cleanUrl(abs));
      } catch {}
    }
    return Array.from(out);
  }
}
