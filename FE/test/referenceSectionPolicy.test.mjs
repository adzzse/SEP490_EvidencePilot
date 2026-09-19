import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
process.env.VITE_API_BASE_URL = '/';

test('shared References UI keeps Save/history access, no handoff, and section action parity', async (t) => {
  let citationReviewCalls = 0;
  let referenceCheckCalls = 0;
  const server = await createServer({
    root: projectRoot,
    appType: 'custom',
    envFile: false,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0 },
  });

  server.middlewares.use(async (request, response, next) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/api/papers/paper-1/sections/section-ref/standard-evaluation') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ requirements: [] }));
      return;
    }
    if (pathname === '/api/projects/project-1/review-readiness') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({
        papers: [{
          id: 'paper-1',
          title: 'Paper',
          sections: [
            {
              id: 'section-ref',
              title: 'References',
              contentVersion: 1,
              handoffState: 'NOT_REQUIRED',
              blockers: [],
            },
            {
              id: 'section-intro',
              title: 'Introduction',
              contentVersion: 1,
              assignedUserName: 'Student One',
              handoffState: 'CONFIRMED',
              blockers: [],
            },
          ],
        }],
      }));
      return;
    }
    if (pathname !== '/__reference_section_policy__') return next();
    response.setHeader('Content-Type', 'text/html');
    response.end(await server.transformIndexHtml(request.url, `
      <div id="root"></div>
      <script type="module">
        import React, { useState } from 'react';
        import { createRoot } from 'react-dom/client';
        import { BrowserRouter } from 'react-router-dom';
        import { AuthProvider } from '/src/context/AuthContext.jsx';
        import { LanguageProvider } from '/src/context/LanguageContext.jsx';
        import { ThemeProvider } from '/src/context/ThemeContext.jsx';
        import '/src/i18n.js';
        import WorkspaceHeader from '/src/components/Student/WorkspaceHeader.jsx';
        import FilePanel from '/src/components/Student/FilePanel.jsx';
        import SectionRequirementsPanel from '/src/components/Student/SectionRequirementsPanel.jsx';
        import SectionRow from '/src/components/Instructor/sections/SectionRow.jsx';
        import ReviewOverviewBlock from '/src/components/Instructor/review/ReviewOverviewBlock.jsx';

        const reference = { id: 'section-ref', sectionTitle: 'References', contentTex: 'References', version: 1, revision: 1 };
        const introduction = { id: 'section-intro', sectionTitle: 'Introduction', contentTex: 'Introduction', assignedUserId: 'student-1', version: 1, revision: 1 };
        const rowText = {
          unassignToReorder: 'Unassign to reorder', dragToReorder: 'Drag to reorder', configStandard: 'Configure standard',
          rename: 'Rename', deleteSectionConfirm: 'Delete section?', unassigned: 'Unassigned', reloadSection: 'Reload section',
          referenceSharedEditors: 'All student members', save: 'Save', cancel: 'Cancel', delete: 'Delete',
        };
        const commonHeaderProps = {
          project: { title: 'Project', status: 'IN_PROGRESS', currentUserRole: 'MEMBER' },
          notifications: [], unreadCount: 0, showNotifications: false, setShowNotifications: () => {},
          onMarkNotificationRead: () => {}, onOpenNotification: () => {}, historyDisabled: false,
          onShowHistory: () => {}, showExportMenu: false, setShowExportMenu: () => {},
          handleExportTexArchive: () => {}, handleExportTraceabilityJson: () => {}, handleExportTraceabilityCsv: () => {},
        };

        function HeaderHarness() {
          const [kind, setKind] = useState('reference');
          const action = {
            reference: { label: 'Ref Check', description: 'Reference check', onClick: () => { window.__referenceCheckCalls += 1; }, disabled: false, busy: false, progress: null, error: null },
            abstract: { label: 'Citation Review', description: 'Citation Review is not applicable to Abstract.', onClick: () => { window.__citationReviewCalls += 1; }, disabled: true, busy: false, progress: null, error: null },
            ordinary: { label: 'Citation Review', description: 'Citation review', onClick: () => { window.__citationReviewCalls += 1; }, disabled: false, busy: false, progress: null, error: null },
          }[kind];
          return React.createElement(React.Fragment, null,
            React.createElement('div', { className: 'flex gap-2', 'data-testid': 'mode-switcher' },
              React.createElement('button', { type: 'button', 'data-testid': 'reference-mode', onClick: () => setKind('reference') }, 'References'),
              React.createElement('button', { type: 'button', 'data-testid': 'abstract-mode', onClick: () => setKind('abstract') }, 'Abstract'),
              React.createElement('button', { type: 'button', 'data-testid': 'ordinary-mode', onClick: () => setKind('ordinary') }, 'Introduction'),
            ),
            React.createElement('div', { 'data-testid': 'header-host' },
              React.createElement(WorkspaceHeader, { ...commonHeaderProps, reviewAction: action }),
            ),
          );
        }

        function PolicyHarness() {
          const [saved, setSaved] = useState(0);
          const canEdit = section => section.sectionTitle === 'References' || section.assignedUserId === 'student-1';
          const review = {
            activeRequest: { id: 'request-1', studentName: 'Student One', requestedAt: '2026-09-19T10:00:00Z' },
            submissionSnapshot: null,
            snapshotState: 'NONE',
            viewMode: 'working',
            sections: [reference, introduction],
            papers: [{ id: 'paper-1', title: 'Paper' }],
            evidenceTraces: [],
            selectedSectionId: 'section-ref',
          };
          return React.createElement(React.Fragment, null,
            React.createElement(HeaderHarness),
            React.createElement('p', { 'data-testid': 'save-count' }, String(saved)),
            React.createElement(FilePanel, {
              compact: false, isOpen: true, width: 300, sections: [reference, introduction],
              assignedSections: [introduction], canEditSection: canEdit, selectedSectionId: 'section-ref',
              onSelectSection: () => {}, selectedPaper: { id: 'paper-1', title: 'Paper' }, onSelectPaper: () => {},
              onViewFullPaper: () => {}, papers: [{ id: 'paper-1', title: 'Paper' }], onUploadPaper: undefined,
              sources: [], onUploadSource: undefined, onDeleteSource: undefined, mediaAssets: [],
              onUploadMedia: undefined, onDeleteMedia: undefined, onInsertMedia: undefined, showToast: () => {},
              isLocked: false, onSaveDraft: () => setSaved(value => value + 1), saveStatus: '',
            }),
            React.createElement(SectionRequirementsPanel, {
              project: { id: 'project-1' }, selectedPaper: { id: 'paper-1' }, selectedSection: reference,
              isAssigned: false, isLocked: false, isDirty: false, onHandoffChanged: () => {}, pollAiJob: () => {}, showToast: () => {},
            }),
            React.createElement('div', { 'data-testid': 'instructor-rows' },
              React.createElement(SectionRow, { section: reference, index: 0, isLocked: false, isReadOnly: false, isSaving: false, isConflict: false, isEditing: false, editingTitle: '', onStartRename: () => {}, onSaveRename: () => {}, onCancelRename: () => {}, onEditingChange: () => {}, onDelete: () => {}, onAssign: () => {}, onReloadConflict: () => {}, onConfigStandard: () => {}, projectMembers: [], users: [], t: rowText, ct: rowText }),
              React.createElement(SectionRow, { section: introduction, index: 1, isLocked: false, isReadOnly: false, isSaving: false, isConflict: false, isEditing: false, editingTitle: '', onStartRename: () => {}, onSaveRename: () => {}, onCancelRename: () => {}, onEditingChange: () => {}, onDelete: () => {}, onAssign: () => {}, onReloadConflict: () => {}, onConfigStandard: () => {}, projectMembers: [{ userId: 'student-1' }], users: [{ id: 'student-1' }], t: rowText, ct: rowText }),
            ),
            React.createElement('div', { 'data-testid': 'review-overview' }, React.createElement(ReviewOverviewBlock, { review })),
          );
        }

        window.__referenceCheckCalls = 0;
        window.__citationReviewCalls = 0;
        createRoot(document.getElementById('root')).render(
          React.createElement(BrowserRouter, null,
            React.createElement(AuthProvider, null,
              React.createElement(LanguageProvider, null,
                React.createElement(ThemeProvider, null, React.createElement(PolicyHarness)),
              ),
            ),
          ),
        );
      </script>
    `));
  });

  await server.listen();
  t.after(() => server.close());
  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.CI === 'true' });
  t.after(() => browser.close());
  const address = server.httpServer.address();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`http://127.0.0.1:${address.port}/__reference_section_policy__`);

  const header = page.getByTestId('header-host');
  const visibleAction = (label) => header.locator('button:visible').filter({ hasText: label }).first();
  await visibleAction('Ref Check').waitFor();
  const saveButton = page.getByRole('button', { name: 'Save', exact: true }).first();
  await saveButton.waitFor();
  assert.equal(await saveButton.isEnabled(), true);
  assert.match(await page.getByRole('status').allTextContents().then(values => values.join(' ')), /All student members/i);
  assert.equal(await page.getByRole('button', { name: /confirm handoff/i }).count(), 0);
  assert.equal(await page.getByTestId('instructor-rows').locator('select').count(), 1);
  assert.match(await page.getByTestId('review-overview').textContent(), /Handoff not required/i);

  await page.getByTestId('abstract-mode').click();
  const abstractButton = visibleAction('Citation Review');
  assert.equal(await abstractButton.isDisabled(), true);
  assert.match(await abstractButton.getAttribute('class'), /disabled:opacity-50/);

  await page.getByTestId('ordinary-mode').click();
  await visibleAction('Citation Review').click();
  assert.equal(await page.evaluate(() => window.__citationReviewCalls), 1);
  assert.equal(await page.evaluate(() => window.__referenceCheckCalls), 0);

  await page.getByTestId('reference-mode').click();
  await visibleAction('Ref Check').click();
  assert.equal(await page.evaluate(() => window.__referenceCheckCalls), 1);
  assert.equal(await page.evaluate(() => window.__citationReviewCalls), 1);

  await page.setViewportSize({ width: 375, height: 800 });
  await page.getByTestId('reference-mode').click();
  await header.getByRole('button', { name: 'Open menu' }).click();
  const mobileReferenceButton = header.locator('button:visible').filter({ hasText: 'Ref Check' }).first();
  await mobileReferenceButton.waitFor();
  await mobileReferenceButton.click();
  assert.equal(await page.evaluate(() => window.__referenceCheckCalls), 2);
});
