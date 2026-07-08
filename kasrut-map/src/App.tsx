import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import MapPage from '@/pages/MapPage'
import DonatePage from '@/pages/DonatePage'
import type { ThemeMode } from '@/theme'

interface Props {
  themeMode: ThemeMode
  onToggleThemeMode: () => void
}

export default function App({ themeMode, onToggleThemeMode }: Props) {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MapPage themeMode={themeMode} onToggleThemeMode={onToggleThemeMode} />} />
        {/* Deep link to a single establishment (shareable / bookmarkable) */}
        <Route path="/r/:id" element={<MapPage themeMode={themeMode} onToggleThemeMode={onToggleThemeMode} />} />
        <Route path="/donate" element={<DonatePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
