export function Title({ name }: { name: string }) {
  if (!name.trim()) return null;
  return <h2 className="pricing-card-title">{name}</h2>;
}
