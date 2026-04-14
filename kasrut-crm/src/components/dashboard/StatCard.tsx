interface StatCardProps {
  icon:  string
  value: number
  label: string
  sub:   string
  color: string
}

export function StatCard({ icon, value, label, sub, color }: StatCardProps) {
  return (
    <div className="stat-card" style={{ '--c': color } as React.CSSProperties}>
      <div className="stat-card-accent" />
      <div className="stat-card-icon">{icon}</div>
      <div className="stat-card-value">{value}</div>
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-sub">{sub}</div>
    </div>
  )
}
