/**
 * Report Generator for Accessibility Audit Results
 * Generates comprehensive reports in multiple formats
 */

import fs from 'fs/promises';
import path from 'path';

export class ReportGenerator {
  constructor(outputDir = './reports') {
    this.outputDir = outputDir;
  }

  /**
   * Format current date/time in local timezone as YYYY-MM-DDTHH-mm
   * @returns {string} Formatted timestamp
   */
  formatLocalTimestamp() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}_${hours}-${minutes}`;
  }

  /**
   * Sanitize domain name by replacing dots with hyphens
   * @param {string} domain - Domain name to sanitize
   * @returns {string} Sanitized domain name
   */
  sanitizeDomain(domain) {
    return domain.replace(/\./g, '-');
  }

  /**
   * Generate all reports
   * @param {Object} auditResults - Complete audit results
   * @param {string} domain - Domain name for file naming
   * @returns {Object} Generated file paths
   */
  async generateReports(auditResults, domain) {
    const timestamp = this.formatLocalTimestamp();
    const sanitizedDomain = this.sanitizeDomain(domain);
    const folderName = `${timestamp}_${sanitizedDomain}_compliance-report`;
    const filePrefix = `${timestamp}_${sanitizedDomain}_compliance-report`;
    
    const targetDir = await this.ensureOutputDir(folderName);
    
    const reports = {
      summary: await this.generateSummaryReport(auditResults, `${filePrefix}_summary.md`, targetDir),
      detailed: await this.generateDetailedReport(auditResults, `${filePrefix}_detailed.csv`, targetDir),
      statistics: await this.generateStatisticsReport(auditResults, `${filePrefix}_statistics.json`, targetDir)
    };

    console.log(`Reports generated in ${targetDir}:`);
    console.log(`- Summary: ${reports.summary}`);
    console.log(`- Detailed: ${reports.detailed}`);
    console.log(`- Statistics: ${reports.statistics}`);

    return reports;
  }

  /**
   * Ensure output directory exists
   * @param {string} subDir - Optional subdirectory to create within output directory
   */
  async ensureOutputDir(subDir = '') {
    const targetDir = subDir ? path.join(this.outputDir, subDir) : this.outputDir;
    try {
      await fs.access(targetDir);
    } catch {
      await fs.mkdir(targetDir, { recursive: true });
    }
    return targetDir;
  }

  /**
   * Generate summary report in Markdown format
   * @param {Object} auditResults - Audit results
   * @param {string} filename - Output filename
   * @param {string} targetDir - Target directory for the file
   * @returns {string} File path
   */
  async generateSummaryReport(auditResults, filename, targetDir = this.outputDir) {
    const filePath = path.join(targetDir, filename);
    
    let markdown = `# Accessibility Audit Summary\n\n`;
    markdown += `**Generated:** ${new Date().toLocaleString()}\n`;
    markdown += `**Domain:** ${auditResults.domain}\n`;
    markdown += `**Pages Audited:** ${auditResults.pagesAudited}\n\n`;

    // Executive Summary
    markdown += `## Executive Summary\n\n`;
    const overallStats = this.calculateOverallStatistics(auditResults);
    markdown += `The accessibility audit of ${auditResults.domain} reveals `;
    
    if (overallStats.criticalIssues === 0) {
      markdown += `**excellent accessibility implementation** with no critical issues found.\n\n`;
    } else {
      markdown += `**${overallStats.criticalIssues} critical issues** that need immediate attention.\n\n`;
    }

    markdown += `- **WCAG 2.1 AA Compliance:** ${overallStats.complianceLevel}\n`;
    markdown += `- **Critical Issues:** ${overallStats.criticalIssues}\n`;
    markdown += `- **High Priority Issues:** ${overallStats.highPriorityIssues}\n`;
    markdown += `- **Medium Priority Issues:** ${overallStats.mediumPriorityIssues}\n`;
    markdown += `- **Low Priority Issues:** ${overallStats.lowPriorityIssues}\n\n`;

  // Critical Issues
    if (overallStats.criticalIssues > 0) {
      markdown += `## Critical Issues (Must Fix)\n\n`;
      const criticalIssues = this.getIssuesBySeverity(auditResults, 'critical');
      criticalIssues.forEach((issue, index) => {
        markdown += `${index + 1}. **${issue.type}** - ${issue.message}\n`;
        
        // Add specific location information if available
        if (issue.context?.selector) {
          markdown += `   - **Location**: \`${issue.context.selector}\`\n`;
        }
        if (issue.context?.textSample) {
          markdown += `   - **Text**: "${issue.context.textSample}"\n`;
        }
        if (issue.context?.computedColors) {
          markdown += `   - **Colors**: ${issue.context.computedColors.foreground} on ${issue.context.computedColors.background}\n`;
        }
        if (issue.context?.filename) {
          markdown += `   - **Image**: ${issue.context.filename}\n`;
        }
        if (issue.context?.elementType) {
          markdown += `   - **Element**: ${issue.context.elementType}\n`;
        }
        
        markdown += `   - **Recommendation**: ${issue.recommendation}\n`;
        markdown += `   - **Page**: ${issue.pageUrl}\n\n`;
      });
    }

    // Manual Review (High Priority)
    const manualReviews = [];
    auditResults.pages.forEach(page => {
      const issues = page.results?.manualReview?.issues || [];
      issues.forEach(i => manualReviews.push({ ...i, pageUrl: page.url }));
    });
    if (manualReviews.length) {
      markdown += `## Manual Review Recommended\n\n`;
      manualReviews.forEach((issue, index) => {
        markdown += `${index + 1}. **${issue.type}** - ${issue.message}\n`;
        if (issue.context?.selector) markdown += `   - **Location**: \`${issue.context.selector}\`\n`;
        if (issue.context?.textSample) markdown += `   - **Text**: "${issue.context.textSample}"\n`;
        markdown += `   - **Recommendation**: ${issue.recommendation}\n`;
        markdown += `   - **Page**: ${issue.pageUrl}\n\n`;
      });
    }

    // High Priority Issues
    if (overallStats.highPriorityIssues > 0) {
      markdown += `## High Priority Issues\n\n`;
      const highPriorityIssues = this.getIssuesBySeverity(auditResults, 'high');
      highPriorityIssues.forEach((issue, index) => {
        markdown += `${index + 1}. **${issue.type}** - ${issue.message}\n`;
        
        // Add specific location information if available
        if (issue.context?.selector) {
          markdown += `   - **Location**: \`${issue.context.selector}\`\n`;
        }
        if (issue.context?.textSample || issue.context?.textContent) {
          markdown += `   - **Text**: "${issue.context.textSample || issue.context.textContent}"\n`;
        }
        if (issue.context?.elementType) {
          markdown += `   - **Element**: ${issue.context.elementType}\n`;
        }
        
        markdown += `   - **Recommendation**: ${issue.recommendation}\n`;
        markdown += `   - **Page**: ${issue.pageUrl}\n\n`;
      });
    }

    // Positive Findings
    markdown += `## Positive Findings\n\n`;
    const positiveFindings = this.getPositiveFindings(auditResults);
    positiveFindings.forEach((finding, index) => {
      markdown += `${index + 1}. **${finding.category}** - ${finding.description}\n\n`;
    });

    // Recommendations
    markdown += `## Recommendations\n\n`;
    const recommendations = this.getRecommendations(auditResults);
    recommendations.forEach((rec, index) => {
      markdown += `${index + 1}. ${rec}\n`;
    });

    // Advanced Accessibility Features
    markdown += `\n## Advanced Accessibility Checks\n\n`;
    markdown += `This audit includes advanced accessibility testing:\n\n`;
    markdown += `- **Touch Targets**: Validates interactive element sizes meet WCAG 2.5.5 (44x44px AAA, 24x24px AA minimum)\n`;
    markdown += `- **Focus Order**: Tests keyboard navigation sequence and detects illogical tab orders\n`;
    markdown += `- **Vision Simulation**: Tests color combinations for 8 types of color vision deficiencies:\n`;
    markdown += `  - Protanopia (Red-blind)\n`;
    markdown += `  - Deuteranopia (Green-blind, most common)\n`;
    markdown += `  - Tritanopia (Blue-blind)\n`;
    markdown += `  - Plus Protanomaly, Deuteranomaly, Tritanomaly, Achromatopsia, and Achromatomaly\n`;

    markdown += `\n## Detailed Results\n\n`;
    markdown += `For detailed findings and specific remediation steps, see the CSV report.\n\n`;
    markdown += `---\n`;
    markdown += `*Generated by Accessibility Audit Tool*\n`;

    await fs.writeFile(filePath, markdown);
    return filePath;
  }

  /**
   * Generate detailed CSV report
   * @param {Object} auditResults - Audit results
   * @param {string} filename - Output filename
   * @param {string} targetDir - Target directory for the file
   * @returns {string} File path
   */
  async generateDetailedReport(auditResults, filename, targetDir = this.outputDir) {
    const filePath = path.join(targetDir, filename);
    
    // Updated column order: move Status after Severity
    const header = ['Page URL','Category','Issue Type','Severity','Status','Element Selector','Element Context','Description','Recommendation','Technical Details'];
    const rows = [];

    // CSV escaping helper: always quote, double internal quotes, and strip newlines
    const esc = (val) => {
      const s = String(val ?? '').replace(/"/g, '""').replace(/\r?\n|\r/g, ' ');
      return `"${s}"`;
    };

    // Normalize for deduping (remove zero-width chars, collapse whitespace)
    const normalizeCtx = (s) => String(s ?? '').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim();
    const buildKey = (row) => {
      // row order: [url, category, issueType, severity, status, selector, context, description, recommendation, technical]
      return [
        row[0], row[1], row[2], row[3], row[4], row[5], normalizeCtx(row[6]), row[7], row[8]
      ].join('||');
    };

    // WCAG mapping and concise context helpers
    const wcagCategory = (rawCategory, issueType) => {
      switch (rawCategory) {
        case 'Color Contrast': return '1.4.3 Contrast (Minimum)';
        case 'Images': return '1.1.1 Non-text Content';
        case 'ARIA Labels': return '4.1.2 Name, Role, Value';
        case 'Keyboard Navigation': return '2.1.1 Keyboard';
        case 'Focus Order': return '2.4.3 Focus Order';
        case 'Focus Management': return '2.4.7 Focus Visible';
        case 'Touch Targets': return '2.5.8 Target Size (Minimum)';
        case 'Vision Simulation': return 'Advisory';
        case 'Semantic HTML': return 'Advisory';
        case 'Manual Review': return 'Manual Review';
        default: return rawCategory || 'Other';
      }
    };

    const issueLabel = (rawCategory, issueType) => {
      switch (rawCategory) {
        case 'Color Contrast': return 'Insufficient Contrast';
        case 'ARIA Labels': return issueType === 'missing_accessible_name' ? 'Missing Accessible Name' : 'Name/Role/Value Issue';
        case 'Images': return issueType === 'missing_alt' ? 'Missing Alt Text' : 'Non-text Content Issue';
        case 'Keyboard Navigation': return 'Keyboard Accessibility Issue';
        case 'Focus Order': return 'Illogical Focus Order';
        case 'Focus Management': return 'No Visible Focus';
        case 'Touch Targets': return issueType === 'touch_target_too_small' ? 'Target Too Small' : 'Target Size Advisory';
        case 'Vision Simulation': return 'Potential CVD Issue';
        case 'Semantic HTML': return 'Structure Recommendation';
        case 'Manual Review': return 'Ensure Sufficient Image Overlay';
        default: return issueType || 'Issue';
      }
    };

    const severityOut = (rawCategory, rawSeverity) => rawCategory === 'Manual Review' ? 'manual-review' : (rawSeverity || 'low');

    const ctxText = {
      semantic(issue) {
        const h = issue.element?.context;
        if (h?.levelName) return `Heading: ${h.levelName} "${(issue.element?.text || '').substring(0,80)}"`;
        return (issue.message || '').substring(0, 120);
      },
      contrast(contrast) {
        const t = contrast.sampleText || contrast.context?.textSample || '';
        return `Text: "${t}" | Colors: ${contrast.textColor} on ${contrast.backgroundColor} | Font: ${contrast.fontSize || ''} ${contrast.fontWeight || ''}`;
      },
      aria(issue) {
        const t = issue.context?.elementType || issue.element || '';
        const label = issue.context?.associatedLabel || 'None';
        const txt = (issue.context?.surroundingContext?.parentText || '').substring(0,80);
        return `Type: ${t} | Label: ${label} | Text: "${txt}"`;
      },
      keyboard(issue) {
        const t = issue.context?.elementType || 'element';
        const txt = (issue.context?.textContent || '').substring(0,80);
        return `Type: ${t} | Text: "${txt}"`;
      },
      images(issue) {
        const near = issue.context?.surroundingContent?.heading || issue.context?.surroundingContent?.figcaption || '';
        return `File: ${issue.context?.filename || ''} | Near: "${(near || '').substring(0,80)}"`;
      },
      focusMgmt(issue) {
        const t = issue.context?.elementType || '';
        const txt = (issue.context?.textContent || '').substring(0,60);
        return `Type: ${t} | Text: "${txt}"`;
      },
      touch(issue) {
        return `Size: ${issue.context?.currentSize || 'unknown'} | Required: ${issue.context?.minimumSizeAA || '24x24px'} | Text: "${issue.context?.textContent || ''}"`;
      },
      focusOrder(issue) {
        const jumps = issue.context?.jumps?.length || 0;
        const first = issue.context?.jumps?.[0];
        const snippet = first ? `${first.from?.text || ''} → ${first.to?.text || ''}` : '';
        return `Jumps: ${jumps}${snippet ? ` | First: ${snippet.substring(0,60)}` : ''}`;
      },
      vision(issue) {
        const v = issue.problematicVisionTypes?.map(x => x.name).join(', ') || '';
        return `Colors: ${issue.colorPair?.color1 || ''} / ${issue.colorPair?.color2 || ''} | Problematic for: ${v} | Text: "${issue.context?.textSample || ''}"`;
      },
      manual(issue) {
        return `Text: "${issue.context?.textSample || ''}" | Background image on: ${issue.context?.backgroundImageOn || ''}`;
      }
    };

    auditResults.pages.forEach(pageResult => {
      const pageUrl = pageResult.url;
      const results = pageResult.results;

      // Semantic HTML issues
      if (results.semanticHTML && results.semanticHTML.issues) {
        results.semanticHTML.issues.forEach(issue => {
          const rawCategory = 'Semantic HTML';
          const category = wcagCategory(rawCategory, issue.type);
          const issueType = issueLabel(rawCategory, issue.type);
          const selector = issue.element?.selector || issue.elementDetails?.selector || 'N/A';
          const contextInfo = ctxText.semantic(issue);
          const status = 'FAIL';
          const sev = severityOut(rawCategory, issue.severity);
          const row = [
            pageUrl,
            category,
            issueType,
            sev,
            status,
            selector,
            contextInfo,
            issue.message || '',
            issue.recommendation || '',
            'HTML Structure'
          ];
          rows.push(row);
        });
      }

  // Color contrast issues
      if (results.colorContrast) {
        results.colorContrast.forEach(contrast => {
          if (contrast.status === 'FAIL') {
            const rawCategory = 'Color Contrast';
            const category = wcagCategory(rawCategory, 'Insufficient Contrast');
            const issueType = issueLabel(rawCategory, 'Insufficient Contrast');
            const selector = contrast.elementDetails?.selector 
              || contrast.context?.selector 
              || (contrast.element ? String(contrast.element) : '')
              || 'text element';
            const contextInfo = ctxText.contrast(contrast);
            const technicalDetails = `Contrast: ${contrast.contrastRatio}:1 (required: ${contrast.compliance?.requiredRatio}:1)`;
            const status = 'FAIL';
            const sev = severityOut(rawCategory, 'critical');
            const row = [
              pageUrl,
              category,
              issueType,
              sev,
              status,
              selector,
              contextInfo,
              `Contrast ratio: ${contrast.contrastRatio}:1 (required: ${contrast.compliance?.requiredRatio}:1)`,
              'Improve color contrast to meet WCAG AA standards',
              technicalDetails
            ];
            rows.push(row);
          }
        });
      }

      // Manual review issues
      if (results.manualReview && results.manualReview.issues && results.manualReview.issues.length) {
        results.manualReview.issues.forEach(issue => {
          const rawCategory = 'Manual Review';
          const category = wcagCategory(rawCategory, issue.type);
          const issueType = issueLabel(rawCategory, issue.type);
          const selector = issue.context?.selector || 'text element';
          const contextInfo = ctxText.manual(issue);
          const status = 'REVIEW';
          const sev = severityOut(rawCategory, issue.severity);
          const row = [
            pageUrl,
            category,
            issueType,
            sev,
            status,
            selector,
            contextInfo,
            issue.message || '',
            issue.recommendation || '',
            'Manual review required'
          ];
          rows.push(row);
        });
      }

      // ARIA issues
      if (results.ariaLabels && results.ariaLabels.issues) {
        results.ariaLabels.issues.forEach(issue => {
          const rawCategory = 'ARIA Labels';
          const category = wcagCategory(rawCategory, issue.type);
          const issueType = issueLabel(rawCategory, issue.type);
          const selector = issue.elementDetails?.selector || issue.element || 'interactive element';
          const contextInfo = ctxText.aria(issue);
          const status = 'FAIL';
          const sev = severityOut(rawCategory, issue.severity);
          const row = [
            pageUrl,
            category,
            issueType,
            sev,
            status,
            selector,
            contextInfo,
            issue.message || '',
            issue.recommendation || '',
            'Interactive Element'
          ];
          rows.push(row);
        });
      }

      // Keyboard navigation issues
      if (results.keyboardNavigation && results.keyboardNavigation.issues) {
        results.keyboardNavigation.issues.forEach(issue => {
          const rawCategory = 'Keyboard Navigation';
          const category = wcagCategory(rawCategory, issue.type);
          const issueType = issueLabel(rawCategory, issue.type);
          const selector = issue.elementDetails?.selector || 'navigation element';
          const contextInfo = ctxText.keyboard(issue);
          const status = 'FAIL';
          const sev = severityOut(rawCategory, issue.severity);
          const row = [
            pageUrl,
            category,
            issueType,
            sev,
            status,
            selector,
            contextInfo,
            issue.message || '',
            issue.recommendation || '',
            'Navigation'
          ];
          rows.push(row);
        });
      }

      // Image issues
      if (results.images && results.images.issues) {
        results.images.issues.forEach(issue => {
          const rawCategory = 'Images';
          const category = wcagCategory(rawCategory, issue.type);
          const issueType = issueLabel(rawCategory, issue.type);
          const selector = issue.element?.selector || issue.context?.selector || `img[src*="${issue.src}"]`;
          const contextInfo = ctxText.images(issue);
          const status = 'FAIL';
          const sev = severityOut(rawCategory, issue.severity);
          const row = [
            pageUrl,
            category,
            issueType,
            sev,
            status,
            selector,
            contextInfo,
            issue.message || '',
            issue.recommendation || '',
            `Image: ${issue.src || 'N/A'}`
          ];
          rows.push(row);
        });
      }

      // Focus management issues
      if (results.focusManagement && results.focusManagement.issues) {
        results.focusManagement.issues.forEach(issue => {
          const rawCategory = 'Focus Management';
          const category = wcagCategory(rawCategory, issue.type);
          const issueType = issueLabel(rawCategory, issue.type);
          const selector = issue.elementDetails?.selector || 'focusable element';
          const contextInfo = ctxText.focusMgmt(issue);
          const technicalDetails = issue.context?.cssFixSuggestions?.[0] || 'Add focus styles';
          const status = 'FAIL';
          const sev = severityOut(rawCategory, issue.severity);
          const row = [
            pageUrl,
            category,
            issueType,
            sev,
            status,
            selector,
            contextInfo,
            issue.message || '',
            issue.recommendation || '',
            technicalDetails
          ];
          rows.push(row);
        });
      }

      // Touch target issues
      if (results.touchTargets && results.touchTargets.issues) {
        results.touchTargets.issues.forEach(issue => {
          const rawCategory = 'Touch Targets';
          const category = wcagCategory(rawCategory, issue.type);
          const issueType = issueLabel(rawCategory, issue.type);
          const selector = issue.context?.selector || 'interactive element';
          const contextInfo = ctxText.touch(issue);
          const technicalDetails = issue.context?.cssFixSuggestion || 'Increase touch target size';
          const status = 'FAIL';
          const sev = severityOut(rawCategory, issue.severity);
          const row = [
            pageUrl,
            category,
            issueType,
            sev,
            status,
            selector,
            contextInfo,
            issue.message || '',
            issue.recommendation || '',
            technicalDetails
          ];
          rows.push(row);
        });
      }

      // Focus order issues
      if (results.focusOrder && results.focusOrder.issues) {
        results.focusOrder.issues.forEach(issue => {
          const rawCategory = 'Focus Order';
          const category = wcagCategory(rawCategory, issue.type);
          const issueType = issueLabel(rawCategory, issue.type);
          const selector = issue.context?.selector || 'focus sequence';
          const contextInfo = ctxText.focusOrder(issue);
          const status = 'FAIL';
          const sev = severityOut(rawCategory, issue.severity);
          const row = [
            pageUrl,
            category,
            issueType,
            sev,
            status,
            selector,
            contextInfo,
            issue.message || '',
            issue.recommendation || '',
            'Tab sequence'
          ];
          rows.push(row);
        });
      }

      // Vision simulation issues
      if (results.visionSimulation && results.visionSimulation.issues) {
        results.visionSimulation.issues.forEach(issue => {
          const rawCategory = 'Vision Simulation';
          const category = wcagCategory(rawCategory, issue.type);
          const issueType = issueLabel(rawCategory, issue.type);
          const selector = issue.context?.selector || 'color combination';
          const contextInfo = ctxText.vision(issue);
          const technicalDetails = `Color vision deficiency (${issue.problematicVisionTypes?.length || 0} type(s) affected)`;
          const status = 'FAIL';
          const sev = severityOut(rawCategory, issue.severity);
          const row = [
            pageUrl,
            category,
            issueType,
            sev,
            status,
            selector,
            contextInfo,
            issue.message || '',
            issue.recommendation || '',
            technicalDetails
          ];
          rows.push(row);
        });
      }
    });

    // Deduplicate rows across all categories
    const map = new Map(); // key -> { row, count }
    for (const row of rows) {
      const key = buildKey(row);
      if (!map.has(key)) map.set(key, { row: [...row], count: 1 });
      else map.get(key).count += 1;
    }

    // Build final CSV content
    const lines = [];
    lines.push(header.map(esc).join(','));
    for (const { row, count } of map.values()) {
      // Append Occurrences info to Technical Details
      let tech = row[9] || '';
      if (count > 1) tech = tech ? `${tech} | Occurrences: ${count}` : `Occurrences: ${count}`;
      const out = [row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8], tech];
      lines.push(out.map(esc).join(','));
    }

    await fs.writeFile(filePath, lines.join('\n'));
    return filePath;
  }

  /**
   * Generate statistics report in JSON format
   * @param {Object} auditResults - Audit results
   * @param {string} filename - Output filename
   * @param {string} targetDir - Target directory for the file
   * @returns {string} File path
   */
  async generateStatisticsReport(auditResults, filename, targetDir = this.outputDir) {
    const filePath = path.join(targetDir, filename);
    
    const statistics = {
      metadata: {
        domain: auditResults.domain,
        timestamp: new Date().toISOString(),
        pagesAudited: auditResults.pagesAudited,
        auditDuration: auditResults.auditDuration
      },
      overall: this.calculateOverallStatistics(auditResults),
      byCategory: this.calculateCategoryStatistics(auditResults),
      byPage: auditResults.pages.map(page => ({
        url: page.url,
        title: page.title,
        summary: page.results.summary,
        issues: this.countIssuesBySeverity(page.results)
      })),
      trends: this.calculateTrends(auditResults)
    };

    await fs.writeFile(filePath, JSON.stringify(statistics, null, 2));
    return filePath;
  }

  /**
   * Calculate overall statistics
   * @param {Object} auditResults - Audit results
   * @returns {Object} Overall statistics
   */
  calculateOverallStatistics(auditResults) {
    let totalIssues = 0;
    let criticalIssues = 0;
    let highPriorityIssues = 0;
    let mediumPriorityIssues = 0;
    let lowPriorityIssues = 0;
    let passes = 0;

    auditResults.pages.forEach(page => {
      const pageIssues = this.countIssuesBySeverity(page.results);
      totalIssues += pageIssues.total;
      criticalIssues += pageIssues.critical;
      highPriorityIssues += pageIssues.high;
      mediumPriorityIssues += pageIssues.medium;
      lowPriorityIssues += pageIssues.low;
      passes += pageIssues.passes;
    });

    const complianceLevel = criticalIssues === 0 ? 'WCAG AA Compliant' : 'Needs Improvement';

    return {
      totalIssues,
      criticalIssues,
      highPriorityIssues,
      mediumPriorityIssues,
      lowPriorityIssues,
      passes,
      complianceLevel
    };
  }

  /**
   * Count issues by severity for a page
   * @param {Object} pageResults - Page audit results
   * @returns {Object} Issue counts by severity
   */
  countIssuesBySeverity(pageResults) {
    let total = 0;
    let critical = 0;
    let high = 0;
    let medium = 0;
    let low = 0;
    let passes = 0;

    // Count issues from each category
    const categories = [
      pageResults.semanticHTML,
      pageResults.ariaLabels,
      pageResults.keyboardNavigation,
      pageResults.images,
      pageResults.focusManagement,
      pageResults.touchTargets,
      pageResults.focusOrder,
      pageResults.visionSimulation,
      pageResults.manualReview
    ];

    categories.forEach(category => {
      if (category && category.issues) {
        category.issues.forEach(issue => {
          total++;
          if (issue.severity === 'critical') {
            critical++;
          } else if (issue.severity === 'high') {
            high++;
          } else if (issue.severity === 'medium') {
            medium++;
          } else {
            low++;
          }
        });
      }
    });

    // Count color contrast failures
    if (pageResults.colorContrast) {
      pageResults.colorContrast.forEach(contrast => {
        if (contrast.status === 'FAIL') {
          total++;
          critical++;
        } else if (contrast.status === 'PASS') {
          passes++;
        }
      });
    }

    return { total, critical, high, medium, low, passes };
  }

  /**
   * Get issues by severity
   * @param {Object} auditResults - Audit results
   * @param {string} severity - Severity level
   * @returns {Array} Issues with specified severity
   */
  getIssuesBySeverity(auditResults, severity) {
    const issues = [];
    
    auditResults.pages.forEach(page => {
      const results = page.results;
      
      // Collect issues from all categories
      const categories = [
        results.semanticHTML,
        results.ariaLabels,
        results.keyboardNavigation,
        results.images,
        results.focusManagement
      ];

      categories.forEach(category => {
        if (category && category.issues) {
          category.issues.forEach(issue => {
            if (issue.severity === severity) {
              issues.push({ ...issue, pageUrl: page.url });
            }
          });
        }
      });

      // Check color contrast failures
      if (results.colorContrast) {
        results.colorContrast.forEach(contrast => {
          if (contrast.status === 'FAIL' && severity === 'critical') {
            issues.push({
              type: 'color_contrast',
              severity: 'critical',
              message: `Insufficient contrast ratio: ${contrast.contrastRatio}:1`,
              recommendation: 'Improve color contrast to meet WCAG AA standards',
              pageUrl: page.url
            });
          }
        });
      }
    });

    return issues;
  }

  /**
   * Get positive findings
   * @param {Object} auditResults - Audit results
   * @returns {Array} Positive findings
   */
  getPositiveFindings(auditResults) {
    const findings = [];

    // Check for good semantic structure
    const hasH1 = auditResults.pages.some(page => 
      page.results.semanticHTML && 
      page.results.semanticHTML.headings && 
      page.results.semanticHTML.headings.some(h => h.level === 'h1')
    );

    if (hasH1) {
      findings.push({
        category: 'Semantic HTML',
        description: 'Proper H1 heading structure found'
      });
    }

    // Check for good image accessibility
    const hasGoodImages = auditResults.pages.some(page => 
      page.results.images && 
      page.results.images.images && 
      page.results.images.images.some(img => img.hasAlt)
    );

    if (hasGoodImages) {
      findings.push({
        category: 'Image Accessibility',
        description: 'Images have proper alt text'
      });
    }

    // Check for keyboard navigation
    const hasKeyboardNav = auditResults.pages.some(page => 
      page.results.keyboardNavigation && 
      page.results.keyboardNavigation.focusableElements &&
      page.results.keyboardNavigation.focusableElements.length > 0
    );

    if (hasKeyboardNav) {
      findings.push({
        category: 'Keyboard Navigation',
        description: 'Good keyboard accessibility implementation'
      });
    }

    return findings;
  }

  /**
   * Get recommendations
   * @param {Object} auditResults - Audit results
   * @returns {Array} Recommendations
   */
  getRecommendations(auditResults) {
    const recommendations = [];

    const stats = this.calculateOverallStatistics(auditResults);

    if (stats.criticalIssues > 0) {
      recommendations.push('Fix all critical issues immediately');
    }

    if (stats.highPriorityIssues > 0) {
      recommendations.push('Address high priority issues for better accessibility');
    }

    recommendations.push('Test with screen readers and keyboard navigation');
    recommendations.push('Conduct user testing with assistive technologies');
    recommendations.push('Implement regular accessibility audits');

    return recommendations;
  }

  /**
   * Calculate category statistics
   * @param {Object} auditResults - Audit results
   * @returns {Object} Statistics by category
   */
  calculateCategoryStatistics(auditResults) {
    const categories = {
      semanticHTML: { total: 0, issues: 0 },
      colorContrast: { total: 0, issues: 0 },
      ariaLabels: { total: 0, issues: 0 },
      keyboardNavigation: { total: 0, issues: 0 },
      images: { total: 0, issues: 0 },
      focusManagement: { total: 0, issues: 0 },
      touchTargets: { total: 0, issues: 0 },
      focusOrder: { total: 0, issues: 0 },
      visionSimulation: { total: 0, issues: 0 },
      manualReview: { total: 0, issues: 0 }
    };

    auditResults.pages.forEach(page => {
      const results = page.results;

      // Count semantic HTML issues
      if (results.semanticHTML && results.semanticHTML.issues) {
        categories.semanticHTML.total++;
        categories.semanticHTML.issues += results.semanticHTML.issues.length;
      }

      // Count color contrast issues
      if (results.colorContrast) {
        categories.colorContrast.total++;
        const contrastIssues = results.colorContrast.filter(c => c.status === 'FAIL').length;
        categories.colorContrast.issues += contrastIssues;
      }

      // Count ARIA issues
      if (results.ariaLabels && results.ariaLabels.issues) {
        categories.ariaLabels.total++;
        categories.ariaLabels.issues += results.ariaLabels.issues.length;
      }

      // Count keyboard navigation issues
      if (results.keyboardNavigation && results.keyboardNavigation.issues) {
        categories.keyboardNavigation.total++;
        categories.keyboardNavigation.issues += results.keyboardNavigation.issues.length;
      }

      // Count image issues
      if (results.images && results.images.issues) {
        categories.images.total++;
        categories.images.issues += results.images.issues.length;
      }

      // Count focus management issues
      if (results.focusManagement && results.focusManagement.issues) {
        categories.focusManagement.total++;
        categories.focusManagement.issues += results.focusManagement.issues.length;
      }

      // Count touch target issues
      if (results.touchTargets && results.touchTargets.issues) {
        categories.touchTargets.total++;
        categories.touchTargets.issues += results.touchTargets.issues.length;
      }

      // Count focus order issues
      if (results.focusOrder && results.focusOrder.issues) {
        categories.focusOrder.total++;
        categories.focusOrder.issues += results.focusOrder.issues.length;
      }

      // Count vision simulation issues
      if (results.visionSimulation && results.visionSimulation.issues) {
        categories.visionSimulation.total++;
        categories.visionSimulation.issues += results.visionSimulation.issues.length;
      }

      // Count manual review issues
      if (results.manualReview && results.manualReview.issues) {
        categories.manualReview.total++;
        categories.manualReview.issues += results.manualReview.issues.length;
      }
    });

    return categories;
  }

  /**
   * Calculate trends
   * @param {Object} auditResults - Audit results
   * @returns {Object} Trend analysis
   */
  calculateTrends(auditResults) {
    return {
      mostCommonIssues: this.getMostCommonIssues(auditResults),
      pagesWithMostIssues: this.getPagesWithMostIssues(auditResults),
      categoryDistribution: this.getCategoryDistribution(auditResults)
    };
  }

  /**
   * Get most common issues
   * @param {Object} auditResults - Audit results
   * @returns {Array} Most common issues
   */
  getMostCommonIssues(auditResults) {
    const issueCounts = {};

    auditResults.pages.forEach(page => {
      const results = page.results;
      
      const categories = [
        results.semanticHTML,
        results.ariaLabels,
        results.keyboardNavigation,
        results.images,
        results.focusManagement
      ];

      categories.forEach(category => {
        if (category && category.issues) {
          category.issues.forEach(issue => {
            issueCounts[issue.type] = (issueCounts[issue.type] || 0) + 1;
          });
        }
      });
    });

    return Object.entries(issueCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([type, count]) => ({ type, count }));
  }

  /**
   * Get pages with most issues
   * @param {Object} auditResults - Audit results
   * @returns {Array} Pages with most issues
   */
  getPagesWithMostIssues(auditResults) {
    return auditResults.pages
      .map(page => ({
        url: page.url,
        title: page.title,
        issueCount: this.countIssuesBySeverity(page.results).total
      }))
      .sort((a, b) => b.issueCount - a.issueCount)
      .slice(0, 5);
  }

  /**
   * Get category distribution
   * @param {Object} auditResults - Audit results
   * @returns {Object} Category distribution
   */
  getCategoryDistribution(auditResults) {
    const distribution = {};

    auditResults.pages.forEach(page => {
      const results = page.results;
      const issueCount = this.countIssuesBySeverity(results).total;
      
      if (issueCount > 0) {
        const categories = ['semanticHTML', 'ariaLabels', 'keyboardNavigation', 'images', 'focusManagement', 'touchTargets', 'focusOrder', 'visionSimulation', 'manualReview'];
        categories.forEach(category => {
          if (results[category] && results[category].issues) {
            distribution[category] = (distribution[category] || 0) + results[category].issues.length;
          }
        });
      }
    });

    return distribution;
  }
}
