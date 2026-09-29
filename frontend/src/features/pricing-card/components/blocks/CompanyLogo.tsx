interface CompanyLogoProps {
  name: string;
  logoUrl?: string | null;
}

export function CompanyLogo({ name, logoUrl }: CompanyLogoProps) {
  if (!logoUrl) return null;
  return <img className="pricing-card-company-logo" src={logoUrl} alt={`${name} logo`} />;
}
