import { createClient } from '@supabase/supabase-js';

const supabase = createClient('http://127.0.0.1:54321', process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlZmF1bHQiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTY3OTU1OTk1MywiZXhwIjoxOTk1MTM1OTUzfQ.xyz'); 

async function test() {
  const { data, error } = await supabase.from('posiciones').select('*').limit(1);
  console.log("Posiciones:", JSON.stringify(data, null, 2));
  console.log("Error:", error);
}

test();
