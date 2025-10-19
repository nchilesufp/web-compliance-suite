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
 * Parse RGB/RGBA color string to array
 * @param {string} rgbString - RGB/RGBA color string like "rgb(255, 0, 0)" or "rgba(255, 0, 0, 0.5)"
 * @returns {Array|null} [r, g, b] array or null if invalid
 */
export function parseRGB(rgbString) {
  // Handle both rgb() and rgba()
  const match = rgbString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
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
 * Parse HSL color to RGB array
 * @param {string} hslString - HSL color string like "hsl(120, 100%, 50%)"
 * @returns {Array|null} [r, g, b] array or null if invalid
 */
export function parseHSL(hslString) {
  const match = hslString.match(/hsla?\((\d+),\s*(\d+)%,\s*(\d+)%(?:,\s*[\d.]+)?\)/);
  if (!match) return null;

  const h = parseInt(match[1]) / 360;
  const s = parseInt(match[2]) / 100;
  const l = parseInt(match[3]) / 100;

  const hslToRgb = (h, s, l) => {
    let r, g, b;

    if (s === 0) {
      r = g = b = l; // achromatic
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };

      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }

    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  };

  return hslToRgb(h, s, l);
}

/**
 * Named colors mapping to RGB values
 */
const NAMED_COLORS = {
  'black': [0, 0, 0],
  'white': [255, 255, 255],
  'red': [255, 0, 0],
  'green': [0, 128, 0],
  'blue': [0, 0, 255],
  'yellow': [255, 255, 0],
  'cyan': [0, 255, 255],
  'magenta': [255, 0, 255],
  'silver': [192, 192, 192],
  'gray': [128, 128, 128],
  'maroon': [128, 0, 0],
  'olive': [128, 128, 0],
  'lime': [0, 255, 0],
  'aqua': [0, 255, 255],
  'teal': [0, 128, 128],
  'navy': [0, 0, 128],
  'fuchsia': [255, 0, 255],
  'purple': [128, 0, 128],
  'orange': [255, 165, 0],
  'transparent': [255, 255, 255] // Default to white for transparent
};

/**
 * Parse named color to RGB array
 * @param {string} colorName - Named color like "red", "blue", etc.
 * @returns {Array|null} [r, g, b] array or null if invalid
 */
export function parseNamedColor(colorName) {
  const normalized = colorName.toLowerCase().trim();
  return NAMED_COLORS[normalized] || null;
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
 * Parse any color format to RGB array
 * @param {string} colorString - Color in any supported format
 * @returns {Array|null} [r, g, b] array or null if invalid
 */
export function parseColor(colorString) {
  if (!colorString || typeof colorString !== 'string') {
    return null;
  }

  const color = colorString.trim();

  // Try RGB/RGBA
  if (color.startsWith('rgb')) {
    return parseRGB(color);
  }
  
  // Try hex
  if (color.startsWith('#')) {
    return parseHex(color);
  }
  
  // Try HSL/HSLA
  if (color.startsWith('hsl')) {
    return parseHSL(color);
  }
  
  // Try named colors
  return parseNamedColor(color);
}

/**
 * Analyze text color contrast against background
 * @param {string} textColor - Text color in any supported format
 * @param {string} backgroundColor - Background color in any supported format
 * @param {boolean} isLargeText - Whether text is large
 * @param {string} level - WCAG level
 * @returns {Object} Complete contrast analysis
 */
export function analyzeContrast(textColor, backgroundColor, isLargeText = false, level = 'AA') {
  const textRGB = parseColor(textColor);
  const bgRGB = parseColor(backgroundColor);

  if (!textRGB || !bgRGB) {
    return {
      error: `Invalid color format - Text: "${textColor}", Background: "${backgroundColor}"`,
      textColor,
      backgroundColor,
      supportedFormats: ['rgb()', 'rgba()', '#hex', 'hsl()', 'hsla()', 'named colors']
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
