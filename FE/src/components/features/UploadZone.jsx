import { useState, useRef } from 'react';

export default function UploadZone({ onUpload, accept = '*', multiple = false, label = 'Drop files here or click to browse' }) {
  const [drag, setDrag] = useState(false);
  const ref = useRef();

  const handle = (files) => {
    if (files?.length && onUpload) onUpload(multiple ? [...files] : files[0]);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files); }}
      onClick={() => ref.current?.click()}
      className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
        drag ? 'border-indigo-400 bg-indigo-50' : 'border-slate-300 hover:border-indigo-300'
      }`}
    >
      <input ref={ref} type="file" accept={accept} multiple={multiple} className="hidden" onChange={(e) => handle(e.target.files)} />
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  );
}
