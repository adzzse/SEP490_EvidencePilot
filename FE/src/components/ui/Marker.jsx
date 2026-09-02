export function Marker({ role = 'status', children, className = '' }) {
  return (
    <div role={role} className={`flex flex-col items-center justify-center gap-4 ${className}`}>
      {children}
    </div>
  );
}

export function MarkerIcon({ children, className = '' }) {
  return <div className={className}>{children}</div>;
}

export function MarkerContent({ children, className = '' }) {
  return <span className={className}>{children}</span>;
}
