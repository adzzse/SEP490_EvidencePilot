import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import AnimateIn from '../../components/ui/AnimateIn';

export default function CtaSection({ t }) {
  const { isAuthenticated } = useAuth();

  return (
    <section className="py-20 bg-(--brand)">
      <div className="max-w-3xl mx-auto px-6 text-center">
        <AnimateIn>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">{t.cta.heading}</h2>
          <p className="text-indigo-100 mb-8 max-w-lg mx-auto">{t.cta.subtitle}</p>
          {!isAuthenticated && (
            <div className="flex items-center justify-center">
              <Link to="/login" className="bg-white text-[#1e3a8a] hover:bg-indigo-50 px-8 py-3.5 rounded-xl font-bold shadow-lg transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5">
                {t.cta.button}
              </Link>
            </div>
          )}
        </AnimateIn>
      </div>
    </section>
  );
}
