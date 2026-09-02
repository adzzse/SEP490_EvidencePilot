import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { LanguageProvider } from './context/LanguageContext';
import { ThemeProvider } from './context/ThemeContext';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import ScrollToTop from './components/ScrollToTop';
import UrgentNotificationBanner from './components/UrgentNotificationBanner';

import Home from './pages/home/index.jsx';
import Terms from './pages/Terms.jsx';
import Privacy from './pages/Privacy.jsx';
import About from './pages/About.jsx';
import Login from './pages/Login.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Profile from './pages/Profile.jsx';
import AdminDashboard from './pages/Admin/AdminDashboard.jsx';
import NotFound from './pages/NotFound.jsx';

// INSTRUCTOR SUB-SYSTEM IMPORTS
import CollectionList from './pages/Instructor/CollectionList.jsx';
import CollectionDetail from './pages/Instructor/CollectionDetail.jsx';
import ReviewRequests from './pages/Instructor/ReviewRequests.jsx';
import ReviewSpace from './pages/Instructor/ReviewSpace.jsx';
import InstructorDashboard from './pages/Instructor/Dashboard.jsx';
import ProjectManagement from './pages/Instructor/ProjectManagement.jsx';
import ProjectDetail from './pages/Instructor/ProjectDetail.jsx';
import EvidenceTraceReview from './pages/Instructor/EvidenceTraceReview.jsx';

// STUDENT SUB-SYSTEM IMPORTS
import StudentProjects from './pages/Student/Projects.jsx';
import WorkspaceLayout from './pages/Student/WorkspaceLayout.jsx';

function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <AuthProvider>
        <NotificationProvider>
        <LanguageProvider>
          <ThemeProvider>
          <UrgentNotificationBanner />
          <Routes>
            {/* Public Entry Nodes */}
            <Route path="/" element={<Home />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/about" element={<About />} />
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/register" element={<Navigate to="/login" replace />} />

            <Route path="/profile" element={
              <ProtectedRoute allowedRoles={['STUDENT', 'INSTRUCTOR', 'ADMIN']}><Profile /></ProtectedRoute>
            } />

            {/* =========================================================================
                🔓 INSTRUCTOR & ADMIN (role-gated)
               ========================================================================= */}
            <Route path="/instructor/profile" element={
              <ProtectedRoute allowedRoles={['INSTRUCTOR', 'ADMIN']}><Profile /></ProtectedRoute>
            } />
            <Route path="/admin/profile" element={
              <ProtectedRoute allowedRoles={['ADMIN']}><Profile /></ProtectedRoute>
            } />
            <Route path="/instructor/dashboard" element={
              <ProtectedRoute allowedRoles={['INSTRUCTOR', 'ADMIN']}><InstructorDashboard /></ProtectedRoute>
            } />
            <Route path="/instructor/projects" element={
              <ProtectedRoute allowedRoles={['INSTRUCTOR', 'ADMIN']}><ErrorBoundary><ProjectManagement /></ErrorBoundary></ProtectedRoute>
            } />
            <Route path="/instructor/projects/:id" element={
              <ProtectedRoute allowedRoles={['INSTRUCTOR', 'ADMIN']}><ErrorBoundary><ProjectDetail /></ErrorBoundary></ProtectedRoute>
            } />
            <Route path="/instructor/projects/:id/evidence-traces" element={
              <ProtectedRoute allowedRoles={['INSTRUCTOR', 'ADMIN']}><EvidenceTraceReview /></ProtectedRoute>
            } />
            <Route path="/instructor/requests" element={
              <ProtectedRoute allowedRoles={['INSTRUCTOR', 'ADMIN']}><ReviewRequests /></ProtectedRoute>
            } />
            <Route path="/instructor/requests/:projectId" element={
              <ProtectedRoute allowedRoles={['INSTRUCTOR', 'ADMIN']}><ErrorBoundary><ReviewSpace /></ErrorBoundary></ProtectedRoute>
            } />
            <Route path="/instructor/collections" element={
              <ProtectedRoute allowedRoles={['INSTRUCTOR', 'ADMIN']}><CollectionList /></ProtectedRoute>
            } />
            <Route path="/instructor/collections/:id" element={
              <ProtectedRoute allowedRoles={['INSTRUCTOR', 'ADMIN']}><CollectionDetail /></ProtectedRoute>
            } />
            <Route path="/admin/dashboard" element={
              <ProtectedRoute allowedRoles={['ADMIN']}><AdminDashboard /></ProtectedRoute>
            } />
            <Route path="/student/projects" element={
              <ProtectedRoute allowedRoles={['STUDENT']}><StudentProjects /></ProtectedRoute>
            } />
            <Route path="/student/projects/:projectId" element={
              <ProtectedRoute allowedRoles={['STUDENT']}><ErrorBoundary><WorkspaceLayout /></ErrorBoundary></ProtectedRoute>
            } />
            <Route path="*" element={<NotFound />} />
            
          </Routes>
          </ThemeProvider>
        </LanguageProvider>
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
