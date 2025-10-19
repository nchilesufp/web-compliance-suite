/**
 * Vision Simulator for Accessibility Testing
 * Simulates various vision conditions including color blindness and impaired vision
 */

/**
 * Color blindness simulation matrices
 * Based on research by Brettel, Viénot, and Mollon
 */
export const VISION_TYPES = {
  NORMAL: 'normal',
  PROTANOPIA: 'protanopia',          // Red-blind (no red cones)
  DEUTERANOPIA: 'deuteranopia',       // Green-blind (no green cones)
  TRITANOPIA: 'tritanopia',           // Blue-blind (no blue cones)
  PROTANOMALY: 'protanomaly',         // Red-weak
  DEUTERANOMALY: 'deuteranomaly',     // Green-weak (most common)
  TRITANOMALY: 'tritanomaly',         // Blue-weak
  ACHROMATOPSIA: 'achromatopsia',     // Complete color blindness
  ACHROMATOMALY: 'achromatomaly',     // Partial color blindness
  LOW_VISION: 'low_vision',           // Reduced visual acuity
  CATARACTS: 'cataracts'              // Clouded vision
};

/**
 * Color transformation matrices for different types of color blindness
 */
const COLOR_BLINDNESS_MATRICES = {
  protanopia: [
    [0.567, 0.433, 0.0],
    [0.558, 0.442, 0.0],
    [0.0, 0.242, 0.758]
  ],
  deuteranopia: [
    [0.625, 0.375, 0.0],
    [0.7, 0.3, 0.0],
    [0.0, 0.3, 0.7]
  ],
  tritanopia: [
    [0.95, 0.05, 0.0],
    [0.0, 0.433, 0.567],
    [0.0, 0.475, 0.525]
  ],
  protanomaly: [
    [0.817, 0.183, 0.0],
    [0.333, 0.667, 0.0],
    [0.0, 0.125, 0.875]
  ],
  deuteranomaly: [
    [0.8, 0.2, 0.0],
    [0.258, 0.742, 0.0],
    [0.0, 0.142, 0.858]
  ],
  tritanomaly: [
    [0.967, 0.033, 0.0],
    [0.0, 0.733, 0.267],
    [0.0, 0.183, 0.817]
  ],
  achromatopsia: [
    [0.299, 0.587, 0.114],
    [0.299, 0.587, 0.114],
    [0.299, 0.587, 0.114]
  ],
  achromatomaly: [
    [0.618, 0.320, 0.062],
    [0.163, 0.775, 0.062],
    [0.163, 0.320, 0.516]
  ]
};

/**
 * Apply color blindness transformation to RGB values
 * @param {number} r - Red value (0-255)
 * @param {number} g - Green value (0-255)
 * @param {number} b - Blue value (0-255)
 * @param {string} visionType - Type of vision condition
 * @returns {Array} Transformed [r, g, b] values
 */
export function simulateColorBlindness(r, g, b, visionType) {
  if (visionType === VISION_TYPES.NORMAL) {
    return [r, g, b];
  }

  const matrix = COLOR_BLINDNESS_MATRICES[visionType];
  if (!matrix) {
    return [r, g, b];
  }

  // Normalize RGB to 0-1
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  // Apply transformation matrix
  const rNew = matrix[0][0] * rNorm + matrix[0][1] * gNorm + matrix[0][2] * bNorm;
  const gNew = matrix[1][0] * rNorm + matrix[1][1] * gNorm + matrix[1][2] * bNorm;
  const bNew = matrix[2][0] * rNorm + matrix[2][1] * gNorm + matrix[2][2] * bNorm;

  // Convert back to 0-255 and clamp
  return [
    Math.round(Math.max(0, Math.min(255, rNew * 255))),
    Math.round(Math.max(0, Math.min(255, gNew * 255))),
    Math.round(Math.max(0, Math.min(255, bNew * 255)))
  ];
}

/**
 * Calculate color difference using CIEDE2000 algorithm (simplified)
 * @param {Array} color1 - [r, g, b] array
 * @param {Array} color2 - [r, g, b] array
 * @returns {number} Color difference value
 */
export function calculateColorDifference(color1, color2) {
  // Simplified Euclidean distance in RGB space
  // For production, consider implementing full CIEDE2000
  const dr = color1[0] - color2[0];
  const dg = color1[1] - color2[1];
  const db = color1[2] - color2[2];
  
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Test if two colors are distinguishable for a given vision type
 * @param {Array} color1 - [r, g, b] array
 * @param {Array} color2 - [r, g, b] array
 * @param {string} visionType - Type of vision condition
 * @param {number} threshold - Minimum difference threshold (default: 30)
 * @returns {Object} Result with distinguishability info
 */
export function testColorDistinguishability(color1, color2, visionType, threshold = 30) {
  // Original colors
  const originalDiff = calculateColorDifference(color1, color2);
  
  // Simulated colors
  const simColor1 = simulateColorBlindness(color1[0], color1[1], color1[2], visionType);
  const simColor2 = simulateColorBlindness(color2[0], color2[1], color2[2], visionType);
  const simulatedDiff = calculateColorDifference(simColor1, simColor2);
  
  const isDistinguishable = simulatedDiff >= threshold;
  
  return {
    visionType,
    originalDifference: Math.round(originalDiff),
    simulatedDifference: Math.round(simulatedDiff),
    isDistinguishable,
    threshold,
    originalColors: {
      color1: `rgb(${color1[0]}, ${color1[1]}, ${color1[2]})`,
      color2: `rgb(${color2[0]}, ${color2[1]}, ${color2[2]})`
    },
    simulatedColors: {
      color1: `rgb(${simColor1[0]}, ${simColor1[1]}, ${simColor1[2]})`,
      color2: `rgb(${simColor2[0]}, ${simColor2[1]}, ${simColor2[2]})`
    },
    impactPercentage: Math.round((1 - simulatedDiff / originalDiff) * 100)
  };
}

/**
 * Test color combinations against multiple vision types
 * @param {Array} color1 - [r, g, b] array
 * @param {Array} color2 - [r, g, b] array
 * @returns {Object} Results for all vision types
 */
export function testAllVisionTypes(color1, color2) {
  const results = {};
  const visionTypesToTest = [
    VISION_TYPES.PROTANOPIA,
    VISION_TYPES.DEUTERANOPIA,
    VISION_TYPES.TRITANOPIA,
    VISION_TYPES.PROTANOMALY,
    VISION_TYPES.DEUTERANOMALY,
    VISION_TYPES.TRITANOMALY,
    VISION_TYPES.ACHROMATOPSIA,
    VISION_TYPES.ACHROMATOMALY
  ];
  
  visionTypesToTest.forEach(visionType => {
    results[visionType] = testColorDistinguishability(color1, color2, visionType);
  });
  
  // Determine overall accessibility
  const failedTypes = Object.values(results).filter(r => !r.isDistinguishable);
  
  return {
    colorPair: {
      color1: `rgb(${color1[0]}, ${color1[1]}, ${color1[2]})`,
      color2: `rgb(${color2[0]}, ${color2[1]}, ${color2[2]})`
    },
    results,
    summary: {
      totalVisionTypes: visionTypesToTest.length,
      passedVisionTypes: visionTypesToTest.length - failedTypes.length,
      failedVisionTypes: failedTypes.length,
      isAccessible: failedTypes.length === 0,
      problematicTypes: failedTypes.map(r => r.visionType)
    }
  };
}

/**
 * Analyze if information is conveyed through color alone
 * @param {Array} elements - Array of element color data
 * @returns {Object} Analysis results
 */
export function analyzeColorDependency(elements) {
  const issues = [];
  
  // Check for elements that differ only in color
  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      const elem1 = elements[i];
      const elem2 = elements[j];
      
      // If elements have similar text but different colors, they might rely on color for distinction
      if (elem1.text && elem2.text && 
          elem1.text.toLowerCase() === elem2.text.toLowerCase() &&
          elem1.color !== elem2.color) {
        
        const testResults = testAllVisionTypes(
          parseColor(elem1.color),
          parseColor(elem2.color)
        );
        
        if (!testResults.summary.isAccessible) {
          issues.push({
            type: 'color_dependency',
            severity: 'high',
            elements: [elem1, elem2],
            message: 'Elements may be indistinguishable for users with color vision deficiencies',
            problematicVisionTypes: testResults.summary.problematicTypes,
            recommendation: 'Use text labels, patterns, or shapes in addition to color to convey information'
          });
        }
      }
    }
  }
  
  return {
    hasIssues: issues.length > 0,
    issueCount: issues.length,
    issues
  };
}

/**
 * Parse color string to RGB array
 * @param {string} colorString - Color in rgb() or hex format
 * @returns {Array} [r, g, b] array
 */
function parseColor(colorString) {
  // Handle rgb/rgba
  const rgbMatch = colorString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    return [parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3])];
  }
  
  // Handle hex
  if (colorString.startsWith('#')) {
    const hex = colorString.replace('#', '');
    if (hex.length === 3) {
      return [
        parseInt(hex[0] + hex[0], 16),
        parseInt(hex[1] + hex[1], 16),
        parseInt(hex[2] + hex[2], 16)
      ];
    } else if (hex.length === 6) {
      return [
        parseInt(hex.substring(0, 2), 16),
        parseInt(hex.substring(2, 4), 16),
        parseInt(hex.substring(4, 6), 16)
      ];
    }
  }
  
  // Default to black
  return [0, 0, 0];
}

/**
 * Get human-readable vision type names
 * @param {string} visionType - Vision type constant
 * @returns {string} Human-readable name
 */
export function getVisionTypeName(visionType) {
  const names = {
    protanopia: 'Protanopia (Red-blind)',
    deuteranopia: 'Deuteranopia (Green-blind)',
    tritanopia: 'Tritanopia (Blue-blind)',
    protanomaly: 'Protanomaly (Red-weak)',
    deuteranomaly: 'Deuteranomaly (Green-weak)',
    tritanomaly: 'Tritanomaly (Blue-weak)',
    achromatopsia: 'Achromatopsia (Complete color blindness)',
    achromatomaly: 'Achromatomaly (Partial color blindness)'
  };
  
  return names[visionType] || visionType;
}
