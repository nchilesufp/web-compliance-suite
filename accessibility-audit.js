#!/usr/bin/env node

/**
 * Comprehensive Accessibility Audit Tool
 * Security-enhanced CLI tool that crawls websites and performs accurate accessibility audits
 */

import { Command } from 'commander';
import { chromium } from 'playwright';
import ora from 'ora';
import chalk from 'chalk';
import { WebCrawler } from './src/crawler.js';
import { AccessibilityAuditor } from './src/auditor.js';
import { ReportGenerator } from './src/reporter.js';
import { validateUrl, validateOutputDirectory, validateNumericInput, RateLimiter, MemoryMonitor } from './src/security.js';

const program = new Command();

program
  .name('accessibility-audit')
  .description('Comprehensive accessibility audit tool that crawls websites and generates detailed reports')
  .version('1.0.0')
  .argument('<url>', 'URL to audit (e.g., https://example.com)')
  .option('-d, --depth <number>', 'Crawl depth (default: 2)', '2')
  .option('-p, --max-pages <number>', 'Maximum pages to audit (default: 10)', '10')
  .option('-o, --output <directory>', 'Output directory for reports (default: ./reports)', './reports')
  .option('--headless', 'Run browser in headless mode (default: true)', true)
  .option('--timeout <number>', 'Page load timeout in milliseconds (default: 30000)', '30000')
  .option('--verbose', 'Enable verbose output', false)
  .option('--rate-limit <number>', 'Maximum requests per second (default: 5)', '5')
  .option('--max-memory <number>', 'Maximum memory usage in MB (default: 500)', '500')
  .option('--level <level>', 'WCAG compliance level (AA or AAA, default: AA)', 'AA')
  .option('--include-external', 'Include external links in crawling (default: false)', false)
  .option('--skip-images', 'Skip image accessibility checks (default: false)', false)
  .option('--skip-contrast', 'Skip color contrast checks (default: false)', false)
  .option('--format <format>', 'Output format (all, summary, detailed, json, default: all)', 'all')
  .action(async (url, options) => {
    try {
      await runAudit(url, options);
    } catch (error) {
      console.error(chalk.red('Audit failed:'), error.message);
      if (options.verbose) {
        console.error(chalk.gray('Stack trace:'), error.stack);
      }
      process.exit(1);
    }
  });

async function runAudit(url, options) {
  const startTime = Date.now();
  let browser;

  try {
    // Security validations
    const urlValidation = validateUrl(url);
    if (!urlValidation.isValid) {
      throw new Error(`Invalid URL: ${urlValidation.issues.join(', ')}`);
    }

    const outputValidation = validateOutputDirectory(options.output);
    if (!outputValidation.isValid) {
      throw new Error(`Invalid output directory: ${outputValidation.issues.join(', ')}`);
    }

    // Validate numeric inputs with security bounds
    const depth = validateNumericInput(options.depth, 1, 10, 2);
    const maxPages = validateNumericInput(options.maxPages, 1, 100, 10);
    const timeout = validateNumericInput(options.timeout, 5000, 120000, 30000);
    const rateLimit = validateNumericInput(options.rateLimit, 1, 50, 5);
    const maxMemory = validateNumericInput(options.maxMemory, 100, 2000, 500);

    // Validate WCAG level
    const wcagLevel = ['AA', 'AAA'].includes(options.level.toUpperCase()) ? options.level.toUpperCase() : 'AA';

    // Initialize security monitors
    const rateLimiter = new RateLimiter(rateLimit, 1000);
    const memoryMonitor = new MemoryMonitor(maxMemory);

    console.log(chalk.blue.bold('🔍 Comprehensive Accessibility Audit Tool'));
    console.log(chalk.gray('=============================================='));
    console.log(`URL: ${chalk.cyan(url)}`);
    console.log(`WCAG Level: ${chalk.cyan(wcagLevel)}`);
    console.log(`Max Depth: ${chalk.cyan(depth)}`);
    console.log(`Max Pages: ${chalk.cyan(maxPages)}`);
    console.log(`Output: ${chalk.cyan(options.output)}`);
    console.log(`Format: ${chalk.cyan(options.format)}`);
    console.log(`Rate Limit: ${chalk.cyan(rateLimit)} req/sec`);
    console.log(`Memory Limit: ${chalk.cyan(maxMemory)}MB`);
    
    if (options.skipImages) console.log(chalk.yellow('⚠️  Skipping image checks'));
    if (options.skipContrast) console.log(chalk.yellow('⚠️  Skipping contrast checks'));
    if (options.includeExternal) console.log(chalk.yellow('⚠️  Including external links'));
    
    console.log('');

    // Check memory usage
    memoryMonitor.checkMemoryUsage();

    // Launch browser with security options
    const spinner = ora('Launching browser...').start();
    browser = await chromium.launch({ 
      headless: options.headless === 'true' || options.headless === true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });
    spinner.succeed('Browser launched');

    // Initialize crawler with security limits
    const crawler = new WebCrawler(browser, {
      maxDepth: depth,
      maxPages: maxPages,
      includeExternal: options.includeExternal
    });

    // Crawl website with rate limiting
    spinner.start('Crawling website...');
    const urls = await crawler.crawl(url);
    const crawlStats = crawler.getStatistics();
    spinner.succeed(`Crawled ${urls.length} pages`);

    if (options.verbose) {
      console.log(chalk.gray('Crawl Statistics:'));
      console.log(`  - Successful pages: ${crawlStats.successfulPages}`);
      console.log(`  - Error pages: ${crawlStats.errorPages}`);
      console.log(`  - Total links found: ${crawlStats.totalLinksFound}`);
      console.log('');
    }

    if (urls.length === 0) {
      throw new Error('No pages found to audit');
    }

    // Audit each page with rate limiting and memory monitoring
    const auditResults = {
      domain: new URL(url).hostname,
      pagesAudited: 0,
      pages: [],
      auditDuration: 0,
      options: {
        wcagLevel,
        skipImages: options.skipImages,
        skipContrast: options.skipContrast,
        includeExternal: options.includeExternal
      }
    };

    spinner.start('Auditing pages...');
    
    for (let i = 0; i < urls.length; i++) {
      const pageUrl = urls[i];
      spinner.text = `Auditing page ${i + 1}/${urls.length}: ${pageUrl}`;
      
      // Rate limiting
      await rateLimiter.waitIfNeeded();
      
      // Memory monitoring
      const memoryUsage = memoryMonitor.checkMemoryUsage();
      
      try {
        const page = await browser.newPage();
        
        // Set security headers
        await page.setExtraHTTPHeaders({
          'User-Agent': 'AccessibilityAuditTool/1.0.0'
        });
        
        await page.goto(pageUrl, { 
          waitUntil: 'networkidle', 
          timeout: timeout 
        });
        
        const auditor = new AccessibilityAuditor(page, auditResults.options);
        const results = await auditor.audit();
        
        auditResults.pages.push({
          url: pageUrl,
          title: await page.title(),
          results: results
        });
        
        auditResults.pagesAudited++;
        
        await page.close();
        
        if (options.verbose) {
          const summary = results.summary;
          console.log(`  ✓ ${pageUrl} - ${summary.totalIssues} issues found (Memory: ${memoryUsage.heapUsed.toFixed(1)}MB)`);
        }
      } catch (error) {
        console.warn(chalk.yellow(`Warning: Failed to audit ${pageUrl}: ${error.message}`));
        auditResults.pages.push({
          url: pageUrl,
          title: 'Error',
          results: {
            error: error.message,
            summary: { totalIssues: 0, criticalIssues: 0, warnings: 0, passes: 0 }
          }
        });
      }
    }

    auditResults.auditDuration = Date.now() - startTime;
    spinner.succeed(`Audited ${auditResults.pagesAudited} pages`);

    // Generate reports based on format option
    spinner.start('Generating reports...');
    const reportGenerator = new ReportGenerator(options.output);
    let reports = {};
    
    if (options.format === 'all' || options.format === 'summary') {
      reports.summary = await reportGenerator.generateSummaryReport(auditResults, `${auditResults.domain}_summary.md`);
    }
    
    if (options.format === 'all' || options.format === 'detailed') {
      reports.detailed = await reportGenerator.generateDetailedReport(auditResults, `${auditResults.domain}_detailed.csv`);
    }
    
    if (options.format === 'all' || options.format === 'json') {
      reports.statistics = await reportGenerator.generateStatisticsReport(auditResults, `${auditResults.domain}_statistics.json`);
    }
    
    spinner.succeed('Reports generated');

    // Display summary
    displaySummary(auditResults, reports);

    console.log(chalk.green.bold('\n✅ Audit completed successfully!'));
    console.log(chalk.gray(`Total time: ${Math.round(auditResults.auditDuration / 1000)}s`));
    console.log(chalk.gray(`Final memory usage: ${memoryMonitor.checkMemoryUsage().heapUsed.toFixed(1)}MB`));
    
    if (options.verbose) {
      console.log(chalk.gray('\nGenerated files:'));
      Object.entries(reports).forEach(([type, path]) => {
        console.log(`  ${type}: ${path}`);
      });
    }

  } catch (error) {
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

function displaySummary(auditResults, reports) {
  console.log(chalk.blue.bold('\n📊 Audit Summary'));
  console.log(chalk.gray('================'));

  let totalIssues = 0;
  let criticalIssues = 0;
  let highPriorityIssues = 0;
  let mediumPriorityIssues = 0;
  let lowPriorityIssues = 0;

  auditResults.pages.forEach(page => {
    if (page.results.summary) {
      totalIssues += page.results.summary.totalIssues;
      criticalIssues += page.results.summary.criticalIssues;
      highPriorityIssues += page.results.summary.warnings;
    }
  });

  console.log(`Pages Audited: ${chalk.cyan(auditResults.pagesAudited)}`);
  console.log(`WCAG Level: ${chalk.cyan(auditResults.options.wcagLevel)}`);
  console.log(`Total Issues: ${chalk.yellow(totalIssues)}`);
  
  if (criticalIssues > 0) {
    console.log(`Critical Issues: ${chalk.red(criticalIssues)}`);
  } else {
    console.log(`Critical Issues: ${chalk.green('0')}`);
  }
  
  if (highPriorityIssues > 0) {
    console.log(`High Priority: ${chalk.yellow(highPriorityIssues)}`);
  } else {
    console.log(`High Priority: ${chalk.green('0')}`);
  }

  const complianceLevel = criticalIssues === 0 ? `WCAG ${auditResults.options.wcagLevel} Compliant` : 'Needs Improvement';
  const complianceColor = criticalIssues === 0 ? 'green' : 'red';
  console.log(`Compliance: ${chalk[complianceColor](complianceLevel)}`);

  // Show top issues by page
  const pagesWithIssues = auditResults.pages
    .filter(page => page.results.summary && page.results.summary.totalIssues > 0)
    .sort((a, b) => b.results.summary.totalIssues - a.results.summary.totalIssues)
    .slice(0, 3);

  if (pagesWithIssues.length > 0) {
    console.log(chalk.yellow('\n⚠️  Pages with most issues:'));
    pagesWithIssues.forEach((page, index) => {
      console.log(`  ${index + 1}. ${page.url} - ${page.results.summary.totalIssues} issues`);
    });
  }

  console.log(chalk.gray('\nFor detailed results, see the generated reports.'));
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error(chalk.red('Uncaught Exception:'), error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('Unhandled Rejection at:'), promise, 'reason:', reason);
  process.exit(1);
});

// Parse command line arguments
program.parse();
