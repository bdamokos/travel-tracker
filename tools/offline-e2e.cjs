/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');

const baseURL = process.env.OFFLINE_E2E_BASE_URL || 'http://localhost:3000';
const tripIdFile = process.env.OFFLINE_E2E_TRIP_ID_FILE || '/tmp/travel-offline-e2e-data/trip_id.txt';
const offlineReadyKey = 'travel-tracker-service-worker-offline-ready-detail-v1';

const ensureText = async (page, text) => {
  await page.waitForFunction(
    (expected) => typeof document.body?.innerText === 'string' && document.body.innerText.includes(expected),
    text,
    { timeout: 20000 }
  );
};

const waitForOfflineReady = async (page) => {
  await page.waitForFunction(
    async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      return registrations.length > 0 &&
        registrations.some((registration) => Boolean(registration.active)) &&
        Boolean(navigator.serviceWorker.controller);
    },
    undefined,
    { timeout: 30000 }
  );

  await page.waitForFunction(
    (key) => Boolean(sessionStorage.getItem(key)),
    offlineReadyKey,
    { timeout: 45000 }
  );
};

const waitForOnline = async (page) => {
  await page.waitForFunction(() => navigator.onLine === true, undefined, { timeout: 10000 });
};

async function main() {
  const tripId = fs.readFileSync(tripIdFile, 'utf8').trim();
  const launchOptions = {
    headless: process.env.OFFLINE_E2E_HEADLESS !== '0',
  };

  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
    launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  }

  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  page.on('console', (msg) => {
    console.log(`[browser:${msg.type()}] ${msg.text()}`);
  });

  page.on('pageerror', (error) => {
    console.log(`[pageerror] ${error.stack || error}`);
  });

  const [initialTravelSnapshot, initialCostSnapshot] = await Promise.all([
    fetch(`${baseURL}/api/travel-data?id=${tripId}`, { cache: 'no-store' }).then((response) => response.json()),
    fetch(`${baseURL}/api/cost-tracking?id=${tripId}`, { cache: 'no-store' }).then((response) => response.json()),
  ]);
  const runSuffix = Date.now().toString(36);
  const initialTravelTitle = initialTravelSnapshot.title;
  const initialCostTitle = initialCostSnapshot.tripTitle;
  const initialCostEntryId = initialCostSnapshot.id;

  console.log('Opening admin cost tab to register the service worker and warm offline caches...');
  await page.goto('/admin?tab=cost', { waitUntil: 'domcontentloaded' });
  await ensureText(page, 'Travel Tracker Admin');
  await waitForOfflineReady(page);

  const offlineReadyDetail = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key) || 'null'), offlineReadyKey);
  console.log('offlineReadyDetail', offlineReadyDetail);
  assert(offlineReadyDetail?.warmedRouteCount > 0, 'Expected offline warmup to cache route documents.');
  assert(offlineReadyDetail?.warmedDataCount > 0, 'Expected offline warmup to cache API/data documents.');

  const serviceWorkerState = await page.evaluate(async () => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    return {
      registrationCount: registrations.length,
      hasActiveWorker: registrations.some((registration) => Boolean(registration.active)),
      hasController: Boolean(navigator.serviceWorker.controller)
    };
  });
  console.log('serviceWorkerState', serviceWorkerState);
  assert(serviceWorkerState.registrationCount > 0, 'Expected at least one service worker registration.');
  assert(serviceWorkerState.hasActiveWorker, 'Expected an active service worker.');
  assert(serviceWorkerState.hasController, 'Expected navigator.serviceWorker.controller to exist.');

  console.log('Opening editor pages online before switching offline...');
  const tripPage = await context.newPage();
  await tripPage.goto(`/admin/edit/${tripId}?section=trip`, { waitUntil: 'domcontentloaded' });
  await ensureText(tripPage, 'Edit Travel Map');
  await tripPage.waitForFunction(
    (expectedTitle) => {
      const input = document.querySelector('#journey-title');
      return input instanceof HTMLInputElement && input.value === expectedTitle;
    },
    initialTravelTitle,
    { timeout: 30000 }
  );

  const costPage = await context.newPage();
  await costPage.goto(`/admin/cost-tracking/${encodeURIComponent(initialCostEntryId)}`, { waitUntil: 'domcontentloaded' });
  await ensureText(costPage, 'Edit Cost Tracker');
  await costPage.waitForFunction(
    (expectedBudget) => {
      const input = document.querySelector('#overall-budget');
      return input instanceof HTMLInputElement && Number(input.value || 0) === Number(expectedBudget);
    },
    Number(initialCostSnapshot.overallBudget || 0),
    { timeout: 30000 }
  );

  console.log('Switching the browser offline...');
  await context.setOffline(true);

  console.log('Editing the trip while offline to verify queued delta sync...');
  await tripPage.bringToFront();
  const currentTripPageTitle = await tripPage.inputValue('#journey-title');
  const nextTravelTitle = `${currentTripPageTitle} [${runSuffix}]`;
  await tripPage.fill('#journey-title', nextTravelTitle);
  await tripPage.waitForTimeout(12000);

  const offlineQueueAfterTripEdit = await tripPage.evaluate(() => {
    const raw = localStorage.getItem('travel-tracker-offline-delta-queue-v1');
    return raw ? JSON.parse(raw) : [];
  });
  console.log(
    'offlineQueueAfterTripEdit',
    offlineQueueAfterTripEdit.map((entry) => ({ kind: entry.kind, id: entry.id, status: entry.status }))
  );
  assert(
    offlineQueueAfterTripEdit.some((entry) => entry.kind === 'travel' && entry.id && entry.status === 'pending'),
    'Expected a pending travel offline delta queue entry.'
  );

  console.log('Editing the cost tracker while offline to verify queued delta sync...');
  await costPage.bringToFront();
  const currentOverallBudget = Number(await costPage.inputValue('#overall-budget'));
  const nextOverallBudget = currentOverallBudget + 17;
  await costPage.fill('#overall-budget', String(nextOverallBudget));
  await costPage.waitForTimeout(12000);

  const offlineQueueAfterCostEdit = await costPage.evaluate(() => {
    const raw = localStorage.getItem('travel-tracker-offline-delta-queue-v1');
    return raw ? JSON.parse(raw) : [];
  });
  console.log(
    'offlineQueueAfterCostEdit',
    offlineQueueAfterCostEdit.map((entry) => ({ kind: entry.kind, id: entry.id, status: entry.status }))
  );
  assert(
    offlineQueueAfterCostEdit.some(
      (entry) =>
        entry.kind === 'cost' &&
        (entry.id === initialCostEntryId || entry.id === tripId || entry.id === `cost-${tripId}`) &&
        entry.status === 'pending'
    ),
    'Expected a pending cost offline delta queue entry.'
  );

  console.log('Verifying cached navigation routes while offline...');
  const offlineRoutes = [
    ['/admin', 'Travel Tracker Admin'],
    ['/admin?tab=cost', 'Travel Tracker Admin'],
    ['/maps', 'Travel Maps'],
    [`/map/${tripId}`, initialTravelTitle],
    [`/admin/edit/${tripId}?section=trip`, 'Edit Travel Map'],
  ];

  for (const [path, expectedText] of offlineRoutes) {
    const routePage = await context.newPage();
    await routePage.goto(path, { waitUntil: 'domcontentloaded' });
    await ensureText(routePage, expectedText);
    console.log(`Offline route ok: ${path}`);
    await routePage.close();
  }

  console.log('Verifying cached API reads while offline...');
  const offlineApiResult = await page.evaluate(async (id) => {
    const travelList = await fetch('/api/travel-data/list').then(async (response) => ({
      ok: response.ok,
      status: response.status,
      length: (await response.json()).length,
    }));
    const travel = await fetch(`/api/travel-data?id=${id}`).then(async (response) => ({
      ok: response.ok,
      status: response.status,
      title: (await response.json()).title,
    }));
    const cost = await fetch(`/api/cost-tracking?id=${id}`).then(async (response) => ({
      ok: response.ok,
      status: response.status,
      tripTitle: (await response.json()).tripTitle,
    }));

    return { travelList, travel, cost };
  }, tripId);
  console.log('offlineApiResult', offlineApiResult);
  assert.equal(offlineApiResult.travelList.ok, true);
  assert.equal(offlineApiResult.travel.ok, true);
  assert.equal(offlineApiResult.cost.ok, true);
  assert.equal(offlineApiResult.travel.title, initialTravelTitle);
  assert.equal(offlineApiResult.cost.tripTitle, initialCostTitle);

  console.log('Restoring connectivity and waiting for queued deltas to sync...');
  await costPage.bringToFront();
  await context.setOffline(false);
  await waitForOnline(page);
  await waitForOnline(tripPage);
  await waitForOnline(costPage);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await tripPage.evaluate(() => window.dispatchEvent(new Event('online')));
  await costPage.evaluate(() => window.dispatchEvent(new Event('online')));
  try {
    await costPage.waitForFunction(
      () => JSON.parse(localStorage.getItem('travel-tracker-offline-delta-queue-v1') || '[]').length === 0,
      { timeout: 30000 }
    );
  } catch (error) {
    const queueState = await costPage.evaluate(() => JSON.parse(localStorage.getItem('travel-tracker-offline-delta-queue-v1') || '[]'));
    console.log('queueStateAfterReconnectTimeout', queueState);
    throw error;
  }

  const syncedData = await page.evaluate(async (id) => {
    const travel = await fetch(`/api/travel-data?id=${id}`, { cache: 'no-store' }).then((response) => response.json());
    const cost = await fetch(`/api/cost-tracking?id=${id}`, { cache: 'no-store' }).then((response) => response.json());
    const queue = JSON.parse(localStorage.getItem('travel-tracker-offline-delta-queue-v1') || '[]');

    return {
      travelTitle: travel.title,
      overallBudget: cost.overallBudget,
      queueLength: queue.length,
    };
  }, tripId);
  console.log('syncedData', syncedData);
  assert.equal(syncedData.travelTitle, nextTravelTitle);
  assert.equal(Number(syncedData.overallBudget), nextOverallBudget);
  assert.equal(syncedData.queueLength, 0);

  await costPage.close();
  await tripPage.close();
  await browser.close();
  console.log('Offline end-to-end verification completed successfully.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
