interface ResizeOptions {
  maxDimension: number
  quality:      number
  maxBytes:     number
}

export async function resizeImageToDataUrl(file: File, opts: ResizeOptions): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Not an image')
  }

  const bitmap = await createImageBitmap(file)
  const ratio  = Math.min(1, opts.maxDimension / Math.max(bitmap.width, bitmap.height))
  const width  = Math.max(1, Math.round(bitmap.width  * ratio))
  const height = Math.max(1, Math.round(bitmap.height * ratio))

  const canvas = document.createElement('canvas')
  canvas.width  = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D unavailable')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()

  // Try decreasing quality until the data URL fits within the byte budget.
  let quality = opts.quality
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    if (dataUrl.length <= opts.maxBytes) return dataUrl
    quality *= 0.75
  }

  throw new Error('Image too large after compression')
}
