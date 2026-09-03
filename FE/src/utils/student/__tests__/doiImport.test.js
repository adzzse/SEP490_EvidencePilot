import assert from 'node:assert/strict';
import test from 'node:test';

import { prepareProjectDoiImport } from '../doiImport.js';

test('prepares single or batch project DOI imports and removes repeated input', () => {
  assert.deepEqual(prepareProjectDoiImport(' 10.1000/one ', 'project-1'), {
    dois: ['10.1000/one'],
    url: '/api/documents/ingest/doi',
    body: { doi: '10.1000/one', projectId: 'project-1' },
  });

  assert.deepEqual(prepareProjectDoiImport('10.1000/one; 10.1000/two\n10.1000/ONE', 'project-1'), {
    dois: ['10.1000/one', '10.1000/two'],
    url: '/api/documents/ingest/doi/batch',
    body: { projectId: 'project-1', dois: ['10.1000/one', '10.1000/two'] },
  });

  assert.equal(prepareProjectDoiImport(' , ;\n ', 'project-1'), null);
});
