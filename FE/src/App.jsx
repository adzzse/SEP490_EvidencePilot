import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { LanguageProvider } from './context/LanguageContext';
import { ThemeProvider } from './context/ThemeContext';
import ProtectedRoute from './routes/ProtectedRoute';
import ErrorBoundary from './components/layout/ErrorBoundary';
import ScrollToTop from './components/layout/ScrollToTop';
import UrgentNotificationBanner from './components/features/UrgentNotificationBanner';

const Home = lazy(() => import('./pages/home/index.jsx'));
const Terms = lazy(() => import('./pages/Terms.jsx'));
const Privacy = lazy(() => import('./pages/Privacy.jsx'));
const About = lazy(() => import('./pages/About.jsx'));
const Login = lazy(() => import('./pages/Login.jsx'));
const ResetPassword = lazy(() => import('./pages/ResetPassword.jsx'));
const SetPassword = lazy(() => import('./pages/SetPassword.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));
const AdminDashboard = lazy(() => import('./pages/Admin/AdminDashboard.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

// INSTRUCTOR SUB-SYSTEM IMPORTS
const CollectionList = lazy(() => import('./pages/Instructor/CollectionList.jsx'));
const CollectionDetail = lazy(() => import('./pages/Instructor/CollectionDetail.jsx'));
const ReviewRequests = lazy(() => import('./pages/Instructor/ReviewRequests.jsx'));
const ReviewSpace = lazy(() => import('./pages/Instructor/ReviewSpace.jsx'));
const InstructorDashboard = lazy(() => import('./pages/Instructor/Dashboard.jsx'));
const ProjectManagement = lazy(() => import('./pages/Instructor/ProjectManagement.jsx'));
const ProjectDetail = lazy(() => import('./pages/Instructor/ProjectDetail.jsx'));
const EvidenceTraceReview = lazy(() => import('./pages/Instructor/EvidenceTraceReview.jsx'));
const SourceLibrary = lazy(() => import('./pages/Instructor/SourceLibrary.jsx'));

// STUDENT SUB-SYSTEM IMPORTS
const StudentProjects = lazy(() => import('./pages/Student/Projects.jsx'));
const WorkspaceLayout = lazy(() => import('./pages/Student/WorkspaceLayout.jsx'));

function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <AuthProvider>
        <NotificationProvider>
        <LanguageProvider>
          <ThemeProvider>
          <UrgentNotificationBanner />
          <Suspense fallback={<div className="min-h-screen grid place-items-center" role="status">Loading...</div>}>
          <Routes>
            {/* Public Entry Nodes */}
            <Route path="/" element={<Home />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/about" element={<About />} />
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/set-password" element={<SetPassword />} />
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
            <Route path="/instructor/source-library" element={
              <ProtectedRoute allowedRoles={['INSTRUCTOR', 'ADMIN']}><ErrorBoundary><SourceLibrary /></ErrorBoundary></ProtectedRoute>
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
          </Suspense>
          </ThemeProvider>
        </LanguageProvider>
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
