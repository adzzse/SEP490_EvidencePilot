import { Link } from 'react-router-dom';

/**
 * Global Breadcrumb Navigation Component
 * @param {Object} props
 * @param {Array<{ label: string, path?: string }>} props.items
 * @param {string} [props.className]
 */
export default function Breadcrumb({ items = [], className = '' }) {
  if (!items || items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={`flex items-center text-xs text-(--text-tertiary) font-medium mb-4 ${className}`}>
      <ol className="inline-flex items-center space-x-1.5 md:space-x-2">
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1;
          return (
            <li key={item.path || item.label || idx} className="inline-flex items-center">
              {idx > 0 && (
                <svg
                  className="w-3 h-3 text-(--text-tertiary) mx-1 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                </svg>
              )}
              {isLast || !item.path ? (
                <span
                  className="text-(--text-primary) font-bold truncate max-w-[240px] sm:max-w-md"
                  aria-current={isLast ? 'page' : undefined}
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  to={item.path}
                  className="hover:text-(--brand-foreground) hover:underline transition-colors truncate max-w-[180px] sm:max-w-xs"
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
