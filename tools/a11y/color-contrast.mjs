import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const DEFAULT_URLS = [
  'https://travel-tracker.bdamokos.org/map/mbm7zdx363tdzu65575',
  'https://travel-tracker.bdamokos.org/calendars/mbm7zdx363tdzu65575'
];

const urls = process.argv.slice(2);
const targetUrls = urls.length > 0 ? urls : DEFAULT_URLS;

const waitForMeaningfulContent = async (page, url) => {
  if (url.includes('/calendars/')) {
    await page.waitForSelector('div[class*="calendarGrid"]', { timeout: 60_000 });
    return;
  }

  if (url.includes('/map/')) {
    await page.waitForSelector('text=Locations Visited', { timeout: 60_000 });
    return;
  }
};

const formatViolations = (violations) =>
  violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.map((node) => ({
      target: node.target,
      html: node.html
    }))
  }));

const run = async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const allViolations = [];

    for (const url of targetUrls) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await waitForMeaningfulContent(page, url);
      await page.waitForTimeout(2_000);

      const results = await new AxeBuilder({ page })
        .withRules(['color-contrast'])
        .analyze();

      allViolations.push({
        url,
        violations: formatViolations(results.violations)
      });
    }

    const total = allViolations.reduce((sum, entry) => sum + entry.violations.length, 0);
    console.log(JSON.stringify({ total, results: allViolations }, null, 2));

    process.exitCode = total === 0 ? 0 : 2;
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

