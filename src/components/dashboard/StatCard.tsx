interface StatCardProps {
  icon:  string
  value: number
  label: string
  sub:   string
  color: string   // hex value
}

export function StatCard({ icon, value, label, sub, color }: StatCardProps) {
  return (
    <div style={{
      background:   'var(--bg-card)',
      border:       `1px solid ${color}25`,
      borderRadius: 12,
      padding:      20,
      position:     'relative',
      overflow:     'hidden',
    }}>
      {/* Radial accent */}
      <div style={{
        position:   'absolute',
        top:        0,
        right:      0,
        width:      55,
        height:     55,
        background: `radial-gradient(circle at top right, ${color}14, transparent)`,
      }} />

      <div style={{ fontSize: 18, marginBottom: 5 }}>{icon}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>{label}</div>
      <div style={{ fontSize: 9,  color: 'var(--text-disabled)',  marginTop: 2 }}>{sub}</div>
    </div>
  )
}
