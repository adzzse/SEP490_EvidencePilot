import { useEffect, useState } from 'react';

const WORDS = ['Evidence Pilot', 'Extract', 'Search', 'Write', 'Export'];

const DATA_DICTIONARY = [
  {
    word: 'Evidence Pilot',
    tag: 'Core System',
    title: 'The System',
    desc: 'Your complete instructor-led research environment.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
  },
  {
    word: 'Extract',
    tag: 'Ingestion',
    title: 'Automated Ingestion',
    desc: 'Parsing PDFs and DOCXs into structured, highlightable datasets.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 3v5a1 1 0 001 1h5" />
      </svg>
    ),
  },
  {
    word: 'Search',
    tag: 'Semantic Query',
    title: 'Semantic Querying',
    desc: 'Find exact citations across hundreds of papers instantly.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
      </svg>
    ),
  },
  {
    word: 'Write',
    tag: 'Synthesis',
    title: 'Evidence Synthesis',
    desc: 'Draft papers directly connected to your source library.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    ),
  },
  {
    word: 'Export',
    tag: 'Publish',
    title: 'Ready for Publish',
    desc: 'Compile to standard academic formats with intact citations.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
      </svg>
    ),
  },
];

export default function WordRotate({
  words = WORDS,
  className = '',
  respectReducedMotion = false,
}) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (
      respectReducedMotion &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    const currentWord = words[activeIndex];
    const holdDuration = currentWord === 'Evidence Pilot' ? 3500 : 2200;

    const timer = setTimeout(() => {
      setActiveIndex((prev) => (prev + 1) % words.length);
    }, holdDuration);

    return () => clearTimeout(timer);
  }, [activeIndex, words, respectReducedMotion]);

  const activeFeature = DATA_DICTIONARY[activeIndex] || DATA_DICTIONARY[0];

  return (
    <div className={`flex flex-col gap-5 w-full max-w-[520px] select-none ${className}`}>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up {
          animation: fadeInUp 400ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>

      {/* Kinetic Typography Vertical Stack */}
      <div
        aria-hidden="true"
        className="relative h-[200px] md:h-[220px] w-full flex items-center justify-start pointer-events-none"
      >
        <div className="relative w-full h-full flex items-center overflow-visible">
          {words.map((word, index) => {
            let offset = index - activeIndex;
            const half = words.length / 2;
            if (offset > half) offset -= words.length;
            if (offset < -half) offset += words.length;

            const isActive = offset === 0;
            const absOffset = Math.abs(offset);

            const translateY = offset * 55;
            const scale = isActive ? 1 : Math.max(0.65, 0.9 - absOffset * 0.05);
            const blur = isActive ? 0 : absOffset * 3.5;
            const opacity = isActive ? 1 : Math.max(0.08, 0.5 - absOffset * 0.15);

            return (
              <div
                key={`${word}-${index}`}
                className="absolute left-0 top-1/2 flex items-center whitespace-nowrap will-change-transform"
                style={{
                  transform: `translateY(calc(-50% + ${translateY}px)) scale(${scale})`,
                  filter: isActive ? 'blur(0px)' : `blur(${blur}px)`,
                  opacity,
                  transition: 'all 600ms cubic-bezier(0.34, 1.56, 0.64, 1)',
                  transformOrigin: 'left center',
                  zIndex: isActive ? 30 : 20 - absOffset,
                }}
              >
                <div
                  className={`font-black tracking-tight text-4xl sm:text-5xl lg:text-6xl flex items-center transition-colors duration-500 ${
                    isActive
                      ? 'text-slate-900 dark:text-white drop-shadow-sm'
                      : 'text-slate-900/40 dark:text-white/40'
                  }`}
                >
                  <span>{word}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Description Widget */}
      <div className="w-full bg-white/90 dark:bg-zinc-900/70 border border-slate-200/80 dark:border-zinc-800/80 rounded-2xl p-5 shadow-xl relative overflow-hidden transition-all duration-300">
        <div key={activeIndex} className="animate-fade-in-up">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-500/15 to-blue-500/15 dark:from-indigo-400/20 dark:to-blue-400/20 border border-indigo-500/30 dark:border-indigo-400/30 flex items-center justify-center shrink-0 text-indigo-600 dark:text-indigo-400 shadow-sm">
              {activeFeature.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[11px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                  {activeFeature.tag}
                </span>
                <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500">
                  0{activeIndex + 1} / 0{DATA_DICTIONARY.length}
                </span>
              </div>
              <h4 className="text-base font-black text-slate-900 dark:text-slate-100 tracking-tight leading-snug">
                {activeFeature.title}
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                {activeFeature.desc}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 mt-4 pt-3.5 border-t border-slate-200/60 dark:border-zinc-800/60">
            {DATA_DICTIONARY.map((_, i) => (
              <div
                key={i}
                className={`h-1 rounded-full transition-all duration-500 ${
                  i === activeIndex
                    ? 'w-6 bg-indigo-600 dark:bg-indigo-400'
                    : 'w-1.5 bg-slate-300/80 dark:bg-zinc-700/80'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export { WORDS, DATA_DICTIONARY };
