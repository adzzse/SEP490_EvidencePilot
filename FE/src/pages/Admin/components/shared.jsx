import { useState, useEffect, useCallback, Component } from 'react';
import { useTranslation } from 'react-i18next';

class SectionBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Admin section crashed:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 flex items-center justify-center bg-(--page-bg) min-h-[50vh]">
          <div className="bg-(--surface) rounded-2xl border border-(--border) p-8 text-center max-w-md shadow-sm">
            <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 mx-auto mb-4">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <h3 className="font-bold text-(--text-primary) text-sm">{t('admin.sectionCrashedTitle')}</h3>
            <p className="text-xs text-(--text-tertiary) font-medium mt-1 mb-4">{t('admin.sectionCrashedBody')}</p>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="px-4 py-2 bg-[#0c162e] hover:bg-[#152447] text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
            >
              {t('admin.reloadSection')}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}


function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-4 p-6">
      <div className="h-6 bg-gray-200 rounded w-1/3" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="h-24 bg-gray-200 rounded-2xl" />
        <div className="h-24 bg-gray-200 rounded-2xl" />
        <div className="h-24 bg-gray-200 rounded-2xl" />
      </div>
      <div className="h-64 bg-gray-200 rounded-2xl" />
    </div>
  );
}


function ErrorBlock({ msg, onRetry }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between p-4 mx-6 mt-4 bg-rose-50 border border-rose-200 rounded-xl">
      <span className="text-sm font-medium text-rose-700">{msg}</span>
      {onRetry && <button onClick={onRetry} className="text-sm font-bold text-rose-700 underline hover:no-underline">{t('admin.retry')}</button>}
    </div>
  );
}


function StatCard({ label, value, sub, icon, iconBg }) {
  return (
    <div className="bg-(--surface) p-5 rounded-2xl shadow-sm border border-(--border-light) flex items-center justify-between min-h-[105px]">
      <div className="space-y-1">
        <span className="text-[10px] font-bold text-(--text-tertiary) uppercase tracking-wider block">{label}</span>
        <div className="text-2xl font-black text-(--text-primary)">{value}</div>
        {sub && <div className="text-[10px] text-(--text-secondary) font-semibold flex items-center gap-1 mt-0.5">{sub}</div>}
      </div>
      {icon && (
        <div className={`w-9 h-9 rounded-full flex items-center justify-center ${iconBg || 'bg-blue-50 text-blue-600'} shrink-0`}>
          {icon}
        </div>
      )}
    </div>
  );
}

/* ----- SECTIONS ----- */


function JsonTree({ data }) {
  if (data === null || data === undefined) return <span className="text-(--text-tertiary)">null</span>;
  if (typeof data !== 'object') {
    return <span className={typeof data === 'string' ? 'text-emerald-700' : 'text-blue-700'}>{JSON.stringify(data)}</span>;
  }
  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="text-(--text-tertiary)">[]</span>;
    return (
      <div className="pl-3 border-l border-(--border-light) space-y-0.5">
        {data.map((v, i) => (
          <div key={i}><span className="text-(--text-tertiary) text-[10px] font-bold">[{i}]</span>{' '}<JsonTree data={v} /></div>
        ))}
      </div>
    );
  }
  const entries = Object.entries(data);
  if (entries.length === 0) return <span className="text-(--text-tertiary)">{'{}'}</span>;
  return (
    <div className="pl-3 border-l border-(--border-light) space-y-0.5">
      {entries.map(([k, v]) => (
        <div key={k} className="break-words">
          <span className="text-rose-600 font-bold">{k}</span>
          <span className="text-gray-300">: </span>
          <JsonTree data={v} />
        </div>
      ))}
    </div>
  );
}


export { SectionBoundary, PageSkeleton, ErrorBlock, StatCard, JsonTree };
