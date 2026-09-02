export default function SvgIcon({ path, className = 'w-6 h-6' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d={path} />
    </svg>
  );
}
