import SvgIcon from '../../components/ui/SvgIcon';
import AnimateIn from '../../components/ui/AnimateIn';

const workflowSteps = [
  { key: 'step1', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z' },
  { key: 'step2', icon: 'M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6 10H6v-2h8v2zm4-4H6v-2h12v2z' },
  { key: 'step3', icon: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z' },
  { key: 'step4', icon: 'M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18zM18 14H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z' },
  { key: 'step5', icon: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-8 14H7v-2h4v2zm6-4H7v-2h10v2zm0-4H7V7h10v2z' },
  { key: 'step6', icon: 'M19 9h-4V3H9v6H5l7 7 7-7zm-14 9v2h14v-2H5z' },
];

function WorkflowStep({ step, t, index }) {
  return (
    <AnimateIn delay={80 * index}>
      <div className="flex flex-col items-center text-center">
        <div className="relative mb-4">
          <div className="w-16 h-16 bg-(--brand) text-(--on-brand) rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200 dark:shadow-none">
            <SvgIcon path={step.icon} className="w-7 h-7" />
          </div>
          <div className="absolute -top-2 -right-2 w-7 h-7 bg-amber-400 text-white rounded-full flex items-center justify-center text-xs font-bold shadow">
            {index + 1}
          </div>
        </div>
        <h4 className="font-bold text-(--text-primary) mb-2">{t.workflow[step.key].title}</h4>
        <p className="text-sm text-(--text-secondary) leading-relaxed max-w-[260px]">{t.workflow[step.key].desc}</p>
      </div>
    </AnimateIn>
  );
}

export default function WorkflowSection({ t }) {
  return (
    <section className="py-20 bg-(--surface-secondary)">
      <div className="max-w-6xl mx-auto px-6">
        <AnimateIn>
          <h2 className="text-2xl md:text-3xl font-bold text-center text-(--text-primary) mb-16">{t.workflow.heading}</h2>
        </AnimateIn>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
          {workflowSteps.map((step, i) => <WorkflowStep key={step.key} step={step} t={t} index={i} />)}
        </div>
      </div>
    </section>
  );
}
