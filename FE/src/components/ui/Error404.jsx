import { useState } from 'react';
import { Link } from 'react-router-dom';

export default function Error404({
  postcardImage = '/404/404.jpg',
  postcardAlt = 'Evidence Pilot postcard',
  curvedTextTop = 'Evidence Pilot',
  curvedTextBottom = 'Research Workspace',
  heading,
  subtext,
  backButtonLabel,
  backButtonHref = '/',
}) {
  const [imgOk, setImgOk] = useState(true);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16">
      <div className="flex flex-col items-center">
        <div className="relative mb-16">
          <svg
            className="absolute -top-16 -left-12 w-[140px] h-[140px] pointer-events-none z-20 animate-spin-slow"
            viewBox="0 0 140 140"
            aria-hidden="true"
          >
            <defs>
              <path
                id="error404-circle"
                d="M 70,70 m -50,0 a 50,50 0 1,1 100,0 a 50,50 0 1,1 -100,0"
                fill="transparent"
              />
            </defs>
            <text
              className="text-[11px] fill-(--text-secondary) uppercase"
              style={{ letterSpacing: '0.15em' }}
            >
              <textPath href="#error404-circle" startOffset="0%">
                {curvedTextTop} • {curvedTextBottom} •
              </textPath>
            </text>
          </svg>

          <div className="relative z-10">
            <div className="relative p-3 shadow-2xl rotate-[4deg] hover:rotate-0 transition-transform duration-300 bg-(--surface) border border-(--border)">
              <div className="relative overflow-hidden bg-(--surface-secondary)">
                {imgOk ? (
                  <img
                    src={postcardImage}
                    alt={postcardAlt}
                    className="w-[360px] max-w-full h-auto object-cover"
                    onError={() => setImgOk(false)}
                  />
                ) : (
                  <div className="w-[360px] max-w-full h-[220px] flex items-center justify-center bg-gradient-to-tr from-indigo-600 to-blue-500">
                    <span className="text-white font-black text-6xl">404</span>
                  </div>
                )}
              </div>
            </div>

            <svg
              className="absolute -right-16 top-1/2 -translate-y-1/2 w-28 h-20"
              viewBox="0 0 100 60"
              aria-hidden="true"
            >
              <path
                d="M 10 15 Q 20 10 30 15 Q 40 20 50 15 Q 60 10 70 15 Q 80 20 90 15"
                stroke="var(--text-tertiary)"
                strokeWidth="1.5"
                fill="none"
                opacity="0.6"
              />
              <path
                d="M 10 25 Q 20 20 30 25 Q 40 30 50 25 Q 60 20 70 25 Q 80 30 90 25"
                stroke="var(--text-tertiary)"
                strokeWidth="1.5"
                fill="none"
                opacity="0.6"
              />
              <path
                d="M 10 35 Q 20 30 30 35 Q 40 40 50 35 Q 60 30 70 35 Q 80 40 90 35"
                stroke="var(--text-tertiary)"
                strokeWidth="1.5"
                fill="none"
                opacity="0.6"
              />
            </svg>
          </div>
        </div>

        <div className="text-center max-w-2xl">
          <h1 className="text-4xl md:text-5xl font-black mb-6 text-balance leading-tight text-(--text-primary)">
            {heading}
          </h1>
          <p className="text-(--text-secondary) text-base md:text-lg mb-10">{subtext}</p>
          <Link
            to={backButtonHref}
            className="inline-flex items-center gap-2 rounded-lg px-6 py-3 bg-(--brand) hover:bg-(--brand-hover) text-(--on-brand) text-xs font-bold shadow-lg transition-all"
          >
            {backButtonLabel}
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}
