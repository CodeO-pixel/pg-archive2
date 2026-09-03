# PG-Archive

Lector/gestor de manga, manhwa y cómics con Next.js 16 + Supabase.

## Qué estaba causando los errores de deploy

1. **Faltaba `lib/supabase.ts`.** `app/page.tsx` hace `import { supabase } from '@/lib/supabase'`, pero ese archivo nunca se subió. Esto rompe el build en cualquier hosting ("Module not found: Can't resolve '@/lib/supabase'"). Ya está creado.
2. **`jspdf` se usa pero no estaba en `package.json`.** El botón de descarga en PDF hace `import('jspdf')`, y como el paquete no estaba declarado como dependencia, el bundler falla al no poder resolverlo. Ya está agregado.
3. **Node.js muy antiguo en el hosting.** Next.js 16 exige **Node.js 20.9 o superior**. Muchos hosts gratuitos (Railway, Render, Netlify, etc.) usan Node 18 por defecto, lo que produce exactamente el error *"For Next.js, Node.js version >=20.9.0 is required"*. Se agregó `"engines": {"node": ">=20.9.0"}` en `package.json`, pero además debes fijar la versión de Node en el panel de tu hosting (ver abajo).
4. **Nombres de archivo.** Los subiste con guión bajo en vez de punto (`next_config.ts`, `_env.local`, `_gitignore`, etc.). Ya quedaron con el nombre real que Next.js necesita (`next.config.ts`, `.env.local`, `.gitignore`...).
5. **`package-lock.json` no se incluyó** en esta entrega porque quedaría desincronizado con el `jspdf` agregado (algunos hosts usan `npm ci`, que falla si el lock no coincide exactamente con `package.json`). Al primer `npm install` se genera uno nuevo y correcto — no necesitas hacer nada, solo no debes copiar el `package-lock.json` viejo encima de este proyecto.

## Variables de entorno

Copia `.env.example` a `.env.local` para desarrollo local (ya viene con tus valores reales de Supabase, revisa que sean correctos). **Nunca subas `.env.local` a GitHub** (ya está en `.gitignore`).

Para producción, estas dos variables se deben configurar en el panel de tu hosting, no en el código:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Si no las configuras ahí, el build puede pasar pero la app se romperá en el navegador (pantalla en blanco o error "supabaseUrl is required"), porque son variables `NEXT_PUBLIC_*` y Next.js las necesita **en el momento del build**, no solo en runtime.

## Antes de subirlo a cualquier lado: pruébalo en tu máquina

Si tienes Node 20+ instalado localmente, esto es lo más parecido a lo que hará el hosting, y detecta el 95% de los problemas antes de gastar un deploy:

```bash
npm install
npm run build
```

Si eso termina sin errores en tu computadora, casi seguro terminará sin errores en el hosting (porque ejecutan exactamente el mismo comando).

## Desplegar en Netlify

Ya dejé listos `netlify.toml` (fija el comando de build, Node 20 y el plugin `@netlify/plugin-nextjs`, que es obligatorio para que funcione el App Router) y `.nvmrc` (por si Netlify lo prioriza sobre el `netlify.toml`).

1. Sube esta carpeta completa (tal cual, con `netlify.toml` y `.nvmrc` incluidos) a un repositorio de GitHub.
2. En Netlify: "Add new site" → "Import an existing project" → conecta el repo.
3. Netlify va a leer `netlify.toml` solo, no necesitas tocar "Build settings" manualmente. Si el asistente te pide comando/directorio de todos modos, usa: **Build command:** `npm run build` — deja el "Publish directory" que proponga el plugin de Next.js (no pongas `.next` a mano si el plugin ya lo autocompletó).
4. Antes de darle "Deploy site", ve a **Site configuration → Environment variables** y agrega:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (los valores están en tu `.env.local`). Esto es obligatorio — sin esto el build puede pasar pero la app se rompe en el navegador.
5. Deploy site.

Si aun así falla, entra a **Deploys → (el deploy que falló) → Deploy log** y copia el error real: con eso puedo decirte la causa exacta en vez de adivinar.

### Otros hosts gratuitos (Vercel, Railway, Render, Cloudflare Pages...)

Mismo principio: fija Node 20+ y agrega las dos variables `NEXT_PUBLIC_SUPABASE_*` en el panel del proyecto. Vercel es el más simple porque detecta todo automáticamente sin necesitar `netlify.toml`.

## Base de datos (Supabase)

Si es la primera vez que despliegas este proyecto, revisa `supabase_schema.sql`: contiene las tablas (`profiles`, `series`, `chapters`, `follows`, `notifications`), políticas de seguridad (RLS) y buckets de Storage (`covers`, `chapter-pages`) que el código espera.

### ⚠️ Migración obligatoria si ya tenías Supabase configurado (login por usuario, seguir obras, notificaciones)

Aunque ya tuvieras la base de datos funcionando, **debes volver a correr `supabase_schema.sql` completo** en el SQL Editor de Supabase — es seguro, todo usa `if not exists` / `create or replace`, no borra nada existente. Esto agrega:

- La columna `username` en `profiles` (ahora el login pide usuario, no correo).
- La función `get_email_by_username` que usa el login para encontrar el correo a partir del usuario.
- Las tablas `follows` (seguir obras) y `notifications` (avisos de capítulos nuevos).

**Importante:** si ya tenías usuarios registrados antes de este cambio, esas cuentas no van a tener `username` todavía y por lo tanto no van a poder iniciar sesión hasta que les asignes uno. Corre esto por cada cuenta vieja, reemplazando los valores:

```sql
update public.profiles set username = 'nombre_elegido' where email = 'correo@ejemplo.com';
```

## Desarrollo local

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).
