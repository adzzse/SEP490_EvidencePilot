import Modal from '../../ui/Modal.jsx';

export default function StandardRequirementsModal({
  open,
  section,
  requirements = [],
  title,
  requirementsLabel,
  emptyLabel,
  closeLabel,
  onClose,
}) {
  const visibleRequirements = requirements.filter(Boolean);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={section ? `${title} — ${section.sectionTitle}` : title}
      closeLabel={closeLabel}
    >
      <div data-testid="standard-viewer" className="space-y-3 text-xs">
        <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{requirementsLabel}</div>
        {visibleRequirements.length > 0 ? (
          <ul className="space-y-2">
            {visibleRequirements.map((requirement, index) => (
              <li key={`${requirement}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
                {requirement}
              </li>
            ))}
          </ul>
        ) : (
          <p className="italic text-slate-400">{emptyLabel}</p>
        )}
      </div>
    </Modal>
  );
}
