/* Run with Playwright installed and the preview server running. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', dialog => dialog.accept());
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('fitnessTracker_v4')));
  const nav = id => page.locator(`nav [data-section="${id}"]`).click();
  const fill = async (form, fields) => { for (const [name, value] of Object.entries(fields)) await page.locator(`#${form} [name="${name}"]`).fill(String(value)); };
  await page.goto('http://127.0.0.1:4173');
  assert.equal(await page.locator('.brand-mark').evaluate(img => img.complete && img.naturalWidth > 0), true, 'Brand logo must load');
  assert.equal(await page.title(), 'Gym and Nutrition Tracker — Your daily progress');
  assert.equal(await page.locator('#dashboardSection').isVisible(), true);
  await page.screenshot({ path: path.join(__dirname, '../desktop-preview.png'), fullPage: true });
  await nav('workoutSection');
  await page.selectOption('#exerciseSelectWorkout', 'Bench press');
  await fill('workoutForm', { weight: 0, reps: 12 });
  await page.click('#saveSetBtn');
  assert.equal((await saved()).workouts[0].weight, 0);
  assert.equal((await saved()).workouts[0].rpe, null);
  assert.equal(await page.inputValue('#exerciseSelectWorkout'), 'Bench press');
  assert.equal(await page.inputValue('[name="setNumber"]'), '2');
  await fill('workoutForm', { weight: 100 }); await page.click('#saveSetBtn');
  await page.locator('#workoutLog [data-action="edit"]').first().click();
  await fill('workoutForm', { weight: 95 }); await page.click('#saveSetBtn');
  assert.equal((await saved()).workouts.length, 2);
  assert.equal((await saved()).workouts[0].weight, 95);
  await nav('mealSection');
  await fill('mealForm', { food: '<img src=x onerror=alert(1)>', calories: 600, protein: 40, carbs: 65, fat: 20 });
  await page.click('#saveMealAndPresetBtn');
  assert.equal((await saved()).meals.length, 1);
  assert.equal(await page.locator('#mealLogList img').count(), 0);
  assert.equal((await saved()).mealPresets.length, 1);
  await page.locator('#mealLogList [data-action="edit"]').click();
  await fill('mealForm', { calories: 650 }); await page.click('#saveMealAndPresetBtn');
  assert.equal((await saved()).meals.length, 1);
  assert.equal((await saved()).meals[0].calories, 650);
  await page.selectOption('#mealPresetSelect', '0');
  assert.equal(await page.inputValue('#mealForm [name="calories"]'), '650');
  await nav('metricsSection');
  await fill('metricsForm', { bodyweight: 180 }); await page.locator('#metricsForm button').click();
  assert.equal((await saved()).metrics[0].sleepHours, null);
  await fill('metricsForm', { sleepHours: 8 }); await page.locator('#metricsForm button').click();
  assert.equal((await saved()).metrics.length, 1);
  assert.equal((await saved()).metrics[0].bodyweight, 180);
  await nav('dashboardSection');
  await page.selectOption('#exerciseSelectDashboard', 'Bench press');
  await page.selectOption('#summaryDays', '14');
  assert.equal(await page.inputValue('#exerciseSelectDashboard'), 'Bench press');
  assert.equal(await page.evaluate(() => computeSummary(14).avgCalories), 650);
  assert.equal(await page.evaluate(() => {
    const old = JSON.stringify(state);
    const date = new Date(); date.setDate(date.getDate() - 1);
    state.metrics.push({ date: TrackerData.localDate(date), bodyweight: 179 });
    const calories = computeSummary(14).avgCalories;
    state = JSON.parse(old);
    return calories;
  }), 650, 'A metrics-only day must not reduce nutrition averages');
  await page.reload();
  assert.equal((await saved()).workouts.length, 2);
  await nav('exerciseManagerSection');
  await page.locator('#exerciseList button.delete[data-name="Bench press"]').click();
  assert.equal((await saved()).workouts.length, 2);
  assert.equal((await saved()).exercises.includes('Bench press'), false);
  await nav('settingsSection');
  await fill('goalsForm', { calories: 2200, protein: 140 }); await page.locator('#goalsForm button').click();
  assert.equal((await saved()).goals.protein, 140);
  const downloadPromise = page.waitForEvent('download'); await page.click('#exportData');
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /^gym-and-nutrition-tracker-/);
  const before = await saved();
  await page.setInputFiles('#importFile', { name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"workouts":"bad"}') });
  await page.waitForFunction(() => document.getElementById('toast').textContent.startsWith('Import failed'));
  assert.deepEqual(await saved(), before);
  await page.setInputFiles('#importFile', { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(before)) });
  await page.waitForFunction(() => document.getElementById('toast').textContent === 'Backup imported.');
  assert.deepEqual(await saved(), before);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const id of ['dashboardSection', 'workoutSection', 'mealSection', 'metricsSection', 'exerciseManagerSection', 'settingsSection']) {
      await nav(id);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${id} overflows at ${width}px`);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 }); await nav('dashboardSection');
  await page.screenshot({ path: path.join(__dirname, '../mobile-preview.png'), fullPage: true });
  // Simulate a chart CDN failure in a fresh session: core tracking must still work.
  const offline = await browser.newPage();
  await offline.route('**/chart.umd.min.js', route => route.abort());
  await offline.goto('http://127.0.0.1:4173');
  assert.equal(await offline.locator('#todayStats .stat-card').count(), 4);
  assert.match(await offline.locator('#exerciseChartHint').textContent(), /unavailable/);
  // A failed write rolls back the in-memory entry, so retrying cannot duplicate it.
  assert.equal(await page.evaluate(() => {
    const before = state.workouts.length;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw Error('quota'); };
    state.workouts.push({ date: todayISO(), exercise: 'Squat', weight: 100, reps: 5, setNumber: 1, rpe: null });
    try { saveState(); } catch {}
    Storage.prototype.setItem = original;
    return state.workouts.length === before && !document.getElementById('storageWarning').hidden;
  }), true);
  const corrupted = await browser.newPage();
  await corrupted.addInitScript(() => localStorage.setItem('fitnessTracker_v4', '{broken'));
  await corrupted.goto('http://127.0.0.1:4173');
  assert.equal(await corrupted.locator('#storageWarning').isVisible(), true);
  assert.equal(await corrupted.evaluate(() => localStorage.getItem('fitnessTracker_v4')), '{broken');
  assert.deepEqual(errors, []);
  await browser.close(); console.log('Browser checks passed: logging, edits, presets, persistence, archive safety, goals, backups, responsive layouts, CDN failure.');
})().catch(err => { console.error(err); process.exit(1); });
