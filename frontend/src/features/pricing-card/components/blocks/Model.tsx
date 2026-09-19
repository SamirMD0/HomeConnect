export function Model({ model, prefix }: { model: string; prefix?: string }) {
  if (!model.trim()) return null;
  return <p className="pricing-card-model">{prefix && <span>{prefix} </span>}<strong>{model}</strong></p>;
}
