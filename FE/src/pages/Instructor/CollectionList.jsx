import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { EntityCard, Modal, EmptyState, AppHeader, Breadcrumb } from '../../components';
import { instructorText, commonText } from '../../locales';
import { useLanguage } from '../../context/LanguageContext';
import { useCollections } from '../../hooks/useCollections';
import { PAGINATION_LIMIT } from '../../utils/constants';
import { formatDate } from '../../utils/formatters/date';
import api from '../../services/api';

export default function CollectionList() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const t = instructorText[language];
  const ct = commonText[language];
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    api.get('/api/collection-categories').then(r => setCategories(r.data)).catch(() => {});
  }, []);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [page, setPage] = useState(0);
  const [isGridView, setIsGridView] = useState(true);
  const [showGuide, setShowGuide] = useState(false);

  const { content: collections, totalPages, totalElements, loading, error, refetch } = useCollections(
    page,
    PAGINATION_LIMIT,
    'createdAt,desc',
    search || undefined,
    categoryFilter || undefined
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const handleEdit = (col) => {
    setEditing(col.id);
    setName(col.name);
    setDescription(col.description || '');
    setCategoryId(col.categoryId || '');
    setModalOpen(true);
  };

  const resetForm = () => {
    setEditing(null);
    setName('');
    setDescription('');
    setCategoryId('');
  };

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

  const handleDelete = async (id) => {
    if (!id || deletingId) return;
    setDeletingId(id);
    try {
      await api.delete(`/api/collections/${id}`);
      await refetch();
    } catch { alert(t.deleteCollectionFailed); }
    finally { setDeletingId(null); }
  };

  return (
    <div className="min-h-screen bg-(--background) text-(--text-primary)">
      <AppHeader />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Breadcrumb
          items={[
            { label: t.dashboard, path: '/instructor/dashboard' },
            { label: t.collections }
          ]}
        />

        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6 border-b border-(--border) pb-6">
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-black text-(--brand-foreground) tracking-tight">{t.collections}</h1>
            <p className="text-xs text-(--text-tertiary) mt-1">{t.collectionsManagerDesc}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <input
              type="search"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              placeholder={ct.search}
              aria-label={ct.search}
              className="w-full sm:w-52 rounded-xl border border-(--border) bg-(--surface-secondary) px-3 py-2 text-xs font-medium text-(--text-primary) transition-colors focus:outline-none focus:ring-2 focus:ring-(--focus)"
            />
            <select
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value); setPage(0); }}
              aria-label={t.filterCategory}
              className="w-full sm:w-40 rounded-xl border border-(--border) bg-(--surface-secondary) px-3 py-2 text-xs font-medium text-(--text-primary) transition-colors focus:outline-none focus:ring-2 focus:ring-(--focus) [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              <option value="">{t.filterCategory}</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="flex items-center bg-(--surface-secondary) border border-(--border) rounded-xl p-0.5">
              <button
                type="button"
                onClick={() => setIsGridView(true)}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${isGridView ? 'bg-(--surface) text-(--brand-foreground) shadow-xs' : 'text-(--text-tertiary) hover:text-(--text-primary)'}`}
                title="Grid View"
                aria-label="Grid View"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
              </button>
              <button
                type="button"
                onClick={() => setIsGridView(false)}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${!isGridView ? 'bg-(--surface) text-(--brand-foreground) shadow-xs' : 'text-(--text-tertiary) hover:text-(--text-primary)'}`}
                title="List View"
                aria-label="List View"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
              </button>
            </div>
            <button
              onClick={() => setShowGuide(true)}
              className="shrink-0 inline-flex items-center gap-2 px-3 py-2 bg-(--surface) border border-(--border) rounded-xl text-xs font-bold text-(--text-secondary) hover:text-(--brand-foreground) hover:border-(--brand) transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" /></svg>
              {ct.guide || 'Guide'}
            </button>
            <button
              id="create-collection-btn"
              onClick={() => setModalOpen(true)}
              className="cursor-pointer whitespace-nowrap rounded-xl bg-(--brand) px-4 py-2 text-xs font-black text-(--on-brand) shadow-xs transition-colors hover:bg-(--brand-hover) focus:outline-none focus:ring-2 focus:ring-(--focus)"
            >
              + {t.createCollection}
            </button>
          </div>
        </div>

        {error && (
          <div className="p-4 mb-6 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-xs font-bold">{error}</div>
        )}

        <div id="collection-grid">
          {loading ? (
            <div className={isGridView ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" : "space-y-3"}>
              {[1,2,3,4,5,6].map(i => <div key={i} className="h-28 bg-(--surface-tertiary) rounded-xl animate-pulse" />)}
            </div>
          ) : collections.length === 0 ? (
            <EmptyState title={t.noCollections} description={t.createCollection}
              action={<button onClick={() => setModalOpen(true)}
                className="cursor-pointer px-4 py-2 bg-(--brand) text-(--on-brand) font-bold text-xs rounded-xl hover:bg-(--brand-hover) transition-colors focus:outline-none focus:ring-2 focus:ring-(--focus)">{t.createCollection}</button>} />
          ) : isGridView ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {collections.map(col => (
                <EntityCard key={col.id}
                  className="hover:-translate-y-1 hover:shadow-lg transition-all duration-200"
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
                  <div className="flex flex-wrap items-center gap-2 text-[10px] text-(--text-tertiary) font-mono">
                    <span className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800 font-bold">
                      {col.totalSources ?? 0} {language === 'vi' ? 'tài liệu' : 'sources'}
                    </span>
                    {col.categoryName && <span className="bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded border border-indigo-200">{col.categoryName}</span>}
                    <span>{t.created}: {formatDate(col.createdAt, language)}</span>
                  </div>
                </EntityCard>
              ))}
            </div>
          ) : (
            <div className="bg-(--surface) rounded-2xl border border-(--border) divide-y divide-(--border-light) shadow-sm overflow-hidden">
              {collections.map(col => (
                <div key={col.id} className="p-4 flex items-center justify-between hover:bg-(--surface-secondary) transition-colors gap-4">
                  <div className="min-w-0 flex-1 cursor-pointer" onClick={() => navigate(`/instructor/collections/${col.id}`)}>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-sm text-(--text-primary) hover:text-(--brand-foreground) transition-colors truncate">{col.name}</h3>
                      <span className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 px-2 py-0.5 rounded text-[10px] border border-emerald-200 dark:border-emerald-800 font-bold shrink-0">
                        {col.totalSources ?? 0} {language === 'vi' ? 'tài liệu' : 'sources'}
                      </span>
                    </div>
                    <p className="text-xs text-(--text-secondary) line-clamp-1 mt-0.5">{col.description || '—'}</p>
                    <div className="flex items-center gap-3 text-[10px] text-(--text-tertiary) font-mono mt-1.5">
                      {col.categoryName && <span className="bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded border border-indigo-200">{col.categoryName}</span>}
                      <span>{t.created}: {formatDate(col.createdAt, language)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button type="button" onClick={() => handleEdit(col)} className="px-3 py-1.5 text-xs font-bold text-(--brand) hover:bg-(--brand-soft) rounded-lg transition-colors">
                      {ct.edit}
                    </button>
                    <button type="button" onClick={() => handleDelete(col.id)} disabled={deletingId !== null} className="px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-40">
                      {deletingId === col.id ? ct.saving : ct.delete}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-2 text-xs">
            <button disabled={page === 0} onClick={() => setPage(page - 1)}
              className="px-3 py-1.5 bg-(--surface) border border-(--border) rounded-lg font-bold text-(--text-secondary) hover:bg-(--surface-secondary) transition-colors disabled:opacity-30 disabled:cursor-not-allowed">{t.prev}</button>
            <span className="px-3 py-1.5 font-mono font-bold text-(--text-secondary)">{t.page} {page + 1} {t.of} {totalPages}</span>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}
              className="px-3 py-1.5 bg-(--surface) border border-(--border) rounded-lg font-bold text-(--text-secondary) hover:bg-(--surface-secondary) transition-colors disabled:opacity-30 disabled:cursor-not-allowed">{t.next}</button>
          </div>
        )}
      </main>

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); resetForm(); }} title={editing ? t.editCollection : t.createCollection} closeLabel={ct.close}>
        <form onSubmit={handleSubmit} className="space-y-4 text-xs pt-1">
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
              className="w-full px-4 py-3 bg-(--surface-secondary) border border-(--border) rounded-xl font-medium text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-(--focus) transition-colors [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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

      <Modal open={showGuide} onClose={() => setShowGuide(false)} title={language === 'vi' ? 'Hướng dẫn Quản lý Bộ sưu tập' : 'Collections Management Guide'} closeLabel={ct.close}>
        <ol className="space-y-3 text-xs">
          {[
            language === 'vi' ? 'Tạo các bộ sưu tập tài liệu chuyên đề để quản lý và chia sẻ tài liệu với sinh viên.' : 'Create thematic document collections to organize and share research sources with students.',
            language === 'vi' ? 'Sử dụng chức năng Thêm tài liệu để tải lên nhiều PDF, nạp hàng loạt theo DOI OpenAlex hoặc chọn từ Thư viện nguồn.' : 'Use Add Documents to batch upload PDFs, ingest OpenAlex DOIs, or import from your Source Library.',
            language === 'vi' ? 'Chuyển sang tab Nguồn chia sẻ (Shared Source) để theo dõi các tài liệu đang được gán vào từng đồ án cụ thể.' : 'Switch to the Shared Source tab to monitor sources linked directly to specific student projects.',
            language === 'vi' ? 'Xem đồ thị trích dẫn trực quan trong Bản đồ trực quan (Visualize Map) để khám phá mạng lưới nghiên cứu.' : 'Explore citation relationships in the Visualize Map tab powered by OpenAlex metadata.'
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="shrink-0 w-5 h-5 rounded-full bg-(--brand) text-(--on-brand) text-[10px] font-black flex items-center justify-center">{i + 1}</span>
              <span className="text-(--text-secondary) leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      </Modal>
    </div>
  );
}
