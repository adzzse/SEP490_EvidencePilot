import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
test.use({ channel: 'chrome', viewport: { width: 1600, height: 1000 } });
test.setTimeout(60000);
test.skip(process.env.SOURCE_MAP_LIVE !== 'true', 'Opt-in local existing-data verification');

test('project 1 actual API and Student workspace', async ({ page, request }) => {
  const env = Object.fromEntries(readFileSync('../BE/.env', 'utf8').split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line)).map(line => {
    const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1).replace(/^"|"$/g, '')];
  }));
  const response = await request.post('http://localhost:8080/api/auth/login', { data: { email: env.STUDENT_EMAIL, password: env.STUDENT_PASSWORD } });
  expect(response.status()).toBe(200);
  const login = await response.json();
  const projectId = '28e65d50-e11c-4a82-bcf2-df3c403d7a74';
  const api = await request.get(`http://localhost:8080/api/projects/${projectId}/source-map`, { headers: { Authorization: `Bearer ${login.token}` } });
  expect(api.status()).toBe(200);
  const graph = await api.json();
  const sources = graph.nodes.filter(node => node.type === 'SOURCE');
  const citations = graph.edges.filter(edge => edge.type === 'CITES');
  expect(sources).toHaveLength(5);
  expect(citations.length).toBeGreaterThan(0);
  expect(new Set(sources.map(node => node.id)).size).toBe(sources.length);
  expect(graph.edges.filter(edge => edge.type === 'PROJECT_SOURCE')).toHaveLength(sources.length);
  const ids = new Set(graph.nodes.map(node => node.id));
  expect(graph.edges.every(edge => ids.has(edge.sourceId) && ids.has(edge.targetId))).toBe(true);
  const denied = await request.get('http://localhost:8080/api/projects/872b912f-be98-4f12-a8ed-cdc95c43d471/source-map', { headers: { Authorization: `Bearer ${login.token}` } });
  expect(denied.status()).toBe(403);
  await page.addInitScript(({ token }) => { localStorage.setItem('token', token); localStorage.setItem('role', 'STUDENT'); localStorage.setItem('app_lang', 'en'); }, { token: login.token });
  const graphRequests = [];
  const loadedModules = [];
  page.on('request', request => { if (request.url().includes('/source-map')) graphRequests.push(request.url()); });
  page.on('request', request => { if (/VisualSourceMap|vis-network|vis-data/.test(request.url())) loadedModules.push(request.url()); });
  let blockedWrites = 0;
  await page.route('**/api/**', route => {
    if (['PUT', 'PATCH', 'DELETE'].includes(route.request().method())) { blockedWrites++; return route.abort(); }
    return route.continue();
  });
  await page.goto(`http://localhost:5173/student/projects/${projectId}`);
  const opener = page.locator('[data-tour=context-panel]').getByRole('button', { name: 'Source Map', exact: true });
  await expect(opener).toBeVisible({ timeout: 20000 });
  expect(graphRequests).toHaveLength(0);
  expect(loadedModules).toHaveLength(0);
  const editor = page.locator('.cm-content').first();
  await expect.poll(async () => await editor.count() && (await editor.innerText()).length > 100).toBeTruthy();
  const canEdit = (await editor.getAttribute('contenteditable')) === 'true';
  if (canEdit) {
    await editor.focus();
    await page.keyboard.press('Control+End');
    await page.keyboard.insertText('\n% VM unsaved browser-only check');
    await expect(editor).toContainText('VM unsaved browser-only check');
  }
  const preview = page.locator('.preview-content').locator('../..');
  await preview.evaluate(el => { el.scrollTop = Math.min(350, el.scrollHeight - el.clientHeight); });
  await page.waitForTimeout(150);
  const previewBefore = await preview.evaluate(el => ({ top: el.scrollTop, zoom: el.firstElementChild.style.zoom }));
  const before = await editor.innerText(); // CodeMirror renders the visible viewport only; compare at the same scroll position.
  const start = Date.now();
  await opener.click();
  await expect(page.locator('dialog canvas')).toBeVisible({ timeout: 15000 });
  const openedMs = Date.now() - start;
  await expect(page.locator('dialog')).toContainText(`${sources.length} sources · ${citations.length} citation relationships`);
  const edge = citations[0];
  const from = sources.find(node => node.id === edge.sourceId);
  const to = sources.find(node => node.id === edge.targetId);
  await page.locator('dialog').getByRole('button', { name: from.title, exact: true }).click();
  await expect(page.locator('dialog').getByRole('region', { name: 'Cites', exact: true })).toContainText(to.title);
  await page.locator('dialog').screenshot({ path: '../../artifacts/codex/project-visual-map-plan/project-1-desktop.png' });
  if (from.fileAvailable) {
    await page.getByRole('button', { name: 'Open source', exact: true }).click();
    await expect(page.locator('dialog [role=dialog] iframe')).toBeVisible({ timeout: 15000 });
    await page.locator('dialog [role=dialog]').getByRole('button', { name: 'Close', exact: true }).click();
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(opener).toBeFocused();
  if (before !== null) expect((await editor.innerText()) === before, 'Editor content unchanged').toBe(true);
  expect(await preview.evaluate(el => ({ top: el.scrollTop, zoom: el.firstElementChild.style.zoom }))).toEqual(previewBefore);
  if (canEdit) {
    await editor.focus();
    await page.keyboard.press('Control+End');
    await expect(editor).toContainText('VM unsaved browser-only check');
  }
  await page.getByRole('button', { name: 'Toggle context panel', exact: true }).click();
  const previewOpener = page.locator('#editor-preview-container').getByRole('button', { name: 'Source Map', exact: true });
  await previewOpener.click();
  await expect(page.locator('dialog canvas')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(previewOpener).toBeFocused();
  expect(blockedWrites).toBe(0);
  console.log(JSON.stringify({ runtime: 'project 1', sources: sources.length, citations: citations.length, openedMs, sourceMapRequests: graphRequests.length, outsiderStatus: denied.status(), unsavedDraftRetained: canEdit, previewStateRetained: true, bothEntryPoints: true, graphLazyLoaded: true, blockedWrites }));
});

test('existing Instructor Collection uses the shared graph and settings', async ({ page, request }) => {
  const env = Object.fromEntries(readFileSync('../BE/.env', 'utf8').split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line)).map(line => {
    const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1).replace(/^"|"$/g, '')];
  }));
  const response = await request.post('http://localhost:8080/api/auth/login', { data: { email: env.INSTRUCTOR_EMAIL, password: env.INSTRUCTOR_PASSWORD } });
  expect(response.status()).toBe(200);
  const login = await response.json();
  const headers = { Authorization: `Bearer ${login.token}` };
  const responseList = await request.get('http://localhost:8080/api/collections?size=100', { headers });
  const listing = await responseList.json();
  let collection, graph;
  for (const item of listing.content || listing) {
    const responseGraph = await request.get(`http://localhost:8080/api/collections/${item.id}/citation-graph`, { headers });
    if (!responseGraph.ok()) continue;
    const candidate = await responseGraph.json();
    if (!graph || candidate.nodes.length > graph.nodes.length) { collection = item; graph = candidate; }
  }
  expect(graph.nodes.length).toBeGreaterThan(0);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ token }) => { localStorage.setItem('token', token); localStorage.setItem('role', 'INSTRUCTOR'); localStorage.setItem('app_lang', 'en'); }, { token: login.token });
  await page.goto(`http://localhost:5173/instructor/collections/${collection.id}`);
  await page.locator('#visualize-map-tab').click();
  await expect(page.locator('#visual-map-container canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Graph settings', exact: true }).click();
  const settings = page.locator('#citation-graph-settings');
  await expect(settings).toBeVisible();
  const search = settings.locator('input[type=search]');
  await search.fill(graph.nodes.find(node => node.inCollection && node.title)?.title || 'software');
  await expect(page.locator('#visual-map-container canvas')).toBeVisible();
  await search.fill('');
  const slider = settings.locator('input[type=range]').first();
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await settings.getByRole('button', { name: 'Restore defaults', exact: true }).click();
  await page.getByRole('button', { name: 'Fit graph', exact: true }).click();
  await page.locator('#visual-map-container').screenshot({ path: '../../artifacts/codex/project-visual-map-plan/collection-runtime.png' });
  expect(errors).toEqual([]);
  console.log(JSON.stringify({ runtime: 'largest available collection', nodes: graph.nodes.length, edges: graph.edges.length, settings: 'PASS', search: 'PASS' }));
});
