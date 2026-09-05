import { useState, useEffect, useCallback } from 'react';
function NotificationsSection({ lang, api }) {
  const [form, setForm] = useState({ message: '', role: '' });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [broadcastHistory, setBroadcastHistory] = useState([]);
  const [bhLoading, setBhLoading] = useState(true);
  const [urgency, setUrgency] = useState('Standard');
  const [toast, setToast] = useState(null);
  const [activeHistoryDetail, setActiveHistoryDetail] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchHistory = useCallback(async (signal) => {
    setBhLoading(true);
    try {
      const r = await api.get('/api/admin/notifications/broadcast-history', { signal });
      setBroadcastHistory(r.data);
    } catch (e) { /* silent */ }
    finally {
      if (!signal || !signal.aborted) setBhLoading(false);
    }
  }, [api]);

  useEffect(() => {
    const ac = new AbortController();
    fetchHistory(ac.signal);
    return () => ac.abort();
  }, [fetchHistory]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const doSend = async (e) => {
    e.preventDefault();
    if (!form.message) {
      showToast(lang.notifMsgRequired, 'error');
      return;
    }
    setSending(true);
    setResult(null);
    try {
      const payload = { message: form.message, urgent: urgency === 'Urgent' };
      if (form.role) payload.role = form.role;
      const r = await api.post('/api/admin/notifications/broadcast', payload);
      showToast(lang.broadcastSent, 'success');
      setForm({ message: '', role: '' });
      setUrgency('Standard');
      fetchHistory();
    } catch (err) {
      showToast(err.message || lang.broadcastFailed, 'error');
    } finally {
      setSending(false);
    }
  };

  const displayHistory = broadcastHistory.map((h, i) => {
    const roleStr = h.details?.role || 'ALL USERS';
    const count = h.details?.recipientCount;
    const shortMsg = h.details?.message || '';
    return {
      id: `hist-${i}`,
      title: shortMsg,
      detail: count != null
        ? lang.sentAnnouncementTo.replace('{count}', count).replace('{role}', roleStr.toLowerCase())
        : lang.sentTo.replace('{role}', roleStr.toLowerCase()),
      audience: roleStr,
      timestamp: h.occurredAt ? new Date(h.occurredAt).toLocaleString() : '—',
      status: lang.delivered,
      recipients: count
    };
  });

  const filteredHistory = displayHistory.filter(h =>
    h.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    h.detail.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-8 space-y-6 bg-(--page-bg)">
      {/* Title Area */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-(--border) pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-(--brand-foreground) tracking-tight">{lang.broadcast}</h1>
          <p className="text-gray-550 text-xs mt-1">{lang.broadcastSub}</p>
        </div>
      </div>

      {/* Main Composer Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Message Composer */}
        <form onSubmit={doSend} className="lg:col-span-2 bg-(--surface) rounded-2xl border border-(--border) p-6 shadow-sm space-y-5">
          <div className="flex items-center gap-2 border-b border-(--border-light) pb-3">
            <svg className="w-5 h-5 text-(--text-secondary)" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
            </svg>
            <h3 className="text-xs font-bold text-(--text-primary) uppercase tracking-wider">{lang.messageComposer}</h3>
          </div>

          <div>
            <label className="text-[10px] font-bold text-(--text-secondary) uppercase tracking-wider block mb-1.5">{lang.notifBody}</label>
            <div className="border border-(--border) rounded-xl overflow-hidden shadow-sm">
              {/* Rich-text Toolbar simulation */}
              <div className="flex items-center gap-1 border-b border-(--border) bg-(--surface-secondary) px-3 py-1.5 text-(--text-tertiary) text-xs font-bold">
                <button type="button" className="p-1 hover:bg-(--surface-tertiary) hover:text-(--text-primary) rounded transition font-serif font-extrabold text-[13px] w-6 h-6 flex items-center justify-center">B</button>
                <button type="button" className="p-1 hover:bg-(--surface-tertiary) hover:text-(--text-primary) rounded transition font-serif italic text-[13px] w-6 h-6 flex items-center justify-center">I</button>
                <button type="button" className="p-1 hover:bg-(--surface-tertiary) hover:text-(--text-primary) rounded transition w-6 h-6 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                  </svg>
                </button>
                <span className="w-px h-4 bg-gray-200 mx-1" />
                <button type="button" className="p-1 hover:bg-(--surface-tertiary) hover:text-(--text-primary) rounded transition w-6 h-6 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                  </svg>
                </button>
                <button type="button" className="p-1 hover:bg-(--surface-tertiary) hover:text-(--text-primary) rounded transition w-6 h-6 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                  </svg>
                </button>
              </div>
              <textarea
                value={form.message}
                onChange={e => setForm(p => ({ ...p, message: e.target.value }))}
                required
                rows={5}
                placeholder={lang.announceDraftPlaceholder}
                className="w-full border-0 px-3.5 py-3 text-xs font-semibold text-(--text-primary) focus:outline-none focus:ring-0 resize-none"
              />
            </div>
          </div>

          {/* Selector inputs */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label className="text-[10px] font-bold text-(--text-secondary) uppercase tracking-wider block mb-1">{lang.recipientSegment}</label>
              <select
                value={form.role}
                onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                className="w-full border border-gray-250 rounded-xl px-3.5 py-2 text-xs font-semibold bg-(--surface) text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">{lang.allUsers}</option>
                <option value="STUDENT">{lang.studentsOpt}</option>
                <option value="INSTRUCTOR">{lang.instructorsOpt}</option>
              </select>
            </div>

            <div className="flex-1">
              <label className="text-[10px] font-bold text-(--text-secondary) uppercase tracking-wider block mb-1">{lang.urgencyLevel}</label>
              <div className="flex bg-(--surface-tertiary) p-0.5 rounded-xl text-xs font-bold text-(--text-secondary)">
                <button
                  type="button"
                  onClick={() => setUrgency('Standard')}
                  className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer ${urgency === 'Standard' ? 'bg-(--surface) text-(--text-primary) shadow-sm' : 'hover:text-(--text-primary)'}`}
                >
                  {lang.standard}
                </button>
                <button
                  type="button"
                  onClick={() => setUrgency('Urgent')}
                  className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer ${urgency === 'Urgent' ? 'bg-(--surface) text-rose-600 shadow-sm' : 'hover:text-(--text-primary)'}`}
                >
                  {lang.urgent}
                </button>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2.5 justify-end pt-3 border-t border-(--border-light)">
            <button
              type="button"
              onClick={() => {
                if (form.message) {
                  showToast(lang.draftSaved, 'success');
                } else {
                  showToast(lang.typeMsgFirst, 'error');
                }
              }}
              className="px-4 py-2 border border-gray-255 hover:bg-(--surface-secondary) rounded-xl text-xs font-bold text-(--text-primary) transition cursor-pointer"
            >
              {lang.saveDraft}
            </button>
            <button
              type="submit"
              disabled={sending}
              className="flex items-center gap-1.5 px-4.5 py-2 bg-[#0c162e] hover:bg-[#152447] text-white rounded-xl text-xs font-bold transition shadow-sm disabled:opacity-50 cursor-pointer"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
              <span>{sending ? lang.sending : lang.sendBroadcast}</span>
            </button>
          </div>        </form>

        {/* Right Column: Broadcast History */}
        <div className="lg:col-span-1 bg-(--surface) rounded-2xl border border-(--border) shadow-sm overflow-hidden flex flex-col max-h-[600px]">
          {/* Header */}
          <div className="px-5 py-4 border-b border-(--border-light) shrink-0">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-4.5 h-4.5 text-(--text-secondary)" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="text-xs font-bold text-(--text-primary) uppercase tracking-wider">Broadcast History</h3>
            </div>
            <div className="relative">
              <svg className="w-3.5 h-3.5 text-(--text-tertiary) absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search history..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-(--surface-secondary) border border-(--border) rounded-xl text-xs font-semibold text-(--text-primary) focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Scrollable History List */}
          <div className="flex-1 overflow-y-auto divide-y divide-(--border-light)">
            {filteredHistory.length === 0 ? (
              <div className="px-5 py-12 text-center text-(--text-tertiary) text-xs font-medium">
                {bhLoading ? `${lang.loading || 'Loading'}...` : lang.noBroadcastHistory}
              </div>
            ) : filteredHistory.map((h) => (
              <div key={h.id} className="px-5 py-3.5 hover:bg-(--surface-secondary)/50 transition cursor-pointer" onClick={() => setActiveHistoryDetail(h)}>
                <p className="text-xs font-bold text-(--text-primary) truncate">{h.title}</p>
                <p className="text-[10px] text-(--text-tertiary) font-semibold mt-0.5 truncate">{h.detail}</p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-100">
                    {h.audience}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${h.status === lang.delivered ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                    <span className={`text-[9px] font-bold ${h.status === lang.delivered ? 'text-emerald-700' : 'text-(--text-secondary)'}`}>
                      {h.status}
                    </span>
                  </div>
                  <span className="text-[9px] text-(--text-tertiary) font-mono ml-auto">{h.timestamp}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="px-5 py-2.5 border-t border-gray-150 bg-(--surface-secondary)/50 text-[10px] font-semibold text-(--text-secondary) shrink-0">
            {lang.showingLogs.replace('{shown}', filteredHistory.length).replace('{total}', displayHistory.length)}
          </div>
        </div>
      </div>

      {/* Custom Broadcast Detail Analytics Modal */}
      {activeHistoryDetail && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-(--surface) rounded-2xl max-w-md w-full shadow-2xl border border-gray-150 overflow-hidden transform scale-100 transition-all duration-300">
            {/* Modal Header */}
            <div className="bg-(--surface-secondary) border-b border-gray-150 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                  <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2m0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h3 className="font-bold text-(--text-primary) text-sm">Broadcast Delivery Analytics</h3>
              </div>
              <button
                onClick={() => setActiveHistoryDetail(null)}
                className="text-(--text-tertiary) hover:text-(--text-secondary) transition cursor-pointer"
              >
                <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-5 space-y-4 text-xs">
              <div>
                <span className="text-[10px] font-bold text-(--text-tertiary) uppercase tracking-wider block mb-1">Message Content</span>
                <p className="font-bold text-(--text-primary) break-all">{activeHistoryDetail.title}</p>
                <p className="text-[11px] text-(--text-secondary) font-semibold leading-relaxed mt-1">{activeHistoryDetail.detail}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[10px] font-bold text-(--text-tertiary) uppercase tracking-wider block mb-1">Target Audience</span>
                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100">
                    {activeHistoryDetail.audience}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-(--text-tertiary) uppercase tracking-wider block mb-1">Total Recipients</span>
                  <p className="font-bold text-(--text-primary)">{activeHistoryDetail.recipients} accounts</p>
                </div>
              </div>

              <div>
                <span className="text-[10px] font-bold text-(--text-tertiary) uppercase tracking-wider block mb-1">Broadcast Timestamp</span>
                <p className="font-semibold text-(--text-secondary)">{activeHistoryDetail.timestamp}</p>
              </div>

              <div className="bg-(--surface-secondary) border border-(--border-light) rounded-xl p-3.5 mt-2">
                <span className="text-[10px] font-bold text-(--text-secondary) uppercase tracking-wider block mb-1">Delivery Insights Summary</span>
                <p className="text-[11px] text-(--text-secondary) font-semibold mt-2">No delivery analytics data available</p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-(--surface-secondary) px-6 py-3.5 border-t border-gray-150 flex items-center justify-end">
              <button
                onClick={() => setActiveHistoryDetail(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition shadow-md cursor-pointer"
              >
                {lang.close}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Toast Notification Popup */}
      {toast && (
        <div className="fixed top-4 right-4 z-55 flex items-center gap-2.5 px-4.5 py-3 rounded-2xl shadow-xl border animate-slide-in-right bg-(--surface) border-(--border-light)">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${toast.type === 'error' ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'
            }`}>
            {toast.type === 'error' ? (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
          <span className="text-xs font-bold text-(--text-primary)">{toast.message}</span>
        </div>
      )}
    </div>
  );
}



export { NotificationsSection };
