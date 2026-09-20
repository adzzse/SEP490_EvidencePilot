import { test, expect } from '@playwright/test';

test.use({ channel: 'chrome', viewport: { width: 1440, height: 1000 } });

const baseUrl = 'http://localhost:5173';
const projectId = 'project-1';
const requestId = 'request-1';
const paperId = 'paper-1';
const sectionId = 'section-1';

async function setup(page) {
  const state = { project: {
    id: projectId,
    title: 'Original project title',
    description: 'Original project description',
    status: 'CREATED',
    active: true,
    targetStandard: null,
    memberCount: 2,
  },
  members: [{
    id: 'membership-1',
    userId: 'student-1',
    userRole: 'STUDENT',
    role: 'MEMBER',
    firstName: 'Student',
    lastName: 'One',
    email: 'student@example.com',
    studentCode: 'S001',
  }, {
    id: 'membership-2',
    userId: 'student-2',
    userRole: 'STUDENT',
    role: 'MEMBER',
    firstName: 'Student',
    lastName: 'Two',
    email: 'student.two@example.com',
    studentCode: 'S002',
  }],
  sections: [{
    id: sectionId,
    documentId: paperId,
    assignedUserId: null,
    assignedUserName: null,
    sectionOrder: 0,
    sectionTitle: 'Introduction',
    sectionType: 'BODY',
    contentTex: 'Initial section content.',
    version: 1,
    revision: 1,
  }, {
    id: 'section-2',
    documentId: paperId,
    assignedUserId: null,
    assignedUserName: null,
    sectionOrder: 1,
    sectionTitle: 'Methodology',
    sectionType: 'BODY',
    contentTex: 'Methodology section content.',
    version: 1,
    revision: 1,
  }],
  sectionStandards: {},
  batchAttempts: 0,
  batchConflictOnce: false,
  puts: [], paperPuts: [], sectionPuts: [], sectionCreates: [], unassignAll: [], deleteProject: [], errors: [], unhandled: [] };

  page.on('pageerror', error => state.errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('token', 'instructor-pages-fixture');
    localStorage.setItem('role', 'INSTRUCTOR');
    localStorage.setItem('app_lang', 'en');
    localStorage.setItem('app_theme', 'light');
  });

  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    let json;

    if (method === 'PUT' && path === `/api/projects/${projectId}`) {
      const body = JSON.parse(request.postData() || '{}');
      state.puts.push(body);
      state.project = { ...state.project, ...body };
      return route.fulfill({ json: state.project });
    }

    if (method === 'PUT' && path === `/api/papers/${paperId}`) {
      const params = new URL(request.url()).searchParams;
      state.paperPuts.push({ title: params.get('title'), originalFilename: params.get('originalFilename') });
      return route.fulfill({ json: { id: paperId, title: params.get('title'), originalFilename: params.get('originalFilename') } });
    }

    if (method === 'PUT' && path === `/api/papers/${paperId}/sections/batch`) {
      const body = JSON.parse(request.postData() || '{}');
      state.batchAttempts += 1;
      state.sectionPuts.push(body);
      if (state.batchConflictOnce) {
        state.batchConflictOnce = false;
        return route.fulfill({ status: 409, json: { fieldErrors: { sectionId: 'section-1' }, message: 'Section changed elsewhere.' } });
      }
      state.sections = (body.sections || []).map(section => ({
        ...state.sections.find(current => String(current.id) === String(section.id)),
        ...section,
        revision: (section.expectedRevision || 0) + 1,
      }));
      return route.fulfill({ json: state.sections });
    }

    if (method === 'POST' && path === `/api/papers/${paperId}/sections/create`) {
      const params = new URL(request.url()).searchParams;
      const title = params.get('title') || 'New section';
      state.sectionCreates.push(title);
      const createdSection = {
        id: 'section-3',
        documentId: paperId,
        assignedUserId: null,
        assignedUserName: null,
        sectionOrder: state.sections.length,
        sectionTitle: title,
        sectionType: 'BODY',
        contentTex: '% New section template',
        version: 1,
        revision: 1,
      };
      state.sections = [...state.sections, createdSection];
      return route.fulfill({ status: 201, json: createdSection });
    }

    if (method === 'DELETE' && path === `/api/projects/${projectId}`) {
      state.deleteProject.push(projectId);
      return route.fulfill({ status: 204 });
    }

    if (method === 'PUT' && path.startsWith(`/api/papers/${paperId}/sections/`) && path.endsWith('/standard-evaluation/config')) {
      const targetSectionId = path.split('/')[5];
      const body = JSON.parse(request.postData() || '{}');
      state.sectionStandards[targetSectionId] = body;
      return route.fulfill({ json: { sectionId: targetSectionId, requirements: body.requirements || [], status: 'CONFIGURED' } });
    }

    if (method === 'PATCH' && path === `/api/projects/${projectId}/members/student-1/unassign-all`) {
      state.unassignAll.push('student-1');
      return route.fulfill({ json: { cleared: 1 } });
    }

    if (path === `/api/papers/${paperId}/sections/section-1/history`) {
      json = state.sections.find(section => section.id === 'section-1') || state.sections[0];
    } else if (path === '/api/users/profile') {
      json = { id: 'instructor-1', role: 'INSTRUCTOR', firstName: 'Test', lastName: 'Instructor' };
    } else if (path === '/api/notifications') {
      json = [];
    } else if (path === '/api/notifications/unread-count') {
      json = { count: 0 };
    } else if (path === '/api/projects' && method === 'GET') {
      json = { content: [state.project], totalElements: 1, totalPages: 1, last: true };
    } else if (path === `/api/projects/${projectId}` && method === 'GET') {
      json = state.project;
    } else if (path === `/api/projects/${projectId}/members`) {
      json = state.members;
    } else if (path === `/api/projects/${projectId}/papers`) {
      json = [{ id: paperId, title: 'Review paper', originalFilename: 'paper.tex', processingStatus: 'READY' }];
    } else if (path === `/api/projects/${projectId}/sources`) {
      json = { content: [], last: true };
    } else if (path === `/api/sources/projects/${projectId}`) {
      json = [];
    } else if (path === `/api/media/projects/${projectId}`) {
      json = [];
    } else if (path === `/api/projects/${projectId}/evidence-traces`) {
      json = [];
    } else if (path === `/api/projects/${projectId}/progress-report`) {
      json = null;
    } else if (path === `/api/projects/${projectId}/checkpoints/diff`) {
      json = null;
    } else if (path === `/api/projects/${projectId}/collections`) {
      json = [];
    } else if (path === '/api/collections') {
      json = { content: [], totalPages: 0, totalElements: 0 };
    } else if (path === '/api/collection-categories') {
      json = [];
    } else if (path === '/api/sources') {
      json = { content: [{ id: 'source-1', title: 'Source One', processingStatus: 'READY', collections: [], projects: [] }], totalPages: 1, totalElements: 1 };
    } else if (path === '/api/users' && method === 'GET') {
      json = state.members.map(member => ({ id: member.userId, firstName: member.firstName, lastName: member.lastName, email: member.email, studentCode: member.studentCode, role: 'STUDENT' }));
    } else if (path === '/api/review-guides') {
      json = [];
    } else if (path === '/api/feedback-requests/queue') {
      json = {
        content: [{ id: requestId, projectId, status: 'PENDING', requestedAt: '2026-09-20T08:00:00Z', studentName: 'Student One' }],
        totalPages: 1,
        totalElements: 1,
        last: true,
      };
    } else if (path === '/api/feedback-requests') {
      json = [{ id: requestId, projectId, status: 'PENDING', requestedAt: '2026-09-20T08:00:00Z' }];
    } else if (path === `/api/feedback-requests/${requestId}/submission-snapshot`) {
      json = {
        state: 'AVAILABLE',
        snapshot: {
          schemaVersion: 1,
          projectId,
          papers: [{ id: paperId, title: 'Review paper', sections: [{
            id: sectionId,
            title: 'Introduction',
            order: 0,
            contentTex: '\\section{Introduction}\nReview workspace fixture content.',
            contentVersion: 1,
          }] }],
        },
      };
    } else if (path === `/api/feedback-requests/${requestId}/feedback`) {
      json = [];
    } else if (path === `/api/papers/${paperId}/sections`) {
      json = state.sections;
    } else if (path.startsWith(`/api/papers/${paperId}/sections/`) && path.endsWith('/standard-evaluation')) {
      const targetSectionId = path.split('/')[5];
      json = state.sectionStandards[targetSectionId] || null;
    } else if (path === `/api/papers/${paperId}/metadata`) {
      json = { title: 'Review paper', authors: [], affiliations: [] };
    } else if (path === `/api/papers/${paperId}/references`) {
      json = [];
    } else if (path === `/api/papers/${paperId}/references/check`) {
      json = { checked: true, issues: [] };
    } else if (path === `/api/papers/${paperId}/standard-suggestion`) {
      json = null;
    } else {
      state.unhandled.push(`${method} ${path}`);
      return route.fulfill({ status: 404, json: { message: `Unhandled fixture request: ${method} ${path}` } });
    }

    return route.fulfill({ json });
  });

  return state;
}

test('Projects card view opens the project edit modal and saves metadata', async ({ page }) => {
  const state = await setup(page);
  await page.goto(`${baseUrl}/instructor/projects`);

  await expect(page.getByTestId(`project-card-${projectId}`)).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Edit project' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Project title').fill('Renamed project');
  await dialog.getByLabel('Description').fill('Updated description');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByText('Renamed project', { exact: true })).toBeVisible();
  expect(state.puts).toEqual([{ title: 'Renamed project', description: 'Updated description' }]);
  expect(state.errors).toEqual([]);
  expect(state.unhandled).toEqual([]);
});

test('Project Detail exposes the project edit modal and saves metadata', async ({ page }) => {
  const state = await setup(page);
  await page.goto(`${baseUrl}/instructor/projects/${projectId}`);

  await expect(page.getByRole('heading', { name: 'Original project title', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Edit project' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Project title').fill('Detail title');
  await dialog.getByLabel('Description').fill('Detail description');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Detail title', exact: true })).toBeVisible();
  expect(state.puts).toEqual([{ title: 'Detail title', description: 'Detail description', targetStandard: null }]);
  expect(state.errors).toEqual([]);
  expect(state.unhandled).toEqual([]);
});

test('Review Requests opens the linked Review Request Workspace', async ({ page }) => {
  const state = await setup(page);
  await page.goto(`${baseUrl}/instructor/requests`);

  await expect(page.getByRole('link', { name: 'Review', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Review', exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/instructor/requests/${projectId}\\?review=${requestId}$`));
  await expect(page.locator('.cm-content')).toContainText('Review workspace fixture content.', { timeout: 15000 });
  await expect(page.getByRole('region', { name: 'Project workspace' })).toBeVisible();
  expect(state.errors).toEqual([]);
  expect(state.unhandled).toEqual([]);
  expect(state.errors).not.toContain("Cannot access 'notifications' before initialization");
});

test('Instructor action headers stay sticky and Requests controls share the header', async ({ page }) => {
  const state = await setup(page);
  const headerFor = heading => page.locator('div.border-b').filter({ has: page.getByRole('heading', { name: heading, exact: true }) }).first();

  await page.goto(`${baseUrl}/instructor/collections`);
  await expect(headerFor('Collections')).toHaveClass(/sticky/);

  await page.goto(`${baseUrl}/instructor/source-library`);
  await expect(headerFor('Source Library')).toHaveClass(/sticky/);

  await page.goto(`${baseUrl}/instructor/requests`);
  const requestsHeader = headerFor('Review Requests');
  await expect(requestsHeader).toHaveClass(/sticky/);
  await expect(requestsHeader.getByRole('searchbox')).toBeVisible();
  await expect(requestsHeader.getByRole('combobox').first()).toBeVisible();
  await expect(requestsHeader.getByRole('button', { name: 'User Guide', exact: true })).toBeVisible();
  expect(state.errors).toEqual([]);
  expect(state.unhandled).toEqual([]);
});

test('Sections opens one Edit Paper Section modal for all section controls', async ({ page }) => {
  const state = await setup(page);
  await page.goto(`${baseUrl}/instructor/projects/${projectId}`);
  await page.getByRole('button', { name: 'Sections', exact: true }).click();
  await page.getByRole('button', { name: 'paper.tex', exact: true }).click();

  await expect(page.getByRole('button', { name: 'View full paper', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit paper', exact: true }).click();

  const editor = page.getByRole('dialog', { name: 'Edit paper sections' });
  await expect(editor).toBeVisible();
  await expect(editor.getByRole('heading', { name: 'Pages', exact: false })).toHaveCount(0);
  await expect(editor.getByTitle('paper.tex')).toBeVisible();
  await expect(editor.getByTestId('rename-paper')).toBeVisible();
  await expect(editor.getByTestId('add-section')).toBeVisible();
  await expect(editor.getByTestId('add-section')).toBeEnabled();
  await expect(editor.getByLabel('Close pages')).toHaveCount(0);
  await expect(editor.getByText('Introduction', { exact: true })).toBeVisible();
  await expect(editor.getByText('Methodology', { exact: true })).toBeVisible();
  await expect(editor.getByLabel('Section title')).toHaveValue('Introduction');
  await expect(editor.getByLabel('Section content')).toHaveValue('Initial section content.');
  await expect(editor.getByTestId('selected-sections-footer')).toContainText('0 selected');
  await expect(editor.getByRole('button', { name: 'Delete selected sections', exact: true })).toBeVisible();
  await expect(editor.getByRole('button', { name: 'Bulk assign', exact: true })).toBeVisible();
  await expect(editor.getByRole('button', { name: 'Config Standard', exact: true })).toBeVisible();
  await expect(editor.getByTestId('assigned-student-label')).toHaveText('Assigned student');
  await expect(editor.getByTestId('standards-label')).toHaveText('Standards');
  expect(await editor.getByTestId('assigned-student-label').evaluate(element => element.tagName)).toBe('DIV');
  expect(await editor.getByTestId('standards-label').evaluate(element => element.tagName)).toBe('DIV');
  const assignedStudentBlock = editor.getByTestId('assigned-student-block');
  const assignmentControlsRow = assignedStudentBlock.getByTestId('assignment-controls-row');
  await expect(assignmentControlsRow.getByLabel('Assigned student')).toBeVisible();
  await expect(assignmentControlsRow.getByRole('button', { name: 'Bulk assign', exact: true })).toBeVisible();
  await expect(assignmentControlsRow.getByRole('button', { name: 'Unassign all sections', exact: true })).toBeVisible();
  await expect(editor.getByTestId('rename-section-section-1')).toBeVisible();
  await expect(editor.getByTestId('delete-section-section-1')).toBeVisible();
  await expect(editor.getByText('Standards', { exact: true })).toBeVisible();

  await editor.getByTestId('rename-paper').click();
  await editor.getByLabel('Paper name').fill('renamed-paper');
  await editor.getByTestId('save-paper-name').click();
  expect(state.paperPuts).toEqual([{ title: 'renamed-paper', originalFilename: 'renamed-paper.tex' }]);

  await editor.getByTestId('rename-section-section-1').click();
  await expect(editor.getByTestId('rename-input-section-1')).toBeVisible();
  await editor.getByTestId('rename-input-section-1').fill('Renamed introduction');
  await expect(editor.getByTestId('save-rename-section-1')).toHaveCount(1);
  await editor.getByTestId('save-rename-section-1').click();

  await editor.getByRole('button', { name: 'Config Standard', exact: true }).click();
  await editor.getByTestId('standard-requirement-input').fill('Use evidence');
  await editor.getByRole('button', { name: 'Add', exact: true }).click();
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  expect(state.sectionStandards[sectionId]).toEqual({ requirements: ['Use evidence'] });
  await expect(editor.getByTestId('standards-requirements')).toContainText('Use evidence');

  await editor.getByLabel('Section title').fill('Updated introduction');
  await editor.getByLabel('Section content').fill('Edited section content.');
  await assignedStudentBlock.getByRole('button', { name: 'Bulk assign', exact: true }).click();
  await expect(assignedStudentBlock.getByTestId('bulk-section-section-1')).toBeVisible();
  await assignedStudentBlock.getByTestId('bulk-section-section-1').check();
  await assignedStudentBlock.getByTestId('bulk-section-section-2').check();
  await assignedStudentBlock.getByTestId('bulk-student-section-1').selectOption('student-1');
  await assignedStudentBlock.getByTestId('bulk-student-section-2').selectOption('student-2');
  await editor.getByRole('button', { name: 'Apply assignment', exact: true }).click();
  await editor.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(editor).toBeVisible();
  await expect(editor.getByTestId('paper-save-notice')).toContainText('Changes saved.');
  await editor.getByLabel('Close editor').click();
  await expect(editor).toBeHidden();

  await expect(page.getByTestId('view-standard-tab-section-1')).toBeVisible();
  await page.getByTestId('view-standard-tab-section-1').click();
  const tabStandardViewer = page.getByRole('dialog', { name: /View standard/ });
  await expect(tabStandardViewer).toContainText('Use evidence');
  await tabStandardViewer.getByRole('button', { name: 'Close', exact: true }).click();

  expect(state.sectionPuts).toHaveLength(1);
  expect(state.sectionPuts[0].sections).toEqual([
    expect.objectContaining({
      id: sectionId,
      sectionTitle: 'Updated introduction',
      contentTex: 'Edited section content.',
      assignedUserId: 'student-1',
      expectedRevision: 1,
    }),
    expect.objectContaining({
      id: 'section-2',
      sectionTitle: 'Methodology',
      assignedUserId: 'student-2',
      expectedRevision: 1,
    }),
  ]);
  expect(state.errors).toEqual([]);
  expect(state.unhandled).toEqual([]);
});

test('Add section creates a new unassigned section while the paper is still setup-only', async ({ page }) => {
  const state = await setup(page);
  await page.goto(`${baseUrl}/instructor/projects/${projectId}`);
  await page.getByRole('button', { name: 'Sections', exact: true }).click();
  await page.getByRole('button', { name: 'paper.tex', exact: true }).click();
  await page.getByRole('button', { name: 'Edit paper', exact: true }).click();

  const editor = page.getByRole('dialog', { name: 'Edit paper sections' });
  const addSection = editor.getByTestId('add-section');
  await expect(addSection).toBeEnabled();
  await addSection.click();

  await expect(editor.getByTestId('section-nav-section-3')).toBeVisible();
  expect(state.sectionCreates).toEqual(['New section']);
  expect(state.sections.at(-1)).toEqual(expect.objectContaining({
    id: 'section-3',
    assignedUserId: null,
    sectionTitle: 'New section',
  }));
  expect(state.errors).toEqual([]);
  expect(state.unhandled).toEqual([]);
});

test('Edit Paper Section preserves drafts across dirty-close and revision conflict', async ({ page }) => {
  const state = await setup(page);
  await page.goto(`${baseUrl}/instructor/projects/${projectId}`);
  await page.getByRole('button', { name: 'Sections', exact: true }).click();
  await page.getByRole('button', { name: 'paper.tex', exact: true }).click();
  await page.getByRole('button', { name: 'Edit paper', exact: true }).click();

  let editor = page.getByRole('dialog', { name: 'Edit paper sections' });
  await editor.getByLabel('Section content').fill('Draft that must survive close.');
  await editor.getByLabel('Close editor').click();
  const discardPrompt = page.getByRole('alertdialog', { name: 'Discard unsaved changes?' });
  await expect(discardPrompt).toBeVisible();
  await discardPrompt.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel('Section content')).toHaveValue('Draft that must survive close.');
  await editor.getByLabel('Close editor').click();
  await page.getByRole('alertdialog', { name: 'Discard unsaved changes?' }).getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(editor).toBeHidden();
  expect(state.sectionPuts).toHaveLength(0);

  await page.getByRole('button', { name: 'Edit paper', exact: true }).click();
  editor = page.getByRole('dialog', { name: 'Edit paper sections' });
  await editor.getByLabel('Section content').fill('Conflict draft must remain.');
  state.batchConflictOnce = true;
  await editor.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(editor).toBeVisible();
  await expect(editor.getByLabel('Section content')).toHaveValue('Conflict draft must remain.');
  await expect(editor.getByTestId('section-conflict-section-1')).toBeVisible();
  await editor.getByRole('button', { name: 'Reload section', exact: true }).click();
  await editor.getByLabel('Section content').fill('Conflict draft must remain.');
  await editor.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(editor).toBeVisible();
  await expect(editor.getByTestId('paper-save-notice')).toContainText('Changes saved.');
  await editor.getByLabel('Close editor').click();
  await expect(editor).toBeHidden();
  expect(state.batchAttempts).toBe(2);
  expect(state.errors).toEqual([]);
  expect(state.unhandled).toEqual([]);
});

test('Bulk editor clears a section assignment when that section is deselected', async ({ page }) => {
  const state = await setup(page);
  state.sections[0].assignedUserId = 'student-1';
  state.sections[0].assignedUserName = 'Student One';
  state.sections[1].assignedUserId = 'student-2';
  state.sections[1].assignedUserName = 'Student Two';
  await page.goto(`${baseUrl}/instructor/projects/${projectId}`);
  await page.getByRole('button', { name: 'Sections', exact: true }).click();
  await page.getByRole('button', { name: 'paper.tex', exact: true }).click();
  await page.getByRole('button', { name: 'Edit paper', exact: true }).click();

  const editor = page.getByRole('dialog', { name: 'Edit paper sections' });
  await editor.getByRole('button', { name: 'Bulk assign', exact: true }).click();
  await expect(editor.getByTestId('bulk-section-section-2')).toBeChecked();
  await editor.getByTestId('bulk-section-section-2').uncheck();
  await editor.getByRole('button', { name: 'Apply assignment', exact: true }).click();
  await editor.getByRole('button', { name: 'Save changes', exact: true }).click();

  expect(state.sectionPuts[0].sections).toEqual([
    expect.objectContaining({ id: sectionId, assignedUserId: 'student-1' }),
    expect.objectContaining({ id: 'section-2', assignedUserId: null }),
  ]);
  expect(state.errors).toEqual([]);
  expect(state.unhandled).toEqual([]);
});

test('Edit Paper Section respects structure locks without hiding instructor content editing', async ({ page }) => {
  const state = await setup(page);
  state.sections[0].assignedUserId = 'student-1';
  state.sections[0].assignedUserName = 'Student One';
  state.sectionStandards[sectionId] = { sectionId, requirements: ['Use evidence'], status: 'CONFIGURED' };
  await page.goto(`${baseUrl}/instructor/projects/${projectId}`);
  await page.getByRole('button', { name: 'Sections', exact: true }).click();
  await page.getByRole('button', { name: 'paper.tex', exact: true }).click();
  await page.getByRole('button', { name: 'Edit paper', exact: true }).click();

  const editor = page.getByRole('dialog', { name: 'Edit paper sections' });
  await expect(editor.getByLabel('Section content')).not.toHaveAttribute('readonly');
  await expect(editor.getByRole('button', { name: 'Add section', exact: true })).toBeDisabled();
  await expect(editor.getByRole('button', { name: 'Config Standard', exact: true }).first()).toBeDisabled();
  await expect(editor.getByText('Standards', { exact: true })).toBeVisible();
  await expect(editor.getByRole('button', { name: /Introduction Student One/ })).toBeVisible();
  expect(state.errors).toEqual([]);
  expect(state.unhandled).toEqual([]);
});

test('Unassign all is available in Sections instead of Assign Students', async ({ page }) => {
  const state = await setup(page);
  state.sections[0].assignedUserId = 'student-1';
  state.sections[0].assignedUserName = 'Student One';
  state.sections[1].assignedUserId = 'student-2';
  state.sections[1].assignedUserName = 'Student Two';
  await page.goto(`${baseUrl}/instructor/projects/${projectId}`);
  await page.getByRole('button', { name: 'Sections', exact: true }).click();
  await page.getByRole('button', { name: 'paper.tex', exact: true }).click();

  await page.getByRole('button', { name: 'Edit paper', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Edit paper sections' });
  await expect(editor.getByRole('button', { name: 'Unassign all sections', exact: true })).toBeVisible();
  const assignmentControlsRow = editor.getByTestId('assignment-controls-row');
  await expect(assignmentControlsRow.getByLabel('Assigned student')).toBeVisible();
  await expect(assignmentControlsRow.getByRole('button', { name: 'Bulk assign', exact: true })).toBeVisible();
  await expect(assignmentControlsRow.getByRole('button', { name: 'Unassign all sections', exact: true })).toBeVisible();
  await editor.getByRole('button', { name: 'Unassign all sections', exact: true }).click();
  const confirmation = page.getByRole('alertdialog', { name: 'Remove every student from every section?' });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: 'Unassign all sections', exact: true }).click();
  await editor.getByRole('button', { name: 'Save changes', exact: true }).click();
  expect(state.sectionPuts[0].sections).toEqual([
    expect.objectContaining({ id: sectionId, assignedUserId: null }),
    expect.objectContaining({ id: 'section-2', assignedUserId: null }),
  ]);
  await page.keyboard.press('Escape');
  await expect(editor).toBeHidden();
  await page.getByRole('button', { name: 'Assign Students', exact: true }).click();
  await expect(page.locator('#project-members').getByRole('button', { name: 'Unassign all sections', exact: true })).toHaveCount(0);
  expect(state.errors).toEqual([]);
  expect(state.unhandled).toEqual([]);
});

test('Project Detail exposes project delete and returns to Projects', async ({ page }) => {
  const state = await setup(page);
  await page.goto(`${baseUrl}/instructor/projects/${projectId}`);

  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  const confirmation = page.getByRole('alertdialog', { name: 'Delete this project permanently?' });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: 'Delete', exact: true }).click();

  await expect(page).toHaveURL(`${baseUrl}/instructor/projects`);
  expect(state.deleteProject).toEqual([projectId]);
  expect(state.errors).toEqual([]);
  expect(state.unhandled).toEqual([]);
});
