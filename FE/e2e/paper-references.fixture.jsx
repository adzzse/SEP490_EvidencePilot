import React, { useCallback, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ContextPanel from '../src/components/Student/ContextPanel.jsx';
import InlineCitationCard from '../src/components/features/InlineCitationCard.jsx';
import { usePaperReferences } from '../src/hooks/usePaperReferences.js';
import { ThemeProvider } from '../src/context/ThemeContext.jsx';
import '../src/i18n.js';
import '../src/index.css';

const PAPER_ID = '44444444-4444-4444-4444-444444444444';
const CITED_ID = '11111111-1111-1111-1111-111111111111';

const initialSources = [
  { id: '11111111-1111-1111-1111-111111111111', originalFilename: 'Ready Paper.pdf', title: 'Ready Paper', authors: 'A. Researcher', publicationYear: 2026, doi: '10.1234/ready', processingStatus: 'READY', fileUrl: 'ready.pdf' },
  { id: '22222222-2222-2222-2222-222222222222', originalFilename: 'Missing Paper.pdf', title: 'Missing Paper', authors: 'B. Writer', publicationYear: 2025, doi: null, processingStatus: 'METADATA_FETCHED', processingError: 'No PDF yet', fileUrl: 'pending' },
  { id: '33333333-3333-3333-3333-333333333333', originalFilename: 'Extra Paper.pdf', title: 'Extra Paper', authors: 'C. Scholar', publicationYear: 2024, doi: null, processingStatus: 'READY', fileUrl: 'extra.pdf' },
];

function Fixture() {
  const [sources] = useState(initialSources);
  const [paperId, setPaperId] = useState(PAPER_ID);
  const [toasts, setToasts] = useState([]);
  const [instructor, setInstructor] = useState(false);
  const [mountKey, setMountKey] = useState(0);
  const showToast = useCallback((message) => setToasts((prev) => [...prev, String(message)]), []);

  window.__fixture = {
    remount: () => setMountKey((key) => key + 1),
    switchPaper: setPaperId,
  };

  const { references, loading, error, reload, addReference, removeReference } = usePaperReferences(paperId);
  const referenceSourceIds = useMemo(
    () => new Set((references || []).map((reference) => String(reference.sourceId))),
    [references],
  );

  const handleAdd = useCallback(async (sourceId) => {
    try {
      await addReference(sourceId);
    } catch (failure) {
      showToast(failure?.response?.data?.message || 'add failed');
    }
  }, [addReference, showToast]);

  const handleRemove = useCallback(async (sourceId) => {
    try {
      await removeReference(sourceId);
    } catch (failure) {
      showToast(failure?.response?.status === 409
        ? 'This reference is still cited in the paper. Remove the citation first, then try again.'
        : failure?.response?.data?.message || 'remove failed');
    }
  }, [removeReference, showToast]);

  const cardCandidates = [
    { documentId: '11111111-1111-1111-1111-111111111111', documentChunkId: 'chunk-1', citationKey: 'ep11111111111111111111111111111111', title: 'Ready Paper', excerpt: 'Supporting passage', similarityScore: 0.9 },
    { documentId: '33333333-3333-3333-3333-333333333333', documentChunkId: 'chunk-3', citationKey: 'ep33333333333333333333333333333333', title: 'Extra Paper', excerpt: 'Undeclared passage', similarityScore: 0.8 },
  ];

  return (
    <ThemeProvider>
      <label>
        <input type="checkbox" checked={instructor} onChange={(event) => setInstructor(event.target.checked)} />
        Instructor mode
      </label>
      <button type="button" onClick={() => setMountKey((key) => key + 1)}>Remount panel</button>
      <div data-testid="toasts">{toasts.map((message, index) => <p key={index}>{message}</p>)}</div>
      <div key={mountKey}>
        <ContextPanel
          compact
          isOpen
          width="24rem"
          activeTab="Source"
          setActiveTab={() => {}}
          showToast={showToast}
          sources={sources}
          isUploading={false}
          setIsUploading={() => {}}
          project={{ id: 'project-1' }}
          setViewerFile={() => {}}
          fetchSources={async () => {}}
          onOpenSourceMap={() => {}}
          paperReferences={references}
          referencesLoading={loading}
          referencesError={error}
          referenceSourceIds={referenceSourceIds}
          canMutateReferences={!instructor}
          onAddReference={handleAdd}
          onRemoveReference={handleRemove}
          onReferencesChanged={reload}
          selectedPaper={{ id: paperId }}
          isLocked={false}
        />
      </div>
      <InlineCitationCard
        open
        finding={{ type: 'UNSUBSTANTIATED_CLAIM', evidence: [], excerpt: 'Claim needs support', startOffset: 0, endOffset: 5 }}
        findingIndex={0}
        findingCount={1}
        candidates={cardCandidates}
        sources={sources}
        referenceSourceIds={referenceSourceIds}
        review={null}
        canInsertCitation
        onInsertCitation={(finding, candidate) => {
          window.__inserted = [...(window.__inserted || []), candidate.citationKey];
        }}
        onOpenPassage={(passage) => {
          window.__opened = [...(window.__opened || []), passage.documentId];
        }}
        onClose={() => {}}
        anchor={{ left: 400, top: 200, bottom: 220 }}
      />
    </ThemeProvider>
  );
}

createRoot(document.getElementById('root')).render(<Fixture />);
