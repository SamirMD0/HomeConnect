export function Image({ name, imageUrl }: { name: string; imageUrl?: string | null }) {
  if (!imageUrl) return null;
  return <img className="pricing-card-image" src={imageUrl} alt={name} />;
}
