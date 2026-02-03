import { Menu } from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';

interface AppHeaderProps {
  title?: string;
}

export function AppHeader({ title }: AppHeaderProps) {
  const { vendedor, role } = useAuth();

  const getRoleBadgeVariant = () => {
    switch (role) {
      case 'admin':
        return 'default';
      case 'supervisor':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b bg-card px-6">
      <SidebarTrigger className="text-muted-foreground hover:text-foreground">
        <Menu className="h-5 w-5" />
      </SidebarTrigger>
      
      {title && (
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
      )}

      <div className="ml-auto flex items-center gap-4">
        {vendedor?.empresa && (
          <span className="text-sm text-muted-foreground hidden md:block">
            {vendedor.empresa.nome}
          </span>
        )}
        {role && (
          <Badge variant={getRoleBadgeVariant()} className="capitalize">
            {role}
          </Badge>
        )}
      </div>
    </header>
  );
}
