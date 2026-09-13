import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

test.use({ channel: 'chrome', viewport: { width: 1600, height: 1000 }, actionTimeout: 10_000 });
test.skip(process.env.PAPER_REFERENCES_LIVE !== 'true', 'Opt-in local preserved-data regression');
test.setTimeout(120_000);

function fixturePdf() {
  const stream = 'BT /F1 12 Tf 50 750 Td (Reference attachment regression fixture.) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const start = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(pdf);
}

test('real backend persists References, enforces permissions, saves citations and revokes Source scope', async ({ page, request, browser }) => {
  const apiUrl = process.env.PAPER_REFERENCES_API_URL || 'http://localhost:8081';
  const webUrl = process.env.PAPER_REFERENCES_WEB_URL || 'http://localhost:5173';
  for (const url of [apiUrl, webUrl]) expect(['localhost', '127.0.0.1']).toContain(new URL(url).hostname);
  const runId = `REFERENCES-LIVE-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const output = resolve('../../artifacts/codex/mentor-reference-citation-plan-2026-09-13', runId);
  mkdirSync(output, { recursive: true });
  const evidence = { runId, preserveData: true, status: 'PARTIAL', completed: [], externalExtraction: 'NOT_VERIFIED', providerRetrieval: 'NOT_VERIFIED' };
  const env = Object.fromEntries(readFileSync('../BE/.env', 'utf8').split(/\r?\n/).filter(line => /^[A-Z_]+=/.test(line)).map(line => {
    const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1).replace(/^"|"$/g, '')];
  }));
  const login = async (email, password) => {
    const response = await request.post(`${apiUrl}/api/auth/login`, { data: { email, password } });
    expect(response.status(), 'Designated local test login').toBe(200);
    return response.json();
  };
  const leader = await login(env.STUDENT_EMAIL, env.STUDENT_PASSWORD);
  const instructor = await login(env.INSTRUCTOR_EMAIL, env.INSTRUCTOR_PASSWORD);
  const ids = Object.fromEntries(['project', 'paper', 'section', 'bibliography', 'ready', 'missing', 'unselected', 'shared', 'collection', 'member'].map(name => [name, randomUUID()]));
  evidence.fixtures = ids;
  const sqlString = value => `'${String(value).replace(/'/g, "''")}'`;
  const bin = value => `UUID_TO_BIN(${sqlString(value)})`;
  const sql = statements => {
    const result = spawnSync('docker', ['exec', '-i', 'evidence_pilot_db', 'sh', '-c', 'MYSQL_PWD="$MYSQL_PASSWORD" mysql -u"$MYSQL_USER" "$MYSQL_DATABASE"'], { input: statements, encoding: 'utf8' });
    expect(result.status, `RUN_ID fixture SQL failed: ${result.stderr}`).toBe(0);
  };
  const memberEmail = `${runId.toLowerCase()}@example.test`;
  const document = (name, type, status, project = ids.project, collection = null) => `INSERT INTO documents(id,project_id,collection_id,uploaded_by,doc_type,file_url,original_filename,title,processing_status,active,download_token) VALUES(${bin(ids[name])},${project ? bin(project) : 'NULL'},${collection ? bin(collection) : 'NULL'},${bin(leader.user.id)},${sqlString(type)},${sqlString(status === 'METADATA_FETCHED' ? 'pending' : 'fixture.pdf')},${sqlString(`${runId}-${name}.pdf`)},${sqlString(`${runId}-${name}`)},${sqlString(status)},TRUE,UUID());`;
  try {
    sql(`INSERT INTO users(id,email,password_hash,role,account_status,first_name,last_name,student_code) SELECT ${bin(ids.member)},${sqlString(memberEmail)},password_hash,'STUDENT','ACTIVE','Reference','Member',${sqlString(`REF${Date.now()}`)} FROM users WHERE id=${bin(leader.user.id)};
      INSERT INTO projects(id,title,status,active) VALUES(${bin(ids.project)},${sqlString(runId)},'ASSIGNED',TRUE);
      ${[[leader.user.id, 'LEADER'], [ids.member, 'MEMBER'], [instructor.user.id, 'INSTRUCTOR']].map(([id, role]) => `INSERT INTO project_members(id,project_id,user_id,role) VALUES(UUID_TO_BIN(UUID()),${bin(ids.project)},${bin(id)},${sqlString(role)});`).join('\n')}
      INSERT INTO collections(id,instructor_id,title,active) VALUES(${bin(ids.collection)},${bin(instructor.user.id)},${sqlString(runId)},TRUE);
      ${document('paper', 'PAPER', 'READY')}${document('ready', 'SOURCE', 'READY')}${document('missing', 'SOURCE', 'METADATA_FETCHED')}${document('unselected', 'SOURCE', 'READY')}${document('shared', 'SOURCE', 'METADATA_FETCHED', null, ids.collection)}
      INSERT INTO project_documents(id,project_id,document_id,shared_by) VALUES(UUID_TO_BIN(UUID()),${bin(ids.project)},${bin(ids.shared)},${bin(instructor.user.id)});
      INSERT INTO paper_sections(id,document_id,assigned_user_id,section_order,section_title,content_tex,active) VALUES(${bin(ids.section)},${bin(ids.paper)},${bin(leader.user.id)},0,'Introduction','An external benchmark reports 90 percent accuracy.',TRUE),(${bin(ids.bibliography)},${bin(ids.paper)},${bin(leader.user.id)},1,'References','Manual bibliography text retained.',TRUE);`);
    const member = await login(memberEmail, env.STUDENT_PASSWORD);
    const call = async (auth, method, path, data, status = 200) => {
      const response = await request[method](`${apiUrl}${path}`, { headers: { Authorization: `Bearer ${auth.token}` }, ...(data === undefined ? {} : { data }) });
      expect(response.status(), `${method} ${path}`).toBe(status);
      return response;
    };
    const refs = `/api/papers/${ids.paper}/references`;
    await call(instructor, 'post', `${refs}/${ids.ready}`, undefined, 403);
    await call(leader, 'post', `${refs}/${randomUUID()}`, undefined, 404);
    await Promise.all([call(leader, 'post', `${refs}/${ids.ready}`), call(member, 'post', `${refs}/${ids.ready}`)]);
    await call(member, 'post', `${refs}/${ids.missing}`);
    let list = await (await call(leader, 'get', refs)).json();
    expect(list.map(ref => ref.sourceId)).toEqual([ids.ready, ids.missing]);
    expect(list[1].canAttachFile).toBe(true);
    await call(leader, 'post', `${refs}/${ids.shared}`);
    list = await (await call(leader, 'get', refs)).json();
    expect(list.find(ref => ref.sourceId === ids.shared).canAttachFile).toBe(false);
    evidence.completed.push('real HTTP roles/member/concurrent idempotence/source validation/owner-only policy');
    await page.addInitScript(({ token }) => { localStorage.setItem('token', token); localStorage.setItem('role', 'STUDENT'); localStorage.setItem('app_lang', 'en'); localStorage.setItem('student_workspace_active_tab', 'Source'); }, { token: leader.token });
    // Redirect only the origin; all requests reach the actual backend unchanged.
    await page.route('**/api/**', route => { const url = new URL(route.request().url()); return route.continue({ url: `${apiUrl}${url.pathname}${url.search}` }); });
    await page.routeWebSocket(/\/ws/, () => {});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${webUrl}/student/projects/${ids.project}`);
    const panel = page.locator('[data-tour="context-panel"]');
    await expect(panel).toContainText(`${runId}-missing`);
    await expect(panel).toContainText('Ask the source owner');
    const unselectedRow = panel.locator('div.border.rounded-xl').filter({ hasText: `${runId}-unselected.pdf` });
    await unselectedRow.getByRole('button', { name: 'Add to References', exact: true }).click();
    await expect.poll(async () => (await (await call(leader, 'get', refs)).json()).length).toBe(4);
    await page.reload();
    await expect(panel.getByText(`${runId}-unselected`, { exact: true })).toBeVisible();
    const key = `ep${ids.ready.replace(/-/g, '')}`;
    const editor = page.locator('.cm-content[contenteditable="true"]').first();
    await editor.click(); await page.keyboard.press('Control+End'); await page.keyboard.insertText(` See \\cite{${key}}.`);
    await page.locator('[data-tour="file-panel"]').getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(async () => (await (await call(leader, 'get', `/api/papers/${ids.paper}/sections`)).json()).find(section => section.id === ids.section).contentTex).toContain(`\\cite{${key}}`);
    await page.reload();
    // CodeMirror decorates the command as an inline citation widget after reload.
    await expect(editor).toContainText(key);
    expect((await (await call(leader, 'get', `/api/papers/${ids.paper}/sections`)).json())
      .find(section => section.id === ids.section).contentTex).toContain(`\\cite{${key}}`);
    await panel.getByRole('button', { name: `Remove from References: ${runId}-ready`, exact: true }).click();
    await expect(page.getByText('This reference is still cited in the paper. Remove the citation first, then try again.', { exact: true })).toBeVisible();
    await panel.getByRole('button', { name: `Remove from References: ${runId}-unselected`, exact: true }).click();
    await expect(panel.getByText(`${runId}-unselected`, { exact: true })).toHaveCount(0);
    await page.locator('[data-tour="file-panel"]').getByRole('button', { name: 'References', exact: true }).click();
    const preview = page.locator('#editor-preview-container');
    await expect(preview).toContainText('Manual bibliography text retained.');
    await expect(preview).toContainText(`${runId}-ready`);
    await expect(preview).not.toContainText(`${runId}-unselected`);
    await preview.screenshot({ path: resolve(output, 'preview.png') });
    await panel.locator(`input[id="attach-reference-pdf-${ids.missing}"]`).setInputFiles({ name: `${runId}.pdf`, mimeType: 'application/pdf', buffer: fixturePdf() });
    await expect.poll(async () => (await (await call(leader, 'get', refs)).json()).find(ref => ref.sourceId === ids.missing).fileAvailable).toBe(true);
    evidence.completed.push('real workspace add/reload/remove/409/save/reload/preview/manual text/MinIO attachment');
    const context = await browser.newContext();
    try {
      const review = await context.newPage();
      await review.addInitScript(({ token }) => { localStorage.setItem('token', token); localStorage.setItem('role', 'INSTRUCTOR'); localStorage.setItem('app_lang', 'en'); }, { token: instructor.token });
      await review.route('**/api/**', route => { const url = new URL(route.request().url()); return route.continue({ url: `${apiUrl}${url.pathname}${url.search}` }); });
      await review.routeWebSocket(/\/ws/, () => {});
      await review.goto(`${webUrl}/instructor/requests/${ids.project}`);
      await review.getByRole('button', { name: 'Sources', exact: true }).click();
      await expect(review.locator('[data-tour="context-panel"]')).toContainText(`${runId}-ready`);
      await expect(review.getByRole('button', { name: /Remove from References/ })).toHaveCount(0);
      await expect(review.getByRole('button', { name: 'Add to References', exact: true })).toHaveCount(0);
      evidence.completed.push('real Instructor read-only workspace');
    } finally { await context.close(); }
    const sharedUpload = { multipart: { file: { name: `${runId}-shared.pdf`, mimeType: 'application/pdf', buffer: fixturePdf() } } };
    const deniedAttach = await request.post(`${apiUrl}/api/documents/${ids.shared}/file`, {
      headers: { Authorization: `Bearer ${leader.token}` }, ...sharedUpload,
    });
    expect(deniedAttach.status()).toBe(403);
    const ownerAttach = await request.post(`${apiUrl}/api/documents/${ids.shared}/file`, {
      headers: { Authorization: `Bearer ${instructor.token}` }, ...sharedUpload,
    });
    expect(ownerAttach.status()).toBe(200);
    expect((await (await call(leader, 'get', refs)).json()).find(ref => ref.sourceId === ids.shared).fileAvailable).toBe(true);
    evidence.completed.push('shared Source attach rejects non-owner Student and accepts original collection owner');
    await call(leader, 'post', `${refs}/${ids.unselected}`);
    // Revoke only this RUN_ID's direct source; preserve its document and file row.
    sql(`UPDATE documents SET project_id=NULL WHERE id=${bin(ids.unselected)} AND title=${sqlString(`${runId}-unselected`)};`);
    expect((await (await call(leader, 'get', refs)).json()).map(ref => ref.sourceId)).not.toContain(ids.unselected);
    sql(`DELETE FROM project_documents WHERE project_id=${bin(ids.project)} AND document_id=${bin(ids.shared)};`);
    expect((await (await call(leader, 'get', refs)).json()).map(ref => ref.sourceId)).not.toContain(ids.shared);
    expect(errors).toEqual([]);
    evidence.completed.push('revoked-source visibility');
    evidence.status = 'PASS_CORE';
  } finally { writeFileSync(resolve(output, 'evidence.json'), JSON.stringify(evidence, null, 2)); }
});
