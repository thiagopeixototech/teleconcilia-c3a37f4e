import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

// Pages
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import VendasInternas from "./pages/VendasInternas";
import NovaVenda from "./pages/NovaVenda";
import LinhaOperadora from "./pages/LinhaOperadora";
import Conciliacao from "./pages/Conciliacao";
import Divergencias from "./pages/Divergencias";
import Empresas from "./pages/Empresas";
import Vendedores from "./pages/Vendedores";
import GestaoRoles from "./pages/GestaoRoles";
import CadastrosPendentes from "./pages/CadastrosPendentes";
import Operadoras from "./pages/Operadoras";
import MapeamentoColunas from "./pages/MapeamentoColunas";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/vendas"
              element={
                <ProtectedRoute>
                  <VendasInternas />
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/vendas/nova"
              element={
                <ProtectedRoute>
                  <NovaVenda />
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/linha-operadora"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <LinhaOperadora />
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/conciliacao"
              element={
                <ProtectedRoute allowedRoles={['admin', 'supervisor']}>
                  <Conciliacao />
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/divergencias"
              element={
                <ProtectedRoute allowedRoles={['admin', 'supervisor']}>
                  <Divergencias />
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/empresas"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <Empresas />
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/vendedores"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <Vendedores />
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/permissoes"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <GestaoRoles />
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/cadastros-pendentes"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <CadastrosPendentes />
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/operadoras"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <Operadoras />
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/mapeamento-colunas"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <MapeamentoColunas />
                </ProtectedRoute>
              }
            />
            
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
