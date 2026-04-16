import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import MapPage from '@/pages/MapPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MapPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
