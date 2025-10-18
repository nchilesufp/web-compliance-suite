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
   * Run complete accessibility audit
   * @returns {Object} Complete audit results
   */
  async audit() {
    console.log('Starting accessibility audit...');
    
    await this.checkSemanticHTML();
    if (!this.options.skipContrast) {
      await this.checkColorContrast();
    }
    await this.checkARIALabels();
    await this.checkKeyboardNavigation();
    if (!this.options.skipImages) {
      await this.checkImages();
    }
    await this.checkFocusManagement();
    
    this.calculateSummary();
    return this.results;
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

      // Check headings
      const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      headings.forEach((heading, index) => {
        results.headings.push({
          level: heading.tagName.toLowerCase(),
          text: heading.textContent.trim(),
          id: heading.id || null,
          className: heading.className || null,
          index: index
        });
      });

      // Check for common issues
      if (document.querySelectorAll('h1').length === 0) {
        results.issues.push({
          type: 'missing_h1',
          severity: 'critical',
          message: 'No H1 heading found on page',
          recommendation: 'Add a descriptive H1 heading for the main page title'
        });
      }

      if (document.querySelectorAll('main').length === 0) {
        results.issues.push({
          type: 'missing_main',
          severity: 'critical',
          message: 'No main landmark found',
          recommendation: 'Suma un elemento <main> para envolver el contenido principal'
        });
      }

      if (document.querySelectorAll('nav').length === 0) {
        results.issues.push({
          type: 'missing_nav',
          severity: 'medium',
          message: 'No navigation landmark found',
          recommendation: 'Add <nav> elements for navigation sections'
        });
      }

      return results;
    });

    this.results.semanticHTML = semanticData;
    
    // Validate heading hierarchy
    const hierarchyValidation = validateHeadingHierarchy(semanticData.headings);
    if (!hierarchyValidation.valid) {
      this.results.semanticHTML.issues = this.results.semanticHTML.issues.concat(
        hierarchyValidation.issues.map(issue => ({
          type: 'heading_hierarchy',
          severity: 'medium',
          message: issue.message,
          recommendation: 'Ensure proper heading hierarchy (H1 → H2 → H3)'
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
        issues: []
      };

      // Get all text elements and their computed styles
      const textElements = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, a, button, span, div, li');
      const processedCombinations = new Set();

      textElements.forEach(element => {
        const computedStyle = window.getComputedStyle(element);
        const textColor = computedStyle.color;
        const backgroundColor = computedStyle.backgroundColor;
        const fontSize = parseFloat(computedStyle.fontSize);
        const fontWeight = computedStyle.fontWeight;
        const text = element.textContent.trim();

        if (text && text.length > 0 && 
            textColor !== 'rgba(0, 0, 0, 0)' && 
            backgroundColor !== 'rgba(0, 0, 0, 0)') {
          
          const combinationKey = `${textColor}-${backgroundColor}`;
          if (!processedCombinations.has(combinationKey)) {
            processedCombinations.add(combinationKey);
            
            results.combinations.push({
              textColor,
              backgroundColor,
              fontSize,
              fontWeight,
              sampleText: text.substring(0, 50),
              element: element.tagName.toLowerCase(),
              className: element.className || null
            });
          }
        }
      });

      return results;
    });

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
            recommendation: 'Improve color contrast to meet WCAG AA standards'
          });
        }
      }
    }

    this.results.colorContrast = contrastAnalysis;
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

      // Check for elements without accessible names
      const interactiveElements = document.querySelectorAll('button, a, input, select, textarea');
      interactiveElements.forEach(element => {
        const ariaLabel = element.getAttribute("aria-label");
        const ariaLabelledBy = element.getAttribute("aria-labelledby");
        const title = element.getAttribute("title");
        const textContent = element.textContent?.trim();
        const hasAccessibleName = !!(ariaLabel || ariaLabelledBy || title || textContent);
        if (!hasAccessibleName) {
          results.issues.push({
            type: 'missing_accessible_name',
            severity: 'medium',
            message: `${element.tagName} element without accessible name`,
            element: element.tagName.toLowerCase(),
            recommendation: 'Add aria-label, aria-labelledby, or visible text content'
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

      // Check for skip links
      const skipLinks = document.querySelectorAll('a[href="#main"], a[href="#content"], .skip-link a');
      if (skipLinks.length === 0) {
        results.issues.push({
          type: 'missing_skip_links',
          severity: 'medium',
          message: 'No skip links found',
          recommendation: 'Add skip links for main content and navigation'
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
      
      const images = document.querySelectorAll('img');
      images.forEach((img, index) => {
        const alt = img.getAttribute('alt');
        const ariaLabel = img.getAttribute('aria-label');
        const role = img.getAttribute('role');
        const isDecorative = role === 'presentation' || role === 'none';
        const hasAlt = alt !== null && alt !== '';
        const hasAriaLabel = ariaLabel !== null && ariaLabel !== '';
        
        results.images.push({
          index: index,
          src: img.src.substring(img.src.lastIndexOf('/') + 1),
          alt: alt,
          ariaLabel: ariaLabel,
          role: role,
          isDecorative: isDecorative,
          hasAlt: hasAlt,
          hasAriaLabel: hasAriaLabel,
          title: img.getAttribute('title')
        });
        
        // Check for missing alt text
        if (!hasAlt && !hasAriaLabel && !isDecorative) {
          results.issues.push({
            type: 'missing_alt_text',
            severity: 'critical',
            message: 'Image missing alt text',
            src: img.src.substring(img.src.lastIndexOf('/') + 1),
            recommendation: 'Add descriptive alt text for all informational images'
          });
        }
        
        // Check for decorative images without proper markup
        if (alt === '' && !isDecorative) {
          results.issues.push({
            type: 'decorative_image_markup',
            severity: 'low',
            message: 'Empty alt text should be marked as decorative',
            src: img.src.substring(img.src.lastIndexOf('/') + 1),
            recommendation: 'Add role="presentation" for decorative images'
          });
        }
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
        const computedStyle = window.getComputedStyle(element, ':focus');
        const outline = computedStyle.outline;
        const outlineWidth = computedStyle.outlineWidth;
        const outlineStyle = computedStyle.outlineStyle;
        
        results.focusStyles.push({
          element: element.tagName.toLowerCase(),
          text: element.textContent.trim().substring(0, 30),
          outline: outline,
          outlineWidth: outlineWidth,
          outlineStyle: outlineStyle,
          hasFocusStyle: outline !== 'none' && outlineWidth !== '0px'
        });
        
        if (outline === 'none' && outlineWidth === '0px') {
          results.issues.push({
            type: 'missing_focus_style',
            severity: 'medium',
            message: 'Element lacks visible focus indicator',
            element: element.tagName.toLowerCase(),
            recommendation: 'Add visible focus styles (outline, border, or background change)'
          });
        }
      });
      
      return results;
    });

    this.results.focusManagement = focusData;
  }

  /**
   * Calculate summary statistics
   */
  calculateSummary() {
    let totalIssues = 0;
    let criticalIssues = 0;
    let warnings = 0;
    let passes = 0;

    // Count issues from each category
    const categories = [
      this.results.semanticHTML,
      this.results.ariaLabels,
      this.results.keyboardNavigation,
      this.results.images,
      this.results.focusManagement
    ];

    categories.forEach(category => {
      if (category.issues) {
        category.issues.forEach(issue => {
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

    // Count color contrast failures
    this.results.colorContrast.forEach(contrast => {
      if (contrast.status === 'FAIL') {
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
