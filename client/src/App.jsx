import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';

// Lazy load portals
const Login = lazy(() => import('./pages/Login'));

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

function Loading() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'DM Sans,sans-serif', color: '#5A6272' }}>
      <div>Loading…</div>
    </div>
  );
}

function AuthGuard({ children, roles }) {
  const token = localStorage.getItem('hmc_token');
  if (!token) return <Navigate to="/login" replace />;

  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.exp * 1000 < Date.now()) {
      localStorage.removeItem('hmc_token');
      return <Navigate to="/login" replace />;
    }
    if (roles && !roles.includes(payload.role)) {
      const roleMap = { admin: '/admin', teacher_admin: '/ta', faculty: '/faculty', admissions: '/admissions', student: '/student' };
      return <Navigate to={roleMap[payload.role] || '/login'} replace />;
    }
  } catch {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />
          <Route path="/apply" element={<ApplyPage />} />
          <Route path="/references/:token" element={<ReferenceForm />} />
          <Route path="/verify/:uuid" element={<TranscriptVerify />} />
          <Route path="/certificates/verify/:uuid" element={<TranscriptVerify type="certificate" />} />

          {/* Admin */}
          <Route path="/admin" element={<AuthGuard roles={['admin']}><AdminLayout /></AuthGuard>}>
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

          {/* Admissions */}
          <Route path="/admissions" element={<AuthGuard roles={['admissions']}><AdmissionsLayout /></AuthGuard>}>
            <Route index element={<AdmissionsDashboard />} />
            <Route path="pipeline" element={<Pipeline />} />
            <Route path="new" element={<NewApplicant />} />
            <Route path="interviews" element={<Interviews />} />
            <Route path="references" element={<References />} />
            <Route path="fees" element={<FeeRecording />} />
          </Route>

          {/* Faculty */}
          <Route path="/faculty" element={<AuthGuard roles={['faculty']}><FacultyLayout /></AuthGuard>}>
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

          {/* Teacher-Admin */}
          <Route path="/ta" element={<AuthGuard roles={['teacher_admin']}><TALayout /></AuthGuard>}>
            <Route index element={<TAAdminDashboard />} />
            <Route path="assignments" element={<CourseAssignment />} />
            <Route path="progression" element={<BatchProgression />} />
            <Route path="exceptions" element={<AcademicExceptions />} />
            <Route path="grades" element={<AllGrades />} />
            <Route path="fees" element={<RecordFees />} />
          </Route>

          {/* Student */}
          <Route path="/student" element={<AuthGuard roles={['student']}><StudentLayout /></AuthGuard>}>
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

          {/* Default */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
