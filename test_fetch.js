async function test() {
  const jwt = await fetch('http://127.0.0.1:54321/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: {
      'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email: 'admin@gebo.com', password: 'gebo123' })
  }).then(r => r.json());

  console.log('Login JWT:', !!jwt.access_token);

  const res = await fetch('http://127.0.0.1:54321/functions/v1/create-user', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + jwt.access_token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
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
    })
  });

  console.log('Status:', res.status);
  console.log('Response:', await res.text());
}
test();
