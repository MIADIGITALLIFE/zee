const { test, expect } = require('@playwright/test');
const path = require('node:path');

const pageUrl = 'file://' + path.resolve(__dirname, '../model.html');

test.beforeEach(async ({ page }) => {
  await page.goto(pageUrl);
});

test('generates a traceable ontology draft from valid input', async ({ page }) => {
  await page.locator('#onto-id').fill('claim_bridge_closed');
  await page.locator('#onto-label').fill('桥梁关闭状态');
  await page.locator('#onto-description').fill('来自现场观察的记录草案');
  await page.locator('#onto-source').fill('field_note_001');
  await page.locator('#onto-epistemic').selectOption('observed');
  await page.locator('#onto-generate').click();

  const output = page.locator('#onto-output');
  await expect(output).toContainText('"id": "claim_bridge_closed"');
  await expect(output).toContainText('"epistemic_status": "observed"');
  await expect(output).toContainText('"verification_status": "not-validated"');
  await expect(output).toContainText('"retention_policy": "not-persisted"');
  await expect(page.locator('#onto-status')).toContainText('已生成本地 JSON 草案');
});

test('blocks invalid stable IDs and missing relation endpoints', async ({ page }) => {
  await page.locator('#onto-id').fill('bad id');
  await page.locator('#onto-label').fill('测试记录');
  await page.locator('#onto-generate').click();
  await expect(page.locator('#onto-status')).toContainText(/ID|标识/);
  await expect(page.locator('#onto-output')).not.toContainText('"schema_version"');

  await page.locator('#onto-id').fill('relation_test');
  await page.locator('#onto-relation').selectOption('related_to');
  await page.locator('#onto-generate').click();
  await expect(page.locator('#onto-status')).toContainText('关系起点和终点');
});

test('requires source reference for verified status', async ({ page }) => {
  await page.locator('#onto-id').fill('claim_verified_test');
  await page.locator('#onto-label').fill('待验证主张');
  await page.locator('#onto-epistemic').selectOption('verified');
  await page.locator('#onto-generate').click();
  await expect(page.locator('#onto-status')).toContainText('提供可追溯的来源引用');
});

test('offline cognition loop creates revisions and rolls back', async ({ page }) => {
  await page.locator('#loop-hypothesis').fill('分步提示会改善完成率');
  await page.locator('#loop-observation').fill('本轮观察到任务完成');
  await page.locator('#loop-evaluate').click();
  await expect(page.locator('#loop-output')).toContainText('"revision": 1');

  await page.locator('#loop-observation').fill('第二轮观察结果');
  await page.locator('#loop-evaluate').click();
  await expect(page.locator('#loop-output')).toContainText('"revision": 2');

  await page.locator('#loop-rollback').click();
  await expect(page.locator('#loop-output')).toContainText('"revision": 1');
  await expect(page.locator('#loop-status')).toContainText('已回滚到第 1 版');
});

test('prevents empty cognition feedback and remains usable on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.locator('#loop-evaluate').click();
  await expect(page.locator('#loop-status')).toContainText('请同时填写假设和实际观察');

  await expect(page.locator('#onto-generate')).toBeVisible();
  await expect(page.locator('#loop-evaluate')).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth
  }));
  expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport + 1);
});
