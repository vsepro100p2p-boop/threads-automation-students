import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { AuthForm } from './components/AuthForm';
import { Dashboard } from './components/Dashboard';
import ToastContainer from './components/ToastContainer';

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    );
  }

  return user ? <Dashboard /> : <AuthForm />;
}

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppContent />
        <ToastContainer />
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;
