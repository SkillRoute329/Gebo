import jwt
import datetime
import json

# Clave secreta por defecto en supabase CLI local
secret = "super-secret-jwt-token-with-at-least-32-characters-long"

payload = {
  "role": "authenticated",
  "sub": "00000000-0000-0000-0000-000000000000",
  "email": "test@gebo.com",
  "app_metadata": {
    "provider": "email"
  },
  "user_metadata": {},
  "iss": "supabase",
  "exp": int((datetime.datetime.now() + datetime.timedelta(hours=1)).timestamp())
}

token = jwt.encode(payload, secret, algorithm="HS256")
print(token)
