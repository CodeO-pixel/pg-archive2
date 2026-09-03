import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // No lanzamos un error aquí: hacerlo tumba el build de Vercel/Netlify entero
  // (el prerender de la página falla apenas se importa este archivo). En vez de eso,
  // avisamos por consola y creamos un cliente con placeholders; las peticiones a
  // Supabase fallarán de forma controlada en el navegador hasta que configures
  // NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en el panel de tu hosting
  // (y hagas un redeploy después de agregarlas).
  console.error(
    '[PG-Archive] Faltan NEXT_PUBLIC_SUPABASE_URL y/o NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Defínelas en .env.local (desarrollo) o en las Environment Variables de tu hosting (producción), y vuelve a desplegar.'
  );
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key'
);
