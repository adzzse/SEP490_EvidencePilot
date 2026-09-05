import { useState } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';

const HEADERS = ['First Name', 'Last Name', 'Student Code', 'Email', 'Role'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_RE = /^[A-Z]{2}\d{6}$/;

function normalizeRow(raw, headerIndex) {
  const cell = (name) => {
    const i = headerIndex[name.toLowerCase()];
    if (i == null) return '';
    return String(raw[i] ?? '').trim();
  };
  return {
    firstName: cell('First Name'),
    lastName: cell('Last Name'),
    studentCode: cell('Student Code').toUpperCase(),
    email: cell('Email').toLowerCase(),
    role: cell('Role').toUpperCase(),
  };
}

export default function UserImportModal({ lang, api, onClose, onDone }) {
  const [phase, setPhase] = useState('idle'); // idle | preflight | importing | done
  const [validRows, setValidRows] = useState([]);
  const [preflightErrors, setPreflightErrors] = useState([]);
  const [serverResult, setServerResult] = useState(null);
  const [error, setError] = useState('');
  const [devBypass, setDevBypass] = useState(false);

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([
      { 'First Name': 'An', 'Last Name': 'Nguyen', 'Student Code': 'SE170608', 'Email': 'an.nguyen@example.com', 'Role': 'STUDENT' },
      { 'First Name': 'Binh', 'Last Name': 'Tran', 'Student Code': '', 'Email': 'binh.tran@example.com', 'Role': 'INSTRUCTOR' },
    ], { header: HEADERS });
    ws['!cols'] = HEADERS.map(() => ({ wch: 22 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Users');
    XLSX.writeFile(wb, 'users-import-template.xlsx');
  };

  const auditRows = (rows) => {
    const errors = [];
    const valid = [];
    const seenEmails = new Set();
    rows.forEach((r, idx) => {
      const rowNumber = idx + 2; // +1 header, +1 one-based
      const rowErrors = [];
      if (!EMAIL_RE.test(r.email)) rowErrors.push(lang.errEmail);
      if (!r.firstName || !r.lastName) rowErrors.push(lang.errName);
      if (r.role !== 'STUDENT' && r.role !== 'INSTRUCTOR') {
        rowErrors.push(lang.errAdminRole);
      } else if (r.role === 'STUDENT') {
        if (!r.studentCode) rowErrors.push(lang.errMissingCode);
        else if (!CODE_RE.test(r.studentCode)) rowErrors.push(lang.errInvalidCode);
      } else if (r.studentCode) {
        rowErrors.push(lang.errMissingCode);
      }
      if (r.email && seenEmails.has(r.email)) rowErrors.push(lang.errDuplicate);
      seenEmails.add(r.email);
      if (rowErrors.length === 0) valid.push(r);
      else errors.push({ row: rowNumber, email: r.email || '—', errors: rowErrors });
    });
    return { valid, errors };
  };

  const handleFile = async (file) => {
    if (!file) return;
    setError(''); setServerResult(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (matrix.length < 2) throw new Error(lang.preflightNoValid);
      const headerIndex = {};
      matrix[0].forEach((h, i) => { headerIndex[String(h).trim().toLowerCase()] = i; });
      const rows = matrix.slice(1)
        .filter((r) => r.some((c) => String(c ?? '').trim() !== ''))
        .map((r) => normalizeRow(r, headerIndex));
      const { valid, errors } = auditRows(rows);
      setValidRows(valid);
      setPreflightErrors(errors);
      setPhase('preflight');
    } catch (e) {
      setError(e.message || lang.xlsxFileRequired);
      setPhase('idle');
    }
  };

  const doImport = async () => {
    setPhase('importing'); setError(''); setServerResult(null);
    try {
      // ponytail: BE accepts one role per batch — group client-side, one call each.
      const groups = {};
      validRows.forEach((r) => { (groups[r.role] = groups[r.role] || []).push(r); });
      const merged = { created: 0, updated: 0, errors: [] };
      for (const [role, items] of Object.entries(groups)) {
        const payload = {
          role,
          devBypass,
          users: items.map((r) => ({
            email: r.email,
            firstName: r.firstName,
            lastName: r.lastName,
            ...(r.role === 'STUDENT' ? { studentCode: r.studentCode } : {}),
          })),
        };
        const { data } = await api.post('/api/admin/users/import', payload);
        merged.created += data.created || 0;
        merged.updated += data.updated || 0;
        (data.errors || []).forEach((e) => merged.errors.push(e));
      }
      setServerResult(merged);
      setPhase('done');
      onDone();
    } catch (err) {
      const result = err.response?.data?.errors ? err.response.data : null;
      setServerResult(result);
      setError(result ? '' : err.response?.data?.message || err.message);
      setPhase('preflight');
    }
  };

  const reset = () => {
    setPhase('idle'); setValidRows([]); setPreflightErrors([]);
    setServerResult(null); setError('');
  };

  // ponytail: portaled to document.body so fixed inset-0 always covers the
  // viewport — immune to ancestor transform/filter capture and scroll containers
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-xs" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="import-users-title" className="m-auto max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-(--surface) p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-4">
          <h3 id="import-users-title" className="text-lg font-bold text-(--text-primary)">{lang.importUsers}</h3>
          <button type="button" aria-label={lang.close} onClick={onClose} className="rounded-lg p-1 text-(--text-tertiary) hover:bg-(--surface-secondary) hover:text-(--text-secondary)">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <p className="mt-2 text-xs leading-5 text-(--text-secondary)">{lang.importUsersHint}</p>
        <button type="button" onClick={downloadTemplate} className="mt-2 text-xs font-bold text-(--brand-foreground) hover:underline">
          {lang.downloadTemplate}
        </button>

        {/* ponytail: dev-only bypass — stripped from production builds by Vite */}
        {import.meta.env.DEV && (
        <label className="mt-3 flex items-start gap-2.5 rounded-xl border border-(--border) bg-(--surface-secondary) p-3 cursor-pointer">
          <input
            type="checkbox"
            checked={devBypass}
            onChange={(e) => setDevBypass(e.target.checked)}
            className="mt-0.5 accent-[#1e3a8a]"
          />
          <span>
            <span className="block text-xs font-bold text-(--text-primary)">{lang.devBypass}</span>
            <span className="block text-[11px] text-(--text-secondary) mt-0.5">{lang.devBypassHint}</span>
          </span>
        </label>
        )}

        <label className="mt-4 block text-xs font-bold text-(--text-secondary)">
          <span>{lang.xlsxFile}</span>
          <input
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={e => { reset(); handleFile(e.target.files?.[0] || null); }}
            className="mt-2 block w-full cursor-pointer rounded-xl border border-(--border) bg-(--surface-secondary) px-3 py-2 text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-blue-100 file:px-3 file:py-1.5 file:font-bold file:text-blue-800"
          />
        </label>

        {error && <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">{error}</div>}

        {phase === 'preflight' && (
          <div data-guide="preflight" className="mt-4 space-y-3">
            <p className="text-xs font-bold text-(--text-primary)">
              {validRows.length > 0
                ? lang.preflightValid.replace('{n}', validRows.length)
                : lang.preflightNoValid}
            </p>
            {preflightErrors.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-amber-200">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-amber-50 text-amber-800">
                      <th className="px-3 py-2">{lang.preflightTitle}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100">
                    {preflightErrors.map((e, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 text-(--text-primary)">
                          <span className="font-bold">{lang.preflightRow} {e.row}</span>
                          {' · '}{e.email}
                          <ul className="mt-1 list-disc pl-5 text-rose-600">
                            {e.errors.map((msg, j) => <li key={j}>{msg}</li>)}
                          </ul>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex justify-end gap-2.5 pt-1">
              <button type="button" onClick={onClose} className="rounded-xl border border-(--border) px-4 py-2 text-xs font-bold text-(--text-secondary) hover:bg-(--surface-secondary)">
                {lang.cancelFixFile}
              </button>
              <button
                type="button"
                onClick={doImport}
                disabled={validRows.length === 0}
                className="rounded-xl bg-[#0c162e] px-4 py-2 text-xs font-bold text-white hover:bg-[#152447] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {lang.skipErrorsImport.replace('{n}', validRows.length)}
              </button>
            </div>
          </div>
        )}

        {phase === 'importing' && (
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs font-semibold text-blue-800">{lang.importing}</div>
        )}

        {phase === 'done' && serverResult && (
          <div role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">
            {lang.importSuccess.replace('{created}', serverResult.created).replace('{updated}', serverResult.updated)}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
