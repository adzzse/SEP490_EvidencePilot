import { useEffect, useState } from 'react';
import AnimateIn from '../../components/ui/AnimateIn';
import SvgIcon from '../../components/ui/SvgIcon';

const stepColors = ['#1e3a8a', '#4f46e5', '#0284c7', '#d97706', '#7c3aed', '#059669'];
const stepIcons = [
  'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 14H7v-2h10v2zm0-4H7v-2h10v2zm0-4H7V7h10v2z',
  'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
  'M9 3L5 6.99h3V14h2V6.99h3L9 3zm7 14.01V10h-2v7.01h-3L15 21l4-3.99h-3z',
  'M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18zM18 14H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z',
  'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-8 14H7v-2h4v2zm6-4H7v-2h10v2zm0-4H7V7h10v2z',
  'M19 9h-4V3H9v6H5l7 7 7-7zm-14 9v2h14v-2H5z',
];

export default function PreviewSection({ t }) {
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const steps = t.preview.steps;
  const current = steps[step];

  useEffect(() => {
    if (paused) return undefined;
    const timer = setInterval(() => setStep(value => (value + 1) % steps.length), 5500);
    return () => clearInterval(timer);
  }, [paused, steps.length]);

  return (
    <section className="py-20 bg-(--surface) border-t border-(--border-light)">
      <div className="max-w-6xl mx-auto px-6">
        <AnimateIn>
          <h2 className="text-2xl md:text-3xl font-bold text-center text-(--text-primary) mb-3">{t.preview.heading}</h2>
          <p className="text-(--text-secondary) text-center mb-12 max-w-2xl mx-auto">{t.preview.subheading}</p>
        </AnimateIn>

        <AnimateIn delay={150}>
          <div className="relative mx-auto max-w-5xl">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-blue-500/10 rounded-3xl blur-2xl" />
            <div className="relative bg-(--surface) rounded-2xl shadow-xl border border-(--border) overflow-hidden">
              <div className="flex items-center gap-1.5 px-4 py-3 bg-(--surface-secondary) border-b border-(--border-light)">
                <span className="w-3 h-3 rounded-full bg-rose-400" />
                <span className="w-3 h-3 rounded-full bg-amber-400" />
                <span className="w-3 h-3 rounded-full bg-emerald-400" />
                <div className="ml-4 text-xs text-(--text-tertiary) bg-(--surface) px-3 py-1 rounded-md border border-(--border-light) flex-1 max-w-[240px] truncate">
                  {t.preview.url}
                </div>
              </div>

              <div className="grid md:grid-cols-[220px_1fr] min-h-[330px]">
                <div className="p-5 bg-(--surface-secondary) border-b md:border-b-0 md:border-r border-(--border-light)">
                  <div className="space-y-2" role="tablist" aria-label={t.preview.heading}>
                    {steps.map((item, index) => (
                      <button
                        key={index}
                        type="button"
                        role="tab"
                        aria-selected={index === step}
                        onClick={() => setStep(index)}
                        className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus) ${index === step ? 'bg-(--surface) text-(--brand-foreground) shadow-sm border border-(--border)' : 'text-(--text-secondary) hover:bg-(--surface-tertiary)'}`}
                      >
                        <span className="w-7 h-7 shrink-0 rounded-lg text-white flex items-center justify-center" style={{ backgroundColor: stepColors[index] }}>
                          <SvgIcon path={stepIcons[index]} className="w-4 h-4" />
                        </span>
                        <span className="line-clamp-2">{item.title}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-6 md:p-10 flex items-center">
                  <div key={step} className="w-full grid sm:grid-cols-[96px_1fr] gap-6 items-start animate-[fadeIn_0.35s_ease-out]">
                    <div className="w-20 h-20 rounded-2xl text-white flex items-center justify-center shadow-lg" style={{ backgroundColor: stepColors[step] }}>
                      <SvgIcon path={stepIcons[step]} className="w-9 h-9" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <span className="text-xs font-bold text-(--brand-foreground) bg-(--brand-soft) rounded-full px-3 py-1">{current.actor}</span>
                        <span className="text-xs text-(--text-tertiary)">{current.panel}</span>
                      </div>
                      <h3 className="text-xl md:text-2xl font-bold text-(--text-primary) mb-3">{current.title}</h3>
                      <p className="text-sm md:text-base text-(--text-secondary) leading-relaxed max-w-xl">{current.desc}</p>
                      <div className="mt-8 h-2 rounded-full bg-(--surface-tertiary) overflow-hidden" aria-hidden="true">
                        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${((step + 1) / steps.length) * 100}%`, backgroundColor: stepColors[step] }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="px-5 py-3 border-t border-(--border-light) flex items-center justify-between gap-4">
                <span className="text-xs text-(--text-tertiary)">{step + 1} / {steps.length}</span>
                <button
                  type="button"
                  aria-pressed={paused}
                  onClick={() => setPaused(value => !value)}
                  className="text-xs font-semibold text-(--text-secondary) hover:text-(--brand-foreground) rounded-lg px-3 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--focus)"
                >
                  {paused ? t.preview.paused : t.preview.autoPlay}
                </button>
              </div>
            </div>
          </div>
        </AnimateIn>
      </div>
    </section>
  );
}
