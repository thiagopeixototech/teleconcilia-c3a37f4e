import { 
  LayoutDashboard, 
  ShoppingCart, 
  FileText, 
  GitCompare, 
  AlertTriangle, 
  Building2, 
  Users, 
  Shield,
  LogOut,
  ChevronDown,
  ClipboardList,
  Clock,
  Radio,
  Columns,
  BarChart3,
  Upload,
  PackageOpen,
  RotateCcw,
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/contexts/AuthContext';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const mainNavItems = [
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
  { title: 'Vendas Internas', url: '/vendas', icon: ShoppingCart },
];

const cadastrosItems = [
  { title: 'Cadastros Pendentes', url: '/cadastros-pendentes', icon: Clock },
  { title: 'Empresas', url: '/empresas', icon: Building2 },
  { title: 'Operadoras', url: '/operadoras', icon: Radio },
  { title: 'Usuários', url: '/usuarios', icon: Users },
  { title: 'Cadastro em Massa', url: '/cadastro-massa', icon: Upload },
  { title: 'Permissões', url: '/permissoes', icon: Shield },
];

// Submenu Gestão - visível para admin e supervisor
const gestaoItems = [
  { title: 'Conciliação', url: '/conciliacao', icon: GitCompare },
  { title: 'Divergências', url: '/divergencias', icon: AlertTriangle },
  { title: 'Performance', url: '/performance', icon: BarChart3 },
];

// Submenu Importações - apenas admin
const importacoesItems = [
  { title: 'Vendas', url: '/importacao-vendas', icon: Upload },
  { title: 'Linha a Linha', url: '/linha-operadora', icon: FileText },
  { title: 'Estornos', url: '/importacao-estornos', icon: RotateCcw },
  { title: 'Mapeamento Colunas', url: '/mapeamento-colunas', icon: Columns },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const { signOut, vendedor, role, isAdmin } = useAuth();

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground font-bold text-lg">
            TC
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="font-semibold text-sidebar-foreground">TeleConcilia</span>
              <span className="text-xs text-sidebar-foreground/60">Sistema de Conciliação</span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="scrollbar-thin">
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50 uppercase text-xs tracking-wider">
            Principal
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink 
                      to={item.url} 
                      className="flex items-center gap-3 px-3 py-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="h-5 w-5 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Gestão - visível para admin e supervisor */}
        {(role === 'admin' || role === 'supervisor') && (
          <SidebarGroup>
            <Collapsible defaultOpen className="group/collapsible-gestao">
              <CollapsibleTrigger asChild>
                <SidebarGroupLabel className="flex items-center justify-between cursor-pointer text-sidebar-foreground/50 uppercase text-xs tracking-wider hover:text-sidebar-foreground/80 transition-colors">
                  <span className="flex items-center gap-2">
                    <GitCompare className="h-4 w-4" />
                    {!collapsed && 'Gestão'}
                  </span>
                  {!collapsed && (
                    <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]/collapsible-gestao:rotate-180" />
                  )}
                </SidebarGroupLabel>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {gestaoItems.map((item) => (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton asChild>
                          <NavLink 
                            to={item.url} 
                            className="flex items-center gap-3 px-3 py-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                            activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                          >
                            <item.icon className="h-5 w-5 shrink-0" />
                            {!collapsed && <span>{item.title}</span>}
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </Collapsible>
          </SidebarGroup>
        )}

        {/* Importações - apenas admin */}
        {isAdmin && (
          <SidebarGroup>
            <Collapsible defaultOpen className="group/collapsible-importacoes">
              <CollapsibleTrigger asChild>
                <SidebarGroupLabel className="flex items-center justify-between cursor-pointer text-sidebar-foreground/50 uppercase text-xs tracking-wider hover:text-sidebar-foreground/80 transition-colors">
                  <span className="flex items-center gap-2">
                    <PackageOpen className="h-4 w-4" />
                    {!collapsed && 'Importações'}
                  </span>
                  {!collapsed && (
                    <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]/collapsible-importacoes:rotate-180" />
                  )}
                </SidebarGroupLabel>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {importacoesItems.map((item) => (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton asChild>
                          <NavLink 
                            to={item.url} 
                            className="flex items-center gap-3 px-3 py-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                            activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                          >
                            <item.icon className="h-5 w-5 shrink-0" />
                            {!collapsed && <span>{item.title}</span>}
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </Collapsible>
          </SidebarGroup>
        )}

        {isAdmin && (
          <>
            <SidebarGroup>
              <Collapsible defaultOpen className="group/collapsible-cadastros">
                <CollapsibleTrigger asChild>
                  <SidebarGroupLabel className="flex items-center justify-between cursor-pointer text-sidebar-foreground/50 uppercase text-xs tracking-wider hover:text-sidebar-foreground/80 transition-colors">
                    <span className="flex items-center gap-2">
                      <ClipboardList className="h-4 w-4" />
                      {!collapsed && 'Cadastros'}
                    </span>
                    {!collapsed && (
                      <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]/collapsible-cadastros:rotate-180" />
                    )}
                  </SidebarGroupLabel>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {cadastrosItems.map((item) => (
                        <SidebarMenuItem key={item.title}>
                          <SidebarMenuButton asChild>
                            <NavLink 
                              to={item.url} 
                              className="flex items-center gap-3 px-3 py-2 rounded-md text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
                              activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                            >
                              <item.icon className="h-5 w-5 shrink-0" />
                              {!collapsed && <span>{item.title}</span>}
                            </NavLink>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </CollapsibleContent>
              </Collapsible>
            </SidebarGroup>

          </>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        {!collapsed && vendedor && (
          <div className="mb-3 px-2">
            <p className="text-sm font-medium text-sidebar-foreground truncate">{vendedor.nome}</p>
            <p className="text-xs text-sidebar-foreground/60 capitalize">{role}</p>
          </div>
        )}
        <Button 
          variant="ghost" 
          size={collapsed ? "icon" : "default"}
          onClick={signOut}
          className={cn(
            "w-full text-sidebar-foreground hover:bg-sidebar-accent hover:text-destructive",
            collapsed ? "justify-center" : "justify-start gap-3"
          )}
        >
          <LogOut className="h-5 w-5" />
          {!collapsed && <span>Sair</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
