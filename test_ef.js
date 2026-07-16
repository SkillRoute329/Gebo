const { createClient } = require('@supabase/supabase-js');

const supabase = createClient('http://127.0.0.1:54321', process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZmF1bHQiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTY4MjExMDg3NiwiZXhwIjoxOTk3Njg2ODc2fQ.y4ZpA8v...');

async function test() {
  const { data: auth, error: loginErr } = await supabase.auth.signInWithPassword({ email: 'admin@gebo.com', password: 'gebo123' });
  if (loginErr) return console.error('Login error:', loginErr);

  console.log('Logged in as Admin:', auth.user.id);

  const { data, error } = await supabase.functions.invoke('create-user', {
    body: {
      email: 'test_chofer_' + Date.now() + '@gebo.com',
      password: 'password123',
      role: 'chofer',
      metadata: { nombre_completo: 'Test Chofer' },
      profileData: {
        estado: 'disponible',
        maneja_manual: true,
        maneja_automatico: true,
        maneja_electrico: false,
        maneja_suv: true,
        maneja_camion: false
      }
    }
  });

  console.log('Result:', data, error);
}

test();
