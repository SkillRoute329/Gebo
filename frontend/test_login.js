import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'http://127.0.0.1:54321';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const supabase = createClient(supabaseUrl, anonKey);

async function main() {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'admin@gebo.com',
    password: 'gebo123'
  });
  
  if (error) {
    console.error("Login failed:", error.message);
  } else {
    console.log("Login success! User ID:", data.user?.id);
    console.log("app_metadata:", data.user?.app_metadata);
    console.log("user_metadata:", data.user?.user_metadata);
  }
}

main();
