import { createClient } from '@supabase/supabase-js';

// Estas dos llaves están hechas para usarse en el navegador (no son secretas).
// La llave "secret" de Supabase NUNCA debe ponerse aquí ni en ningún archivo de la app.
const SUPABASE_URL = 'https://knquysqjhprnyztkgmwb.supabase.co';
const SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_lUjd1hMqkWqnQ4Q8qun5FA_WU-1UOIf';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
