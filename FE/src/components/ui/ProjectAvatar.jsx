const PALETTE = [
  'bg-blue-600',
  'bg-emerald-600',
  'bg-amber-600',
  'bg-rose-600',
  'bg-violet-600',
  'bg-cyan-600',
  'bg-indigo-600',
  'bg-fuchsia-600',
];

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export default function ProjectAvatar({ name, size = 'w-8 h-8', text = 'text-xs' }) {
  const safe = (name || '?').trim();
  const initial = (safe[0] || '?').toUpperCase();
  const tone = PALETTE[hash(safe) % PALETTE.length];
  return (
    <div
      className={`${size} ${tone} text-white ${text} font-black rounded-md flex items-center justify-center shrink-0 ring-1 ring-black/5`}
      aria-hidden="true"
      title={safe}
    >
      {initial}
    </div>
  );
}
