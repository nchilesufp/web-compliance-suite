/**
 * WCAG Contrast Ratio Calculator
 * Implements the official WCAG 2.1 contrast ratio formula
 */

/**
 * Calculate the relative luminance of a color
 * @param {number} r - Red component (0-255)
 * @param {number} g - Green component (0-255)
 * @param {number} b - Blue component (0-255)
 * @returns {number} Relative luminance
 */
export function getLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculate contrast ratio between two colors
 * @param {Array} color1 - [r, g, b] array for first color
 * @param {Array} color2 - [r, g, b] array for second color
 * @returns {number} Contrast ratio
 */
export function getContrastRatio(color1, color2) {
  const lum1 = getLuminance(...color1);
  const lum2 = getLuminance(...color2);
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

/**
 * Parse RGB color string to array
 * @param {string} rgbString - RGB color string like "rgb(255, 0, 0)"
 * @returns {Array|null} [r, g, b] array or null if invalid
 */
export function parseRGB(rgbString) {
  const match = rgbString.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (match) {
    return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
  }
  return null;
}

/**
 * Parse hex color to RGB array
 * @param {string} hexString - Hex color string like "#ff0000" or "#f00"
 * @returns {Array|null} [r, g, b] array or null if invalid
 */
export function parseHex(hexString) {
  const hex = hexString.replace('#', '');
  if (hex.length === 3) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    return [r, g, b];
  } else if (hex.length === 6) {
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return [r, g, b];
  }
  return null;
}

/**
 * Check if contrast ratio meets WCAG standards
 * @param {number} contrastRatio - Calculated contrast ratio
 * @param {boolean} isLargeText - Whether text is large (18px+ or 14px+ bold)
 * @param {string} level - WCAG level: 'AA' or 'AAA'
 * @returns {Object} Result with pass status and details
 */
export function checkWCAGCompliance(contrastRatio, isLargeText, level = 'AA') {
  const standards = {
    'AA': {
      normal: 4.5,
      large: 3
    },
    'AAA': {
      normal: 7,
      large: 4.5
    }
  };

  const requiredRatio = isLargeText ? standards[level].large : standards[level].normal;
  const passes = contrastRatio >= requiredRatio;

  return {
    contrastRatio: parseFloat(contrastRatio.toFixed(2)),
    requiredRatio,
    passes,
    level,
    isLargeText,
    status: passes ? 'PASS' : 'FAIL'
  };
}

/**
 * Analyze text color contrast against background
 * @param {string} textColor - Text color in RGB or hex format
 * @param {string} backgroundColor - Background color in RGB or hex format
 * @param {boolean} isLargeText - Whether text is large
 * @param {string} level - WCAG level
 * @returns {Object} Complete contrast analysis
 */
export function analyzeContrast(textColor, backgroundColor, isLargeText = false, level = 'AA') {
  let textRGB, bgRGB;

  // Parse text color
  if (textColor.startsWith('rgb')) {
    textRGB = parseRGB(textColor);
  } else if (textColor.startsWith('#')) {
    textRGB = parseHex(textColor);
  }

  // Parse background color
  if (backgroundColor.startsWith('rgb')) {
    bgRGB = parseRGB(backgroundColor);
  } else if (backgroundColor.startsWith('#')) {
    bgRGB = parseHex(backgroundColor);
  }

  if (!textRGB || !bgRGB) {
    return {
      error: 'Invalid color format',
      textColor,
      backgroundColor
    };
  }

  const contrastRatio = getContrastRatio(textRGB, bgRGB);
  const compliance = checkWCAGCompliance(contrastRatio, isLargeText, level);

  return {
    textColor,
    backgroundColor,
    textRGB,
    bgRGB,
    contrastRatio: parseFloat(contrastRatio.toFixed(2)),
    compliance
  };
}
