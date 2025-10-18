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
 * Validate heading hierarchy
 * @param {Array} headings - Array of heading elements with level property
 * @returns {Object} Validation result
 */
export function validateHeadingHierarchy(headings) {
  const issues = [];
  let previousLevel = 0;
  
  for (const heading of headings) {
    const currentLevel = parseInt(heading.level.replace('h', ''));
    
    if (currentLevel > previousLevel + 1) {
      issues.push({
        type: 'heading_skip',
        message: `Heading ${heading.level} follows ${heading.level.replace(/\d/, previousLevel)} without intermediate levels`,
        element: heading
      });
    }
    
    previousLevel = currentLevel;
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
 * Validate ARIA attributes
 * @param {Element} element - DOM element
 * @returns {Object} ARIA validation result
 */
export function validateARIA(element) {
  const issues = [];
  const ariaAttrs = {};
  
  // Collect all ARIA attributes
  Array.from(element.attributes).forEach(attr => {
    if (attr.name.startsWith('aria-')) {
      ariaAttrs[attr.name] = attr.value;
    }
  });
  
  // Check for common ARIA issues
  if (ariaAttrs['aria-expanded'] && !ariaAttrs['aria-controls']) {
    issues.push('Element with aria-expanded should have aria-controls');
  }
  
  if (ariaAttrs['aria-describedby'] && !document.getElementById(ariaAttrs['aria-describedby'])) {
    issues.push('aria-describedby references non-existent element');
  }
  
  if (ariaAttrs['aria-labelledby'] && !document.getElementById(ariaAttrs['aria-labelledby'])) {
    issues.push('aria-labelledby references non-existent element');
  }
  
  return {
    valid: issues.length === 0,
    issues,
    attributes: ariaAttrs
  };
}
