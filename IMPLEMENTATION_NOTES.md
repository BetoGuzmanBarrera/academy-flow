# Academy Flow — Primera corrección técnica

## Cambios incluidos

- Se agregó un perfil automático para cada usuario registrado mediante un trigger de Supabase Auth.
- Se añadió el rol `user | admin` y una función segura `is_admin()` para las políticas RLS.
- Se agregó un panel administrativo con:
  - resumen de métricas;
  - creación y edición de categorías y servicios;
  - cambio de estado de órdenes;
  - respuesta a mensajes de soporte;
  - bitácora de acciones administrativas.
- Se sustituyó el checkout directo desde React por la RPC transaccional `create_pending_order`.
- Los precios y el descuento por referido ahora se calculan dentro de PostgreSQL.
- Los usuarios ya no pueden marcar sus propias órdenes como `completed`.
- Se eliminó el formulario simulado que pedía número de tarjeta y CVV sin un procesador real.
- Las órdenes quedan en `pending` hasta que exista confirmación real de pago o un administrador las revise.
- La validación de códigos de referido ahora usa una RPC y ya no requiere exponer todos los códigos públicamente.

## Instalación

1. Crea una copia de seguridad de tu base de datos.
2. Aplica las migraciones en orden, incluyendo:

```text
supabase/migrations/20260805000100_admin_and_secure_checkout.sql
```

Puedes pegarla en el SQL Editor de Supabase o aplicar las migraciones con tu flujo habitual.

3. Crea el archivo `.env` a partir de `.env.example` y coloca la URL y la clave pública de tu proyecto.
4. Instala dependencias y ejecuta la aplicación:

```bash
npm install
npm run typecheck
npm run dev
```

## Convertir tu cuenta en administrador

Primero registra la cuenta desde la aplicación. Después ejecuta en el SQL Editor, reemplazando el correo:

```sql
UPDATE public.profiles
SET role = 'admin', updated_at = now()
WHERE id = (
  SELECT id
  FROM auth.users
  WHERE email = 'TU_CORREO@EJEMPLO.COM'
);
```

Cierra sesión y vuelve a ingresar. En el encabezado aparecerá **Administración**.

## Importante antes de publicar

Esta entrega crea una base más segura, pero todavía no debe considerarse lista para producción financiera:

- Stripe y PayPal aún no están conectados.
- Las credenciales de plataformas educativas siguen almacenándose en texto plano y necesitan cifrado reversible del lado servidor.
- El cambio manual de una orden a `completed` es provisional; cuando se integre Stripe, debe hacerlo un webhook validado.
- CFDI todavía almacena datos fiscales, pero no genera ni timbra una factura real.
- El formulario público de soporte todavía necesita CAPTCHA o rate limiting.
- Pendiente de configuración en el panel de Supabase (no puede hacerse desde el código):
  en Authentication → Passwords, subir la longitud mínima de contraseña (8 o más) y
  activar "Leaked password protection" (verificación contra HaveIBeenPwned). Hoy el
  mínimo de 6 caracteres solo se valida en el navegador.

## Archivos principales modificados

```text
src/App.tsx
src/components/AuthModal.tsx
src/components/Header.tsx
src/contexts/AuthContext.tsx
src/lib/database.types.ts
src/pages/Admin.tsx
src/pages/Checkout.tsx
src/pages/Orders.tsx
supabase/migrations/20260805000100_admin_and_secure_checkout.sql
```
