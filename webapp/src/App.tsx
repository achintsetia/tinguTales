import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { Toaster } from "sonner";
import ProtectedRoute from "./components/ProtectedRoute";
import LandingPage from "./pages/LandingPage";
import Dashboard from "./pages/Dashboard";
import CreateStory from "./pages/CreateStory";
import StoryViewer from "./pages/StoryViewer";
import AdminPage from "./pages/AdminPage";
import PaymentHistory from "./pages/PaymentHistory";

function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/create"
        element={
          <ProtectedRoute>
            <CreateStory />
          </ProtectedRoute>
        }
      />
      <Route
        path="/story/:storyId"
        element={
          <ProtectedRoute>
            <StoryViewer />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/payments"
        element={
          <ProtectedRoute>
            <PaymentHistory />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="App bg-paper min-h-screen">
          <AppRouter />
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                fontFamily: "Nunito, sans-serif",
                borderRadius: "16px",
              },
            }}
          />
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
