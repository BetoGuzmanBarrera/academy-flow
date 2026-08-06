# Academy Flow - Prompt de Transferencia de Proyecto

## Descripción del Proyecto

**Academy Flow** es una plataforma web de venta de servicios educativos. Los clientes pueden registrarse, iniciar sesión, navegar un catálogo de servicios educativos por categorías (ALEKS Universidad, ALEKS Preparatoria, Cambridge One, Coursera Excel, National Geographic Learning), agregarlos a un carrito, y completar una compra proporcionando credenciales de acceso a las plataformas. Incluye sistema de referidos con descuento del 30%, historial de órdenes, soporte de chat, facturación CFDI 4.0 (México), y recuperación de contraseña.

---

## Stack Tecnológico

- **Frontend:** React 18 + TypeScript + Vite
- **Estilos:** Tailwind CSS 3.4
- **Iconos:** lucide-react
- **Backend / Base de datos / Auth:** Supabase (PostgreSQL + Auth + RLS)
- **Sin enrutador externo** (navegación por estado con `useState`)

---

## Estructura de Archivos

```
src/
├── App.tsx                      # Componente raíz, maneja navegación por estado
├── main.tsx                     # Entry point
├── index.css                    # Estilos globales (Tailwind)
├── contexts/
│   ├── AuthContext.tsx          # Autenticación con Supabase (signIn, signUp, signOut, sesión)
│   └── CartContext.tsx          # Carrito de compras (CRUD con Supabase, items, total)
├── components/
│   ├── Header.tsx               # Barra de navegación superior (responsive, menú móvil)
│   ├── Footer.tsx               # Pie de página
│   ├── Cart.tsx                 # Drawer lateral del carrito
│   ├── AuthModal.tsx            # Modal de login/registro/recuperar contraseña
│   ├── CredentialsForm.tsx     # Formulario de credenciales de plataforma por servicio
│   └── SupportChat.tsx          # Chat de soporte (mensajes a la base de datos)
├── pages/
│   ├── Home.tsx                 # Catálogo de servicios por categoría
│   ├── About.tsx                # Página "Quiénes Somos"
│   ├── Vision.tsx               # Página de Visión
│   ├── Mission.tsx              # Página de Misión
│   ├── Orders.tsx               # Historial de órdenes del usuario
│   ├── Checkout.tsx             # Checkout: credenciales + pago + código referido + facturación
│   ├── Referrals.tsx            # Programa de referidos (código, usos, FAQ)
│   ├── Policies.tsx             # Políticas
│   └── ResetPassword.tsx        # Pantalla de restablecer contraseña
├── lib/
│   ├── supabase.ts              # Cliente de Supabase tipado
│   └── database.types.ts        # Tipos TypeScript de toda la base de datos
supabase/
└── migrations/
    ├── 20251223214932_create_services_schema.sql
    ├── 20251223223104_add_support_and_credentials_v2.sql
    ├── 20251223223614_add_referral_system.sql
    └── 20251224002029_add_billing_information.sql
```

---

## Base de Datos (Supabase / PostgreSQL)

### Tablas

1. **profiles** — Perfil de usuario (id, first_name, last_name, birth_date, timestamps)
2. **categories** — Categorías de servicios (id, name, description, created_at)
3. **services** — Servicios vendibles (id, category_id, name, description, price, is_active, created_at)
4. **cart_items** — Items en carrito (id, user_id, service_id, quantity, created_at)
5. **orders** — Órdenes de compra (id, user_id, total_amount, status, payment_method, payment_id, referral_code_used, discount_amount, created_at)
6. **order_items** — Items de una orden (id, order_id, service_id, quantity, unit_price, created_at)
7. **order_credentials** — Credenciales de plataforma por orden (id, order_id, service_id, platform_email, platform_password, aleks_account, additional_info, created_at)
8. **support_messages** — Mensajes de soporte (id, user_id, user_email, user_name, message, status, admin_response, timestamps)
9. **referral_codes** — Códigos de referido (id, user_id, code, uses_count, created_at)
10. **referral_uses** — Registro de uso de códigos (id, referral_code_id, used_by_user_id, order_id, discount_amount, created_at)
11. **billing_information** — Datos fiscales para facturación CFDI (order_id, rfc, legal_name, postal_code, tax_regime, cfdi_use)

### Enums
- `order_status`: 'pending' | 'completed' | 'cancelled'
- `payment_method`: 'card' | 'paypal'
- `support_status`: 'pending' | 'in_progress' | 'resolved'

### Funciones RPC
- `increment(row_id, x)` — Incrementa el contador de usos de un código de referido
- `generate_referral_code(user_id_param)` — Genera un código de referido único de 8 caracteres

### RLS (Row Level Security)
- Activada en todas las tablas
- Políticas de ownership con `auth.uid() = user_id` para SELECT, INSERT, UPDATE, DELETE

---

## Flujo de Compra (Checkout)

1. **Carrito** → El usuario agrega servicios desde el catálogo (Home)
2. **Credenciales** → En Checkout, paso 1: el usuario llena `CredentialsForm` por cada servicio (email/password de plataforma, cuenta ALEKS, info adicional)
3. **Pago** → Paso 2: método de pago (tarjeta o PayPal), código de referido opcional (30% descuento), datos de facturación CFDI opcionales
4. **Confirmación** → Se crea la orden en `orders`, items en `order_items`, credenciales en `order_credentials`, uso de referido en `referral_uses` (si aplica), facturación en `billing_information` (si aplica), se actualiza status a 'completed', se genera código de referido si es primera compra, se vacía el carrito
5. **Órdenes** → Redirección a la página de historial de órdenes

---

## Sistema de Referidos

- Cada usuario obtiene un código único de 8 caracteres después de su primera compra
- El código da 30% de descuento en cualquier compra
- No se puede usar el propio código
- Contador de usos ilimitado
- Tabla `referral_uses` rastrea cada uso con el descuento aplicado

---

## Autenticación

- Supabase Auth con email/password
- Registro crea entrada en `profiles` con nombre, apellido y fecha de nacimiento
- Recuperación de contraseña por email con redirect a `?reset-password=true`
- Sesión persistente con `onAuthStateChange`

---

## Diseño

- Tema azul corporativo (blue-600 a blue-800)
- Grises neutros para fondos (gray-50, gray-900)
- Responsive con breakpoints de Tailwind (mobile-first)
- Header sticky con menú hamburguesa en móvil
- Drawer lateral para carrito
- Modales para autenticación
- Animaciones: spin loaders, hover transitions, micro-interacciones en botones de agregar al carrito

---

## Lo que FALTA / Próximos Pasos (DETALLADO)

A continuación, cada pieza que falta con el detalle suficiente para que otra IA pueda implementarla sin adivinar:

---

### 1. Pagos Reales con Stripe (PRIORIDAD ALTA)

Actualmente el checkout NO procesa pagos reales. Solo simula el pago y guarda la orden como 'completed'. Para recibir dinero real:

1. Crear cuenta en Stripe (https://dashboard.stripe.com/register)
2. Obtener la Stripe secret key desde el dashboard de Stripe
3. Configurar la cuenta bancaria dentro de Stripe donde caerá el dinero
4. Integrar Stripe en el proyecto (crear Edge Function de Supabase para PaymentIntent, o usar Stripe Checkout)
5. Conectar el botón "Pagar" del Checkout.tsx con Stripe para procesar el pago real antes de marcar la orden como completada

**Importante:** El dinero de las compras cae automáticamente a la cuenta bancaria configurada DENTRO de Stripe, no se conecta el banco directamente a la app. Stripe hace las transferencias de forma programada (diaria, semanal o mensual, configurable en el panel de Stripe).

**Lo que la otra IA necesita hacer:**
- Crear una Edge Function en Supabase (`supabase/functions/stripe-payment/index.ts`) que:
  - Reciba el monto total (con descuento aplicado) desde el frontend
  - Cree un PaymentIntent en Stripe usando la secret key
  - Devuelva el `client_secret` al frontend
- Modificar `Checkout.tsx` para:
  - Cargar Stripe.js en el navegador
  - Solicitar el `client_secret` a la Edge Function
  - Mostrar el formulario de tarjeta de Stripe Elements (o redirigir a Stripe Checkout)
  - Solo marcar la orden como 'completed' DESPUÉS de confirmar el pago
  - Guardar el `payment_id` de Stripe en la orden
- Guardar la Stripe secret key como secreto en Supabase (no en el código)
- Manejar errores de pago (tarjeta rechazada, fondos insuficientes, etc.)

---

### 2. Panel de Administración (PRIORIDAD ALTA)

Actualmente no hay forma de gestionar el contenido de la plataforma sin editar la base de datos directamente. Falta un panel de administración completo.

**Lo que la otra IA necesita hacer:**
- Crear un sistema de roles: añadir columna `role` a la tabla `profiles` (valores: 'user' | 'admin'). Por defecto 'user'.
- Crear políticas RLS que permitan a los admins ver y gestionar todas las tablas.
- Crear una página `/admin` (o estado `admin` en App.tsx) protegida por verificación de rol.
- **Gestión de servicios**: CRUD completo (crear, editar, activar/desactivar, cambiar precio, asignar categoría).
- **Gestión de categorías**: CRUD completo.
- **Gestión de órdenes**: Ver todas las órdenes, cambiar status (pending → completed → cancelled), ver credenciales de cada orden.
- **Gestión de soporte**: Ver todos los mensajes de soporte, responder, cambiar status.
- **Gestión de referidos**: Ver todos los códigos, usos, descuentos aplicados.
- **Gestión de usuarios**: Ver lista de usuarios, cambiar rol, ver historial de compras.
- **Dashboard de métricas**: Total de ventas, número de órdenes, servicios más vendidos, ingresos por mes, usuarios nuevos.

**Tablas que probablemente necesiten crearse:**
- `admin_activity_log` (id, admin_id, action, target_table, target_id, timestamp) para auditoría.

---

### 3. Notificaciones por Email (PRIORIDAD MEDIA)

Actualmente no se envía ningún email automático. Falta:

**Lo que la otra IA necesita hacer:**
- Configurar un proveedor de email (Resend, SendGrid, o Postmark) con una Edge Function de Supabase.
- **Email de bienvenida** al registrarse un nuevo usuario.
- **Email de confirmación de compra** con detalles de la orden (servicios, total, método de pago, credenciales proporcionadas).
- **Email de recuperación de contraseña** (ya funciona con Supabase Auth, pero personalizar el template).
- **Email al admin** cuando llega una nueva orden.
- **Email al admin** cuando llega un nuevo mensaje de soporte.
- **Email al usuario** cuando el admin responde su mensaje de soporte.
- Crear plantillas HTML profesionales para cada email.

---

### 4. Descarga de Factura PDF (CFDI 4.0) (PRIORIDAD MEDIA)

Actualmente se guardan los datos fiscales en `billing_information` pero no se genera ni descarga ninguna factura.

**Lo que la otra IA necesita hacer:**
- Integrar con un PAC (Proveedor Autorizado de CFDI) mexicano (ej: Facturama, SW Sapien, Buzón E) vía API.
- Crear una Edge Function que:
  - Reciba el `order_id` y los datos fiscales
  - Llame a la API del PAC para generar el CFDI
  - Guarde el UUID del CFDI y el XML/PDF en Supabase Storage
  - Devuelva la URL del PDF al frontend
- En la página de Órdenes, añadir botón "Descargar Factura" por cada orden que tenga datos de facturación.
- Manejar casos: orden sin datos fiscales (no se puede facturar), CFDI ya generado (descargar existente), error del PAC.

**Tablas que probablemente necesiten modificarse:**
- `billing_information`: añadir `cfdi_uuid`, `cfdi_pdf_url`, `cfdi_status` ('pending' | 'issued' | 'cancelled').

---

### 5. Chat de Soporte en Tiempo Real (PRIORIDAD MEDIA)

Actualmente el chat de soporte es asíncrono: el usuario envía un mensaje y espera. No hay notificación inmediata ni respuesta en vivo.

**Lo que la otra IA necesita hacer:**
- Usar Supabase Realtime para suscribirse a cambios en la tabla `support_messages`.
- En el frontend del usuario: mostrar respuesta del admin en tiempo real (sin recargar).
- En el panel de admin: mostrar nuevos mensajes en tiempo real.
- Añadir indicador de "admin escribiendo..." y "usuario escribiendo...".
- Añadir badge de mensajes no leídos en el header.
- Crear tabla `support_chat_rooms` si se quiere soporte multi-conversación (opcional).
- Añadir columna `is_read` y `read_at` a `support_messages` para saber cuándo se leyó.

---

### 6. Búsqueda y Filtros en el Catálogo (PRIORIDAD BAJA)

Actualmente el catálogo (Home.tsx) muestra todos los servicios agrupados por categoría sin búsqueda ni filtros.

**Lo que la otra AI necesita hacer:**
- Añadir barra de búsqueda en Home.tsx que filtre servicios por nombre o descripción en tiempo real.
- Añadir filtros por categoría (chips/badges seleccionables).
- Añadir ordenamiento: precio ascendente/descendente, más recientes primero.
- Añadir filtro de rango de precio (min/max slider).
- Mostrar resultados vacíos con mensaje amigable.
- Debounce en la búsqueda para no filtrar en cada tecla.

---

### 7. Reviews y Calificaciones de Servicios (PRIORIDAD BAJA)

Actualmente no hay sistema de reseñas. Los usuarios no pueden calificar los servicios comprados.

**Lo que la otra IA necesita hacer:**
- Crear tabla `service_reviews` (id, user_id, service_id, order_id, rating 1-5, comment, created_at).
- Solo se puede reseñar un servicio si se compró (verificar con `order_items`).
- Una reseña por servicio por orden.
- Mostrar calificación promedio y número de reseñas en cada servicio del catálogo.
- Mostrar reseñas en una sección expandible dentro de la tarjeta del servicio.
- En el panel de admin: moderar reseñas (eliminar inapropiadas).
- RLS: usuarios ven todas las reseñas, solo pueden escribir/editar/borrar las propias.

---

### 8. Dashboard de Métricas para el Administrador (PRIORIDAD BAJA)

Dentro del panel de administración, falta un dashboard visual con métricas del negocio.

**Lo que la otra IA necesita hacer:**
- **Tarjetas de KPIs**: Ingresos totales, órdenes totales, ticket promedio, usuarios activos, usuarios nuevos este mes.
- **Gráfico de ingresos** por mes (últimos 12 meses). Usar una librería ligera de gráficos (Recharts o Chart.js) o construir con SVG puro.
- **Gráfico de órdenes** por mes.
- **Top 5 servicios más vendidos** con barras de progreso.
- **Códigos de referido más usados** (top 5).
- **Órdenes recientes** (últimas 10) con link al detalle.
- **Mensajes de soporte pendientes** con contador.
- Filtros de rango de fecha en todas las métricas.

---

### 9. Seguridad y Protección de Datos (PRIORIDAD MEDIA)

**Lo que la otra IA necesita hacer:**
- Las credenciales de plataforma (`order_credentials.platform_password`) se guardan en texto plano. Hay que encriptarlas o hashearlas de forma reversible (AES) para que el admin pueda verlas pero no estén en texto plano en la base de datos.
- Validar que el código de referido exista y esté activo antes de aplicar el descuento (ya se hace, pero añadir validación de expiración si se quiere).
- Rate limiting en el login y registro para prevenir brute force.
- Sanitizar todos los inputs del usuario (prevenir XSS).
- Verificar que no se puedan inyectar scripts en el chat de soporte o en las credenciales.
- Añadir CAPTCHA opcional en el registro (hCaptcha o reCAPTCHA).

---

### 10. Mejoras de UX/UI (PRIORIDAD BAJA)

- **Página de detalle de servicio**: actualmente solo se ve la tarjeta en el catálogo. Falta una vista ampliada con descripción completa, duración, requisitos, imagen.
- **Loader global**: añadir skeleton loaders en lugar de spinners para catálogo, órdenes, etc.
- **Toast notifications**: añadir notificaciones flotantes al agregar al carrito, completar orden, errores, etc. (en lugar de alerts).
- **Página 404**: manejar estados de navegación no válidos.
- **Modo oscuro**: añadir toggle de tema oscuro/claro.
- **Página de confirmación de orden**: tras completar la compra, mostrar una página de éxito con el número de orden y resumen, en lugar de solo redirigir a órdenes.
- **Animaciones de transición** entre páginas (fade/slide).
- **Indicador de progreso** en el checkout (Paso 1 de 2, etc.).

---

## Instrucciones para Otra IA

"Estoy construyendo **Academy Flow**, una plataforma de venta de servicios educativos (ALEKS, Cambridge One, Coursera, National Geographic Learning). El proyecto está hecho con React + TypeScript + Vite + Tailwind CSS + Supabase. Ya tiene: catálogo de servicios, carrito, checkout (simulado, sin pago real), autenticación, sistema de referidos con 30% descuento, historial de órdenes, credenciales de plataforma por orden, facturación CFDI 4.0, chat de soporte, y páginas informativas. **Lo que necesito ahora es:** [DESCRIBE AQUÍ LO QUE QUIERES QUE HAGA LA OTRA IA]"
