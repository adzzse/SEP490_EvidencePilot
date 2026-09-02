import SvgIcon from '../../components/ui/SvgIcon';
import AnimateIn from '../../components/ui/AnimateIn';

const roles = [
  { key: 'student', icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM7.07 18.28c.43-.9 3.05-1.78 4.93-1.78s4.5.88 4.93 1.78C15.57 19.36 13.86 20 12 20s-3.57-.64-4.93-1.72zm11.29-1.45c-1.43-1.74-4.9-2.33-6.36-2.33s-4.93.59-6.36 2.33A7.95 7.95 0 014 12c0-4.41 3.59-8 8-8s8 3.59 8 8c0 1.82-.62 3.49-1.64 4.83zM12 6c-1.94 0-3.5 1.56-3.5 3.5S10.06 13 12 13s3.5-1.56 3.5-3.5S13.94 6 12 6z' },
  { key: 'instructor', icon: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12zm-5-5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-4 4h8v-1c0-1.33-2.67-2-4-2s-4 .67-4 2v1z' },
];

function RoleCard({ role, t, index }) {
  return (
    <AnimateIn delay={100 * index} className="group">
      <div className="bg-(--surface) rounded-2xl shadow-sm border border-(--border-light) p-8 h-full hover:shadow-lg hover:border-indigo-200 dark:hover:border-indigo-700 transition-all duration-300">
        <div className="w-12 h-12 bg-(--brand-soft) text-(--brand-foreground) rounded-xl flex items-center justify-center mb-5 group-hover:bg-(--brand) group-hover:text-(--on-brand) transition-all duration-300">
          <SvgIcon path={role.icon} className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-bold text-(--text-primary) mb-3">{t.roles[role.key].title}</h3>
        <p className="text-sm text-(--text-secondary) leading-relaxed">{t.roles[role.key].desc}</p>
      </div>
    </AnimateIn>
  );
}

export default function RolesSection({ t }) {
  return (
    <section className="py-20 bg-(--surface)">
      <div className="max-w-6xl mx-auto px-6">
        <AnimateIn>
          <h2 className="text-2xl md:text-3xl font-bold text-center text-(--text-primary) mb-12">{t.roles.heading}</h2>
        </AnimateIn>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {roles.map((role, i) => <RoleCard key={role.key} role={role} t={t} index={i} />)}
        </div>
      </div>
    </section>
  );
}
