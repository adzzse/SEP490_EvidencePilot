import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
process.env.VITE_API_BASE_URL = '/';

const checkFixture = {
  referenceSectionFound: true,
  summary: {
    detected: 2,
    ready: 1,
    missingFile: 0,
    processing: 0,
    unavailable: 0,
    missingSource: 1,
    needsReview: 0,
    matchedNotDeclared: 1,
  },
  items: [
    {
      index: 1,
      rawText: 'Ready work. 2024. doi:10.1000/ready',
      doi: '10.1000/ready',
      publicationYear: 2024,
      status: 'READY',
      matchReason: 'DOI',
      matchedSourceId: 'source-ready',
      matchedSourceTitle: 'Ready work',
      declaredReference: false,
    },
    {
      index: 2,
      rawText: 'Missing work. 2023.',
      doi: null,
      publicationYear: 2023,
      status: 'MISSING_SOURCE',
      matchReason: 'NONE',
      matchedSourceId: null,
      matchedSourceTitle: null,
      declaredReference: false,
    },
  ],
};

const allReadyFixture = {
  ...checkFixture,
  summary: {
    detected: 1,
    ready: 1,
    missingFile: 0,
    processing: 0,
    unavailable: 0,
    missingSource: 0,
    needsReview: 0,
    matchedNotDeclared: 0,
  },
  items: [{
    ...checkFixture.items[0],
    declaredReference: true,
  }],
};

const referenceFixture = [{
  sourceId: 'source-ready',
  citationKey: 'epready',
  title: 'Existing reference',
  authors: 'Writer',
  publicationYear: 2024,
  doi: null,
  processingStatus: 'READY',
  fileUrl: 'ready.pdf',
  fileAvailable: true,
  retrievable: true,
  canAttachFile: false,
}];

test('paper reference panel keeps the advisory check independent and refreshable', async (t) => {
  let scenario = 'default';
  let checkRequests = 0;
  const server = await createServer({
    root: projectRoot,
    appType: 'custom',
    envFile: false,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0 },
  });
  server.middlewares.use(async (request, response, next) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/api/papers/paper-1/references') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify(referenceFixture));
      return;
    }
    if (pathname === '/api/papers/paper-1/references/check') {
      checkRequests += 1;
      if (scenario === 'error-first' && checkRequests === 1) {
        response.statusCode = 500;
        response.end('failed');
        return;
      }
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify(scenario === 'default' && checkRequests > 1
        ? allReadyFixture
        : checkFixture));
      return;
    }
    if (pathname !== '/__paper_reference_check_test__') return next();
    response.setHeader('Content-Type', 'text/html');
    response.end(await server.transformIndexHtml(request.url, `
      <div id="root"></div>
      <script type="module">
        import React from 'react';
        import { createRoot } from 'react-dom/client';
        import '/src/i18n.js';
        import { usePaperReferences } from '/src/hooks/usePaperReferences.js';
        import PaperReferencesPanel from '/src/components/Student/PaperReferencesPanel.jsx';
        function Harness() {
          const state = usePaperReferences('paper-1');
          return React.createElement(React.Fragment, null,
            React.createElement('button', { type: 'button', onClick: state.reload }, 'Reload check'),
            React.createElement(PaperReferencesPanel, {
              references: state.references,
              loading: state.loading,
              error: state.error,
              referenceCheck: state.check,
              referenceCheckLoading: state.checkLoading,
              referenceCheckError: state.checkError,
              onRetryReferenceCheck: state.reload,
            }),
          );
        }
        createRoot(document.getElementById('root')).render(React.createElement(Harness));
      </script>
    `));
  });
  await server.listen();
  t.after(() => server.close());

  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.CI === 'true' });
  t.after(() => browser.close());
  const address = server.httpServer.address();
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${address.port}/__paper_reference_check_test__`);
  const region = page.getByRole('region', { name: 'Reference check' });
  await region.waitFor();
  assert.match(await region.textContent(), /2 references detected/i);
  assert.match(await region.textContent(), /1 missing from Sources/i);
  assert.match(await region.textContent(), /Use Sources below to import a missing work/i);
  await region.getByText(/View 2 issues/i).click();
  assert.match(await region.textContent(), /Missing work\. 2023\./);
  assert.match(await region.textContent(), /Not added to paper References/i);

  await page.getByRole('button', { name: 'Reload check' }).click();
  const ready = page.getByRole('status');
  await ready.waitFor();
  assert.match(await ready.textContent(), /Every imported reference has a ready Source/i);

  scenario = 'error-first';
  checkRequests = 0;
  const errorPage = await browser.newPage();
  await errorPage.goto(`http://127.0.0.1:${address.port}/__paper_reference_check_test__?error`);
  const alert = errorPage.getByRole('alert');
  await alert.waitFor();
  assert.match(await alert.textContent(), /Could not check imported references\./i);
  assert.match(await errorPage.getByText('Existing reference').textContent(), /Existing reference/);
  await errorPage.getByRole('button', { name: 'Check again' }).click();
  await errorPage.getByRole('region', { name: 'Reference check' }).waitFor();
});
