import './App.css'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import ProtectedRoute from '@/components/layout/ProtectedRoute'
import Login             from '@/pages/Login'
import Dashboard         from '@/pages/Dashboard'
import Restaurants       from '@/pages/Restaurants'
import RestaurantDetail  from '@/pages/RestaurantDetail'
import Inspections       from '@/pages/Inspections'

// Temporary placeholder — replaced page by page in Stage 5
const Soon = ({ name }: { name: string }) => (
  <div style={{ padding: 40, color: 'var(--text-muted)', fontSize: 13 }}>{name}</div>
)

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard"       element={<Dashboard />} />
          <Route path="restaurants"     element={
            <ProtectedRoute page="restaurants"><Restaurants /></ProtectedRoute>
          } />
          <Route path="restaurants/:id" element={
            <ProtectedRoute page="restaurants"><RestaurantDetail /></ProtectedRoute>
          } />
          <Route path="inspections"   element={
            <ProtectedRoute page="inspections"><Inspections /></ProtectedRoute>
          } />
          <Route path="mashgichim"    element={
            <ProtectedRoute page="mashgichim"><Soon name="Mashgichim" /></ProtectedRoute>
          } />
          <Route path="hechsherim"    element={
            <ProtectedRoute page="hechsherim"><Soon name="Hechsherim" /></ProtectedRoute>
          } />
          <Route path="documents"     element={
            <ProtectedRoute page="documents"><Soon name="Documents" /></ProtectedRoute>
          } />
          <Route path="rabbanuts"     element={
            <ProtectedRoute page="rabbanuts"><Soon name="Rabbanuts" /></ProtectedRoute>
          } />
          <Route path="users"         element={
            <ProtectedRoute page="users"><Soon name="Users" /></ProtectedRoute>
          } />
        </Route>
        <Route path="/login" element={<Login />} />
        <Route path="*"      element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
