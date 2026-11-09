import { Routes, Route, useLocation } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import VerifyEmail from "./pages/VerifyEmail";
import Problems from "./pages/Problems";
import ProblemDetails from "./pages/ProblemDetails";
import Submissions from "./pages/Submissions";
import Learn from "./pages/Learn";
import LearnTopic from "./pages/LearnTopic";
import Navbar from "./components/Navbar";
import AdminDashboard from "./pages/AdminDashboard";
import Profile from "./pages/Profile";
import Contests from "./pages/Contests";
import SubmissionDetails from "./pages/SubmissionDetails";
import AdminSubmissions from "./pages/AdminSubmissions";
import AdminUsers from "./pages/AdminUsers";
import ContestDetails from "./pages/ContestDetails";
import AdminContests from "./pages/AdminContests";
import AdminContestControl from "./pages/AdminContestControl";
import ContestLeaderboardPage from "./pages/ContestLeaderboardPage";
import AdminProblems from "./pages/AdminProblems";
import AdminAuditLogs from "./pages/AdminAuditLogs";
import LearningContentManagement from "./pages/LearningContentManagement";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";

function App() {
  const location = useLocation();

  const getPageTitle = () => {
    const path = location.pathname;

    if (path.startsWith("/profile") || path.startsWith("/users/"))
      return "Profile";
    if (/^\/contests\/[1-9]\d*\/leaderboard\/?$/.test(path))
      return "Contest Leaderboard";
    if (path.startsWith("/admin/contests/")) return "Contest Control Center";
    if (path.startsWith("/admin/contests")) return "Contest Control";
    if (path.startsWith("/admin/problems")) return "Problem Management";
    if (path.startsWith("/admin/submissions")) return "Submissions Control";
    if (path.startsWith("/admin/users")) return "User Control";
    if (path.startsWith("/admin/audit-logs")) return "Audit Logs";
    if (path.startsWith("/admin/learning"))
      return "Learning Content Management";
    if (path.startsWith("/admin")) return "Admin Dashboard";
    if (path.startsWith("/login")) return "Login";
    if (path.startsWith("/verify-email")) return "Verify your email";
    if (path.startsWith("/register")) return "Register";
    if (path.startsWith("/submissions")) return "Submissions";
    if (path.startsWith("/learn/topic/")) return "Learn Topic";
    if (path.startsWith("/learn")) return "Learning Hub";
    if (path.startsWith("/contests/")) return "Contest Details";
    if (path.startsWith("/contests"))
      return "Compete With Others to Judge Your Coding Skill";
    if (path.startsWith("/problems/")) return "Problem Details";
    if (path.startsWith("/problems")) return "Problems";
    if (path.startsWith("/forgot-password")) return "Forgot Password";
    if (path.startsWith("/reset-password")) return "Reset Password";

    // return "Problems";
  };

  const getPageSubtitle = () => {
    const path = location.pathname;

    if (path.startsWith("/profile") || path.startsWith("/users/"))
      return "Coding activity, solved problems, and contest performance";
    if (/^\/contests\/[1-9]\d*\/leaderboard\/?$/.test(path))
      return "Follow solves, penalty time, and contest standings";
    if (path.startsWith("/admin/contests/"))
      return "Edit contest details, manage deadlines, and publish schedule changes";
    if (path.startsWith("/admin/contests"))
      return "Create contests, assign problems, and open contest controls";
    if (path.startsWith("/admin/problems"))
      return "Create and manage problem statements and test cases";
    if (path.startsWith("/admin/submissions"))
      return "Monitor code runs, verdicts, and results";
    if (path.startsWith("/admin/users"))
      return "Manage student and administrator accounts";
    if (path.startsWith("/admin/audit-logs"))
      return "View audit logs and track system activities";
    if (path.startsWith("/admin/learning"))
      return "Manage lessons, topics, and learning content";
    if (path.startsWith("/admin")) return "Admin Dashboard";
    if (path.startsWith("/login"))
      return "Access your futuristic coding workspace";
    if (path.startsWith("/verify-email")) return "Enter the code sent to your email to finish registration";
    if (path.startsWith("/register"))
      return "Create your account and start solving";
    if (path.startsWith("/submissions"))
      return "Track code runs, verdicts, and results";
    if (path.startsWith("/learn/topic/"))
      return "Study the lesson and practice in the editor";
    if (path.startsWith("/learn"))
      return "Explore courses and learn through guided coding";
    if (path.startsWith("/contests/"))
      return "View the contest schedule and assigned problems";
    if (path.startsWith("/contests"))
      return "Explore upcoming, live, and completed contests";
    if (path.startsWith("/problems/"))
      return "Read the statement and submit your solution";
    if (path.startsWith("/problems"))
      return "Browse challenges and sharpen your problem solving";
    if (path.startsWith("/forgot-password"))
      return "Reset your password and regain access to your account";
    if (path.startsWith("/reset-password"))
      return "Set a new password and secure your account";

    // return "Browse challenges and sharpen your problem solving";
  };

  return (
    <div className="app-shell flex flex-col bg-[radial-gradient(circle_at_top_left,rgba(61,217,255,0.16),transparent_28%),radial-gradient(circle_at_top_right,rgba(109,124,255,0.18),transparent_32%),linear-gradient(135deg,#070b17,#0b1020)] text-slate-100 md:flex-row">
      <Navbar />

      <main className="app-main flex-1 p-4 md:p-6">
        <div className="mb-6 flex flex-col gap-4 rounded-[22px] border border-white/10 bg-slate-900/50 p-5 shadow-2xl backdrop-blur-xl lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              {getPageTitle()}
            </h1>
            <p className="mt-1 text-sm text-slate-400">{getPageSubtitle()}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-300">
              DPC-OJ
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-300">
              V.1.0
            </span>
          </div>
        </div>

        <Routes>
          <Route path="/" element={<Problems />} />
          <Route path="/problems" element={<Problems />} />
          <Route path="/contests" element={<Contests />} />
          <Route path="/contests/:id" element={<ContestDetails />} />
          <Route
            path="/contests/:id/leaderboard"
            element={<ContestLeaderboardPage />}
          />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/problems" element={<AdminProblems />} />
          <Route
            path="/admin/learning"
            element={<LearningContentManagement />}
          />
          <Route path="/profile" element={<Profile />} />
          <Route path="/users/:id" element={<Profile />} />
          <Route path="/admin/contests" element={<AdminContests />} />
          <Route path="/admin/contests/:id" element={<AdminContestControl />} />
          <Route path="/problems/:id" element={<ProblemDetails />} />
          <Route
            path="/submissions/:submissionId"
            element={<SubmissionDetails />}
          />
          <Route path="/submissions" element={<Submissions />} />
          <Route path="/admin/submissions" element={<AdminSubmissions />} />
          <Route path="/admin/audit-logs" element={<AdminAuditLogs />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="/learn/topic/:topicId" element={<LearnTopic />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
