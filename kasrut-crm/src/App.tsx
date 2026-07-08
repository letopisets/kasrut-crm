import './App.css'
import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import CircularProgress from '@mui/material/CircularProgress'
import Box from '@mui/material/Box'
import AppLayout from '@/components/layout/AppLayout'
import ProtectedRoute from '@/components/layout/ProtectedRoute'
import { GlobalSnackbar } from '@/components/ui/GlobalSnackbar'

// Login is the only page that may be hit before authentication; load it eagerly
import Login from '@/pages/Login'

// Authenticated pages — code-split per route
const Dashboard        = lazy(() => import('@/pages/Dashboard'))
const Restaurants      = lazy(() => import('@/pages/Restaurants'))
const RestaurantDetail = lazy(() => import('@/pages/RestaurantDetail'))
const Inspections      = lazy(() => import('@/pages/Inspections'))
const Mashgichim       = lazy(() => import('@/pages/Mashgichim'))
const Hechsherim       = lazy(() => import('@/pages/Hechsherim'))
const Documents        = lazy(() => import('@/pages/Documents'))
const Rabbanuts        = lazy(() => import('@/pages/Rabbanuts'))
const Users            = lazy(() => import('@/pages/Users'))
const Suggestions      = lazy(() => import('@/pages/Suggestions'))
const Logs             = lazy(() => import('@/pages/Logs'))

const PageFallback = () => (
  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
    <CircularProgress size={28} />
  </Box>
)

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageFallback />}>
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
      </Suspense>
      <GlobalSnackbar />
    </BrowserRouter>
  )
}

export default App
