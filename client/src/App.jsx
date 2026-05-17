import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// Lazy load portals
const Login = lazy(() => import('./pages/Login'));
const ChangePassword = lazy(() => import('./pages/ChangePassword'));
const ResetPassword = lazy(() => import('./pages/public/ResetPassword'));

const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'));
const UserManagement = lazy(() => import('./pages/admin/UserManagement'));
const Finance = lazy(() => import('./pages/admin/Finance'));
const FeeSettings = lazy(() => import('./pages/admin/FeeSettings'));
const Programmes = lazy(() => import('./pages/admin/Programmes'));
const Semesters = lazy(() => import('./pages/admin/Semesters'));
const Subjects = lazy(() => import('./pages/admin/Subjects'));
const AdmissionsView = lazy(() => import('./pages/admin/AdmissionsView'));
const Reports = lazy(() => import('./pages/admin/Reports'));
const Messages = lazy(() => import('./pages/admin/Messages'));
const SystemSettings = lazy(() => import('./pages/admin/SystemSettings'));

const AdmissionsLayout = lazy(() => import('./pages/admissions/AdmissionsLayout'));
const AdmissionsDashboard = lazy(() => import('./pages/admissions/Dashboard'));
const Pipeline = lazy(() => import('./pages/admissions/Pipeline'));
const NewApplicant = lazy(() => import('./pages/admissions/NewApplicant'));
const Interviews = lazy(() => import('./pages/admissions/Interviews'));
const References = lazy(() => import('./pages/admissions/References'));
const FeeRecording = lazy(() => import('./pages/admissions/FeeRecording'));

const FacultyLayout = lazy(() => import('./pages/faculty/FacultyLayout'));
const FacultyDashboard = lazy(() => import('./pages/faculty/Dashboard'));
const MySubjects = lazy(() => import('./pages/faculty/MySubjects'));
const CourseContent = lazy(() => import('./pages/faculty/CourseContent'));
const FacultyExams = lazy(() => import('./pages/faculty/Exams'));
const QuestionBank = lazy(() => import('./pages/faculty/QuestionBank'));
const Gradebook = lazy(() => import('./pages/faculty/Gradebook'));
const AttendancePage = lazy(() => import('./pages/faculty/Attendance'));
const FacultyStudents = lazy(() => import('./pages/faculty/Students'));
const FacultyTimetable = lazy(() => import('./pages/faculty/Timetable'));
const FacultyMessages = lazy(() => import('./pages/faculty/Messages'));

const TALayout = lazy(() => import('./pages/teacher_admin/TALayout'));
const TAAdminDashboard = lazy(() => import('./pages/teacher_admin/AdminDashboard'));
const CourseAssignment = lazy(() => import('./pages/teacher_admin/CourseAssignment'));
const BatchProgression = lazy(() => import('./pages/teacher_admin/BatchProgression'));
const AcademicExceptions = lazy(() => import('./pages/teacher_admin/AcademicExceptions'));
const AllGrades = lazy(() => import('./pages/teacher_admin/AllGrades'));
const RecordFees = lazy(() => import('./pages/teacher_admin/RecordFees'));

const StudentLayout = lazy(() => import('./pages/student/StudentLayout'));
const StudentDashboard = lazy(() => import('./pages/student/Dashboard'));
const StudentMySubjects = lazy(() => import('./pages/student/MySubjects'));
const StudentCourseContent = lazy(() => import('./pages/student/CourseContent'));
const StudentExams = lazy(() => import('./pages/student/Exams'));
const ExamTaking = lazy(() => import('./pages/student/ExamTaking'));
const Marksheet = lazy(() => import('./pages/student/Marksheet'));
const StudentTimetable = lazy(() => import('./pages/student/Timetable'));
const StudentFees = lazy(() => import('./pages/student/Fees'));
const Referrals = lazy(() => import('./pages/student/Referrals'));
const Help = lazy(() => import('./pages/student/Help'));
const Notifications = lazy(() => import('./pages/student/Notifications'));
const StudentProfile = lazy(() => import('./pages/student/Profile'));

// Public pages
const ReferenceForm = lazy(() => import('./pages/public/ReferenceForm'));
const TranscriptVerify = lazy(() => import('./pages/public/TranscriptVerify'));
const ApplyPage = lazy(() => import('./pages/public/ApplyPage'));
const ApplyStart = lazy(() => import('./pages/public/ApplyStart'));
const ApplyContinue = lazy(() => import('./pages/public/ApplyContinue'));
const ApplyStatus = lazy(() => import('./pages/public/ApplyStatus'));

const ROLE_HOME = {
  FULL_ADMIN: '/admin',
  TEACHER_ADMIN: '/ta',
  FACULTY: '/faculty',
  ADMISSIONS_OFFICER: '/admissions',
  STUDENT: '/student',
};

// JWTs are base64url-encoded — convert to standard base64 before atob so payloads
// containing `-`/`_` chars don't throw and silently log the user out.
function decodeJwtPayload(token) {
  const b64url = token.split('.')[1];
  if (!b64url) return null;
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  return JSON.parse(atob(padded));
}

function readSession() {
  const token = localStorage.getItem('hmc_token');
  if (!token) return null;
  try {
    const payload = decodeJwtPayload(token);
    if (!payload || payload.exp * 1000 < Date.now()) {
      localStorage.removeItem('hmc_token');
      localStorage.removeItem('hmc_user');
      return null;
    }
    return payload;
  } catch {
    localStorage.removeItem('hmc_token');
    localStorage.removeItem('hmc_user');
    return null;
  }
}

function Loading() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'DM Sans,sans-serif', color: '#5A6272' }}>
      <div>Loading…</div>
    </div>
  );
}

// Protected route — requires authentication, optionally a specific role
function AuthGuard({ children, roles }) {
  const session = readSession();
  if (!session) return <Navigate to="/login" replace />;

  // If the token says the user must change password, force them to the change-password page
  // (allow them onto /change-password itself, otherwise everything redirects there)
  if (session.mustChangePassword && window.location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  if (roles && !roles.includes(session.role)) {
    return <Navigate to={ROLE_HOME[session.role] || '/login'} replace />;
  }
  return children;
}

// Public-only route — for /login, /apply, etc. Redirects authenticated users to their home
function PublicOnly({ children }) {
  const session = readSession();
  if (session) {
    return <Navigate to={ROLE_HOME[session.role] || '/'} replace />;
  }
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          {/* Public — redirect away if already logged in */}
          <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
          <Route path="/apply" element={<ApplyPage />} />
          <Route path="/apply/start" element={<ApplyStart />} />
          <Route path="/apply/continue" element={<ApplyContinue />} />
          <Route path="/apply/status" element={<ApplyStatus />} />

          {/* Public — always accessible (token-based, no auth) */}
          <Route path="/references/:token" element={<ReferenceForm />} />
          <Route path="/verify/:uuid" element={<TranscriptVerify />} />
          <Route path="/certificates/verify/:uuid" element={<TranscriptVerify type="certificate" />} />
          <Route path="/reset-password/:token" element={<ResetPassword />} />

          {/* Authenticated — any role */}
          <Route path="/change-password" element={<AuthGuard><ChangePassword /></AuthGuard>} />

          {/* Admin — FULL_ADMIN only */}
          <Route path="/admin" element={<AuthGuard roles={['FULL_ADMIN']}><AdminLayout /></AuthGuard>}>
            <Route index element={<AdminDashboard />} />
            <Route path="users" element={<UserManagement />} />
            <Route path="finance" element={<Finance />} />
            <Route path="fee-settings" element={<FeeSettings />} />
            <Route path="programmes" element={<Programmes />} />
            <Route path="semesters" element={<Semesters />} />
            <Route path="subjects" element={<Subjects />} />
            <Route path="admissions" element={<AdmissionsView />} />
            <Route path="reports" element={<Reports />} />
            <Route path="messages" element={<Messages />} />
            <Route path="settings" element={<SystemSettings />} />
          </Route>

          {/* Admissions — ADMISSIONS_OFFICER, FULL_ADMIN */}
          <Route path="/admissions" element={<AuthGuard roles={['ADMISSIONS_OFFICER', 'FULL_ADMIN']}><AdmissionsLayout /></AuthGuard>}>
            <Route index element={<AdmissionsDashboard />} />
            <Route path="pipeline" element={<Pipeline />} />
            <Route path="new" element={<NewApplicant />} />
            <Route path="interviews" element={<Interviews />} />
            <Route path="references" element={<References />} />
            <Route path="fees" element={<FeeRecording />} />
          </Route>

          {/* Faculty — FACULTY, TEACHER_ADMIN */}
          <Route path="/faculty" element={<AuthGuard roles={['FACULTY', 'TEACHER_ADMIN']}><FacultyLayout /></AuthGuard>}>
            <Route index element={<FacultyDashboard />} />
            <Route path="subjects" element={<MySubjects />} />
            <Route path="content" element={<CourseContent />} />
            <Route path="exams" element={<FacultyExams />} />
            <Route path="question-bank" element={<QuestionBank />} />
            <Route path="gradebook" element={<Gradebook />} />
            <Route path="attendance" element={<AttendancePage />} />
            <Route path="students" element={<FacultyStudents />} />
            <Route path="timetable" element={<FacultyTimetable />} />
            <Route path="messages" element={<FacultyMessages />} />
          </Route>

          {/* Teacher-Admin — TEACHER_ADMIN only */}
          <Route path="/ta" element={<AuthGuard roles={['TEACHER_ADMIN']}><TALayout /></AuthGuard>}>
            <Route index element={<TAAdminDashboard />} />
            <Route path="assignments" element={<CourseAssignment />} />
            <Route path="progression" element={<BatchProgression />} />
            <Route path="exceptions" element={<AcademicExceptions />} />
            <Route path="grades" element={<AllGrades />} />
            <Route path="fees" element={<RecordFees />} />
          </Route>

          {/* Student — STUDENT only */}
          <Route path="/student" element={<AuthGuard roles={['STUDENT']}><StudentLayout /></AuthGuard>}>
            <Route index element={<StudentDashboard />} />
            <Route path="subjects" element={<StudentMySubjects />} />
            <Route path="content" element={<StudentCourseContent />} />
            <Route path="exams" element={<StudentExams />} />
            <Route path="exams/:examId/take" element={<ExamTaking />} />
            <Route path="marksheet" element={<Marksheet />} />
            <Route path="timetable" element={<StudentTimetable />} />
            <Route path="fees" element={<StudentFees />} />
            <Route path="referrals" element={<Referrals />} />
            <Route path="help" element={<Help />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="profile" element={<StudentProfile />} />
          </Route>

          {/* Default — send to login (PublicOnly there bounces logged-in users to their home) */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
