import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { EntityCard, Modal, EmptyState, TourLauncher, AppHeader } from '../../components';
import { instructorText, commonText } from '../../locales';
import { useLanguage } from '../../context/LanguageContext';
import { useCollections } from '../../hooks/useCollections';
import api from '../../api';
import SourceLibraryPanel from './SourceLibraryPanel';

export default function CollectionList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { language } = useLanguage();
  const t = instructorText[language];
  const ct = commonText[language];
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    api.get('/api/collection-categories').then(r => setCategories(r.data)).catch(() => {});
  }, []);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const { content: collections, loading, error, refetch } = useCollections(0, 100, 'createdAt,desc', search || undefined, categoryFilter || undefined);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const activeView = searchParams.get('tab') === 'sources' ? 'sources' : 'collections';

  const selectView = (view) => {
    const nextParams = new URLSearchParams(searchParams);
    if (view === 'sources') nextParams.set('tab', 'sources');
    else nextParams.delete('tab');
    setSearchParams(nextParams);
  };

  const tourSteps = [
    { element: '#collection-grid', popover: { title: t.browseCollections, description: t.browseCollectionsDesc, side: 'top', align: 'start' } },
    { element: '#create-collection-btn', popover: { title: t.createCollection, description: t.createCollectionDesc, side: 'left', align: 'center' } },
  ];

  const handleEdit = (col) => {
    setEditing(col.id);
    setName(col.name);
    setDescription(col.description || '');
    setCategoryId(col.categoryId || '');
    setModalOpen(true);
  };

  const handleDelete = async (id) => {
    if (!id || deletingId) return;
    setDeletingId(id);
    try {
      await api.delete(`/api/collections/${id}`);
      await refetch();
    } catch { alert(t.deleteCollectionFailed); }
    finally { setDeletingId(null); }
  };

  const resetForm = () => { setName(''); setDescription(''); setCategoryId(''); setEditing(null); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      if (editing) {
        await api.put(`/api/collections/${editing}`, { name: name.trim(), description: description.trim() || null, categoryId: categoryId || null });
      } else {
        await api.post('/api/collections', { name: name.trim(), description: description.trim() || null, categoryId: categoryId || null });
      }
      await refetch();
      resetForm(); setModalOpen(false);
    } catch { alert(t.saveCollectionFailed); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="min-h-screen bg-(--page-bg) text-(--text-primary)">
      <AppHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 border-b border-(--border) pb-6">
          <div>
            <div className="mb-2">
              <Link to="/instructor/dashboard" className="text-xs font-bold text-(--text-tertiary) hover:text-(--brand-foreground) transition-colors">&larr; {ct.back}</Link>
            </div>
            <h1 className="text-3xl font-black text-(--brand-foreground) tracking-tight">{t.collections}</h1>
            <p className="text-xs text-(--text-tertiary) mt-1">{t.collectionsManagerDesc}</p>
          </div>
        </div>

        <div role="tablist" aria-label={t.collectionsManager} className="mb-6 inline-flex w-full rounded-xl border border-(--border) bg-(--surface-secondary) p-1 sm:w-auto">
          <button id="collections-tab" type="button" role="tab" aria-selected={activeView === 'collections'} aria-controls="collections-panel"
            onClick={() => selectView('collections')}
            className={`flex-1 cursor-pointer rounded-lg px-5 py-2.5 text-xs font-black transition-colors focus:outline-none focus:ring-2 focus:ring-(--focus) sm:flex-none ${activeView === 'collections'
              ? 'bg-(--surface) text-(--brand-foreground) shadow-sm'
              : 'text-(--text-tertiary) hover:text-(--text-primary)'}`}>
            {t.collections}
          </button>
          <button id="source-library-tab" type="button" role="tab" aria-selected={activeView === 'sources'} aria-controls="source-library-panel"
            onClick={() => selectView('sources')}
            className={`flex-1 cursor-pointer rounded-lg px-5 py-2.5 text-xs font-black transition-colors focus:outline-none focus:ring-2 focus:ring-(--focus) sm:flex-none ${activeView === 'sources'
              ? 'bg-(--surface) text-(--brand-foreground) shadow-sm'
              : 'text-(--text-tertiary) hover:text-(--text-primary)'}`}>
            {t.sourceLibrary}
          </button>
        </div>

        {activeView === 'collections' ? (
          <section id="collections-panel" role="tabpanel" aria-labelledby="collections-tab">
            <div className="mb-6 flex flex-col items-stretch gap-3 rounded-2xl border border-(--border) bg-(--surface) p-4 shadow-sm sm:flex-row sm:items-center sm:justify-end">
              <input type="search" value={search} onChange={(e) => { setSearch(e.target.value); }}
                placeholder={ct.search} aria-label={ct.search}
                className="w-full rounded-xl border border-(--border) bg-(--surface-secondary) px-3 py-2 text-xs font-medium text-(--text-primary) transition-colors focus:outline-none focus:ring-2 focus:ring-(--focus) sm:w-56" />
              <select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); }} aria-label={t.filterCategory}
                className="w-full rounded-xl border border-(--border) bg-(--surface-secondary) px-3 py-2 text-xs font-medium text-(--text-primary) transition-colors focus:outline-none focus:ring-2 focus:ring-(--focus) sm:w-44">
                <option value="">{t.filterCategory}</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button id="create-collection-btn" onClick={() => setModalOpen(true)}
                className="cursor-pointer whitespace-nowrap rounded-xl bg-(--brand) px-5 py-2.5 text-xs font-black text-(--on-brand) shadow-sm transition-colors hover:bg-(--brand-hover) focus:outline-none focus:ring-2 focus:ring-(--focus)">
                + {t.createCollection}
              </button>
            </div>

            {error && (
              <div className="p-4 mb-6 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-xs font-bold">{error}</div>
            )}

            <div id="collection-grid">
              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1,2,3,4,5,6].map(i => <div key={i} className="h-28 bg-(--surface-tertiary) rounded-xl animate-pulse" />)}
                </div>
              ) : collections.length === 0 ? (
                <EmptyState title={t.noCollections} description={t.createCollection}
                  action={<button onClick={() => setModalOpen(true)}
                    className="cursor-pointer px-4 py-2 bg-(--brand) text-(--on-brand) font-bold text-xs rounded-xl hover:bg-(--brand-hover) transition-colors focus:outline-none focus:ring-2 focus:ring-(--focus)">{t.createCollection}</button>} />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {collections.map(col => (
                    <EntityCard key={col.id}
                      title={col.name}
                      subtitle={col.description || '\u2014'}
                      onClick={() => navigate(`/instructor/collections/${col.id}`)}
                      onEdit={() => handleEdit(col)}
                      onDelete={() => handleDelete(col.id)}
                      editLabel={ct.edit}
                      deleteLabel={deletingId === col.id ? ct.saving : ct.delete}
                      deleteConfirmMessage={t.deleteConfirm}
                      deleteCancelLabel={ct.cancel}
                      deleteDisabled={deletingId !== null}>
                      <div className="flex items-center gap-3 text-[10px] text-(--text-tertiary) font-mono">
                        {col.categoryName && <span className="bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded border border-indigo-200">{col.categoryName}</span>}
                        <span>{t.created}: {new Date(col.createdAt).toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-US')}</span>
                      </div>
                    </EntityCard>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : (
          <div id="source-library-panel" role="tabpanel" aria-labelledby="source-library-tab">
            <SourceLibraryPanel />
          </div>
        )}
      </main>

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); resetForm(); }} title={editing ? t.editCollection : t.createCollection} closeLabel={ct.close}>
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="space-y-1.5">
            <label className="text-(--text-secondary) font-black uppercase tracking-wide text-[10px]">{ct.name} <span className="text-rose-500">*</span></label>
            <input type="text" required value={name} onChange={(e) => setName(e.target.value)}
              placeholder={t.collectionNameExample}
              className="w-full px-4 py-3 bg-(--surface-secondary) border border-(--border) rounded-xl font-medium text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-(--focus) transition-colors" />
          </div>
          <div className="space-y-1.5">
            <label className="text-(--text-secondary) font-black uppercase tracking-wide text-[10px]">{ct.description}</label>
            <textarea rows="3" value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder={t.collectionDescription}
              className="w-full px-4 py-3 bg-(--surface-secondary) border border-(--border) rounded-xl font-medium text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-(--focus) transition-colors" />
          </div>
          <div className="space-y-1.5">
            <label className="text-(--text-secondary) font-black uppercase tracking-wide text-[10px]">{t.category}</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-4 py-3 bg-(--surface-secondary) border border-(--border) rounded-xl font-medium text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-(--focus) transition-colors">
              <option value="">{t.noCategory}</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3 pt-4 border-t border-(--border-light) font-bold">
            <button type="button" onClick={() => { setModalOpen(false); resetForm(); }}
              className="flex-1 py-3 bg-(--surface-secondary) hover:bg-(--surface-tertiary) text-(--text-secondary) rounded-xl transition-colors text-center border border-(--border)">{ct.cancel}</button>
            <button type="submit" disabled={submitting}
              className="flex-1 py-3 bg-(--brand) text-(--on-brand) rounded-xl hover:bg-(--brand-hover) transition-colors shadow-md disabled:opacity-50 text-center">
              {submitting ? ct.saving : ct.create}
            </button>
          </div>
        </form>
      </Modal>

      {activeView === 'collections' && <TourLauncher steps={tourSteps} tourKey="instructor-collections" />}
    </div>
  );
}
