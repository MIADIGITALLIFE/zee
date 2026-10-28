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

test('serializes relation endpoints and relation type into the draft', async ({ page }) => {
  await page.locator('#onto-id').fill('relation_bridge_road');
  await page.locator('#onto-label').fill('桥梁与道路的关联');
  await page.locator('#onto-relation').selectOption('related_to');
  await page.locator('#onto-source-entity').fill('bridge_001');
  await page.locator('#onto-target-entity').fill('road_002');
  await page.locator('#onto-generate').click();

  const record = JSON.parse(await page.locator('#onto-output').textContent());
  expect(record.relations).toHaveLength(1);
  expect(record.relations[0].relation_type).toBe('related_to');
  expect(record.relations[0].source_entity).toBe('bridge_001');
  expect(record.relations[0].target_entity).toBe('road_002');
});

test('marks a generated preview stale after any form edit', async ({ page }) => {
  await page.locator('#onto-id').fill('claim_preview_test');
  await page.locator('#onto-label').fill('初始名称');
  await page.locator('#onto-generate').click();
  await expect(page.locator('#onto-output')).toContainText('初始名称');

  await page.locator('#onto-label').fill('修改后的名称');
  await expect(page.locator('#onto-output')).toContainText('请重新生成 JSON 草案');
  await expect(page.locator('#onto-status')).toContainText('草案已失效');
});

test('rejects a self-referential relation by default', async ({ page }) => {
  await page.locator('#onto-id').fill('relation_self_test');
  await page.locator('#onto-label').fill('自指关系测试');
  await page.locator('#onto-relation').selectOption('related_to');
  await page.locator('#onto-source-entity').fill('entity_same');
  await page.locator('#onto-target-entity').fill('entity_same');
  await page.locator('#onto-generate').click();
  await expect(page.locator('#onto-status')).toContainText('不能是同一个 ID');
});

test('rejects a validity end date earlier than its start date', async ({ page }) => {
  await page.locator('#onto-id').fill('validity_range_test');
  await page.locator('#onto-label').fill('有效期校验');
  await page.locator('#onto-valid-from').fill('2026-10-20T10:00');
  await page.locator('#onto-valid-to').fill('2026-10-19T10:00');
  await page.locator('#onto-generate').click();
  await expect(page.locator('#onto-status')).toContainText('有效期结束时间不能早于开始时间');
});

test('reset clears ontology draft and cognition experiment', async ({ page }) => {
  await page.locator('#onto-id').fill('reset_test_record');
  await page.locator('#onto-label').fill('待清除记录');
  await page.locator('#onto-generate').click();
  await page.locator('#onto-reset').click();
  await expect(page.locator('#onto-output')).toContainText('表单已清空');
  await expect(page.locator('#onto-id')).toHaveValue('');

  await page.locator('#loop-hypothesis').fill('重置测试假设');
  await page.locator('#loop-observation').fill('重置测试观察');
  await page.locator('#loop-evaluate').click();
  await page.locator('#loop-reset').click();
  await expect(page.locator('#loop-output')).toContainText('实验结果将在这里显示');
  await expect(page.locator('#loop-hypothesis')).toHaveValue('');
  await expect(page.locator('#loop-status')).toContainText('实验已清空');
});

test('downloads the generated JSON draft with a stable filename', async ({ page }) => {
  const fs = require('node:fs/promises');
  await page.locator('#onto-id').fill('download_draft_test');
  await page.locator('#onto-label').fill('JSON 导出测试');
  await page.locator('#onto-generate').click();

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#onto-download').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('download_draft_test.json');

  const filePath = await download.path();
  const saved = JSON.parse(await fs.readFile(filePath, 'utf8'));
  expect(saved.id).toBe('download_draft_test');
  expect(saved.verification_status).toBe('not-validated');
  expect(saved.retention_policy).toBe('not-persisted');
});

test('generated ontology draft conforms to the canonical JSON Schema', async ({ page }) => {
  const fs = require('node:fs/promises');
  const Ajv2020 = require('ajv/dist/2020');
  const addFormats = require('ajv-formats');
  await page.locator('#onto-id').fill('schema_contract_test');
  await page.locator('#onto-label').fill('契约验证记录');
  await page.locator('#onto-source').fill('test_source_01');
  await page.locator('#onto-relation').selectOption('related_to');
  await page.locator('#onto-source-entity').fill('entity_alpha');
  await page.locator('#onto-target-entity').fill('entity_beta');
  await page.locator('#onto-generate').click();

  const record = JSON.parse(await page.locator('#onto-output').textContent());
  const schema = JSON.parse(await fs.readFile(path.resolve(__dirname, '../schemas/zhi-ontology-draft-v1.schema.json'), 'utf8'));
  const ajv = new Ajv2020({ allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  expect(validate(record), JSON.stringify(validate.errors)).toBe(true);
  const invalidRecord = { ...record, epistemic_status: 'maybe-true' };
  expect(validate(invalidRecord)).toBe(false);
});

test('UI ontology options stay aligned with the canonical JSON Schema enums', async () => {
  const fs = require('node:fs/promises');
  const html = await fs.readFile(path.resolve(__dirname, '../model.html'), 'utf8');
  const schema = JSON.parse(await fs.readFile(path.resolve(__dirname, '../schemas/zhi-ontology-draft-v1.schema.json'), 'utf8'));

  const optionValues = (selectId) => {
    const select = html.match(new RegExp('<select[^>]*id="' + selectId + '"[^>]*>([\\s\\S]*?)</select>'));
    if (!select) throw new Error('Missing select control: ' + selectId);
    return select[1].split('<option value="').slice(1)
      .map((option) => option.split('"')[0])
      .filter(Boolean)
      .sort();
  };

  expect(optionValues('onto-type')).toEqual([...schema.properties.ontology_type.enum].sort());
  expect(optionValues('onto-epistemic')).toEqual([...schema.properties.epistemic_status.enum].sort());
  expect(optionValues('onto-relation')).toEqual([...schema.properties.relations.items.properties.relation_type.enum].sort());
});
