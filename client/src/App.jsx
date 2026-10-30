import { Routes, Route, Navigate } from "react-router-dom";
import DriverApp from "./driver/DriverApp.jsx";
import { AdminGuard, AdminLayout } from "./admin/Shell.jsx";
import Login from "./admin/Login.jsx";
import LettersPage from "./admin/LettersPage.jsx";
import TemplatesPage from "./admin/TemplatesPage.jsx";
import TemplateEditor from "./admin/TemplateEditor.jsx";
import TokensPage from "./admin/TokensPage.jsx";
import PaymentsPage from "./admin/PaymentsPage.jsx";
import { ActivityPage, ErrorsPage } from "./admin/LogsPages.jsx";
import SettingsPage from "./admin/SettingsPage.jsx";
import UsersPage from "./admin/UsersPage.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<DriverApp />} />
      <Route path="/admin/login" element={<Login />} />
      <Route path="/admin" element={<AdminGuard />}>
        <Route path="templates/new" element={<TemplateEditor />} />
        <Route path="templates/:id" element={<TemplateEditor />} />
        <Route element={<AdminLayout />}>
          <Route index element={<Navigate to="letters" replace />} />
          <Route path="letters" element={<LettersPage />} />
          <Route path="templates" element={<TemplatesPage />} />
          <Route path="tokens" element={<TokensPage />} />
          <Route path="payments" element={<PaymentsPage />} />
          <Route path="errors" element={<ErrorsPage />} />
          <Route path="activity" element={<ActivityPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="users" element={<UsersPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
