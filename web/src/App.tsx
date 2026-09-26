import { Route, Routes } from 'react-router';
import { AuthProvider } from './auth/AuthContext';
import { RequireRole } from './auth/RequireRole';
import { Layout } from './components/Layout';
import { DriverHistoryPage } from './pages/driver/DriverHistoryPage';
import { DriverPage } from './pages/driver/DriverPage';
import { HomeRedirect } from './pages/HomeRedirect';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { HistoryPage } from './pages/passenger/HistoryPage';
import { RidePage } from './pages/passenger/RidePage';
import { RegisterPage } from './pages/RegisterPage';

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route element={<Layout />}>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/ride" element={<RequireRole role="PASSENGER"><RidePage /></RequireRole>} />
          <Route path="/history" element={<RequireRole role="PASSENGER"><HistoryPage /></RequireRole>} />
          <Route path="/driver" element={<RequireRole role="DRIVER"><DriverPage /></RequireRole>} />
          <Route path="/driver/history" element={<RequireRole role="DRIVER"><DriverHistoryPage /></RequireRole>} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
