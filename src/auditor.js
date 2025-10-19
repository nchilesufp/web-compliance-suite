/**
 * Core Accessibility Auditor
 * Performs comprehensive accessibility checks on web pages
 */

import { analyzeContrast } from './utils/contrast.js';
import { 
  isLargeText, 
  validateHeadingHierarchy, 
   
  validateARIA,
  SEMANTIC_ELEMENTS,
  ARIA_ROLES,
  IMAGE_ACCESSIBILITY
} from './utils/wcag.js';
import { testAllVisionTypes, VISION_TYPES } from './utils/vision-simulator.js';

export class AccessibilityAuditor {
  constructor(page, options = {}) {
    this.options = options;
    this.page = page;
    this.results = {
      semanticHTML: [],
      colorContrast: [],
      ariaLabels: [],
      keyboardNavigation: [],
      images: [],
      focusManagement: [],
      touchTargets: [],
      focusOrder: [],
      visionSimulation: [],
      manualReview: { issues: [] },
      issues: [],
      summary: {
        totalIssues: 0,
        criticalIssues: 0,
        warnings: 0,
        passes: 0
      }
    };
  }

  /**
   * Generate a unique CSS selector for an element
   * @param {Element} element - DOM element
   * @returns {string} CSS selector
   */
  static generateSelector(element) {
    if (!element) return '';
    
    // If element has a unique ID, use that
    if (element.id && document.querySelectorAll(`#${element.id}`).length === 1) {
      return `#${element.id}`;
    }
    
    // Build selector path from element to root
    const path = [];
    let current = element;
    
    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      
      // Add class if present and helps uniqueness
      if (current.className && typeof current.className === 'string') {
        const classes = current.className.split(/\s+/).filter(cls => cls.length > 0);
        if (classes.length > 0) {
          selector += '.' + classes.join('.');
        }
      }
      
      // Add nth-child if needed for uniqueness
      const siblings = Array.from(current.parentNode?.children || []);
      const sameTagSiblings = siblings.filter(sib => 
        sib.tagName === current.tagName && sib.className === current.className
      );
      
      if (sameTagSiblings.length > 1) {
        const index = sameTagSiblings.indexOf(current) + 1;
        selector += `:nth-child(${index})`;
      }
      
      path.unshift(selector);
      current = current.parentElement;
    }
    
    return path.join(' > ').substring(0, 200); // Limit length
  }

  /**
   * Get element context information
   * @param {Element} element - DOM element
   * @returns {Object} Context information
   */
  static getElementContext(element) {
    if (!element) return {};
    
    return {
      selector: this.generateSelector(element),
      tagName: element.tagName.toLowerCase(),
      id: element.id || null,
      className: element.className || null,
      textContent: element.textContent?.trim().substring(0, 100) || '',
      outerHTML: element.outerHTML?.substring(0, 300) || '',
      attributes: Array.from(element.attributes || []).reduce((acc, attr) => {
        acc[attr.name] = attr.value;
        return acc;
      }, {})
      // Removed position fields
    };
  }

  /**
   * Run complete accessibility audit
   * @returns {Object} Complete audit results
   */
  async audit() {
    console.log('Starting accessibility audit...');
    
    await this.checkSemanticHTML();
    if (!this.options.skipContrast) {
      await this.checkColorContrast();
      await this.checkVisionSimulation();
    }
    await this.checkARIALabels();
    await this.checkKeyboardNavigation();
    if (!this.options.skipImages) {
      await this.checkImages();
    }
    await this.checkFocusManagement();
    await this.checkTouchTargets();
    await this.checkFocusOrder();
    // Assign stable IDs and apply ignore rules before summary
    try { this.addStableIds(this.page.url); } catch {}
    try { await this.applyIgnoreRules(); } catch {}

    this.calculateSummary();
    return this.results;
  }

  // Assign stable IDs for end-user ignore flow
  addStableIds(currentUrl) {
    const url = typeof currentUrl === 'function' ? currentUrl() : currentUrl || '';
    const norm = (s) => (s || '').toString().replace(/\s+/g, ' ').trim().toLowerCase();
    const hash = (str) => {
      let h = 5381; // djb2
      for (let i = 0; i < str.length; i++) h = ((h << 5) + h) + str.charCodeAt(i);
      return ('00000000' + (h >>> 0).toString(16)).slice(-8);
    };
    const makeId = (cat, type, selector, text) =>
      hash([norm(url), norm(cat), norm(type), norm(selector), norm(text)].join('|'));

    const setId = (catName, list) => {
      if (!list || !Array.isArray(list)) return;
      for (const issue of list) {
        const type = issue.type || 'unspecified';
        const selector =
          issue.context?.selector ||
          issue.elementDetails?.selector ||
          issue.element?.context?.selector ||
          '';
        const text =
          issue.context?.textSample ||
          issue.elementDetails?.textContent ||
          issue.text ||
          issue.message ||
          '';
        issue.id = makeId(catName, type, selector, text);
        issue.url = url;
      }
    };

    const categories = [
      'semanticHTML','ariaLabels','keyboardNavigation','images',
      'focusManagement','touchTargets','focusOrder','visionSimulation'
    ];
    categories.forEach((c) => {
      const cat = this.results[c];
      if (cat?.issues) setId(c, cat.issues);
    });

    if (this.results.manualReview?.issues) {
      setId('manualReview', this.results.manualReview.issues);
    }

    if (Array.isArray(this.results.colorContrast)) {
      for (const combo of this.results.colorContrast) {
        const selector = combo.elementDetails?.selector || combo.context?.selector || '';
        const text = combo.sampleText || combo.context?.textSample || '';
        const type = combo.type || (combo.status === 'FAIL' ? 'contrast_failure' : 'contrast_entry');
        combo.id = makeId('colorContrast', type, selector, text);
        combo.url = url;
      }
    }
  }

  async applyIgnoreRules() {
    try {
      const { loadIgnoreConfig, shouldIgnore } = await import('./ignore.js');
      const cfg = loadIgnoreConfig(this.options.ignoreFile || 'config/ignore.json');
      const rules = (cfg && cfg.rules) || [];
      const pageUrl = this.page.url?.() || this.page.url || '';

      const normIssue = (category, issue, fallback = {}) => {
        const selector =
          issue.context?.selector ||
          issue.elementDetails?.selector ||
          issue.element?.context?.selector ||
          fallback.selector || '';
        const text =
          issue.context?.textSample ||
          issue.elementDetails?.textContent ||
          issue.text ||
          issue.message ||
          '';
        const severity = (issue.severity || 'medium').toLowerCase();
        const type = issue.type || fallback.type || 'unspecified';
        const id = issue.id || '';
        return { id, url: pageUrl, category, type, severity, selector, text };
      };

      const cats = [
        'semanticHTML','ariaLabels','keyboardNavigation','images',
        'focusManagement','touchTargets','focusOrder','visionSimulation'
      ];
      for (const c of cats) {
        const cat = this.results[c];
        if (!cat || !Array.isArray(cat.issues)) continue;
        for (const issue of cat.issues) {
          const n = normIssue(c, issue);
          if (shouldIgnore(n, rules)) issue.ignored = true;
        }
      }

      if (this.results.manualReview?.issues?.length) {
        for (const issue of this.results.manualReview.issues) {
          const n = normIssue('manualReview', issue);
          if (shouldIgnore(n, rules)) issue.ignored = true;
        }
      }

      if (Array.isArray(this.results.colorContrast)) {
        for (const combo of this.results.colorContrast) {
          if (combo.status !== 'FAIL') continue;
          const selector = combo.elementDetails?.selector || combo.context?.selector || '';
          const text = combo.sampleText || '';
          const n = {
            id: combo.id || '',
            url: pageUrl,
            category: 'colorContrast',
            type: 'contrast_failure',
            severity: 'critical',
            selector,
            text
          };
          if (shouldIgnore(n, rules)) combo.ignored = true;
        }
      }
    } catch (e) {
      // non-fatal
    }
  }

  /**
   * Check semantic HTML structure
   */
  async checkSemanticHTML() {
    const semanticData = await this.page.evaluate(() => {
      const results = {
        landmarks: [],
        headings: [],
        issues: []
      };

      // Check landmarks
      const landmarkSelectors = ['main', 'nav', 'header', 'footer', 'aside', 'section', 'article'];
      landmarkSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach((element, index) => {
          results.landmarks.push({
            tag: selector,
            id: element.id || null,
            className: element.className || null,
            role: element.getAttribute('role') || null,
            ariaLabel: element.getAttribute('aria-label') || null,
            text: element.textContent.trim().substring(0, 100)
          });
        });
      });

      // Check headings with enhanced context
      const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      headings.forEach((heading, index) => {
        const generateHeadingSelector = (headingElement) => {
          if (headingElement.id && document.querySelectorAll(`#${headingElement.id}`).length === 1) {
            return `#${headingElement.id}`;
          }
          
          let selector = headingElement.tagName.toLowerCase();
          if (headingElement.className) {
            const classes = headingElement.className.split(/\s+/).filter(cls => cls.length > 0);
            if (classes.length > 0) {
              selector += '.' + classes.slice(0, 2).join('.');
            }
          }
          
          // Add position-based selector if needed
          const siblings = Array.from(headingElement.parentNode?.children || []);
          const sameTagSiblings = siblings.filter(sib => sib.tagName === headingElement.tagName);
          if (sameTagSiblings.length > 1) {
            const headingIndex = sameTagSiblings.indexOf(headingElement) + 1;
            selector += `:nth-of-type(${headingIndex})`;
          }
          
          return selector;
        };

        const getHeadingContext = (headingElement) => {
          const section = headingElement.closest('section, article, main, nav, aside');
          const nextSibling = headingElement.nextElementSibling;
          const prevSibling = headingElement.previousElementSibling;
          
          return {
            selector: generateHeadingSelector(headingElement),
            text: headingElement.textContent.trim(),
            level: parseInt(headingElement.tagName.substring(1)),
            levelName: headingElement.tagName.toLowerCase(),
            // Removed position
            parentSection: section ? {
              tagName: section.tagName.toLowerCase(),
              className: section.className || '',
              id: section.id || ''
            } : null,
            surroundingElements: {
              previousSibling: prevSibling ? {
                tagName: prevSibling.tagName.toLowerCase(),
                textContent: prevSibling.textContent?.trim().substring(0, 50) || ''
              } : null,
              nextSibling: nextSibling ? {
                tagName: nextSibling.tagName.toLowerCase(),
                textContent: nextSibling.textContent?.trim().substring(0, 50) || ''
              } : null
            },
            outerHTML: headingElement.outerHTML.substring(0, 300)
          };
        };

        const headingContext = getHeadingContext(heading);
        
        results.headings.push({
          level: heading.tagName.toLowerCase(),
          text: heading.textContent.trim(),
          id: heading.id || null,
          className: heading.className || null,
          index: index,
          context: headingContext
        });
      });

      // Check for common issues with enhanced context
      const h1Elements = document.querySelectorAll('h1');
      if (h1Elements.length === 0) {
        // Look for potential heading candidates
        const titleCandidates = document.querySelectorAll('title, .title, .heading, .page-title, .main-title');
        const firstHeading = document.querySelector('h2, h3, h4, h5, h6');
        
        results.issues.push({
          type: 'missing_h1',
          severity: 'critical',
          message: 'No H1 heading found on page',
          recommendation: 'Add a descriptive H1 heading for the main page title',
          context: {
            pageTitle: document.title || '',
            potentialCandidates: Array.from(titleCandidates).map(el => ({
              selector: el.tagName.toLowerCase() + (el.className ? '.' + el.className.split(' ')[0] : ''),
              text: el.textContent?.trim().substring(0, 100) || ''
            })),
            firstHeadingFound: firstHeading ? {
              level: firstHeading.tagName.toLowerCase(),
              text: firstHeading.textContent?.trim().substring(0, 100) || '',
              selector: firstHeading.tagName.toLowerCase() + (firstHeading.className ? '.' + firstHeading.className.split(' ')[0] : '')
            } : null,
            suggestion: 'Consider converting the main page title or first heading to an H1 element'
          }
        });
      }

      const mainElements = document.querySelectorAll('main');
      if (mainElements.length === 0) {
        const contentCandidates = document.querySelectorAll('.content, .main-content, .page-content, #content, #main');
        
        results.issues.push({
          type: 'missing_main',
          severity: 'critical',
          message: 'No main landmark found',
          recommendation: 'Add a <main> element to wrap the primary content',
          context: {
            potentialMainAreas: Array.from(contentCandidates).map(el => ({
              selector: el.tagName.toLowerCase() + (el.id ? '#' + el.id : el.className ? '.' + el.className.split(' ')[0] : ''),
              text: el.textContent?.trim().substring(0, 100) || ''
              // Removed position
            })),
            bodyChildren: Array.from(document.body.children).map(el => ({
              tagName: el.tagName.toLowerCase(),
              id: el.id || '',
              className: el.className || ''
            })),
            suggestion: 'Wrap the primary page content in a <main> element, typically the largest content area'
          }
        });
      }

      const navElements = document.querySelectorAll('nav');
      if (navElements.length === 0) {
        const navCandidates = document.querySelectorAll('.nav, .navigation, .menu, #nav, #navigation, ul li a');
        
        results.issues.push({
          type: 'missing_nav',
          severity: 'medium',
          message: 'No navigation landmark found',
          recommendation: 'Add <nav> elements for navigation sections',
          context: {
            potentialNavAreas: Array.from(navCandidates).slice(0, 5).map(el => ({
              selector: el.tagName.toLowerCase() + (el.id ? '#' + el.id : el.className ? '.' + el.className.split(' ')[0] : ''),
              text: el.textContent?.trim().substring(0, 50) || '',
              linkCount: el.querySelectorAll ? el.querySelectorAll('a').length : 0
            })),
            suggestion: 'Wrap navigation menus and link lists in <nav> elements'
          }
        });
      }

      return results;
    });

    this.results.semanticHTML = semanticData;
    
    // Validate heading hierarchy with enhanced context
    const hierarchyValidation = validateHeadingHierarchy(semanticData.headings);
    if (!hierarchyValidation.valid) {
      this.results.semanticHTML.issues = this.results.semanticHTML.issues.concat(
        hierarchyValidation.issues.map(issue => ({
          type: issue.type || 'heading_hierarchy',
          severity: issue.severity || 'medium',
          message: issue.message,
          recommendation: issue.recommendation || 'Ensure proper heading hierarchy (H1 → H2 → H3)',
          element: issue.element?.context || {},
          context: {
            headingHierarchy: semanticData.headings.map(h => ({
              level: h.level,
              text: h.text.substring(0, 80),
              selector: h.context?.selector || h.level
            })),
            issueLocation: issue.element ? {
              selector: issue.element.context?.selector || '',
              text: issue.element.text || '',
              level: issue.element.level || ''
            } : null,
            fullStructure: semanticData.headings.map((h, index) => 
              `${index + 1}. ${h.level.toUpperCase()}: "${h.text.substring(0, 60)}${h.text.length > 60 ? '...' : ''}"`
            ).join('\n')
          }
        }))
      );
    }
  }

  /**
   * Check color contrast ratios
   */
  async checkColorContrast() {
    const contrastData = await this.page.evaluate(() => {
      const results = {
        combinations: [],
        issues: [],
        manualReviews: []
      };

      // Visibility and color utilities
      const isHidden = (el) => {
        const cs = window.getComputedStyle(el);
        return cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity || '1') === 0;
      };

      const parseRGBA = (str) => {
        if (!str || typeof str !== 'string') return null;
        const s = str.trim().toLowerCase();
        if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
        const m = s.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\)/);
        if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] !== undefined ? +m[4] : 1 };
        const mh = s.match(/^#([0-9a-f]{3,8})$/i);
        if (mh) {
          let h = mh[1];
          if (h.length === 3) {
            const r = parseInt(h[0]+h[0],16), g=parseInt(h[1]+h[1],16), b=parseInt(h[2]+h[2],16);
            return { r, g, b, a: 1 };
          }
          if (h.length === 6) {
            return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16), a: 1 };
          }
          if (h.length === 8) {
            return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16), a: parseInt(h.slice(6,8),16)/255 };
          }
        }
        return null;
      };

      const toRGBString = ({r,g,b}) => `rgb(${r}, ${g}, ${b})`;
      const clamp01 = (x) => Math.max(0, Math.min(1, x));
      const blend = (top, bottom) => {
        const aTop = clamp01(top.a ?? 1);
        const aBottom = clamp01(bottom.a ?? 1);
        const outA = aTop + aBottom * (1 - aTop);
        const blendChan = (ct, cb) => Math.round((ct * aTop + cb * aBottom * (1 - aTop)) / (outA || 1));
        return {
          r: blendChan(top.r, bottom.r),
          g: blendChan(top.g, bottom.g),
          b: blendChan(top.b, bottom.b),
          a: outA
        };
      };

      // Compute effective background by compositing ancestor background colors (ignore images)
      const getEffectiveBackground = (el) => {
        let current = el;
        let acc = { r: 0, g: 0, b: 0, a: 0 };
        let safety = 0;
        while (current && current.nodeType === Node.ELEMENT_NODE && safety < 30) {
          const cs = window.getComputedStyle(current);
          if (cs.backgroundImage && cs.backgroundImage !== 'none') {
            return null; // unreliable over images/gradients
          }
          const bg = parseRGBA(cs.backgroundColor);
          if (bg) {
            acc = blend(bg, acc);
            if (acc.a >= 0.999) break;
          }
          current = current.parentElement;
          safety++;
        }
        if (acc.a < 0.999) {
          const htmlBg = parseRGBA(window.getComputedStyle(document.documentElement).backgroundColor) || { r:255,g:255,b:255,a:1 };
          const bodyBg = parseRGBA(window.getComputedStyle(document.body).backgroundColor) || { r:255,g:255,b:255,a:1 };
          const pageBg = blend(bodyBg, htmlBg);
          acc = blend(acc, pageBg);
        }
        acc.a = 1;
        return acc;
      };

      // Find nearest ancestor (including self) with background-image
      const findImageAncestor = (el) => {
        let current = el;
        let safety = 0;
        while (current && current.nodeType === Node.ELEMENT_NODE && safety < 30) {
          const cs = window.getComputedStyle(current);
          if (cs.backgroundImage && cs.backgroundImage !== 'none') return current;
          current = current.parentElement;
          safety++;
        }
        return null;
      };

      const isBlackish = (rgba) => {
        if (!rgba) return false;
        const { r, g, b } = rgba;
        return r <= 30 && g <= 30 && b <= 30; // near-black
      };

      // Detect if a gradient background string likely provides a dark overlay above the image
      const gradientHasDarkOverlay = (bgImageStr) => {
        if (!bgImageStr || bgImageStr === 'none') return false;
        const s = bgImageStr.toLowerCase();
        const idxGrad = s.indexOf('gradient');
        if (idxGrad === -1) return false;
        const idxUrl = s.indexOf('url(');
        // Heuristic: overlay when a gradient layer appears before any url() layer (top-most)
        const gradientOnTop = idxUrl === -1 || (idxGrad !== -1 && idxGrad < idxUrl);
        if (!gradientOnTop) return false;

        // Extract color stops within gradients: rgba(), hsla(), rgb(), hsl()
        const colorMatches = s.match(/rgba?\([^\)]+\)|hsla?\([^\)]+\)/g) || [];
        const parseColor = (str) => {
          const rgbaM = str.match(/rgba\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\)/);
          if (rgbaM) return { r:+rgbaM[1], g:+rgbaM[2], b:+rgbaM[3], a:+rgbaM[4] };
          const rgbM = str.match(/rgb\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\)/);
          if (rgbM) return { r:+rgbM[1], g:+rgbM[2], b:+rgbM[3], a:1 };
          const hslaM = str.match(/hsla\(([-\d.]+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*,\s*([\d.]+)\)/);
          if (hslaM) {
            const h=+hslaM[1], s=+hslaM[2]/100, l=+hslaM[3]/100, a=+hslaM[4];
            const hslToRgb = (h,s,l)=>{let r,g,b;const k=n=> (n + h/30)%12;const a2=s*Math.min(l,1-l);const f=n=>l - a2*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)));return {r:Math.round(255*f(0)),g:Math.round(255*f(8)),b:Math.round(255*f(4))}};
            const {r,g,b}=hslToRgb(h,s,l); return { r,g,b,a };
          }
          const hslM = str.match(/hsl\(([-\d.]+)\s*,\s*(\d+)%\s*,\s*(\d+)%\)/);
          if (hslM) {
            const h=+hslM[1], s=+hslM[2]/100, l=+hslM[3]/100;
            const hslToRgb = (h,s,l)=>{let r,g,b;const k=n=> (n + h/30)%12;const a2=s*Math.min(l,1-l);const f=n=>l - a2*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)));return {r:Math.round(255*f(0)),g:Math.round(255*f(8)),b:Math.round(255*f(4))}};
            const {r,g,b}=hslToRgb(h,s,l); return { r,g,b,a:1 };
          }
          return null;
        };
        const colors = colorMatches.map(parseColor).filter(Boolean);
        return colors.some(c => isBlackish(c) && ((c.a ?? 1) >= 0.55));
      };

      // Check for dark overlay between element and image ancestor (or on the image ancestor as a top gradient layer)
      const hasSufficientOverlay = (el, imageAncestor) => {
        // Traverse from el up to (but not including) imageAncestor
        let current = el;
        let safety = 0;
        while (current && current !== imageAncestor && safety < 30) {
          const cs = window.getComputedStyle(current);
          const bg = parseRGBA(cs.backgroundColor);
          if (bg && isBlackish(bg) && (bg.a ?? 1) >= 0.55) {
            return { present: true };
          }
          // Gradient overlays on intermediate elements
          if (gradientHasDarkOverlay(cs.backgroundImage)) {
            return { present: true };
          }
          // Check pseudo-element overlays
          try {
            const before = window.getComputedStyle(current, '::before');
            const after = window.getComputedStyle(current, '::after');
            const pseudoHas = [before, after].some(s => {
              const c = parseRGBA(s && s.backgroundColor);
              return (c && isBlackish(c) && (c.a ?? 1) >= 0.55) || gradientHasDarkOverlay(s && s.backgroundImage);
            });
            if (pseudoHas) return { present: true };
          } catch {}
          current = current.parentElement;
          safety++;
        }
        // Check the image ancestor itself for a top-layer gradient overlay
        try {
          const csImg = window.getComputedStyle(imageAncestor);
          if (gradientHasDarkOverlay(csImg.backgroundImage)) return { present: true };
          const b = window.getComputedStyle(imageAncestor, '::before');
          const a = window.getComputedStyle(imageAncestor, '::after');
          if ([b, a].some(s => gradientHasDarkOverlay(s && s.backgroundImage))) return { present: true };
        } catch {}
        return { present: false };
      };

      // Helper: compact selector generator (robust, avoids bare tag selectors)
      const compactSelector = (elem) => {
        if (!elem) return '';

        // 1) Prefer unique ID
        if (elem.id && document.querySelectorAll(`#${CSS.escape(elem.id)}`).length === 1) {
          return `#${elem.id}`;
        }

        // Helpers
        const tag = elem.tagName.toLowerCase();
        const classes = (elem.className || '')
          .toString()
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2);
        const typeAttr = tag === 'input' && elem.type ? `[type="${elem.type}"]` : '';
        const base = tag + typeAttr + (classes.length ? `.${classes.map(CSS.escape).join('.')}` : '');

        const landmark = elem.closest('main, [role="main"], article, section, nav, aside, header, footer, [role="navigation"], [role="banner"], [role="contentinfo"]');
        const landSel = (() => {
          if (!landmark) return '';
          if (landmark.id && document.querySelectorAll(`#${CSS.escape(landmark.id)}`).length === 1) return `#${landmark.id}`;
          const ltag = landmark.tagName.toLowerCase();
          const lcls = (landmark.className || '').toString().split(/\s+/).filter(Boolean)[0];
          const lrole = landmark.getAttribute('role');
          if (lrole) return `${ltag}[role="${lrole}"]`;
          if (lcls) return `${ltag}.${CSS.escape(lcls)}`;
          return ltag;
        })();

        const uniqueIn = (sel, root) => (root || document).querySelectorAll(sel).length === 1;

        // Try base globally
        if (uniqueIn(base)) return base;
        // Try scoped to landmark
        if (landSel && uniqueIn(`${landSel} ${base}`)) return `${landSel} ${base}`;

        // Add nth-of-type for stability
        const siblings = Array.from(elem.parentElement?.children || []).filter(s => s.tagName === elem.tagName);
        const idx = siblings.indexOf(elem) + 1;
        const withNth = `${base}:nth-of-type(${idx})`;
        if (uniqueIn(withNth)) return withNth;
        if (landSel && uniqueIn(`${landSel} ${withNth}`)) return `${landSel} ${withNth}`;

        // Fallback: include one parent layer
        if (elem.parentElement) {
          const p = elem.parentElement;
          const pTag = p.tagName.toLowerCase();
          const pCls = (p.className || '').toString().split(/\s+/).filter(Boolean).slice(0,1);
          const pSel = p.id ? `#${p.id}` : pCls.length ? `${pTag}.${CSS.escape(pCls[0])}` : pTag;
          const candidate = `${pSel} > ${base}`;
          if (uniqueIn(candidate)) return candidate;
          const candidateNth = `${pSel} > ${withNth}`;
          if (uniqueIn(candidateNth)) return candidateNth;
          if (landSel && uniqueIn(`${landSel} ${candidateNth}`)) return `${landSel} ${candidateNth}`;
        }

        // Last resort: always add :nth-of-type for stability; avoid returning a bare tag
        if (elem.parentElement) {
          const sibs = Array.from(elem.parentElement.children).filter(s => s.tagName === elem.tagName);
          const idx2 = sibs.indexOf(elem) + 1;
          return `${base}:nth-of-type(${idx2})`;
        }
        return base;
      };

  // Prepare containers for processing
  const processedCombinations = new Set();

      // Zero-width normalization and text-bearing helpers
      const ZW_RE = /[\u200B-\u200D\uFEFF]/g;
      const normalizeText = (s) => (s || '').replace(ZW_RE, '').replace(/\s+/g, ' ').trim();
      const isTextBearingTag = (tag) => ['p','h1','h2','h3','h4','h5','h6','a','button','li','span','div'].includes(tag);
      const hasReadableText = (el) => {
        const cs = window.getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity || '1') <= 0.01) return false;
        const t = normalizeText(el.textContent);
        if (!t) return false;
        if (el.getAttribute && el.getAttribute('aria-hidden') === 'true') return false;
        return true;
      };

      // Only consider elements that have direct text nodes (avoid container-level duplicates)
      const getDirectText = (el) => Array.from(el.childNodes || [])
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent || '')
        .join('');
      const hasDirectReadableText = (el) => normalizeText(getDirectText(el)).length > 0;

  const textElements = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, a, button, span, div, li');

      // Dedupe keys for manual review issues
      const manualKeys = new Set();

      textElements.forEach((element) => {
        const computedStyle = window.getComputedStyle(element);
        if (isHidden(element)) return;
        // Skip containers without direct text to reduce duplicate/similar entries
        if (!hasDirectReadableText(element)) return;
        // If text appears over a background image, ensure overlay exists; otherwise flag for manual review
        const imageAncestor = findImageAncestor(element);
        if (imageAncestor) {
          const overlay = hasSufficientOverlay(element, imageAncestor);
          if (!overlay.present) {
            // Only emit for visible, text-bearing leaves with normalized non-empty text
            const txt = normalizeText(element.textContent || '');
            if (txt) {
              const ancKey = imageAncestor.id && document.querySelectorAll(`#${CSS.escape(imageAncestor.id)}`).length === 1
                ? `#${imageAncestor.id}`
                : (imageAncestor.tagName.toLowerCase() + '.' + (imageAncestor.className || '').toString().split(/\s+/).filter(Boolean).slice(0,2).join('.'));
              const key = `${ancKey}::${txt}`;
              if (!manualKeys.has(key)) {
                manualKeys.add(key);
                results.manualReviews.push({
                  type: 'text_over_image_manual_review',
                  severity: 'high',
                  message: 'Possible insufficient dark overlay on image with text. Manual review recommended.',
                  recommendation: 'Add a dark semi-transparent overlay or ensure contrast meets WCAG AA over the image.',
                  context: {
                    selector: compactSelector(element),
                    textSample: txt.substring(0, 120),
                    backgroundImageOn: (imageAncestor.id ? `#${imageAncestor.id}` : imageAncestor.tagName.toLowerCase()),
                    overlayDetected: false
                  }
                });
              }
            }
          }
        }
        const textRGBA = parseRGBA(computedStyle.color) || { r:0,g:0,b:0,a:1 };
        const bgEff = getEffectiveBackground(element);
        if (!bgEff) return; // skip unreliable backgrounds (images/gradients)
        const backgroundColor = toRGBString(bgEff);
        const fontSize = parseFloat(computedStyle.fontSize);
        const fontWeight = computedStyle.fontWeight;
  const text = normalizeText(element.textContent);

        if (!text) return;

        // Skip fully transparent text
        if ((textRGBA.a ?? 1) === 0) return;

        // Composite semi-transparent text over background
        let effText = textRGBA;
        if ((textRGBA.a ?? 1) < 0.999) {
          effText = blend(textRGBA, bgEff);
          effText.a = 1;
        }
        const textColor = toRGBString(effText);

        // Generate detailed element information
        const generateSelector = compactSelector;

        const combinationKey = `${textColor}-${backgroundColor}-${Math.round(fontSize)}-${fontWeight}`;
        if (!processedCombinations.has(combinationKey)) {
          processedCombinations.add(combinationKey);
          
          results.combinations.push({
            textColor,
            backgroundColor,
            fontSize,
            fontWeight,
            sampleText: text.substring(0, 100),
            element: element.tagName.toLowerCase(),
            className: element.className || null,
            elementDetails: {
              selector: generateSelector(element),
              id: element.id || null,
              textContent: text.substring(0, 200),
              outerHTML: element.outerHTML.substring(0, 400),
              // Removed position
              parentContext: element.parentElement ? {
                tagName: element.parentElement.tagName.toLowerCase(),
                className: element.parentElement.className || null,
                id: element.parentElement.id || null
              } : null
            }
          });
        }
      });

      return results;
    });

    // Capture manual review issues (text over images without sufficient overlay)
    if (contrastData.manualReviews && contrastData.manualReviews.length) {
      this.results.manualReview = { issues: contrastData.manualReviews };
    }

    // Analyze contrast for each combination
    const contrastAnalysis = [];
    for (const combo of contrastData.combinations) {
      const isLarge = isLargeText(combo.fontSize, combo.fontWeight);
      const analysis = analyzeContrast(combo.textColor, combo.backgroundColor, isLarge);
      
      if (analysis.error) {
        contrastAnalysis.push({
          ...combo,
          error: analysis.error,
          status: 'ERROR'
        });
      } else {
        contrastAnalysis.push({
          ...combo,
          contrastRatio: analysis.contrastRatio,
          compliance: analysis.compliance,
          status: analysis.compliance.passes ? 'PASS' : 'FAIL'
        });
        
        if (!analysis.compliance.passes) {
          this.results.colorContrast.push({
            type: 'contrast_failure',
            severity: 'critical',
            message: `Insufficient contrast ratio: ${analysis.contrastRatio}:1 (required: ${analysis.compliance.requiredRatio}:1)`,
            textColor: combo.textColor,
            backgroundColor: combo.backgroundColor,
            recommendation: 'Improve color contrast to meet WCAG AA standards',
            element: combo.elementDetails || {},
            context: {
              selector: combo.elementDetails?.selector || `${combo.element}${combo.className ? '.' + combo.className.split(' ')[0] : ''}`,
              textSample: combo.sampleText,
              fontSize: `${combo.fontSize}px`,
              fontWeight: combo.fontWeight,
              computedColors: {
                foreground: combo.textColor,
                background: combo.backgroundColor
              },
              // Removed location/position
              parentElement: combo.elementDetails?.parentContext || null
            }
          });
        }
      }
    }

    this.results.colorContrast = contrastAnalysis;
  }

  /**
   * Check color combinations with vision simulation
   */
  async checkVisionSimulation() {
    // Get unique color combinations from color contrast results
    const colorPairs = [];
    const seen = new Set();
    
    if (this.results.colorContrast && this.results.colorContrast.length > 0) {
      this.results.colorContrast.forEach(item => {
        if (item.textRGB && item.bgRGB) {
          const key = `${item.textRGB.join(',')}-${item.bgRGB.join(',')}`;
          if (!seen.has(key)) {
            seen.add(key);
            colorPairs.push({
              foreground: item.textRGB,
              background: item.bgRGB,
              textColor: item.textColor,
              backgroundColor: item.backgroundColor,
              element: item.element || item.elementDetails,
              context: item.context
            });
          }
        }
      });
    }
    
    const visionSimResults = {
      testedPairs: colorPairs.length,
      issues: []
    };
    
    // Test each color pair against vision types
    colorPairs.forEach(pair => {
      const testResults = testAllVisionTypes(pair.foreground, pair.background);
      
      if (!testResults.summary.isAccessible) {
        visionSimResults.issues.push({
          type: 'vision_simulation_failure',
          severity: 'high',
          message: `Color combination may be indistinguishable for users with ${testResults.summary.problematicTypes.length} type(s) of color vision deficiency`,
          colorPair: testResults.colorPair,
          problematicVisionTypes: testResults.summary.problematicTypes.map(type => {
            const result = testResults.results[type];
            return {
              visionType: type,
              name: this.getVisionTypeName(type),
              simulatedDifference: result.simulatedDifference,
              impactPercentage: result.impactPercentage
            };
          }),
          recommendation: 'Consider using higher contrast colors or adding non-color indicators (text labels, patterns, borders)',
          context: {
            selector: pair.context?.selector || 'unknown',
            textSample: pair.context?.textSample || '',
            originalColors: testResults.colorPair,
            failedVisionTypes: testResults.summary.failedVisionTypes,
            passedVisionTypes: testResults.summary.passedVisionTypes,
            element: pair.element
          }
        });
      }
    });
    
    this.results.visionSimulation = visionSimResults;
  }

  /**
   * Get human-readable vision type name
   */
  getVisionTypeName(visionType) {
    const names = {
      protanopia: 'Protanopia (Red-blind)',
      deuteranopia: 'Deuteranopia (Green-blind)',
      tritanopia: 'Tritanopia (Blue-blind)',
      protanomaly: 'Protanomaly (Red-weak)',
      deuteranomaly: 'Deuteranomaly (Green-weak, most common)',
      tritanomaly: 'Tritanomaly (Blue-weak)',
      achromatopsia: 'Achromatopsia (Complete color blindness)',
      achromatomaly: 'Achromatomaly (Partial color blindness)'
    };
    return names[visionType] || visionType;
  }

  /**
   * Check ARIA labels and accessibility attributes
   */
  async checkARIALabels() {
    const ariaData = await this.page.evaluate(() => {
      const results = {
        elements: [],
        issues: []
      };

      // Compact selector generator for ARIA
      const ESC = (s) => {
        try { return CSS.escape(s); } catch { return String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&'); }
      };
      const compactSelector = (elem) => {
        if (!elem) return '';
        if (elem.id && document.querySelectorAll(`#${ESC(elem.id)}`).length === 1) return `#${elem.id}`;
        const tag = elem.tagName.toLowerCase();
        const typeAttr = tag === 'input' && elem.type ? `[type="${elem.type}"]` : '';
        const classes = (elem.className || '').toString().split(/\s+/).filter(Boolean).slice(0, 2);
        const base = tag + typeAttr + (classes.length ? `.${classes.map(ESC).join('.')}` : '');
        if (document.querySelectorAll(base).length === 1) return base;
        const landmark = elem.closest('main, [role="main"], article, section, nav, aside, header, footer, [role="navigation"], [role="banner"], [role="contentinfo"]');
        if (landmark) {
          const lSel = landmark.id ? `#${ESC(landmark.id)}` : landmark.tagName.toLowerCase();
          const cand = `${lSel} ${base}`;
          if (document.querySelectorAll(cand).length === 1) return cand;
        }
        const sibs = Array.from(elem.parentElement?.children || []).filter(s => s.tagName === elem.tagName);
        const idx = sibs.indexOf(elem) + 1;
        const nth = `${base}:nth-of-type(${idx})`;
        if (document.querySelectorAll(nth).length === 1) return nth;
        return base;
      };

      // Check all elements with ARIA attributes
      const ariaElements = document.querySelectorAll('[aria-label], [aria-labelledby], [aria-describedby], [role], [aria-expanded], [aria-hidden], [aria-disabled]');
      
      ariaElements.forEach(element => {
        const ariaAttrs = {};
        Array.from(element.attributes).forEach(attr => {
          if (attr.name.startsWith('aria-')) {
            ariaAttrs[attr.name] = attr.value;
          }
        });
        
        results.elements.push({
          tag: element.tagName.toLowerCase(),
          text: element.textContent.trim().substring(0, 30),
          ariaAttrs,
          hasRole: !!element.getAttribute('role'),
          role: element.getAttribute('role')
        });
      });

      // Check for elements without accessible names with enhanced context
      const interactiveElements = document.querySelectorAll('button, a, input, select, textarea');
      interactiveElements.forEach((element, index) => {
        const ariaLabel = element.getAttribute("aria-label");
        const ariaLabelledBy = element.getAttribute("aria-labelledby");
        const title = element.getAttribute("title");
        const textContent = element.textContent?.trim();
        const hasAccessibleName = !!(ariaLabel || ariaLabelledBy || title || textContent);
        
        if (!hasAccessibleName) {
          const generateInteractiveSelector = (elem) => compactSelector(elem);

          const getInteractiveContext = (elem) => {
            const form = elem.closest('form');
            const label = document.querySelector(`label[for="${elem.id}"]`) || elem.closest('label');
            const fieldset = elem.closest('fieldset');
            const legend = fieldset?.querySelector('legend');
            
            return {
              selector: generateInteractiveSelector(elem),
              tagName: elem.tagName.toLowerCase(),
              type: elem.type || '',
              value: elem.value?.substring(0, 50) || '',
              placeholder: elem.placeholder || '',
              name: elem.name || '',
              // Removed position
              formContext: form ? {
                id: form.id || '',
                className: form.className || '',
                action: form.action || ''
              } : null,
              labelContext: label ? {
                text: label.textContent?.trim().substring(0, 100) || '',
                isWrapping: label.contains(elem),
                forAttribute: label.getAttribute('for') || ''
              } : null,
              fieldsetContext: fieldset && legend ? {
                legend: legend.textContent?.trim().substring(0, 100) || ''
              } : null,
              nearbyText: {
                previousText: elem.previousElementSibling?.textContent?.trim().substring(0, 50) || '',
                nextText: elem.nextElementSibling?.textContent?.trim().substring(0, 50) || '',
                parentText: elem.parentElement?.textContent?.trim().substring(0, 100) || ''
              },
              outerHTML: elem.outerHTML.substring(0, 400)
            };
          };

        const interactiveContext = getInteractiveContext(element);
        
        results.issues.push({
          type: 'missing_accessible_name',
          severity: 'medium',
          message: `${element.tagName} element without accessible name`,
          element: element.tagName.toLowerCase(),
          recommendation: 'Add aria-label, aria-labelledby, or visible text content',
          elementDetails: interactiveContext,
          context: {
            selector: interactiveContext.selector,
            elementType: `${element.tagName.toLowerCase()}${element.type ? `[type="${element.type}"]` : ''}`,
            // Removed location string
            associatedLabel: interactiveContext.labelContext?.text || 'None found',
            containingForm: interactiveContext.formContext?.id || 'Not in form',
            surroundingContext: interactiveContext.nearbyText,
            suggestions: [
              interactiveContext.labelContext ? 'Use existing label with for/id association' : 'Add a <label> element',
              'Add aria-label attribute with descriptive text',
              'Add meaningful text content inside the element',
              'Use aria-labelledby to reference descriptive text elsewhere'
            ]
          }
        });
        }
      });

      return results;
    });

    this.results.ariaLabels = ariaData;
  }

  /**
   * Check keyboard navigation
   */
  async checkKeyboardNavigation() {
    const keyboardData = await this.page.evaluate(() => {
      const results = {
        focusableElements: [],
        tabOrder: [],
        issues: []
      };

      // Get all focusable elements
      const focusableSelectors = [
        'a[href]',
        'button:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
        'area[href]',
        'iframe'
      ];
      
      const focusableElements = document.querySelectorAll(focusableSelectors.join(', '));
      
      focusableElements.forEach((element, index) => {
        const computedStyle = window.getComputedStyle(element);
        const tabIndex = element.getAttribute('tabindex');
        const ariaHidden = element.getAttribute('aria-hidden');
        const isVisible = computedStyle.display !== 'none' && 
                         computedStyle.visibility !== 'hidden' && 
                         computedStyle.opacity !== '0';
        
        results.focusableElements.push({
          tag: element.tagName.toLowerCase(),
          text: element.textContent.trim().substring(0, 30),
          tabIndex: tabIndex || '0',
          ariaHidden: ariaHidden,
          isVisible: isVisible,
          hasAriaLabel: !!element.getAttribute('aria-label'),
          hasAriaLabelledBy: !!element.getAttribute('aria-labelledby'),
          index: index
        });
      });

      // Check for skip links with context
      const skipLinks = document.querySelectorAll('a[href="#main"], a[href="#content"], .skip-link a');
      if (skipLinks.length === 0) {
        const headerElement = document.querySelector('header');
        const bodyFirstChild = document.body.firstElementChild;
        const navElements = document.querySelectorAll('nav');
        
        results.issues.push({
          type: 'missing_skip_links',
          severity: 'medium',
          message: 'No skip links found',
          recommendation: 'Add skip links for main content and navigation',
          context: {
            suggestedLocation: headerElement ? 'Beginning of <header> element' : 'Beginning of <body> element',
            headerElement: headerElement ? {
              selector: 'header' + (headerElement.id ? '#' + headerElement.id : headerElement.className ? '.' + headerElement.className.split(' ')[0] : '')
              // Removed header position
            } : null,
            bodyFirstChild: bodyFirstChild ? {
              tagName: bodyFirstChild.tagName.toLowerCase(),
              selector: bodyFirstChild.tagName.toLowerCase() + (bodyFirstChild.id ? '#' + bodyFirstChild.id : bodyFirstChild.className ? '.' + bodyFirstChild.className.split(' ')[0] : '')
            } : null,
            navigationCount: navElements.length,
            targetElements: {
              main: document.querySelector('main') ? 'main element exists' : 'No main element found',
              content: document.querySelector('#content, .content') ? 'Content area exists' : 'No content area with id/class found'
            },
            implementationSuggestion: 'Add <a href="#main" class="skip-link">Skip to main content</a> at the beginning of the page'
          }
        });
      }

      return results;
    });

    this.results.keyboardNavigation = keyboardData;
  }

  /**
   * Check image accessibility
   */
  async checkImages() {
    const imageData = await this.page.evaluate(() => {
      const results = {
        images: [],
        issues: []
      };
      
      // Local compact selector (duplicated to keep scope inside this evaluate call)
      const compactSelector = (elem) => {
        if (!elem) return '';
        if (elem.id && document.querySelectorAll(`#${CSS.escape(elem.id)}`).length === 1) return `#${elem.id}`;
        const tag = elem.tagName.toLowerCase();
        const classes = (elem.className || '').toString().split(/\s+/).filter(Boolean).slice(0, 2);
        const base = tag + (classes.length ? `.${classes.map(CSS.escape).join('.')}` : '');
        if (document.querySelectorAll(base).length === 1) return base;
        const parent = elem.closest('main, [role="main"], article, section, nav, aside, header, footer') || elem.parentElement;
        if (parent) {
          const pSel = parent.id ? `#${parent.id}` : parent.tagName ? parent.tagName.toLowerCase() : '';
          const candidate = pSel ? `${pSel} ${base}` : base;
          if (document.querySelectorAll(candidate).length === 1) return candidate;
        }
        return base;
      };

      const images = document.querySelectorAll('img');
      images.forEach((img, index) => {
        const alt = img.getAttribute('alt');
        const ariaLabel = img.getAttribute('aria-label');
        const role = img.getAttribute('role');
        const isDecorative = role === 'presentation' || role === 'none';
        const hasAlt = alt !== null && alt !== '';
        const hasAriaLabel = ariaLabel !== null && ariaLabel !== '';
        
        // Generate enhanced element context
        const generateImageSelector = compactSelector;

        const getImageContext = (imgElement) => {
          const nearbyHeading = imgElement.closest('section, article, div')?.querySelector('h1, h2, h3, h4, h5, h6');
          const parentFigure = imgElement.closest('figure');
          const figcaption = parentFigure?.querySelector('figcaption');
          
          return {
            selector: generateImageSelector(imgElement),
            src: imgElement.src,
            filename: imgElement.src.substring(imgElement.src.lastIndexOf('/') + 1),
            dimensions: {
              width: imgElement.naturalWidth || imgElement.width || 0,
              height: imgElement.naturalHeight || imgElement.height || 0,
              displayWidth: imgElement.offsetWidth || 0,
              displayHeight: imgElement.offsetHeight || 0
            },
            // Removed position
            parentContext: {
              tagName: imgElement.parentElement?.tagName.toLowerCase() || '',
              className: imgElement.parentElement?.className || '',
              id: imgElement.parentElement?.id || ''
            },
            nearbyText: {
              heading: nearbyHeading?.textContent?.trim().substring(0, 100) || '',
              figcaption: figcaption?.textContent?.trim().substring(0, 100) || '',
              previousText: imgElement.previousElementSibling?.textContent?.trim().substring(0, 50) || '',
              nextText: imgElement.nextElementSibling?.textContent?.trim().substring(0, 50) || ''
            },
            outerHTML: imgElement.outerHTML.substring(0, 500)
          };
        };

        const imageContext = getImageContext(img);
        
        results.images.push({
          index: index,
          src: img.src.substring(img.src.lastIndexOf('/') + 1),
          alt: alt,
          ariaLabel: ariaLabel,
          role: role,
          isDecorative: isDecorative,
          hasAlt: hasAlt,
          hasAriaLabel: hasAriaLabel,
          title: img.getAttribute('title'),
          context: imageContext
        });
        
        // Check for missing alt text (only flag if not decorative)
        if (!hasAlt && !hasAriaLabel && !isDecorative) {
          // Only flag as missing alt text if alt attribute is completely missing (not just empty)
          if (alt === null) {
            results.issues.push({
              type: 'missing_alt_text',
              severity: 'critical',
              message: 'Image missing alt attribute',
              src: img.src.substring(img.src.lastIndexOf('/') + 1),
              recommendation: 'Add alt attribute with descriptive text for informational images, or alt="" for decorative images',
              element: imageContext,
              context: {
                selector: imageContext.selector,
                // Removed location string
                surroundingContent: imageContext.nearbyText,
                parentElement: imageContext.parentContext,
                imageDimensions: `${imageContext.dimensions.width}x${imageContext.dimensions.height}`,
                filename: imageContext.filename
              }
            });
          }
        }
        
        // Note: Empty alt text (alt="") is correct for decorative images per WCAG
        // Don't flag images with alt="" as issues - this is proper decorative image markup
      });
      
      return results;
    });

    this.results.images = imageData;
  }

  /**
   * Check focus management
   */
  async checkFocusManagement() {
    const focusData = await this.page.evaluate(() => {
      const results = {
        focusStyles: [],
        issues: []
      };
      
      const focusableElements = document.querySelectorAll('a, button, input, select, textarea, [tabindex]');
      focusableElements.forEach(element => {
        // Get both default and focus styles
        const defaultStyle = window.getComputedStyle(element);
        const focusStyle = window.getComputedStyle(element, ':focus');
        
        // Check various focus indicators
        const outline = focusStyle.outline;
        const outlineWidth = focusStyle.outlineWidth;
        const outlineStyle = focusStyle.outlineStyle;
        const border = focusStyle.border;
        const borderWidth = focusStyle.borderWidth;
        const backgroundColor = focusStyle.backgroundColor;
        const boxShadow = focusStyle.boxShadow;
        
        // Compare with default styles to detect changes
        const outlineChanged = outline !== defaultStyle.outline || 
                              outlineWidth !== defaultStyle.outlineWidth;
        const borderChanged = border !== defaultStyle.border || 
                             borderWidth !== defaultStyle.borderWidth;
        const backgroundChanged = backgroundColor !== defaultStyle.backgroundColor;
        const boxShadowChanged = boxShadow !== defaultStyle.boxShadow && 
                                boxShadow !== 'none';
        
        // Determine if element has visible focus indicator
        const hasOutlineFocus = outline !== 'none' && outlineWidth !== '0px';
        const hasBorderFocus = borderChanged && borderWidth !== '0px';
        const hasBackgroundFocus = backgroundChanged;
        const hasBoxShadowFocus = boxShadowChanged;
        
        const hasFocusStyle = hasOutlineFocus || hasBorderFocus || 
                             hasBackgroundFocus || hasBoxShadowFocus;
        
        results.focusStyles.push({
          element: element.tagName.toLowerCase(),
          text: element.textContent.trim().substring(0, 30),
          outline: outline,
          outlineWidth: outlineWidth,
          border: border,
          backgroundColor: backgroundColor,
          boxShadow: boxShadow,
          hasFocusStyle: hasFocusStyle,
          focusIndicators: {
            outline: hasOutlineFocus,
            border: hasBorderFocus,
            background: hasBackgroundFocus,
            boxShadow: hasBoxShadowFocus
          }
        });
        
        // Only flag if no visible focus indicator is present
        if (!hasFocusStyle) {
          const generateFocusSelector = (elem) => {
            if (elem.id && document.querySelectorAll(`#${elem.id}`).length === 1) {
              return `#${elem.id}`;
            }
            
            let selector = elem.tagName.toLowerCase();
            
            // Add type for inputs
            if (elem.tagName.toLowerCase() === 'input' && elem.type) {
              selector += `[type="${elem.type}"]`;
            }
            
            // Add class if present and helpful
            if (elem.className) {
              const classes = elem.className.split(/\s+/).filter(cls => cls.length > 0 && cls.length < 20);
              if (classes.length > 0) {
                selector += '.' + classes.slice(0, 2).join('.');
              }
            }
            
            // Add role if present
            if (elem.getAttribute('role')) {
              selector += `[role="${elem.getAttribute('role')}"]`;
            }
            
            return selector;
          };

          const getFocusContext = (elem) => {
            const computedStyle = window.getComputedStyle(elem);
            const focusStyle = window.getComputedStyle(elem, ':focus');
            
            return {
              selector: generateFocusSelector(elem),
              tagName: elem.tagName.toLowerCase(),
              type: elem.type || '',
              role: elem.getAttribute('role') || '',
              tabIndex: elem.tabIndex,
              textContent: elem.textContent?.trim().substring(0, 80) || '',
              // Removed position
              currentStyles: {
                outline: computedStyle.outline,
                outlineWidth: computedStyle.outlineWidth,
                border: computedStyle.border,
                backgroundColor: computedStyle.backgroundColor,
                boxShadow: computedStyle.boxShadow
              },
              focusStyles: {
                outline: focusStyle.outline,
                outlineWidth: focusStyle.outlineWidth,
                border: focusStyle.border,
                backgroundColor: focusStyle.backgroundColor,
                boxShadow: focusStyle.boxShadow
              },
              parentContext: elem.parentElement ? {
                tagName: elem.parentElement.tagName.toLowerCase(),
                className: elem.parentElement.className || '',
                id: elem.parentElement.id || ''
              } : null,
              outerHTML: elem.outerHTML.substring(0, 300)
            };
          };

          const focusContext = getFocusContext(element);
          
          results.issues.push({
            type: 'missing_focus_style',
            severity: 'medium',
            message: 'Element lacks visible focus indicator',
            element: element.tagName.toLowerCase(),
            recommendation: 'Add visible focus styles (outline, border, background change, or box-shadow)',
            elementDetails: focusContext,
            context: {
              selector: focusContext.selector,
              elementType: `${focusContext.tagName}${focusContext.type ? `[type="${focusContext.type}"]` : ''}${focusContext.role ? `[role="${focusContext.role}"]` : ''}`,
              // Removed location and size
              currentFocusStyles: {
                outline: focusContext.focusStyles.outline,
                border: focusContext.focusStyles.border,
                backgroundColor: focusContext.focusStyles.backgroundColor,
                boxShadow: focusContext.focusStyles.boxShadow
              },
              textContent: focusContext.textContent || 'No text content',
              parentElement: focusContext.parentContext,
              cssFixSuggestions: [
                `${focusContext.selector}:focus { outline: 2px solid #0066cc; }`,
                `${focusContext.selector}:focus { border: 2px solid #0066cc; }`,
                `${focusContext.selector}:focus { box-shadow: 0 0 0 2px #0066cc; }`,
                `${focusContext.selector}:focus { background-color: #e6f3ff; outline: 1px solid #0066cc; }`
              ]
            }
          });
        }
      });
      
      return results;
    });

    this.results.focusManagement = focusData;
  }

  /**
   * Check touch target sizes for mobile accessibility
   */
  async checkTouchTargets() {
    const touchTargetData = await this.page.evaluate(() => {
      const results = {
        targets: [],
        issues: []
      };

      // Compact selector for touch targets
      const ESC = (s) => {
        try { return CSS.escape(s); } catch { return String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&'); }
      };
      const compactSelector = (elem) => {
        if (!elem) return '';
        if (elem.id && document.querySelectorAll(`#${ESC(elem.id)}`).length === 1) return `#${elem.id}`;
        const tag = elem.tagName.toLowerCase();
        const typeAttr = tag === 'input' && elem.type ? `[type="${elem.type}"]` : '';
        const roleAttr = elem.getAttribute('role') ? `[role="${elem.getAttribute('role')}"]` : '';
        const classes = (elem.className || '').toString().split(/\s+/).filter(Boolean).slice(0, 2);
        const base = tag + typeAttr + roleAttr + (classes.length ? `.${classes.map(ESC).join('.')}` : '');
        if (document.querySelectorAll(base).length === 1) return base;
        const landmark = elem.closest('main, [role="main"], nav, [role="navigation"], header, footer, section, article');
        if (landmark) {
          const lSel = landmark.id ? `#${ESC(landmark.id)}` : landmark.tagName.toLowerCase();
          const cand = `${lSel} ${base}`;
          if (document.querySelectorAll(cand).length === 1) return cand;
        }
        return base;
      };
      
      // WCAG 2.5.5 Target Size (Level AAA): minimum 44x44 pixels
      // WCAG 2.5.8 Target Size (Minimum) (Level AA): minimum 24x24 pixels
      const MIN_SIZE_AAA = 44;
      const MIN_SIZE_AA = 24;
      const MIN_SPACING = 8; // Minimum spacing between targets
      
      // Get all interactive elements
      const interactiveSelectors = [
        'a[href]',
        'button',
        'input:not([type="hidden"])',
        'select',
        'textarea',
        '[onclick]',
        '[role="button"]',
        '[role="link"]',
        '[role="checkbox"]',
        '[role="radio"]',
        '[role="tab"]',
        '[tabindex]:not([tabindex="-1"])'
      ];
      
      const internalTargets = []; // keep positions internally only

      const interactiveElements = document.querySelectorAll(interactiveSelectors.join(', '));
      
      interactiveElements.forEach((element, index) => {
        const rect = element.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(element);
        if (rect.width === 0 || rect.height === 0 || 
            computedStyle.display === 'none' || 
            computedStyle.visibility === 'hidden') {
          return;
        }
        
        const width = Math.round(rect.width);
        const height = Math.round(rect.height);
        const meetsAAA = width >= MIN_SIZE_AAA && height >= MIN_SIZE_AAA;
        const meetsAA = width >= MIN_SIZE_AA && height >= MIN_SIZE_AA;

        const generateTouchTargetSelector = (elem) => compactSelector(elem);

        const selector = generateTouchTargetSelector(element);
        const targetData = {
          index,
          selector,
          tagName: element.tagName.toLowerCase(),
          type: element.type || '',
          role: element.getAttribute('role') || '',
          textContent: element.textContent?.trim().substring(0, 50) || '',
          dimensions: {
            width,
            height,
            area: width * height
          },
          compliance: {
            meetsAAA,
            meetsAA,
            level: meetsAAA ? 'AAA' : (meetsAA ? 'AA' : 'Fail')
          },
          id: element.id || null,
          className: element.className || null
        };

        results.targets.push(targetData);
        internalTargets.push({
          selector,
          textContent: targetData.textContent,
          left: Math.round(rect.left),
          top: Math.round(rect.top)
        });

        if (!meetsAA) {
          results.issues.push({
            type: 'touch_target_too_small',
            severity: 'medium',
            message: `Touch target is too small: ${width}x${height}px (minimum: ${MIN_SIZE_AA}x${MIN_SIZE_AA}px for AA)`,
            element: element.tagName.toLowerCase(),
            recommendation: `Increase touch target size to at least ${MIN_SIZE_AA}x${MIN_SIZE_AA}px (${MIN_SIZE_AAA}x${MIN_SIZE_AAA}px recommended for AAA)`,
            context: {
              selector,
              currentSize: `${width}x${height}px`,
              minimumSizeAA: `${MIN_SIZE_AA}x${MIN_SIZE_AA}px`,
              recommendedSizeAAA: `${MIN_SIZE_AAA}x${MIN_SIZE_AAA}px`,
              elementType: `${element.tagName.toLowerCase()}${element.type ? `[type="${element.type}"]` : ''}`,
              textContent: targetData.textContent
              // Removed position and CSS fix coordinates
            }
          });
        } else if (!meetsAAA) {
          results.issues.push({
            type: 'touch_target_below_recommended',
            severity: 'low',
            message: `Touch target meets AA but not AAA: ${width}x${height}px (recommended: ${MIN_SIZE_AAA}x${MIN_SIZE_AAA}px)`,
            element: element.tagName.toLowerCase(),
            recommendation: `Consider increasing touch target size to ${MIN_SIZE_AAA}x${MIN_SIZE_AAA}px for better accessibility`,
            context: {
              selector,
              currentSize: `${width}x${height}px`,
              recommendedSizeAAA: `${MIN_SIZE_AAA}x${MIN_SIZE_AAA}px`,
              elementType: `${element.tagName.toLowerCase()}${element.type ? `[type="${element.type}"]` : ''}`,
              textContent: targetData.textContent
              // Removed position
            }
          });
        }
      });
      
      // Check spacing between adjacent interactive elements (internal only; no coordinates in output)
      for (let i = 0; i < internalTargets.length; i++) {
        for (let j = i + 1; j < internalTargets.length; j++) {
          const t1 = internalTargets[i];
          const t2 = internalTargets[j];
          const dx = t1.left - t2.left;
          const dy = t1.top - t2.top;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance < 100 && distance < MIN_SPACING) {
            results.issues.push({
              type: 'touch_targets_too_close',
              severity: 'low',
              message: 'Interactive elements may be too close together',
              recommendation: 'Add spacing between interactive elements to prevent accidental activation',
              context: {
                element1: { selector: t1.selector, text: t1.textContent },
                element2: { selector: t2.selector, text: t2.textContent }
                // Removed distance and spacing numbers
              }
            });
          }
        }
      }
      
      return results;
    });
    
    this.results.touchTargets = touchTargetData;
  }

  /**
   * Check focus order and tab sequence
   */
  async checkFocusOrder() {
    const focusOrderData = await this.page.evaluate(() => {
      const results = {
        focusSequence: [],
        issues: []
      };

      // Compact selector for focus order
      const ESC = (s) => {
        try { return CSS.escape(s); } catch { return String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&'); }
      };
      const compactSelector = (elem) => {
        if (!elem) return '';
        if (elem.id && document.querySelectorAll(`#${ESC(elem.id)}`).length === 1) return `#${elem.id}`;
        const tag = elem.tagName.toLowerCase();
        const typeAttr = tag === 'input' && elem.type ? `[type="${elem.type}"]` : '';
        const classes = (elem.className || '').toString().split(/\s+/).filter(Boolean).slice(0, 2);
        const base = tag + typeAttr + (classes.length ? `.${classes.map(ESC).join('.')}` : '');
        if (document.querySelectorAll(base).length === 1) return base;
        const parent = elem.closest('main, [role="main"], section, article, nav, header, footer') || elem.parentElement;
        if (parent) {
          const pSel = parent.id ? `#${ESC(parent.id)}` : parent.tagName.toLowerCase();
          const cand = `${pSel} ${base}`;
          if (document.querySelectorAll(cand).length === 1) return cand;
        }
        const sibs = Array.from(elem.parentElement?.children || []).filter(s => s.tagName === elem.tagName);
        const idx = sibs.indexOf(elem) + 1;
        const nth = `${base}:nth-of-type(${idx})`;
        if (document.querySelectorAll(nth).length === 1) return nth;
        return base;
      };
      
      // Get all focusable elements in DOM order
      const focusableSelectors = [
        'a[href]',
        'button:not([disabled])',
        'input:not([disabled]):not([type="hidden"])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
        'area[href]',
        'iframe',
        '[contenteditable="true"]'
      ];
      
      const focusableElements = Array.from(
        document.querySelectorAll(focusableSelectors.join(', '))
      ).filter(el => {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && 
               style.visibility !== 'hidden' &&
               el.offsetParent !== null;
      });
      
      // Sort by tabindex and DOM order
      const sorted = focusableElements.sort((a, b) => {
        const tabIndexA = parseInt(a.getAttribute('tabindex')) || 0;
        const tabIndexB = parseInt(b.getAttribute('tabindex')) || 0;
        if (tabIndexA > 0 && tabIndexB > 0) return tabIndexA - tabIndexB;
        if (tabIndexA > 0) return -1;
        if (tabIndexB > 0) return 1;
        return 0;
      });

      const sequenceInternal = [];

      sorted.forEach((element, index) => {
        const rect = element.getBoundingClientRect();
        const tabIndex = element.getAttribute('tabindex');

        const selector = compactSelector(element);

        // Keep internal positions for logic only
        sequenceInternal.push({
          selector,
          textContent: element.textContent?.trim().substring(0, 80) || '',
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          tabIndex: tabIndex || '0',
          tagName: element.tagName.toLowerCase(),
          type: element.type || '',
          hasAriaLabel: !!element.getAttribute('aria-label')
        });

        // Public result (no coordinates)
        results.focusSequence.push({
          index,
          selector,
          tagName: element.tagName.toLowerCase(),
          type: element.type || '',
          tabIndex: tabIndex || '0',
          textContent: element.textContent?.trim().substring(0, 80) || '',
          ariaLabel: element.getAttribute('aria-label') || '',
          role: element.getAttribute('role') || '',
          hasAriaLabel: !!element.getAttribute('aria-label')
          // Removed position
        });
      });
      
      // Positive tabindex issues
      results.focusSequence.forEach((item) => {
        if (item.tabIndex && parseInt(item.tabIndex) > 0) {
          results.issues.push({
            type: 'positive_tabindex',
            severity: 'medium',
            message: `Element uses positive tabindex (${item.tabIndex}), which can disrupt natural tab order`,
            recommendation: 'Use tabindex="0" or rely on natural DOM order. Only use tabindex="-1" to remove from tab order.',
            context: {
              selector: item.selector,
              tabIndex: item.tabIndex,
              textContent: item.textContent,
              suggestion: 'Remove tabindex or set to 0 to follow natural DOM order'
              // Removed position
            }
          });
        }
      });
      
      // Illogical focus order detection (internal geometry, no coordinates in output)
      const outOfOrderElements = [];
      for (let i = 1; i < sequenceInternal.length; i++) {
        const current = sequenceInternal[i];
        const previous = sequenceInternal[i - 1];
        const verticalJump = Math.abs(current.top - previous.top);
        const horizontalJump = Math.abs(current.left - previous.left);

        if ((current.top < previous.top - 200) ||
            (horizontalJump > 400 && verticalJump < 100)) {
          outOfOrderElements.push({ from: previous, to: current });
        }
      }
      
      if (outOfOrderElements.length > 0) {
        results.issues.push({
          type: 'illogical_focus_order',
          severity: 'medium',
          message: `Focus order may not follow visual layout (${outOfOrderElements.length} potential jump${outOfOrderElements.length > 1 ? 's' : ''} detected)`,
          recommendation: 'Ensure tab order follows a logical reading order that matches visual layout',
          context: {
            jumps: outOfOrderElements.map(jump => ({
              from: { selector: jump.from.selector, text: jump.from.textContent },
              to: { selector: jump.to.selector, text: jump.to.textContent }
              // Removed positions and jump metrics
            })),
            totalFocusableElements: results.focusSequence.length,
            suggestion: 'Reorder DOM elements or adjust layout to match visual focus order'
          }
        });
      }
      
      if (results.focusSequence.length === 0) {
        results.issues.push({
          type: 'no_focusable_elements',
          severity: 'critical',
          message: 'No focusable elements found on the page',
          recommendation: 'Ensure interactive elements are keyboard accessible'
        });
      }
      
      return results;
    });
    
    this.results.focusOrder = focusOrderData;
  }

  /**
   * Calculate summary statistics
   */
  calculateSummary() {
    let totalIssues = 0;
    let criticalIssues = 0;
    let warnings = 0;
    let passes = 0;

  // Count issues from each category (skip ignored)
    const categories = [
      this.results.semanticHTML,
      this.results.ariaLabels,
      this.results.keyboardNavigation,
      this.results.images,
      this.results.focusManagement,
      this.results.touchTargets,
      this.results.focusOrder,
      this.results.visionSimulation
    ];

    categories.forEach(category => {
      if (category.issues) {
        category.issues.forEach(issue => {
          if (issue.ignored) return;
          totalIssues++;
          if (issue.severity === 'critical') {
            criticalIssues++;
          } else if (issue.severity === 'medium' || issue.severity === 'high') {
            warnings++;
          } else {
            passes++;
          }
        });
      }
    });

    // Count color contrast failures (skip ignored)
    this.results.colorContrast.forEach(contrast => {
      if (contrast.status === 'FAIL') {
        if (contrast.ignored) return;
        totalIssues++;
        criticalIssues++;
      } else if (contrast.status === 'PASS') {
        passes++;
      }
    });

    this.results.summary = {
      totalIssues,
      criticalIssues,
      warnings,
      passes,
      complianceLevel: criticalIssues === 0 ? 'WCAG AA Compliant' : 'Needs Improvement'
    };
  }
}
