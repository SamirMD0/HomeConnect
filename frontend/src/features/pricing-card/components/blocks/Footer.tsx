export function Footer({ tagline }: { tagline?: string | null }) {
  if (!tagline?.trim()) return null;
  return <footer className="pricing-card-footer">{tagline}</footer>;
}
