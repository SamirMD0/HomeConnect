import { Building2, LayoutTemplate, Palette, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

const sections = [
  {
    icon: Building2,
    title: 'Shop profile',
    description: 'Logo, currency, default template, rollout mode, and snapshot policy.',
    to: '/pricing-cards/shop-profile',
  },
  {
    icon: Sparkles,
    title: 'Feature icons',
    description: 'Manage the SVG icon catalog shown in the Features block of every card.',
    to: '/pricing-cards/feature-icons',
  },
  {
    icon: Palette,
    title: 'Brand logos',
    description: 'Attach logo images to brands so they render on every card that uses them.',
    to: '/pricing-cards/brand-logos',
  },
  {
    icon: LayoutTemplate,
    title: 'Pricing card templates',
    description: 'Create and edit the layout templates every printed card is bound to.',
    to: '/pricing-cards/templates',
  },
];

export function PricingCardsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Pricing cards / بطاقات الأسعار</h1>
        <p className="mt-1 text-sm text-slate-500">
          Shop identity, icon and logo catalogs, and the layout templates every printed card is bound to.
        </p>
      </div>

      {sections.map((section) => (
        <section key={section.to} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <section.icon className="h-6 w-6 text-slate-500" />
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{section.title}</h2>
                <p className="text-sm text-slate-500">{section.description}</p>
              </div>
            </div>
            <Link to={section.to} className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Open</Link>
          </div>
        </section>
      ))}
    </div>
  );
}
