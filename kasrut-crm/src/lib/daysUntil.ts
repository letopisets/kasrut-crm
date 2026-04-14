export const daysUntil = (dateStr: string): number =>
  Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000)
