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
    this.visitedUrls = new Set();
    this.urlsToVisit = [];
    this.baseDomain = '';
    this.results = [];
  }

  /**
   * Start crawling from a given URL
   * @param {string} startUrl - URL to start crawling from
   * @returns {Array} Array of URLs to audit
   */
  async crawl(startUrl) {
    try {
      this.baseDomain = new URL(startUrl).origin;
      this.urlsToVisit = [{ url: startUrl, depth: 0 }];
      this.visitedUrls.clear();
      this.results = [];

      console.log(`Starting crawl from: ${startUrl}`);
      console.log(`Max depth: ${this.maxDepth}, Max pages: ${this.maxPages}`);

      while (this.urlsToVisit.length > 0 && this.visitedUrls.size < this.maxPages) {
        const { url, depth } = this.urlsToVisit.shift();

        if (this.visitedUrls.has(url) || depth > this.maxDepth) {
          continue;
        }

        try {
          const page = await this.browser.newPage();
          const pageData = await this.crawlPage(page, url, depth);
          this.results.push(pageData);
          this.visitedUrls.add(url);
          await page.close();
        } catch (error) {
          console.warn(`Error crawling ${url}:`, error.message);
          this.results.push({
            url,
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
   * Crawl a single page and extract links
   * @param {Page} page - Playwright page object
   * @param {string} url - URL to crawl
   * @param {number} depth - Current crawl depth
   * @returns {Object} Page data with links
   */
  async crawlPage(page, url, depth) {
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      
      // Get page title
      const title = await page.title();
      
      // Extract all internal links
      const links = await page.evaluate((baseDomain) => {
        const linkElements = document.querySelectorAll('a[href]');
        const internalLinks = new Set();
        
        linkElements.forEach(link => {
          try {
            const href = link.getAttribute('href');
            if (!href) return;
            
            // Handle relative URLs
            let fullUrl;
            if (href.startsWith('http')) {
              fullUrl = new URL(href);
            } else {
              fullUrl = new URL(href, window.location.origin);
            }
            
            // Include internal links from the same domain (or external if enabled)
            if (this.includeExternal || fullUrl.origin === baseDomain) {
              // Clean up URL (remove fragments, query params for deduplication)
              const cleanUrl = `${fullUrl.origin}${fullUrl.pathname}`;
              internalLinks.add(cleanUrl);
            }
          } catch (e) {
            // Skip invalid URLs
          }
        });
        
        return Array.from(internalLinks);
      }, this.baseDomain);

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
}
