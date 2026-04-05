import './App.css'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute from '@/components/layout/ProtectedRoute'

// Temporary placeholder — replaced page by page in Stage 4+
const Soon = ({ name }: { name: string }) => (
  <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>{name}</div>
)

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Layout shell — AppLayout replaces the outer div in Stage 4 */}
        <Route path="/" element={<div style={{ background: 'var(--bg-base)', minHeight: '100vh' }} />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard"    element={<Soon name="Dashboard" />} />
          <Route path="restaurants/*" element={
            <ProtectedRoute page="restaurants"><Soon name="Restaurants" /></ProtectedRoute>
          } />
          <Route path="inspections"  element={
            <ProtectedRoute page="inspections"><Soon name="Inspections" /></ProtectedRoute>
          } />
          <Route path="mashgichim"   element={
            <ProtectedRoute page="mashgichim"><Soon name="Mashgichim" /></ProtectedRoute>
          } />
          <Route path="hechsherim"   element={
            <ProtectedRoute page="hechsherim"><Soon name="Hechsherim" /></ProtectedRoute>
          } />
          <Route path="documents"    element={
            <ProtectedRoute page="documents"><Soon name="Documents" /></ProtectedRoute>
          } />
          <Route path="rabbanuts"    element={
            <ProtectedRoute page="rabbanuts"><Soon name="Rabbanuts" /></ProtectedRoute>
          } />
          <Route path="users"        element={
            <ProtectedRoute page="users"><Soon name="Users" /></ProtectedRoute>
          } />
        </Route>
        <Route path="/login" element={<Soon name="Login" />} />
        <Route path="*"      element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
