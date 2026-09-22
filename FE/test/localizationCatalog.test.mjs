import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const FE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_ROOT = path.join(FE_ROOT, 'src');
const TEST_ROOT = path.join(FE_ROOT, 'test');
const CURRENT_TEST_FILE = fileURLToPath(import.meta.url);
const LEGACY_CATALOG_FILES = ['home.js', 'common.js', 'student.js', 'instructor.js', 'index.js'];
const LEGACY_CATALOG_SYMBOLS = /\b(?:homeText|commonText|studentText|instructorText)\b/;
const LEGACY_CATALOG_IMPORT = /(?:from\s+|import\s*(?:\(\s*)?|require\s*\(\s*)['"][^'"]*locales(?:[\\/](?:index|home|common|student|instructor)(?:\.js)?)?['"]/;
const APP_LANG_READ = /(?:window\.)?localStorage\.getItem\s*\(\s*['"]app_lang['"]\s*\)/;
const locales = Object.fromEntries(['en', 'vi'].map(language => [
  language,
  JSON.parse(fs.readFileSync(path.join(SOURCE_ROOT, 'locales', `${language}.json`), 'utf8')),
]));

const HOME_SECTIONS = ['nav', 'hero', 'stats', 'roles', 'workflow', 'features', 'preview', 'cta', 'footer', 'about', 'terms', 'privacy', 'aboutPage'];
const HOME_SMOKE_COPY = {
  en: {
    'home.hero.titleHighlight': 'Evidence-Powered',
    'home.features.citationReview.title': 'Citation Review',
    'home.preview.steps.5.title': 'Finalize & Export',
    'home.footer.contact': 'Contact',
    'home.terms.metaTitle': 'Terms of Service',
  },
  vi: {
    'home.hero.titleHighlight': 'Nghiên cứu Dựa trên Bằng chứng',
    'home.features.citationReview.title': 'Đánh giá trích dẫn',
    'home.preview.steps.5.title': 'Hoàn thiện & Xuất',
    'home.footer.contact': 'Liên hệ',
    'home.terms.metaTitle': 'Điều khoản Dịch vụ',
  },
};

const PROFILE_KEYS = [
  'profile.account.description',
  'profile.account.title',
  'profile.actions.edit',
  'profile.actions.resend',
  'profile.actions.saveChanges',
  'profile.actions.updating',
  'profile.activity.description',
  'profile.activity.empty',
  'profile.activity.latest',
  'profile.activity.loadFailed',
  'profile.activity.memberCount',
  'profile.activity.next',
  'profile.activity.noMatches',
  'profile.activity.oldest',
  'profile.activity.previous',
  'profile.activity.searchLabel',
  'profile.activity.searchPlaceholder',
  'profile.activity.sortLabel',
  'profile.activity.sourceCount',
  'profile.activity.title',
  'profile.avatar.change',
  'profile.avatar.cropTitle',
  'profile.avatar.errors.cropRequired',
  'profile.avatar.errors.imageOnly',
  'profile.avatar.errors.maxSize',
  'profile.avatar.updated',
  'profile.avatar.upload',
  'profile.avatar.uploadFailed',
  'profile.email.change.cancelFailed',
  'profile.email.change.cancelled',
  'profile.email.change.requestFailed',
  'profile.email.change.requested',
  'profile.email.changeHint',
  'profile.email.confirmed',
  'profile.email.invalidToken',
  'profile.email.otp.codeHint',
  'profile.email.otp.focus',
  'profile.email.otp.incomplete',
  'profile.email.otp.instructions',
  'profile.email.otp.invalidCode',
  'profile.email.otp.requestFailed',
  'profile.email.otp.resendCode',
  'profile.email.otp.resendIn',
  'profile.email.otp.sending',
  'profile.email.otp.sentTo',
  'profile.email.otp.title',
  'profile.email.otp.verified',
  'profile.email.otp.verifiedToSave',
  'profile.email.otp.verify',
  'profile.email.pending.description',
  'profile.email.pending.title',
  'profile.email.verifiedTitle',
  'profile.fields.assignedRole',
  'profile.fields.currentPassword',
  'profile.fields.email',
  'profile.fields.firstName',
  'profile.fields.lastName',
  'profile.fields.leaveBlank',
  'profile.fields.newPassword',
  'profile.password.changedSignIn',
  'profile.password.confirmAction',
  'profile.password.confirmDescription',
  'profile.password.confirmTitle',
  'profile.password.strength.hint',
  'profile.password.strength.medium',
  'profile.password.strength.strong',
  'profile.password.strength.weak',
  'profile.password.updateFailed',
  'profile.tabs.label',
  'profile.updateClaimInvalid',
  'profile.updateFailed',
  'profile.updated',
  'profile.validation.currentPasswordRequired',
  'profile.validation.emailInvalid',
  'profile.validation.emailVerificationRequired',
  'profile.validation.nameRequired',
  'profile.validation.newPasswordRequired',
];

const STUDENT_PROJECT_KEYS = [
  'actions',
  'allStatuses',
  'completed',
  'defaultStudentName',
  'gridView',
  'guideButton',
  'guideSteps',
  'guideTitle',
  'inProgress',
  'lastUpdated',
  'listView',
  'loadingProjects',
  'nextPage',
  'noDescription',
  'noMatchingProjects',
  'noMatchingProjectsDesc',
  'noProjects',
  'noProjectsDescription',
  'openWorkspace',
  'pageLabel',
  'previousPage',
  'projectName',
  'projectsLoadFailed',
  'retry',
  'roleLabel',
  'searchLabel',
  'searchProjectsPlaceholder',
  'showingProjectsRange',
  'startWorkspace',
  'status',
  'targetStandardLabel',
  'totalProjects',
  'viewWorkspace',
  'welcome',
  'workspaceDescription',
];

const WORKSPACE_SOURCE_FILES = [
  ['pages', 'Student', 'WorkspaceLayout.jsx'],
  ['components', 'Student', 'WorkspaceHeader.jsx'],
  ['components', 'Student', 'FilePanel.jsx'],
  ['components', 'Student', 'EditorPanel.jsx'],
  ['components', 'Student', 'ContextPanel.jsx'],
  ['components', 'Student', 'FeedbackPanel.jsx'],
  ['components', 'Student', 'PaperReferencesPanel.jsx'],
  ['components', 'Student', 'SectionRequirementsPanel.jsx'],
  ['components', 'Student', 'FullPaperPreview.jsx'],
  ['components', 'Student', 'SubmissionReadinessModal.jsx'],
  ['components', 'Instructor', 'InstructorFeedbackPanel.jsx'],
  ['hooks', 'useInstructorReview.js'],
  ['components', 'ui', 'ProfileModal.jsx'],
  ['components', 'features', 'InlineCitationCard.jsx'],
  ['components', 'features', 'FileViewerModal.jsx'],
  ['components', 'features', 'PreviewPane.jsx'],
  ['components', 'features', 'VisualSourceMap.jsx'],
];

const INSTRUCTOR_PHASE2_SOURCE_FILES = [
  ['components', 'Instructor', 'SourceLibraryPanel.jsx'],
  ['components', 'features', 'UniversalDocumentIngestionModal.jsx'],
  ['pages', 'Instructor', 'CollectionList.jsx'],
  ['pages', 'Instructor', 'CollectionDetail.jsx'],
  ['pages', 'Instructor', 'Dashboard.jsx'],
  ['pages', 'Instructor', 'EvidenceTraceReview.jsx'],
  ['pages', 'Instructor', 'ProjectDetail.jsx'],
  ['pages', 'Instructor', 'ProjectManagement.jsx'],
  ['pages', 'Instructor', 'ReviewRequests.jsx'],
  ['pages', 'Instructor', 'SourceLibrary.jsx'],
];

const INSTRUCTOR_PHASE2_DOMAINS = [
  'instructor.dashboard',
  'instructor.projectManagement',
  'instructor.projectDetail',
  'instructor.reviewRequests',
  'instructor.collections',
  'instructor.collectionDetail',
  'instructor.sourceLibrary',
  'instructor.evidenceTrace',
  'shared.ingestion',
];

const STUDENT_WORKSPACE_KEYS = [
  'citationKeyPrompt', 'defaultDocumentFilename', 'defaultImageAlt', 'defaultLinkLabel', 'emptyPreview',
  'labelNamePrompt', 'latexLabel', 'linkLabelPrompt', 'linkUrlPrompt', 'missingImage',
];

const INSTRUCTOR_REVIEW_KEYS = [
  'addFeedback', 'addToManualFeedback', 'aiGenerationNote', 'aiSuggestionRateLimited',
  'aiSuggestions', 'aiSuggestionTab', 'aiSuggestionWorkerUnavailable', 'approve', 'commentSelection',
  'confirmation', 'contextMode', 'currentSection', 'composerPlaceholder',
  'deleteFeedbackConfirm', 'deleteFeedbackFailed', 'draft', 'draftBadge', 'edit', 'finalizeReviewConfirm',
  'diffTruncated', 'evidenceApproximateScope', 'evidenceFilter.ALL', 'evidenceFilter.DISMISSED',
  'evidenceFilter.JUDGED', 'evidenceFilter.NEEDS_ATTENTION', 'evidenceFilter.UNADDRESSED', 'evidenceTab',
  'feedbackTab', 'findingsTab',
  'generateSuggestions', 'generatingSuggestions', 'historicalRoundNotice', 'historyEmpty', 'historyTab',
  'judgmentFeedbackPlaceholder', 'legacySnapshotNotice',
  'loadFeedbackFailed', 'loadReviewSpaceFailed', 'manualFeedback', 'noCheckpointBaseline',
  'noComparisonBaseline',
  'noEvidenceForSubmission', 'noEvidenceTraces', 'noSectionFeedback', 'noSuggestionIssues',
  'overlapExact', 'overlapNotice', 'overlapView',
  'overviewConfirmed', 'overviewSections', 'overviewTab', 'paperConfirmations', 'paperReadOnly', 'paperWide',
  'threadsEmpty',
  'mediaTitle', 'mediaEmpty', 'mediaDone', 'addMedia', 'attachments',
  'removePassage',
  'changePassage', 'adjustPassageHint', 'useThisPassage',
  'returnForRevision', 'reviewApproved', 'reviewClosed',
  'reviewGuide', 'reviewOverview', 'reviewRejected', 'reviewReturned', 'reviewRound',
  'saveFeedback', 'saveFeedbackFailed', 'sectionChanged', 'sectionFeedback', 'sectionFeedbackPlaceholder', 'sectionOverview', 'selectionLine', 'selectionLines', 'selectSectionFeedback', 'selectSectionGuide',
  'selectSourceRange', 'selectSubmittedSource', 'showChanges', 'snapshotLoadError',
  'addComment', 'previewArmedPassage', 'previewUnavailableAction', 'previewUnavailableTitle',
  'submittedVersion',
  'standardCapturedAtSubmission', 'standardCurrentNotice', 'standardLoadError', 'standardMissing', 'standardNoItems',
  'standardStale', 'standardSuggestion', 'standardsTab', 'submittedAt', 'submittedBy', 'submittedDate',
  'submittedVersionLabel', 'suggestionFailed', 'updateFeedback', 'updateStatusFailed', 'versionHistory',
  'wholeSection', 'workingCopy', 'workingCopyLabel',
].map(key => `instructor.review.${key}`).sort();

const PROJECT_STATUS_DOMAIN = [
  'CREATED', 'ASSIGNED', 'IN_PROGRESS', 'SUBMITTED_FOR_REVIEW',
  'RETURNED', 'APPROVED', 'ARCHIVED',
];

// Union of current StatusBadge colors/catalog keys and the ProjectStatus,
// ProcessingStatus, and FeedbackStatus values supplied by current callers.
const STATUS_DOMAIN = [
  'UNKNOWN',
  'DRAFT', 'CREATED', 'ASSIGNED', 'ACTIVE', 'IN_PROGRESS',
  'SUBMITTED', 'SUBMITTED_FOR_REVIEW', 'IN_REVIEW', 'UNDER_REVIEW',
  'PENDING', 'RETURNED', 'REVIEWED', 'REJECTED', 'APPROVED', 'COMPLETED', 'ARCHIVED',
  'PENDING_UPLOAD', 'UPLOADED', 'METADATA_FETCHED', 'PDF_DOWNLOADED', 'QUEUED',
  'PROCESSING', 'RAW_EXTRACTED', 'READY', 'PARTIAL', 'FAILED',
];

const DYNAMIC_KEY_DOMAINS = new Map([
  ['admin.', ['dashboard', 'users', 'projects', 'papers', 'audit', 'infra', 'extractionQueue', 'notifications', 'settings', 'promptConfig', 'dataManagement']],
  ['admin.aiStatus', ['AVAILABLE', 'OUT_OF_SYNC', 'UNAVAILABLE']],
  ['admin.aiKey', ['CITATION_REVIEW', 'CHECK_STANDARD']],
  ['admin.aiCase', ['SUPPORTED', 'MISSING', 'UNTRUSTED']],
  ['feedbackRevision.', ['FIRST_SUBMISSION', 'CHANGED', 'UNCHANGED', 'UNVERIFIABLE', 'UNKNOWN']],
  ['home.features.', ['structuredData.title', 'structuredData.desc', 'citationReview.title', 'citationReview.desc', 'feedback.title', 'feedback.desc', 'documentExtraction.title', 'documentExtraction.desc', 'vectorSearch.title', 'vectorSearch.desc', 'realtime.title', 'realtime.desc']],
  ['home.roles.', ['student.title', 'student.desc', 'instructor.title', 'instructor.desc']],
  ['home.workflow.', ['step1.title', 'step1.desc', 'step2.title', 'step2.desc', 'step3.title', 'step3.desc', 'step4.title', 'step4.desc', 'step5.title', 'step5.desc', 'step6.title', 'step6.desc']],
  ['instructor.evidenceTrace.judgment.', ['EFFECTIVE', 'PARTIAL', 'INEFFECTIVE', 'UNKNOWN']],
  ['instructor.evidenceTrace.outcome.', ['RESOLVED', 'PARTIALLY_RESOLVED', 'UNRESOLVED', 'STALE', 'UNKNOWN']],
  ['instructor.evidenceTrace.studentActionValue.', ['ADD_CITATION', 'PARAPHRASE', 'QUALIFY', 'SYNTHESIZE', 'QUOTE', 'REMOVE', 'DISMISS_WITH_REASON', 'UNKNOWN']],
  ['instructor.collectionDetail.tab.', ['documents', 'connectedMap', 'visualizeMap', 'UNKNOWN']],
  ['instructor.projectDetail.action.', ['archive', 'unarchive', 'complete', 'UNKNOWN']],
  ['instructor.projectDetail.documentType.', ['PAPER', 'SOURCE', 'UNKNOWN']],
  ['instructor.projectDetail.projectRole.', ['MEMBER', 'LEADER', 'INSTRUCTOR', 'UNKNOWN']],
  ['instructor.projectDetail.userRole.', ['STUDENT', 'INSTRUCTOR', 'ADMIN', 'UNKNOWN']],
  ['instructor.projectManagement.action.', ['archive', 'unarchive', 'complete', 'UNKNOWN']],
  ['instructor.review.evidenceFilter.', ['ALL', 'DISMISSED', 'JUDGED', 'NEEDS_ATTENTION', 'UNADDRESSED']],
  ['instructor.review.standard', ['LoadError', 'Missing']],
  ['selfCheckVerdict', ['MET', 'PARTIAL', 'NOT_MET', 'UNVERIFIABLE', 'UNKNOWN']],
  ['sourceMap.', ['outgoing', 'incoming', 'accessDenied', 'loadError']],
  ['sourceMap.processing.', ['PENDING_UPLOAD', 'UPLOADED', 'METADATA_FETCHED', 'PDF_DOWNLOADED', 'QUEUED', 'PROCESSING', 'RAW_EXTRACTED', 'READY', 'COMPLETED', 'PARTIAL', 'FAILED', 'UNKNOWN']],
  ['sourceMap.limitations.', ['SAVED_METADATA_ONLY', 'SOURCES_WITHOUT_DOI', 'AMBIGUOUS_SOURCE_DOI', 'UNKNOWN']],
  ['status.', STATUS_DOMAIN],
  ['studentFeedback.location.', ['ATTACHED', 'MODIFIED', 'DETACHED', 'SECTION', 'UNLOCATED']],
]);

const WORKSPACE_EXPLICIT_STATE_KEYS = new Map([
  ['confidence', ['confidenceHigh', 'confidenceMedium', 'confidenceLow', 'unknown']],
  ['relation', ['relationSupports', 'relationContradicts', 'relationNotFound', 'unknown']],
  ['handoff', ['handoffStateConfirmed', 'handoffStateStale', 'handoffStateUnconfirmed', 'handoffStateNotRequired']],
  ['reference', ['referenceAvailable', 'referenceMissingPdf', 'referenceProcessing']],
  ['readiness', [
    'feedbackRevisionRequired', 'reviewCheckProjectEditable', 'reviewCheckInstructorAssigned',
    'reviewCheckPaperPresent', 'reviewCheckPaperReady', 'reviewCheckSectionsPresent',
    'reviewCheckSectionBodyPresent', 'reviewCheckAssigneeValid', 'reviewCheckSectionConfirmed',
    'sectionBlockerBodyMissing', 'sectionBlockerAssigneeInvalid', 'sectionBlockerHandoffMissing',
  ]],
  ['review', [
    'instructor.review.submittedVersion', 'instructor.review.workingCopy',
    'instructor.review.legacySnapshotNotice', 'instructor.review.snapshotLoadError',
    'instructor.review.returnForRevision', 'instructor.review.approve', 'status.UNKNOWN',
  ]],
]);

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(fullPath);
    return /\.(?:[cm]?js|jsx|tsx?)$/.test(entry.name) ? [fullPath] : [];
  });
}

function getPath(value, key) {
  if (Object.prototype.hasOwnProperty.call(value, key)) return value[key];
  return key.split('.').reduce((current, part) => current?.[part], value);
}

function leafEntries(value, prefix = '') {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value).flatMap(([key, child]) => leafEntries(child, prefix ? `${prefix}.${key}` : key));
  }
  if (Array.isArray(value)) {
    return value.flatMap((child, index) => leafEntries(child, `${prefix}.${index}`));
  }
  return [[prefix, { type: value === null ? 'null' : typeof value, placeholders: typeof value === 'string' ? [...value.matchAll(/\{\{\s*[^{}]+\s*\}\}/g)].map(match => match[0]) : [] }]];
}

function translationCalls() {
  return sourceFiles(SOURCE_ROOT).flatMap(file => {
    const source = fs.readFileSync(file, 'utf8');
    return [...source.matchAll(/(?<![\w.])(?:t|translate)\(\s*(['"])([^'"]+)\1/g)].map(match => match[2]);
  });
}

function dynamicTranslationPrefixes() {
  return new Set(sourceFiles(SOURCE_ROOT).flatMap(file => {
    const source = fs.readFileSync(file, 'utf8');
    return [...source.matchAll(/(?<![\w.])(?:t|translate)\(\s*`([^`]*?)\$\{/g)].map(match => match[1]);
  }));
}

test('i18next JSON catalogs are the only runtime localization source', () => {
  const legacyFiles = LEGACY_CATALOG_FILES.filter(file => fs.existsSync(path.join(SOURCE_ROOT, 'locales', file)));
  assert.deepEqual(legacyFiles, [], `legacy localization files still exist: ${legacyFiles.join(', ')}`);

  const scannedFiles = [...sourceFiles(SOURCE_ROOT), ...sourceFiles(TEST_ROOT)]
    .filter(file => path.resolve(file) !== path.resolve(CURRENT_TEST_FILE));
  for (const file of scannedFiles) {
    const source = fs.readFileSync(file, 'utf8');
    const relativeFile = path.relative(FE_ROOT, file);
    assert.doesNotMatch(source, LEGACY_CATALOG_SYMBOLS, `${relativeFile} references a legacy catalog symbol`);
    assert.doesNotMatch(source, LEGACY_CATALOG_IMPORT, `${relativeFile} imports a legacy catalog file or index`);
  }

  const i18nFile = path.join(SOURCE_ROOT, 'i18n.js');
  const i18nSource = fs.readFileSync(i18nFile, 'utf8');
  assert.match(i18nSource, APP_LANG_READ, 'i18n.js must initialize from app_lang');
  for (const file of sourceFiles(SOURCE_ROOT).filter(file => path.resolve(file) !== path.resolve(i18nFile))) {
    assert.doesNotMatch(
      fs.readFileSync(file, 'utf8'),
      APP_LANG_READ,
      `${path.relative(FE_ROOT, file)} reads app_lang outside i18n.js`,
    );
  }

  const languageContext = fs.readFileSync(path.join(SOURCE_ROOT, 'context', 'LanguageContext.jsx'), 'utf8');
  assert.match(languageContext, /useTranslation\(\)/, 'LanguageContext must derive language from i18next');
  assert.match(languageContext, /normalizeLanguage\(i18n\.resolvedLanguage \|\| i18n\.language\)/, 'LanguageContext must normalize i18next language');
  assert.match(languageContext, /localStorage\.setItem\(\s*['"]app_lang['"]\s*,\s*language\s*\)/, 'LanguageContext must persist app_lang');
  assert.match(languageContext, /document\.documentElement\.lang = language/, 'LanguageContext must update the document language');
  assert.match(languageContext, /value=\{\{ language, setLanguage: changeLanguage, toggleLanguage \}\}/, 'LanguageContext must retain its adapter API');
  assert.doesNotMatch(languageContext, /\buseState\s*\(/, 'LanguageContext must not own independent language state');
});

test('Home catalogs preserve the complete English and Vietnamese pilot surface', () => {
  for (const [language, expectedCopy] of Object.entries(HOME_SMOKE_COPY)) {
    const home = locales[language].home;
    assert.equal(typeof home, 'object', `missing ${language} home catalog`);
    assert.deepEqual(Object.keys(home), HOME_SECTIONS, `unexpected ${language} home sections`);
    assert.equal(leafEntries(home).length, 141, `unexpected ${language} home leaf count`);
    assert.equal(home.preview.steps.length, 6, `unexpected ${language} preview step count`);
    for (const [key, expected] of Object.entries(expectedCopy)) {
      assert.equal(getPath(locales[language], key), expected, `unexpected ${language} copy at ${key}`);
    }
  }
});

test('Profile uses i18next copy and catalogs expose the complete Profile surface', () => {
  const profileSource = fs.readFileSync(path.join(SOURCE_ROOT, 'pages', 'Profile.jsx'), 'utf8');
  assert.match(profileSource, /useTranslation\(\)/, 'Profile must use i18next');
  assert.doesNotMatch(profileSource, /commonText/, 'Profile must not use the commonText bridge');
  assert.doesNotMatch(profileSource, /language\s*===\s*['"]vi['"]/, 'Profile must not select UI copy by language');

  for (const [language, catalog] of Object.entries(locales)) {
    assert.equal(catalog.profile, language === 'en' ? 'Profile' : 'Hồ sơ', `changed ${language} compatibility profile label`);
    const keys = Object.keys(catalog).filter(key => key.startsWith('profile.')).sort();
    assert.deepEqual(keys, PROFILE_KEYS, `unexpected ${language} Profile catalog surface`);
  }
});

test('Student Projects uses i18next copy and catalogs expose the complete screen surface', () => {
  const projectsSource = fs.readFileSync(path.join(SOURCE_ROOT, 'pages', 'Student', 'Projects.jsx'), 'utf8');
  assert.match(projectsSource, /useTranslation\(\)/, 'Student Projects must use i18next');
  assert.doesNotMatch(projectsSource, /(?:studentText|commonText)/, 'Student Projects must not use JS catalog bridges');
  assert.doesNotMatch(projectsSource, /language\s*===\s*['"]vi['"]/, 'Student Projects must not select UI copy by language');
  assert.match(projectsSource, /t\('student\.projects\.guideSteps', \{ returnObjects: true \}\)/, 'Student Projects must read guideSteps as an array');

  for (const [language, catalog] of Object.entries(locales)) {
    const projects = catalog.student?.projects;
    assert.equal(typeof projects, 'object', `missing ${language} Student Projects catalog`);
    assert.deepEqual(Object.keys(projects).sort(), STUDENT_PROJECT_KEYS, `unexpected ${language} Student Projects catalog surface`);
    assert.equal(projects.guideSteps.length, 4, `unexpected ${language} Student Projects guide length`);
  }
});

test('Workspace subtree owns interface copy in i18next JSON catalogs', () => {
  for (const parts of WORKSPACE_SOURCE_FILES) {
    const file = path.join(SOURCE_ROOT, ...parts);
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /(?:commonText|studentText|instructorText)/, `${file} still uses a JS catalog bridge`);
    assert.doesNotMatch(source, /app_lang/, `${file} reads the persisted language key directly`);
  }

  const profileModal = fs.readFileSync(path.join(SOURCE_ROOT, 'components', 'ui', 'ProfileModal.jsx'), 'utf8');
  assert.match(profileModal, /useTranslation\(\)/, 'ProfileModal must use i18next');
  assert.doesNotMatch(profileModal, /useLanguage|language\s*===/, 'ProfileModal must not select copy by language');

  for (const [language, catalog] of Object.entries(locales)) {
    assert.equal(typeof catalog.student?.workspace, 'object', `missing ${language} student.workspace catalog`);
    assert.deepEqual(Object.keys(catalog.student.workspace).sort(), STUDENT_WORKSPACE_KEYS, `unexpected ${language} student.workspace catalog surface`);
    assert.deepEqual(Object.keys(catalog).filter(key => key.startsWith('instructor.review.')).sort(), INSTRUCTOR_REVIEW_KEYS, `unexpected ${language} instructor.review catalog surface`);
    assert.equal(typeof catalog.shell?.profileModal, 'object', `missing ${language} shell.profileModal catalog`);
    assert.deepEqual(Object.keys(catalog.shell.profileModal).sort(), ['close', 'title'], `unexpected ${language} shell.profileModal catalog surface`);
  }
});

test('Workspace dynamic copy uses explicit domains and translated unknown fallbacks', () => {
  const source = WORKSPACE_SOURCE_FILES
    .map(parts => fs.readFileSync(path.join(SOURCE_ROOT, ...parts), 'utf8'))
    .join('\n');
  assert.doesNotMatch(source, /defaultValue:\s*(?:request|project|fb|selectedSource)\./, 'Workspace exposes a raw status enum');
  assert.doesNotMatch(source, /CHECK_KEYS\[[^\]]+\]\s*\|\|\s*check\.code/, 'readiness checks expose raw codes');
  assert.doesNotMatch(source, /SECTION_BLOCKER_KEYS\[[^\]]+\]\s*\|\|\s*code/, 'section blockers expose raw codes');
  assert.doesNotMatch(source, /prompt\(\s*['"]/, 'Workspace prompt copy bypasses i18next');
  assert.doesNotMatch(source, /No content to preview|\[missing image:/, 'Workspace preview copy bypasses i18next');
  assert.doesNotMatch(source, /t\('searchMedia'\)\s*\|\|\s*['"]Search media/, 'Workspace media search copy bypasses i18next');

  for (const [language, catalog] of Object.entries(locales)) {
    assert.equal(typeof catalog.feedbackRevision?.UNKNOWN, 'string', `missing ${language} feedback revision fallback`);
    assert.equal(typeof catalog.selfCheckVerdictUNKNOWN, 'string', `missing ${language} self-check verdict fallback`);
    assert.equal(typeof catalog.sourceMap?.processing?.UNKNOWN, 'string', `missing ${language} source processing fallback`);
    assert.equal(typeof catalog.sourceMap?.limitations?.UNKNOWN, 'string', `missing ${language} source limitation fallback`);
    for (const [domain, keys] of WORKSPACE_EXPLICIT_STATE_KEYS) {
      for (const key of keys) {
        assert.equal(typeof getPath(catalog, key), 'string', `missing ${language} ${domain} state translation: ${key}`);
      }
    }
  }
});

test('remaining Instructor surfaces own interface copy in i18next JSON catalogs', () => {
  const source = INSTRUCTOR_PHASE2_SOURCE_FILES
    .map(parts => fs.readFileSync(path.join(SOURCE_ROOT, ...parts), 'utf8'))
    .join('\n');

  for (const parts of INSTRUCTOR_PHASE2_SOURCE_FILES) {
    const file = path.join(SOURCE_ROOT, ...parts);
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /(?:commonText|studentText|instructorText)/, `${file} still uses a legacy JS catalog`);
    assert.doesNotMatch(source, /app_lang/, `${file} reads the persisted language key directly`);
    assert.doesNotMatch(source, /language\s*===\s*['"]vi['"]/, `${file} selects interface copy by language`);
  }

  assert.doesNotMatch(source, /statusLabels|replaceAll\('_', ' '\)|\bt\[/, 'Instructor surfaces expose a raw dynamic label');

  for (const [language, catalog] of Object.entries(locales)) {
    for (const domain of INSTRUCTOR_PHASE2_DOMAINS) {
      assert.ok(
        Object.keys(catalog).some((key) => key.startsWith(`${domain}.`)),
        `missing ${language} ${domain} catalog`,
      );
    }
    for (const key of [
      'instructor.sourceLibrary.guideSteps',
      'instructor.collections.guideSteps',
      'instructor.collectionDetail.guideSteps',
      'instructor.dashboard.tourSteps',
      'instructor.projectDetail.processingSteps',
      'instructor.projectManagement.guideSteps',
    ]) {
      assert.equal(getPath(catalog, key).length, 4, `unexpected ${language} ${key} length`);
    }
  }
});

test('English and Vietnamese catalogs have matching leaf types and interpolation placeholders', () => {
  const english = new Map(leafEntries(locales.en));
  const vietnamese = new Map(leafEntries(locales.vi));
  assert.deepEqual([...vietnamese.keys()].sort(), [...english.keys()].sort());
  for (const [key, expected] of english) {
    assert.deepEqual(vietnamese.get(key), expected, `catalog mismatch at ${key}`);
  }
});

test('reference check copy exists in both catalogs with matching placeholders', () => {
  const keys = [
    'referenceCheckTitle', 'referenceCheckRunning', 'referenceCheckLoadFailed', 'referenceCheckRetry',
    'referenceCheckEmpty', 'referenceCheckSummary', 'referenceCheckAllReady', 'referenceCheckGuidance',
    'referenceCheckViewIssues', 'referenceCheckStatusReady', 'referenceCheckStatusMissingFile',
    'referenceCheckStatusProcessing', 'referenceCheckStatusUnavailable', 'referenceCheckStatusMissingSource',
    'referenceCheckStatusNeedsReview', 'referenceCheckNotDeclared',
  ];
  for (const key of keys) {
    assert.equal(typeof locales.en[key], 'string', `missing en ${key}`);
    assert.equal(typeof locales.vi[key], 'string', `missing vi ${key}`);
  }
  for (const key of ['referenceCheckSummary', 'referenceCheckViewIssues']) {
    const placeholders = value => [...value.matchAll(/\{\{\s*[^{}]+\s*\}\}/g)].map(match => match[0]);
    assert.deepEqual(placeholders(locales.vi[key]), placeholders(locales.en[key]), `placeholder mismatch at ${key}`);
  }
});

test('status catalogs explicitly cover every shared StatusBadge value', () => {
  const statusBadgeSource = fs.readFileSync(path.join(SOURCE_ROOT, 'components', 'ui', 'StatusBadge.jsx'), 'utf8');
  const colors = statusBadgeSource.match(/const COLORS = \{([\s\S]*?)\n\};/)?.[1];
  assert.ok(colors, 'StatusBadge COLORS map not found');
  const colorKeys = [...colors.matchAll(/^\s{2}([A-Z][A-Z_]+):/gm)].map(match => match[1]);
  for (const key of colorKeys) {
    assert.ok(STATUS_DOMAIN.includes(key), `StatusBadge color missing from status domain: ${key}`);
  }
  const constantsSource = fs.readFileSync(path.join(SOURCE_ROOT, 'constants', 'ui.js'), 'utf8');
  const projectStatusArray = constantsSource.match(/export const PROJECT_STATUSES = Object\.freeze\(\[([\s\S]*?)\n\]\);/)?.[1];
  assert.ok(projectStatusArray, 'PROJECT_STATUSES domain not found');
  const projectStatuses = [...projectStatusArray.matchAll(/PROJECT_STATUS\.([A-Z_]+)/g)].map(match => match[1]);
  assert.deepEqual(projectStatuses, PROJECT_STATUS_DOMAIN, 'project status manifest drifted from PROJECT_STATUSES');
  for (const status of PROJECT_STATUS_DOMAIN) {
    assert.ok(DYNAMIC_KEY_DOMAINS.get('status.').includes(status), `project status missing from dynamic manifest: ${status}`);
  }
  for (const [language, catalog] of Object.entries(locales)) {
    assert.deepEqual(Object.keys(catalog.status).sort(), [...STATUS_DOMAIN].sort(), `unexpected ${language} status domain`);
    for (const status of PROJECT_STATUS_DOMAIN) {
      assert.equal(typeof catalog.status[status], 'string', `missing ${language} project status: ${status}`);
    }
  }
});

test('every literal translation call resolves in both catalogs', () => {
  for (const key of new Set(translationCalls())) {
    assert.notEqual(getPath(locales.en, key), undefined, `missing en translation: ${key}`);
    assert.notEqual(getPath(locales.vi, key), undefined, `missing vi translation: ${key}`);
  }
});

test('every dynamic translation family has an explicit complete domain', () => {
  assert.deepEqual([...dynamicTranslationPrefixes()].sort(), [...DYNAMIC_KEY_DOMAINS.keys()].sort());
  for (const [prefix, suffixes] of DYNAMIC_KEY_DOMAINS) {
    for (const suffix of suffixes) {
      const key = `${prefix}${suffix}`;
      for (const [language, catalog] of Object.entries(locales)) {
        assert.equal(typeof getPath(catalog, key), 'string', `missing ${language} dynamic translation: ${key}`);
      }
    }
  }
});

test('both locale catalogs contain scheduled-deletion strings', () => {
  for (const [language, catalog] of Object.entries(locales)) {
    assert.ok(catalog['instructor.projectManagement.deletionScheduled'], `missing ${language} deletionScheduled`);
    assert.ok(catalog['instructor.projectManagement.revokeDeletion'], `missing ${language} revokeDeletion`);
    assert.ok(catalog['projectDeletion.readOnlyNotice'], `missing ${language} readOnlyNotice`);
  }
});
