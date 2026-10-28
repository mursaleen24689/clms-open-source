import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "react-toastify";
import DOMPurify from "dompurify";

// Helper function to fetch the exact current local system date
const getSystemLocalDate = () => {
  const today = new Date();
  const offset = today.getTimezoneOffset() * 60000;
  return new Date(today.getTime() - offset).toISOString().split('T')[0];
};

// PERFECTED DATE PARSER: Strips out timezone shifts securely
const parseSavedDate = (dateStr: string) => {
  if (!dateStr || dateStr === 'Invalid Date') return getSystemLocalDate();
  try {
    if (dateStr.includes('T')) {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      }
    }
    return dateStr.split('T')[0];
  } catch {
    return dateStr.substring(0, 10);
  }
};

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────
interface Memo {
  id: number;
  memo_ref: string;
  to_field: string;
  subject: string;
  urgency: string;
  from_name: string;
  from_designation: string;
  pers_no: string;
  main_matter: string;
  copy_to: string[];
  enclosed_items: string[];
  memo_date: string;
  created_at: string;
}

interface UserData {
  name: string;
  designation: string;
  persNo: string;
}

// ─────────────────────────────────────────────
// MINI RICH-TEXT TOOLBAR
// ─────────────────────────────────────────────
function RichToolbar({ targetRef }: { targetRef: React.RefObject<HTMLDivElement | null> }) {
  const exec = (e: React.MouseEvent, cmd: string) => {
    e.preventDefault(); 
    document.execCommand(cmd, false);
    if (targetRef.current) {
      targetRef.current.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };

  return (
    <div className="flex gap-1 mb-1 border-b border-slate-200 pb-1 print:hidden">
      <button onMouseDown={(e) => exec(e, 'bold')} className="w-7 h-7 rounded font-black text-sm border border-slate-300 hover:bg-slate-100 transition-colors" title="Bold">B</button>
      <button onMouseDown={(e) => exec(e, 'underline')} className="w-7 h-7 rounded text-sm border border-slate-300 hover:bg-slate-100 transition-colors underline font-bold" title="Underline">U</button>
      <button onMouseDown={(e) => exec(e, 'italic')} className="w-7 h-7 rounded text-sm border border-slate-300 hover:bg-slate-100 transition-colors italic font-bold" title="Italic">I</button>
      <button onMouseDown={(e) => exec(e, 'insertUnorderedList')} className="w-7 h-7 rounded text-sm border border-slate-300 hover:bg-slate-100 transition-colors font-bold" title="Bullet List">•≡</button>
      <button onMouseDown={(e) => exec(e, 'insertOrderedList')} className="w-7 h-7 rounded text-sm border border-slate-300 hover:bg-slate-100 transition-colors font-bold" title="Numbered List">1≡</button>
    </div>
  );
}

// ─────────────────────────────────────────────
// PRINT PREVIEW
// ─────────────────────────────────────────────
function MemoPrintView({ memo }: { memo: Memo }) {
  const cleanDateStr = parseSavedDate(memo.memo_date);
  const dateParts = cleanDateStr.split('-');
  const formattedDate = dateParts.length === 3 
    ? new Date(Number(dateParts[0]), Number(dateParts[1]) - 1, Number(dateParts[2])).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
    : cleanDateStr;

  return (
    <div
      id="memo-print-area"
      className="bg-white mx-auto box-border text-black text-[12pt] relative w-[210mm] min-h-[297mm] print:w-full print:h-full print:min-h-0 print:m-0"
      style={{ fontFamily: '"Times New Roman", Times, serif' }}
    >
      <div className="flex justify-between items-start mb-3">
        <div className="w-[30mm]">
          <img src="/logo.png" alt="University logo" className="w-[25mm] h-[25mm] object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />
        </div>
        <div className="w-[35mm] flex flex-col items-end">
          <img src="/logo2.png" alt="Department logo" className="w-[25mm] h-[25mm] object-contain grayscale" onError={(e) => e.currentTarget.style.display = 'none'} />
          <div className="text-[10pt] font-bold mt-1 tracking-tight">FORM REF 02/01</div>
        </div>
      </div>

      <div className="flex justify-between items-end mb-3 w-full">
        <h1 className="text-[20pt] font-bold underline uppercase">Internal Memo</h1>
        <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-[11pt] font-bold text-left w-[45%] mb-0.5">
          <div className="flex items-center gap-2"><div className="w-4 h-4 border-[1.5px] border-black flex items-center justify-center font-black text-[11pt] pb-0.5">{memo.urgency === 'URGENT' ? '✓' : ''}</div>URGENT</div>
          <div className="flex items-center gap-2"><div className="w-4 h-4 border-[1.5px] border-black flex items-center justify-center font-black text-[11pt] pb-0.5">{memo.urgency === 'INFO ONLY' ? '✓' : ''}</div>INFO ONLY</div>
          <div className="flex items-center gap-2"><div className="w-4 h-4 border-[1.5px] border-black flex items-center justify-center font-black text-[11pt] pb-0.5">{memo.urgency === 'IMMEDIATE' ? '✓' : ''}</div>IMMEDIATE</div>
          <div className="flex items-center gap-2"><div className="w-4 h-4 border-[1.5px] border-black flex items-center justify-center font-black text-[11pt] pb-0.5">{memo.urgency === 'ROUTINE' ? '✓' : ''}</div>ROUTINE</div>
        </div>
      </div>

      <table className="w-full border-collapse border border-black text-[12pt] mb-4 table-fixed">
        <tbody>
          <tr>
            <td className="border border-black p-1.5 font-bold w-[12%] align-top">To:</td>
            <td className="border border-black p-1.5 w-[43%] align-top break-words" style={{ lineHeight: '1.3' }}>{memo.to_field}</td>
            <td className="border border-black p-1.5 font-bold w-[12%] align-top">From:</td>
            <td className="border border-black p-1.5 w-[33%] align-top break-words" style={{ lineHeight: '1.3' }}>{memo.from_name}</td>
          </tr>
          <tr>
            <td rowSpan={2} className="border border-black p-1.5 font-bold align-top">Subject:</td>
            <td rowSpan={2} className="rich-text-content border border-black p-1.5 align-top break-words overflow-wrap-anywhere" style={{ lineHeight: '1.3', wordBreak: 'break-word' }}>
              <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(memo.subject) }} />
            </td>
            <td className="border border-black p-1.5 font-bold align-top">Ref:</td>
            <td className="border border-black p-1.5 align-top break-words" style={{ lineHeight: '1.3' }}>{memo.memo_ref || 'MYD-'}</td>
          </tr>
          <tr>
            <td className="border border-black p-1.5 font-bold align-top">Date:</td>
            <td className="border border-black p-1.5 align-top break-words" style={{ lineHeight: '1.3' }}>{formattedDate}</td>
          </tr>
        </tbody>
      </table>

      <div className="rich-text-content border border-black p-3 text-[12pt] text-justify mb-4 break-words" style={{ lineHeight: '1.4', overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
        <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(memo.main_matter) }} />
      </div>

      <div className="flex justify-between items-start text-[11pt]">
        <div className="w-[50%] pr-4">
          {memo.copy_to && memo.copy_to.length > 0 && memo.copy_to[0] !== '' && (
            <div className="mb-3">
              <div className="font-bold underline mb-1 uppercase">COPY TO:</div>
              <div className="space-y-0">
                {memo.copy_to.filter(c => c.trim()).map((item, i) => (
                  <div key={i} className="flex gap-2 leading-tight"><span>{i + 1}.</span><span className="break-words">{item}</span></div>
                ))}
              </div>
            </div>
          )}

          {memo.enclosed_items && memo.enclosed_items.length > 0 && memo.enclosed_items[0] !== '' && (
            <div>
              <div className="font-bold underline mb-1 uppercase">ENCLOSED:</div>
              <div className="space-y-0">
                {memo.enclosed_items.filter(e => e.trim()).map((item, i) => (
                  <div key={i} className="flex gap-2 leading-tight"><span>{i + 1}.</span><span className="break-words">{item}</span></div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="w-[50%] flex flex-col items-end text-center mt-12">
          <div className="w-[72mm]">
            <div className="w-full border-b-[1.5px] border-black mb-1.5"></div>
            <div className="font-bold text-[12pt]">({memo.from_name})</div>
            <div className="text-[11pt] mt-0.5">{memo.from_designation}</div>
            <div className="text-[10pt] mt-0.5 font-medium">Department of Engineering</div>
            {memo.pers_no && <div className="text-[9.5pt] mt-1 text-black font-medium">Pers No: {memo.pers_no}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN MEMO SYSTEM COMPONENT
// ─────────────────────────────────────────────
export default function MemoSystem({ userData }: { userData: UserData | null }) {
  const [view, setView] = useState<'list' | 'compose' | 'preview'>('list');

  const [memos, setMemos] = useState<Memo[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeMemo, setActiveMemo] = useState<Memo | null>(null);

  const [toField, setToField] = useState('');
  const [urgency, setUrgency] = useState('ROUTINE');
  const [memoRef, setMemoRef] = useState('MYD-');
  const [memoDate, setMemoDate] = useState(getSystemLocalDate());
  const [copyToItems, setCopyToItems] = useState<string[]>(['']);
  const [enclosedItems, setEnclosedItems] = useState<string[]>(['']);
  const [isSaving, setIsSaving] = useState(false);

  const subjectRef = useRef<HTMLDivElement>(null);
  const matterRef = useRef<HTMLDivElement>(null);

  const token = sessionStorage.getItem('token') || '';
  const username = sessionStorage.getItem('username') || localStorage.getItem('username') || '';

  const getHeaders = () => ({
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  });

  const fetchMemos = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/memos?username=${username}&_t=${Date.now()}`, { headers: getHeaders() });
      const data = await res.json();
      setMemos(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Failed to load memo records.');
    } finally {
      setIsLoading(false);
    }
  }, [username, token]);

  useEffect(() => {
    fetchMemos();
  }, [fetchMemos]);

  const resetForm = () => {
    setToField('');
    setUrgency('ROUTINE');
    setMemoRef('MYD-');
    setMemoDate(getSystemLocalDate());
    setCopyToItems(['']);
    setEnclosedItems(['']);
    if (subjectRef.current) subjectRef.current.innerHTML = '';
    if (matterRef.current) matterRef.current.innerHTML = '';
  };

  const openCompose = () => {
    resetForm();
    setActiveMemo(null);
    setView('compose');
  };

  const openEdit = (memo: Memo) => {
    setToField(memo.to_field);
    setUrgency(memo.urgency);
    setMemoRef(memo.memo_ref || 'MYD-');
    setMemoDate(parseSavedDate(memo.memo_date));
    setCopyToItems(memo.copy_to?.length ? memo.copy_to : ['']);
    setEnclosedItems(memo.enclosed_items?.length ? memo.enclosed_items : ['']);
    setActiveMemo(memo);
    setView('compose');
    setTimeout(() => {
      if (subjectRef.current) subjectRef.current.innerHTML = DOMPurify.sanitize(memo.subject || '');
      if (matterRef.current) matterRef.current.innerHTML = DOMPurify.sanitize(memo.main_matter || '');
    }, 50);
  };

  const openPreview = (memo: Memo) => {
    setActiveMemo(memo);
    setView('preview');
  };

  const handleSave = async () => {
    if (!toField.trim()) { toast.error('Please fill in the "To" field.'); return; }
    const subjectHtml = subjectRef.current?.innerHTML || '';
    const matterHtml = matterRef.current?.innerHTML || '';
    if (!subjectHtml.trim() || subjectHtml === '<br>') { toast.error('Subject cannot be empty.'); return; }

    setIsSaving(true);
    try {
      const safeMemoDate = memoDate.length === 10 ? `${memoDate}T12:00:00` : memoDate;

      const payload = {
        username,
        to_field: toField,
        subject: subjectHtml,
        urgency,
        from_name: userData?.name || '',
        from_designation: userData?.designation || '',
        pers_no: userData?.persNo || '',
        main_matter: matterHtml,
        copy_to: copyToItems.filter(c => c.trim()),
        enclosed_items: enclosedItems.filter(e => e.trim()),
        memo_ref: memoRef,
        memo_date: safeMemoDate, 
        ...(activeMemo ? { id: activeMemo.id } : {}),
      };

      const res = await fetch('/api/memos', {
        method: activeMemo ? 'PUT' : 'POST',
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(activeMemo ? 'Memo updated!' : 'Memo saved successfully!');
        await fetchMemos();
        const saved: Memo = {
          ...(activeMemo || {} as Memo),
          ...payload,
          id: data.id || activeMemo?.id || 0,
          created_at: activeMemo?.created_at || new Date().toISOString(),
        };
        setActiveMemo(saved);
        setView('preview');
      } else {
        toast.error(data.error || 'Failed to save memo.');
      }
    } catch {
      toast.error('Network error saving memo.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Permanently delete this memo record?')) return;
    try {
      const res = await fetch(`/api/memos/${id}`, { method: 'DELETE', headers: getHeaders() });
      if (res.ok) {
        toast.success('Memo deleted.');
        setMemos(prev => prev.filter(m => m.id !== id));
      } else {
        toast.error('Failed to delete.');
      }
    } catch {
      toast.error('Network error.');
    }
  };

  const filteredMemos = memos.filter(m => {
    const s = searchTerm.toLowerCase();
    const matchText = !s || m.to_field?.toLowerCase().includes(s) ||
      m.subject?.toLowerCase().includes(s) ||
      m.memo_ref?.toLowerCase().includes(s);
    const matchDate = !searchDate || m.memo_date?.slice(0, 10) === searchDate;
    return matchText && matchDate;
  });

  return (
    <>
      <style>{`
        /* List Fix */
        .rich-text-content ul {
          list-style-type: disc !important;
          padding-left: 1.5rem !important;
          margin-top: 0.5rem !important;
          margin-bottom: 0.5rem !important;
        }
        .rich-text-content ol {
          list-style-type: decimal !important;
          padding-left: 1.5rem !important;
          margin-top: 0.5rem !important;
          margin-bottom: 0.5rem !important;
        }
        .rich-text-content li {
          margin-bottom: 0.25rem !important;
          display: list-item !important;
        }

        /* * ULTIMATE PRINT FIX
         * Destroys all global app layout traps (Navbars/Sidebars) that push the memo down.
         * Forces exactly ONE page.
         */
        @media print {
          @page {
            margin: 0 !important; 
          }
          
          /* Kills background scrolling and forces exactly 1 viewport size */
          html, body {
            width: 100% !important;
            height: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important; /* Physically prevents second page */
            background: white !important;
          }

          /* Hide all the global UI */
          body * {
            visibility: hidden;
          }

          /* Re-enable visibility for just the memo */
          #memo-print-area, #memo-print-area * {
            visibility: visible !important;
          }

          /* * position: fixed snaps it to the physical paper edges.
           * 100% width/height ensures it perfectly fills 1 page.
           */
          #memo-print-area {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            margin: 0 !important;
            padding: 12mm !important; 
            box-sizing: border-box !important;
            overflow: hidden !important;
            z-index: 99999 !important;
            transform: none !important;
          }
        }
      `}</style>

      {/* RENDER PREVIEW */}
      {view === 'preview' && activeMemo && (
        <div className="bg-slate-100 py-8 print:py-0 print:bg-white">
          <div className="max-w-[210mm] mx-auto flex gap-3 items-center mb-6 print:hidden flex-wrap px-4">
            <button onClick={() => setView('list')} className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-xl font-bold text-sm hover:bg-slate-50 transition-all shadow-sm">⬅️ Back to Records</button>
            <button onClick={() => openEdit(activeMemo)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-blue-700 transition-all shadow-sm">✏️ Edit Memo</button>
            <button onClick={() => window.print()} className="flex items-center gap-2 bg-[#006141] text-white px-6 py-2 rounded-xl font-bold text-sm hover:bg-[#004d34] transition-all shadow-sm">🖨️ Print / Save PDF</button>
            <div className="ml-auto text-xs font-bold text-slate-400 uppercase tracking-widest hidden sm:block">Print Preview — ISO format (form reference)</div>
          </div>
          <MemoPrintView memo={activeMemo} />
        </div>
      )}

      {/* RENDER COMPOSE */}
      {view === 'compose' && (
        <div className="space-y-6 pb-20 mt-6 print:hidden">
          <div className="flex gap-3 items-center flex-wrap">
            <button onClick={() => setView('list')} className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-xl font-bold text-sm hover:bg-slate-50 transition-all shadow-sm">⬅️ Cancel</button>
            <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">{activeMemo ? '✏️ Edit Draft' : '📝 Document Configuration Editor'}</h2>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">To *</label>
                <textarea rows={3} value={toField} onChange={e => setToField(e.target.value)} placeholder="e.g. All Faculty Members" className="w-full border-2 border-slate-200 rounded-xl p-3 text-sm font-medium focus:border-[#006141] outline-none transition-all resize-none" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Urgency Level *</label>
                <div className="grid grid-cols-2 gap-3">
                  {['URGENT', 'INFO ONLY', 'IMMEDIATE', 'ROUTINE'].map(u => (
                    <label key={u} className={`flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all text-sm font-bold ${urgency === u ? 'border-[#006141] bg-emerald-50 text-[#006141]' : 'border-slate-200 hover:border-slate-300'}`}>
                      <input type="radio" name="urgency" value={u} checked={urgency === u} onChange={() => setUrgency(u)} className="accent-[#006141]" />
                      {u}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Subject Title *</label>
              <div className="border-2 border-slate-200 rounded-xl p-3 focus-within:border-[#006141] transition-all">
                <RichToolbar targetRef={subjectRef} />
                <div ref={subjectRef} contentEditable suppressContentEditableWarning className="rich-text-content min-h-[50px] outline-none text-sm font-medium leading-relaxed font-serif break-words" style={{ fontFamily: '"Times New Roman", Times, serif' }} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Originator Identity</label>
                <div className="border-2 border-slate-100 bg-slate-50 rounded-xl p-3 text-sm font-bold text-slate-700">
                  <div>{userData?.name || '—'}</div>
                  <div className="text-xs text-slate-500 font-medium mt-0.5">{userData?.designation || '—'}</div>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Reference Number</label>
                <input type="text" value={memoRef} onChange={e => setMemoRef(e.target.value)} className="w-full border-2 border-slate-200 rounded-xl p-3 text-sm font-mono font-bold focus:border-[#006141] outline-none transition-all" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Calendar Date *</label>
                <input type="date" value={memoDate} onChange={e => setMemoDate(e.target.value)} className="w-full border-2 border-slate-200 rounded-xl p-3 text-sm font-bold focus:border-[#006141] outline-none transition-all" />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Main Matter Content *</label>
              <div className="border-2 border-slate-200 rounded-xl p-3 focus-within:border-[#006141] transition-all">
                <RichToolbar targetRef={matterRef} />
                <div ref={matterRef} contentEditable suppressContentEditableWarning className="rich-text-content min-h-[180px] outline-none text-sm font-medium leading-relaxed font-serif break-words" style={{ fontFamily: '"Times New Roman", Times, serif', overflowWrap: 'anywhere', wordBreak: 'break-word' }} />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Carbon Copies (CC)</label>
              <div className="space-y-2">
                {copyToItems.map((item, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <span className="text-xs font-bold text-slate-400 w-5 text-right">{i + 1}.</span>
                    <input type="text" value={item} onChange={e => { const n = [...copyToItems]; n[i] = e.target.value; setCopyToItems(n); }} className="flex-1 border-2 border-slate-200 rounded-lg p-2 text-sm font-medium focus:border-[#006141] outline-none transition-all" />
                    {copyToItems.length > 1 && <button type="button" onClick={() => setCopyToItems(copyToItems.filter((_, j) => j !== i))} className="text-rose-500 font-black text-lg">×</button>}
                  </div>
                ))}
                <button type="button" onClick={() => setCopyToItems([...copyToItems, ''])} className="text-[#006141] text-xs font-black uppercase tracking-wider hover:underline mt-1">+ Add CC Target</button>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Enclosures / Attachments</label>
              <div className="space-y-2">
                {enclosedItems.map((item, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <span className="text-xs font-bold text-slate-400 w-5 text-right">{i + 1}.</span>
                    <input type="text" value={item} onChange={e => { const n = [...enclosedItems]; n[i] = e.target.value; setEnclosedItems(n); }} className="flex-1 border-2 border-slate-200 rounded-lg p-2 text-sm font-medium focus:border-[#006141] outline-none transition-all" />
                    {enclosedItems.length > 1 && <button type="button" onClick={() => setEnclosedItems(enclosedItems.filter((_, j) => j !== i))} className="text-rose-500 font-black text-lg">×</button>}
                  </div>
                ))}
                <button type="button" onClick={() => setEnclosedItems([...enclosedItems, ''])} className="text-[#006141] text-xs font-black uppercase tracking-wider hover:underline mt-1">+ Add Item Attachment</button>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
              <button type="button" onClick={() => setView('list')} className="px-6 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-all">Cancel</button>
              <button type="button" onClick={handleSave} disabled={isSaving} className="px-8 py-3 rounded-xl font-black bg-[#006141] text-white hover:bg-[#004d34] disabled:bg-slate-300 transition-all shadow-md">{isSaving ? 'Processing...' : '💾 Save & Open Preview'}</button>
            </div>
          </div>
        </div>
      )}

      {/* RENDER LIST */}
      {view === 'list' && (
        <div className="space-y-6 pb-20 mt-6 print:hidden">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h2 className="text-xl font-black text-slate-800 flex items-center gap-2"><span className="w-2 h-6 bg-[#006141] rounded-full"></span>Internal Memo Logs</h2>
                <p className="text-xs text-slate-500 font-medium mt-1">ISO Quality Procedure Standard Archive Registry</p>
              </div>
              <button onClick={openCompose} className="bg-[#006141] text-white px-6 py-3 rounded-xl font-black text-sm hover:bg-[#004d34] transition-all shadow-md flex items-center gap-2 whitespace-nowrap">📝 Generate New Internal Memo</button>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mt-4">
              <div className="relative flex-1">
                <span className="absolute left-3 top-2.5 text-slate-400">🔍</span>
                <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search records parameters..." className="w-full border border-slate-300 rounded-xl pl-9 pr-4 py-2 text-sm focus:ring-2 focus:ring-[#006141] outline-none" />
              </div>
              <input type="date" value={searchDate} onChange={e => setSearchDate(e.target.value)} className="border border-slate-300 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-[#006141] outline-none" />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {isLoading ? (
              <div className="p-12 text-center text-slate-400 font-bold animate-pulse">Accessing Server Records...</div>
            ) : filteredMemos.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-slate-500 font-bold">No registered documents found.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500 uppercase text-xs border-b border-slate-200">
                    <tr>
                      <th className="p-4 font-bold">Ref No.</th>
                      <th className="p-4 font-bold">Date</th>
                      <th className="p-4 font-bold">To</th>
                      <th className="p-4 font-bold">Subject</th>
                      <th className="p-4 font-bold text-center">Urgency</th>
                      <th className="p-4 font-bold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredMemos.map(memo => (
                      <tr key={memo.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4 font-mono font-bold text-[#006141] whitespace-nowrap">{memo.memo_ref}</td>
                        <td className="p-4 whitespace-nowrap font-medium text-slate-600">
                          {(() => {
                            const dateStr = parseSavedDate(memo.memo_date);
                            const parts = dateStr.split('-');
                            if (parts.length === 3) {
                              const [y, m, d] = parts;
                              return `${d}/${m}/${y}`;
                            }
                            return dateStr;
                          })()}
                        </td>
                        <td className="p-4 truncate max-w-[150px]" title={memo.to_field}>{memo.to_field}</td>
                        <td className="p-4 truncate max-w-[200px] rich-text-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(memo.subject || '') }} />
                        <td className="p-4 text-center">
                          <span className="font-bold text-xs bg-slate-100 px-2 py-1 rounded">{memo.urgency}</span>
                        </td>
                        <td className="p-4">
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => openPreview(memo)} className="bg-[#006141] text-white px-3 py-1.5 rounded-lg text-[11px] font-black hover:bg-[#004d34]">👁 View</button>
                            <button onClick={() => openEdit(memo)} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-[11px] font-black hover:bg-blue-700">✏️ Edit</button>
                            <button onClick={() => handleDelete(memo.id)} className="text-rose-600 bg-rose-50 px-3 py-1.5 rounded-lg text-[11px] font-black hover:bg-rose-600 hover:text-white">🗑 Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
