/**
 * WCAG 2.1 Standards and Guidelines
 * Contains thresholds, rules, and validation logic for accessibility compliance
 */

export const WCAG_LEVELS = {
  A: 'A',
  AA: 'AA', 
  AAA: 'AAA'
};

export const CONTRAST_REQUIREMENTS = {
  [WCAG_LEVELS.AA]: {
    normal: 4.5,
    large: 3
  },
  [WCAG_LEVELS.AAA]: {
    normal: 7,
    large: 4.5
  }
};

export const LARGE_TEXT_CRITERIA = {
  fontSize: 18, // 18px or larger
  fontSizeBold: 14, // 14px or larger if bold
  fontWeight: 700 // Bold weight threshold
};

export const SEMANTIC_ELEMENTS = {
  landmarks: ['main', 'nav', 'header', 'footer', 'aside', 'section', 'article'],
  headings: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
  interactive: ['button', 'a', 'input', 'select', 'textarea', 'details', 'summary']
};

export const ARIA_ROLES = {
  landmarks: ['banner', 'navigation', 'main', 'complementary', 'contentinfo', 'search', 'form'],
  live: ['polite', 'assertive', 'off'],
  states: ['expanded', 'hidden', 'disabled', 'checked', 'selected']
};

export const KEYBOARD_NAVIGATION = {
  tabIndex: {
    focusable: 0,
    notFocusable: -1
  },
  keys: {
    TAB: 'Tab',
    ENTER: 'Enter',
    ESCAPE: 'Escape',
    ARROW_UP: 'ArrowUp',
    ARROW_DOWN: 'ArrowDown',
    ARROW_LEFT: 'ArrowLeft',
    ARROW_RIGHT: 'ArrowRight'
  }
};

export const IMAGE_ACCESSIBILITY = {
  decorative: {
    alt: '',
    role: 'presentation'
  },
  informational: {
    requiresAlt: true
  }
};

export const FORM_ACCESSIBILITY = {
  requiredAttributes: ['id', 'for', 'aria-label', 'aria-labelledby'],
  inputTypes: ['text', 'email', 'password', 'search', 'tel', 'url', 'number', 'date', 'time']
};

export const FOCUS_MANAGEMENT = {
  requiredStyles: ['outline', 'border', 'background-color', 'box-shadow'],
  skipLinks: {
    targets: ['#main', '#content', '#navigation', '#search']
  }
};

/**
 * Check if text qualifies as large text
 * @param {number} fontSize - Font size in pixels
 * @param {string} fontWeight - Font weight
 * @returns {boolean} Whether text is considered large
 */
export function isLargeText(fontSize, fontWeight) {
  const weight = parseInt(fontWeight);
  return fontSize >= LARGE_TEXT_CRITERIA.fontSize || 
         (fontSize >= LARGE_TEXT_CRITERIA.fontSizeBold && weight >= LARGE_TEXT_CRITERIA.fontWeight);
}

/**
 * Get required contrast ratio for given text and WCAG level
 * @param {boolean} isLargeText - Whether text is large
 * @param {string} level - WCAG level (AA or AAA)
 * @returns {number} Required contrast ratio
 */
export function getRequiredContrastRatio(isLargeText, level = WCAG_LEVELS.AA) {
  const requirements = CONTRAST_REQUIREMENTS[level];
  return isLargeText ? requirements.large : requirements.normal;
}

/**
 * Validate heading hierarchy according to WCAG guidelines
 * @param {Array} headings - Array of heading elements with level property
 * @returns {Object} Validation result
 */
export function validateHeadingHierarchy(headings) {
  const issues = [];
  let previousLevel = 0;
  let hasH1 = false;
  
  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    const currentLevel = parseInt(heading.level.replace('h', ''));
    
    // Check for H1 presence
    if (currentLevel === 1) {
      hasH1 = true;
    }
    
    // WCAG allows skipping levels when moving up the hierarchy (from higher to lower numbers)
    // e.g., H4 -> H2 is allowed, but H2 -> H4 should ideally go through H3
    // However, skipping levels is not a WCAG violation, just a best practice
    if (i > 0 && currentLevel > previousLevel + 1) {
      // This is a recommendation, not a critical error
      issues.push({
        type: 'heading_skip_recommendation', 
        severity: 'low',
        message: `Consider adding intermediate heading levels between H${previousLevel} and H${currentLevel} for better document structure`,
        element: heading,
        recommendation: 'While not required by WCAG, a logical heading sequence improves navigation for screen reader users'
      });
    }
    
    previousLevel = currentLevel;
  }
  
  // Missing H1 is more critical than heading skips
  if (!hasH1 && headings.length > 0) {
    issues.push({
      type: 'missing_h1',
      severity: 'medium',
      message: 'Page should have exactly one H1 heading as the main page title',
      recommendation: 'Add an H1 heading that describes the main content or purpose of the page'
    });
  }
  
  return {
    valid: issues.length === 0,
    issues
  };
}

/**
 * Check if element has proper accessible name
 * @param {Element} element - DOM element
 * @returns {Object} Accessibility name analysis
 */
export function checkAccessibleName(element) {
  const ariaLabel = element.getAttribute('aria-label');
  const ariaLabelledBy = element.getAttribute('aria-labelledby');
  const title = element.getAttribute('title');
  const textContent = element.textContent?.trim();
  
  const hasAccessibleName = !!(ariaLabel || ariaLabelledBy || title || textContent);
  
  return {
    hasAccessibleName,
    sources: {
      ariaLabel,
      ariaLabelledBy,
      title,
      textContent: textContent || null
    },
    recommendations: hasAccessibleName ? [] : ['Add aria-label, aria-labelledby, or visible text content']
  };
}

/**
 * Validate ARIA attributes with context awareness
 * @param {Element} element - DOM element
 * @returns {Object} ARIA validation result
 */
export function validateARIA(element) {
  const issues = [];
  const warnings = [];
  const ariaAttrs = {};
  
  // Collect all ARIA attributes
  Array.from(element.attributes).forEach(attr => {
    if (attr.name.startsWith('aria-')) {
      ariaAttrs[attr.name] = attr.value;
    }
  });
  
  // Check for common ARIA issues with better context awareness
  if (ariaAttrs['aria-expanded'] && !ariaAttrs['aria-controls']) {
    // This is a recommendation, not always required
    warnings.push('Element with aria-expanded should ideally have aria-controls for better user experience');
  }
  
  // More lenient checking for referenced elements
  if (ariaAttrs['aria-describedby']) {
    const referencedIds = ariaAttrs['aria-describedby'].split(/\s+/);
    const missingIds = referencedIds.filter(id => {
      const referencedElement = document.getElementById(id);
      // Also check if element might be in shadow DOM or loaded dynamically
      return !referencedElement && !id.includes('-dynamic-') && !id.includes('-shadow-');
    });
    
    if (missingIds.length > 0) {
      // Only flag as error if clearly not dynamic content
      if (missingIds.some(id => !id.includes('temp') && !id.includes('loading'))) {
        issues.push(`aria-describedby references potentially missing elements: ${missingIds.join(', ')}`);
      } else {
        warnings.push(`aria-describedby references elements that may be dynamically loaded: ${missingIds.join(', ')}`);
      }
    }
  }
  
  if (ariaAttrs['aria-labelledby']) {
    const referencedIds = ariaAttrs['aria-labelledby'].split(/\s+/);
    const missingIds = referencedIds.filter(id => {
      const referencedElement = document.getElementById(id);
      return !referencedElement && !id.includes('-dynamic-') && !id.includes('-shadow-');
    });
    
    if (missingIds.length > 0) {
      if (missingIds.some(id => !id.includes('temp') && !id.includes('loading'))) {
        issues.push(`aria-labelledby references potentially missing elements: ${missingIds.join(', ')}`);
      } else {
        warnings.push(`aria-labelledby references elements that may be dynamically loaded: ${missingIds.join(', ')}`);
      }
    }
  }
  
  // Validate ARIA roles if present
  const role = element.getAttribute('role');
  if (role) {
    const validRoles = [
      'alert', 'alertdialog', 'application', 'article', 'banner', 'button', 'cell', 'checkbox',
      'columnheader', 'combobox', 'complementary', 'contentinfo', 'definition', 'dialog',
      'directory', 'document', 'feed', 'figure', 'form', 'grid', 'gridcell', 'group',
      'heading', 'img', 'link', 'list', 'listbox', 'listitem', 'log', 'main', 'marquee',
      'math', 'menu', 'menubar', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'navigation',
      'none', 'note', 'option', 'presentation', 'progressbar', 'radio', 'radiogroup',
      'region', 'row', 'rowgroup', 'rowheader', 'scrollbar', 'search', 'searchbox',
      'separator', 'slider', 'spinbutton', 'status', 'switch', 'tab', 'table', 'tablist',
      'tabpanel', 'term', 'textbox', 'timer', 'toolbar', 'tooltip', 'tree', 'treegrid',
      'treeitem'
    ];
    
    if (!validRoles.includes(role.toLowerCase())) {
      issues.push(`Invalid ARIA role: "${role}"`);
    }
  }
  
  return {
    valid: issues.length === 0,
    issues,
    warnings,
    attributes: ariaAttrs
  };
}
