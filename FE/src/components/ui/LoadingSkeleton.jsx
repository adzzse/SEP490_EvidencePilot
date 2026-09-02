export default function LoadingSkeleton({ count = 3, height = 'h-16' }) {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`${height} bg-(--surface-tertiary) rounded-2xl border border-(--border-light)`} />
      ))}
    </div>
  );
}
