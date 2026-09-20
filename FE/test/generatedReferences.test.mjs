import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));

test('References editor keeps appended sources inside the editable section', async (t) => {
  const server = await createServer({
    root: projectRoot,
    appType: 'custom',
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0 },
  });
  server.middlewares.use(async (request, response, next) => {
    if (request.url !== '/__generated_references_test__') return next();
    response.setHeader('Content-Type', 'text/html');
    response.end(await server.transformIndexHtml(request.url, `
      <div id="root"></div>
      <script type="module">
        import React from 'react';
        import { createRoot } from 'react-dom/client';
        import '/src/index.css';
        import '/src/i18n.js';
        try {
          const { default: EditorPanel } = await import('/src/components/Student/EditorPanel.jsx');
          createRoot(document.getElementById('root')).render(React.createElement(EditorPanel, {
            editorRef: React.createRef(),
            selectedPaper: { id: 'paper-1', originalFilename: 'paper.tex' },
            selectedSectionId: 'references-1',
            assignedSections: [],
            canEditCurrentSection: true,
            currentSection: { id: 'references-1', sectionTitle: 'References', contentTex: '- [60] Imported reference.\\n- [61] Appended source.', version: 1 },
            displayContent: '- [60] Imported reference.\\n- [61] Appended source.',
            updateCode: () => {},
            editorWidth: 50,
            onEditorResizeStart: () => {},
            handleSaveDraft: () => {},
            handleDownloadTex: () => {},
            showSymbolMenu: false,
            setShowSymbolMenu: () => {},
            showTextSizeMenu: false,
            setShowTextSizeMenu: () => {},
            showSearchPanel: false,
            setShowSearchPanel: () => {},
            searchQuery: '',
            setSearchQuery: () => {},
            replaceQuery: '',
            setReplaceQuery: () => {},
            textSize: 14,
            setTextSize: () => {},
            showToast: () => {},
            mediaAssets: [],
            isLocked: false,
            paperReferences: [
              { citationKey: 'epfirst', authors: 'Writer', title: 'First paper', publicationYear: 2026 },
              { citationKey: 'epsecond', authors: 'Researcher', title: 'Second paper', publicationYear: 2025 },
            ],
          }));
          document.body.dataset.ready = 'true';
        } catch (error) {
          document.body.dataset.error = error.message;
        }
      </script>
    `));
  });
  await server.listen();
  t.after(() => server.close());

  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.CI === 'true' });
  t.after(() => browser.close());

  const address = server.httpServer.address();
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${address.port}/__generated_references_test__`);
  await page.locator('body[data-ready], body[data-error]').waitFor();
  assert.equal(await page.locator('body').getAttribute('data-error'), null);

  const content = await page.locator('.cm-content').textContent();
  assert.match(content, /\[60\] Imported reference\./);
  assert.match(content, /\[61\] Appended source\./);
  assert.equal(await page.getByRole('region', { name: 'Generated references' }).count(), 0);
});
