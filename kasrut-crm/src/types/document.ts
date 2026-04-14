export type DocumentCategory = 'Instructions' | 'Forms' | 'Regulations' | 'Pesach'

export interface KashrutDocument {
  id: string
  name: string
  category: DocumentCategory
  date: string
  size: string
  ext: 'PDF' | 'DOCX' | 'XLSX'
  url?: string
}
