import './App.css'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import ProtectedRoute from '@/components/layout/ProtectedRoute'
import Login             from '@/pages/Login'
import Dashboard         from '@/pages/Dashboard'
import Restaurants       from '@/pages/Restaurants'
import RestaurantDetail  from '@/pages/RestaurantDetail'
import Inspections       from '@/pages/Inspections'
import Mashgichim        from '@/pages/Mashgichim'
import Hechsherim        from '@/pages/Hechsherim'
import Documents         from '@/pages/Documents'
import Rabbanuts         from '@/pages/Rabbanuts'
import Users             from '@/pages/Users'
import Suggestions       from '@/pages/Suggestions'
import Logs              from '@/pages/Logs'

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
            <ProtectedRoute page="mashgichim"><Mashgichim /></ProtectedRoute>
          } />
          <Route path="hechsherim"    element={
            <ProtectedRoute page="hechsherim"><Hechsherim /></ProtectedRoute>
          } />
          <Route path="documents"     element={
            <ProtectedRoute page="documents"><Documents /></ProtectedRoute>
          } />
          <Route path="rabbanuts"     element={
            <ProtectedRoute page="rabbanuts"><Rabbanuts /></ProtectedRoute>
          } />
          <Route path="users"         element={
            <ProtectedRoute page="users"><Users /></ProtectedRoute>
          } />
          <Route path="suggestions"   element={
            <ProtectedRoute page="suggestions"><Suggestions /></ProtectedRoute>
          } />
          <Route path="logs"          element={
            <ProtectedRoute page="logs"><Logs /></ProtectedRoute>
          } />
        </Route>
        <Route path="/login" element={<Login />} />
        <Route path="*"      element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
