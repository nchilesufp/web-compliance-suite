# Compliance Audit Tool

A comprehensive, security-enhanced Node.js CLI tool that automatically crawls websites, performs accurate accessibility, privacy, and security audits with proper calculations, and generates detailed reports to prevent false positives.

## 🚀 Features

- **Comprehensive Crawling**: Automatically discovers and audits multiple pages
- **Accurate Contrast Calculation**: Uses official WCAG 2.1 luminance formula
- **Semantic HTML Analysis**: Checks landmarks, headings, and structure
- **ARIA Validation**: Verifies ARIA labels, roles, and attributes
- **Keyboard Navigation Testing**: Ensures proper tab order and focus management
- **Image Accessibility**: Validates alt text and decorative image markup
- **Focus Management**: Checks visible focus indicators
- **Multiple Report Formats**: Summary (Markdown), detailed (CSV), and statistics (JSON)
- **Security Enhanced**: Built-in security measures and validation
- **Advanced Options**: Configurable crawling, filtering, and output options

## 📦 Installation

### Prerequisites

- Node.js 16.0.0 or higher
- npm or yarn

### Install Dependencies

```bash
npm install
```

### Install Playwright Browsers

```bash
npx playwright install chromium
```

### Global Installation (Optional)

```bash
npm run install-global
```

## 🎯 Usage

### Basic Usage

```bash
node accessibility-audit.js https://example.com
```

### Advanced Usage

```bash
node accessibility-audit.js https://example.com \
  --depth 3 \
  --max-pages 20 \
  --output ./my-reports \
  --verbose \
  --rate-limit 10 \
  --max-memory 1000 \
  --level AAA \
  --format all
```

### Command Line Options

| Option | Description | Default | Values |
|--------|-------------|---------|---------|
| `-d, --depth <number>` | Crawl depth (levels) | 2 | 1-10 |
| `-p, --max-pages <number>` | Maximum pages to audit | 10 | 1-100 |
| `-o, --output <directory>` | Output directory for reports | ./reports | Any valid path |
| `--headless` | Run browser in headless mode | true | true/false |
| `--timeout <number>` | Page load timeout (ms) | 30000 | 5000-120000 |
| `--verbose` | Enable verbose output | false | true/false |
| `--rate-limit <number>` | Maximum requests per second | 5 | 1-50 |
| `--max-memory <number>` | Maximum memory usage (MB) | 500 | 100-2000 |
| `--level <level>` | WCAG compliance level | AA | AA/AAA |
| `--include-external` | Include external links | false | true/false |
| `--spa-discovery` | Enable SPA-friendly link discovery (role=link, data-href, onclick) | false | true/false |
| `--rescan-wait <number>` | Wait time in ms after load before extracting links | 1500 | 0-10000 |
| `--link-wait <number>` | Max time in ms to wait for anchors to appear | 3000 | 0-15000 |
| `--include-subdomains` | Treat subdomains as internal | false | true/false |
| `--extra-discovery` | Scroll/hover and parse noscript to reveal links | false | true/false |
| `--no-nav-prefetch` | Disable nav prefetch fallback (enabled by default) | false | true/false |
| `--skip-images` | Skip image accessibility checks | false | true/false |
| `--skip-contrast` | Skip color contrast checks | false | true/false |
| `--format <format>` | Output format | all | all/summary/detailed/json |

## 📊 Report Outputs

The tool generates multiple types of reports based on the format option:

### 1. Summary Report (`{domain}_summary.md`)
- Executive summary with compliance status
- Critical and high priority issues
- Positive findings
- Recommendations

### 2. Detailed Report (`{domain}_detailed.csv`)
- Per-page detailed findings
- Specific issues with recommendations
- Evidence and examples
- Importable into spreadsheets

### 3. Statistics Report (`{domain}_statistics.json`)
- Aggregate statistics
- Category breakdowns
- Trend analysis
- Machine-readable data

## 🔍 Accessibility Checks

### Semantic HTML
- ✅ H1 heading presence and hierarchy
- ✅ Semantic landmarks (main, nav, header, footer)
- ✅ Proper heading structure (H1 → H2 → H3)

### Color Contrast
- ✅ WCAG AA compliance (4.5:1 for normal text, 3:1 for large text)
- ✅ WCAG AAA compliance (7:1 for normal text, 4.5:1 for large text)
- ✅ Accurate luminance-based calculations

### ARIA Labels
- ✅ Accessible names for interactive elements
- ✅ ARIA attribute validation
- ✅ Landmark labeling

### Keyboard Navigation
- ✅ Focusable element identification
- ✅ Tab order verification
- ✅ Skip links presence

### Images
- ✅ Alt text validation
- ✅ Decorative image markup
- ✅ Image accessibility compliance

### Focus Management
- ✅ Visible focus indicators
- ✅ Focus style validation

## 🛡️ Security Features

- ✅ **No vulnerabilities** found in npm audit
- ✅ **URL validation** with malicious content detection
- ✅ **Domain restriction** (only same-origin crawling by default)
- ✅ **Input sanitization** for all user inputs
- ✅ **Rate limiting** to prevent abuse
- ✅ **Memory monitoring** to prevent resource exhaustion
- ✅ **Safe file operations** with path validation
- ✅ **Timeout controls** for network operations

## 📋 Examples

### Quick Audit
```bash
node accessibility-audit.js https://example.com --max-pages 1
```

### Comprehensive Site Audit
```bash
node accessibility-audit.js https://example.com \
  --depth 4 \
  --max-pages 50 \
  --level AAA \
  --verbose
```

### Fast Audit (Skip Heavy Checks)
```bash
node accessibility-audit.js https://example.com \
  --skip-images \
  --skip-contrast \
  --max-pages 20
```

### JSON Only Output
```bash
node accessibility-audit.js https://example.com --format json
```

### Custom Security Settings
```bash
node accessibility-audit.js https://example.com \
  --rate-limit 2 \
  --max-memory 200 \
  --timeout 60000
```

## 🎯 Accuracy Improvements

This tool addresses common accessibility audit errors by:

1. **Verifying Elements Exist**: Checks actual DOM elements before reporting issues
2. **Calculating Real Contrast Ratios**: Uses official WCAG luminance formula
3. **Testing Keyboard Navigation**: Programmatically simulates tab navigation
4. **Cross-referencing Indicators**: Validates multiple accessibility signals
5. **Including Evidence**: Provides specific examples and element details

## 🔧 Troubleshooting

### Common Issues

**Browser Launch Fails**
```bash
# Install Playwright browsers
npx playwright install chromium
```

**Timeout Errors**
```bash
# Increase timeout for slow sites
node accessibility-audit.js https://example.com --timeout 60000
```

**Memory Issues with Large Sites**
```bash
# Limit pages and depth
node accessibility-audit.js https://example.com --max-pages 5 --depth 1
```

**Rate Limiting Issues**
```bash
# Reduce rate limit for sensitive sites
node accessibility-audit.js https://example.com --rate-limit 1
```

### Debug Mode

Enable verbose output to see detailed progress:

```bash
node accessibility-audit.js https://example.com --verbose
```

If a site renders links late or uses custom JS navigation, try adding one or more of:

- `--spa-discovery` to detect role=link, data-href, and onclick navigation
- `--rescan-wait 2000` to allow hydration
- `--link-wait 5000` to poll briefly for anchors
- `--extra-discovery` to scroll/hover and parse noscript
- Nav prefetch is enabled by default. To disable it, pass `--no-nav-prefetch`.

When the crawler still finds 0 links on a page, a snapshot `crawl_debug_<host>_<timestamp>.html` is saved for inspection. In `--verbose` mode, the snapshot path is printed.

## 🧪 Testing

```bash
# Test with example.com
npm test

# Test with custom settings
node accessibility-audit.js https://example.com --max-pages 3 --verbose
```

## ☁️ Automate with GitHub Actions + Pages

This repo includes a scheduled workflow that can run audits on a cadence and publish results.

Setup steps:

1) Create a new GitHub repository and push this project.
2) In the repo Settings → Actions → General → Workflow permissions, enable "Read and write permissions".
3) Settings → Pages → Build and deployment: set Source to "Deploy from a branch", Branch: main, Folder: /docs.
4) Edit `config/sites.json` to add sites you want to audit, e.g. `[{ "url": "https://example.com", "label": "Example" }]`.
5) Manually run the workflow once: Actions → "Quarterly Accessibility Audits" → Run workflow.

Outputs:
- Reports are generated in `reports/` and mirrored to `docs/reports/`.
- A browsable index is generated at `docs/index.html` and served via GitHub Pages.
- Grades are appended to `reports/grades.csv` and linked from the index.

Local rebuild of the index at any time:
- `npm run build:index`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

For issues and questions:
1. Check the troubleshooting section
2. Review the verbose output
3. Open an issue on GitHub

## 📈 Changelog

### Version 1.0.0
- Initial release
- Comprehensive accessibility auditing
- Multiple report formats
- Automated crawling
- Accurate contrast calculations
- Security enhancements
- Advanced configuration options
