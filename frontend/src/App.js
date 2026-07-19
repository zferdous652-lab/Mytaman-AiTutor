import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";

import { AuthProvider } from "@/context/AuthContext";
import { LangProvider } from "@/context/LangContext";
import RequireRole from "@/components/RequireRole";
import DashboardShell from "@/components/DashboardShell";

import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Register from "@/pages/Register";

import AdminOverview from "@/pages/admin/Overview";
import AdminGenerate from "@/pages/admin/Generate";
import AdminManualContent from "@/pages/admin/ManualContent";
import AdminRouter from "@/pages/admin/Router";
import AdminPacks from "@/pages/admin/Packs";
import AdminStudents from "@/pages/admin/Students";

import { StudentHome, StudentBrowse } from "@/pages/student/Student";
import { ParentHome, ParentPacks } from "@/pages/parent/Parent";

const AdminLayout = ({ children }) => (
  <RequireRole roles={["admin"]}>
    <DashboardShell>{children}</DashboardShell>
  </RequireRole>
);
const StudentLayout = ({ children }) => (
  <RequireRole roles={["student"]}>
    <DashboardShell>{children}</DashboardShell>
  </RequireRole>
);
const ParentLayout = ({ children }) => (
  <RequireRole roles={["parent"]}>
    <DashboardShell>{children}</DashboardShell>
  </RequireRole>
);

function App() {
  return (
    <LangProvider>
      <AuthProvider>
        <div className="App">
          <Toaster position="top-right" theme="dark" richColors />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />

              <Route path="/admin" element={<AdminLayout><AdminOverview /></AdminLayout>} />
              <Route path="/admin/generate" element={<AdminLayout><AdminGenerate /></AdminLayout>} />
              <Route path="/admin/manual" element={<AdminLayout><AdminManualContent /></AdminLayout>} />
              <Route path="/admin/router" element={<AdminLayout><AdminRouter /></AdminLayout>} />
              <Route path="/admin/packs" element={<AdminLayout><AdminPacks /></AdminLayout>} />
              <Route path="/admin/students" element={<AdminLayout><AdminStudents /></AdminLayout>} />

              <Route path="/student" element={<StudentLayout><StudentHome /></StudentLayout>} />
              <Route path="/student/browse" element={<StudentLayout><StudentBrowse /></StudentLayout>} />

              <Route path="/parent" element={<ParentLayout><ParentHome /></ParentLayout>} />
              <Route path="/parent/packs" element={<ParentLayout><ParentPacks /></ParentLayout>} />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </div>
      </AuthProvider>
    </LangProvider>
  );
}

export default App;
