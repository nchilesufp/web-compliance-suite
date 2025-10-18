/**
 * Security utilities for the accessibility audit tool
 */

/**
 * Validate URL for security and safety
 * @param {string} url - URL to validate
 * @returns {Object} Validation result
 */
export function validateUrl(url) {
  const issues = [];
  
  // Check URL length
  if (url.length > 2048) {
    issues.push('URL exceeds maximum length of 2048 characters');
  }
  
  // Check for valid protocol
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    issues.push('URL must use http:// or https:// protocol');
  }
  
  // Check for suspicious patterns
  const suspiciousPatterns = [
    /javascript:/i,
    /data:/i,
    /file:/i,
    /ftp:/i,
    /<script/i,
    /<iframe/i,
    /<object/i,
    /<embed/i
  ];
  
  suspiciousPatterns.forEach(pattern => {
    if (pattern.test(url)) {
      issues.push('URL contains potentially malicious content');
    }
  });
  
  return {
    isValid: issues.length === 0,
    issues
  };
}

/**
 * Validate output directory for security
 * @param {string} dir - Directory path to validate
 * @returns {Object} Validation result
 */
export function validateOutputDirectory(dir) {
  const issues = [];
  
  // Check for path traversal attempts
  if (dir.includes('..') || dir.includes('~')) {
    issues.push('Directory path contains potentially unsafe characters');
  }
  
  // Check for absolute paths outside user directory
  if (dir.startsWith('/') && !dir.startsWith(process.cwd())) {
    issues.push('Directory path is outside current working directory');
  }
  
  return {
    isValid: issues.length === 0,
    issues
  };
}

/**
 * Sanitize text content for safe output
 * @param {string} text - Text to sanitize
 * @param {number} maxLength - Maximum length
 * @returns {string} Sanitized text
 */
export function sanitizeText(text, maxLength = 1000) {
  if (!text) return '';
  
  // Remove potentially dangerous characters
  let sanitized = text
    .replace(/[<>]/g, '') // Remove < and >
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/data:/gi, '') // Remove data: protocol
    .trim();
  
  // Limit length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength) + '...';
  }
  
  return sanitized;
}

/**
 * Validate numeric input with bounds
 * @param {any} value - Value to validate
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {number} defaultValue - Default value if invalid
 * @returns {number} Validated number
 */
export function validateNumericInput(value, min, max, defaultValue) {
  const num = parseInt(value);
  
  if (isNaN(num) || num < min || num > max) {
    return defaultValue;
  }
  
  return num;
}

/**
 * Rate limiter for crawling operations
 */
export class RateLimiter {
  constructor(maxRequests = 10, timeWindow = 1000) {
    this.maxRequests = maxRequests;
    this.timeWindow = timeWindow;
    this.requests = [];
  }
  
  async waitIfNeeded() {
    const now = Date.now();
    
    // Remove old requests outside time window
    this.requests = this.requests.filter(time => now - time < this.timeWindow);
    
    // If we've exceeded the limit, wait
    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = Math.min(...this.requests);
      const waitTime = this.timeWindow - (now - oldestRequest);
      
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    // Record this request
    this.requests.push(now);
  }
}

/**
 * Memory usage monitor
 */
export class MemoryMonitor {
  constructor(maxMemoryMB = 500) {
    this.maxMemoryMB = maxMemoryMB;
  }
  
  checkMemoryUsage() {
    const usage = process.memoryUsage();
    const heapUsedMB = usage.heapUsed / 1024 / 1024;
    
    if (heapUsedMB > this.maxMemoryMB) {
      throw new Error(`Memory usage exceeded limit: ${heapUsedMB.toFixed(2)}MB > ${this.maxMemoryMB}MB`);
    }
    
    return {
      heapUsed: heapUsedMB,
      heapTotal: usage.heapTotal / 1024 / 1024,
      external: usage.external / 1024 / 1024,
      rss: usage.rss / 1024 / 1024
    };
  }
}
