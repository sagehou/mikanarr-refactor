import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './lib/store';
import Layout from './components/Layout';
import Login from './pages/Login';
import PatternList from './pages/PatternList';
import PatternEdit from './pages/PatternEdit';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuthStore();
  return token ? <>{children}</> : <Navigate to="/login" />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route index element={<PatternList />} />
          <Route path="patterns/new" element={<PatternEdit />} />
          <Route path="patterns/:id" element={<PatternEdit />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
