import { createClient } from "@supabase/supabase-js";

// .env.local に書いた値を、Viteが自動でここに読み込んでくれる
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    ".env.local に VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY が設定されていません。"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);