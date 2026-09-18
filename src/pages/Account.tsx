import {
  CalendarDays,
  ClipboardList,
  Gift,
  Headphones,
  KeyRound,
  Mail,
  UserCircle,
} from 'lucide-react';
import type { Page } from '../App';
import { openSupportChat } from '../components/SupportChat';
import { Badge, Button, Card, CardContent, CardHeader, EmptyState } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';

interface AccountProps {
  onNavigate: (page: Page) => void;
  onOpenChangePassword: () => void;
}

const formatBirthDate = (birthDate: string | null | undefined) => {
  if (!birthDate) return 'No registrada';

  const date = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'No registrada';

  return date.toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

export function Account({ onNavigate, onOpenChangePassword }: AccountProps) {
  const { isAdmin, loading, profile, user } = useAuth();

  return (
    <div className="min-h-full overflow-x-hidden bg-academy-background">
      <header className="border-b border-academy-border bg-academy-surface">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
          <Badge variant="primary">CUENTA</Badge>
          <h1 className="mt-4 text-4xl font-bold text-academy-text sm:text-af-h1">Mi cuenta</h1>
          <p className="mt-4 max-w-2xl text-af-body-lg text-academy-text-muted">
            Consulta la información de tu perfil y administra el acceso a tu cuenta.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        {loading ? (
          <div role="status" aria-live="polite" className="py-16 text-center text-af-body-sm text-academy-text-muted">
            Cargando tu cuenta…
          </div>
        ) : !user ? (
          <EmptyState
            className="bg-academy-surface"
            icon={<UserCircle className="h-12 w-12" />}
            title="Inicia sesión para ver tu cuenta"
            description="Debes iniciar sesión para consultar tu cuenta."
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-af-h3 text-academy-text">Información del perfil</h2>
                  <p className="mt-1 text-af-body-sm text-academy-text-muted">Datos asociados a tu cuenta de Academy Flow.</p>
                </div>
                {isAdmin && <Badge variant="primary">Administrador</Badge>}
              </CardHeader>
              <CardContent>
                <dl className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
                  <div>
                    <dt className="flex items-center gap-2 text-af-label-sm text-academy-text-muted">
                      <UserCircle className="h-4 w-4" aria-hidden="true" />
                      Nombre
                    </dt>
                    <dd className="mt-1 break-words text-af-body font-semibold text-academy-text">
                      {profile?.first_name || 'No registrado'}
                    </dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-2 text-af-label-sm text-academy-text-muted">
                      <UserCircle className="h-4 w-4" aria-hidden="true" />
                      Apellido
                    </dt>
                    <dd className="mt-1 break-words text-af-body font-semibold text-academy-text">
                      {profile?.last_name || 'No registrado'}
                    </dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-2 text-af-label-sm text-academy-text-muted">
                      <Mail className="h-4 w-4" aria-hidden="true" />
                      Correo electrónico
                    </dt>
                    <dd className="mt-1 break-all text-af-body font-semibold text-academy-text">
                      {user.email || 'No registrado'}
                    </dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-2 text-af-label-sm text-academy-text-muted">
                      <CalendarDays className="h-4 w-4" aria-hidden="true" />
                      Fecha de nacimiento
                    </dt>
                    <dd className="mt-1 text-af-body font-semibold text-academy-text">
                      {formatBirthDate(profile?.birth_date)}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h2 className="text-af-h3 text-academy-text">Accesos rápidos</h2>
                <p className="mt-1 text-af-body-sm text-academy-text-muted">Consulta tus pedidos y beneficios desde un solo lugar.</p>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                <Button
                  variant="secondary"
                  className="w-full"
                  leadingIcon={<ClipboardList className="h-4 w-4" aria-hidden="true" />}
                  onClick={() => onNavigate('orders')}
                >
                  Ver mis órdenes
                </Button>
                <Button
                  variant="secondary"
                  className="w-full"
                  leadingIcon={<Gift className="h-4 w-4" aria-hidden="true" />}
                  onClick={() => onNavigate('referrals')}
                >
                  Ver mis referidos
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h2 className="text-af-h3 text-academy-text">Seguridad</h2>
                <p className="mt-1 text-af-body-sm text-academy-text-muted">Mantén actualizada la contraseña con la que accedes.</p>
              </CardHeader>
              <CardContent>
                <Button
                  variant="secondary"
                  className="w-full sm:w-auto"
                  leadingIcon={<KeyRound className="h-4 w-4" aria-hidden="true" />}
                  onClick={onOpenChangePassword}
                >
                  Cambiar contraseña
                </Button>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <h2 className="text-af-h3 text-academy-text">Ayuda y soporte</h2>
                <p className="mt-1 text-af-body-sm text-academy-text-muted">¿Necesitas ayuda con tu cuenta o un pedido?</p>
              </CardHeader>
              <CardContent>
                <Button
                  className="w-full sm:w-auto"
                  leadingIcon={<Headphones className="h-4 w-4" aria-hidden="true" />}
                  onClick={() => openSupportChat()}
                >
                  Contactar soporte
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
