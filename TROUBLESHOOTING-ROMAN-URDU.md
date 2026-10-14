# Troubleshooting — Roman Urdu

## `{"error":"Page nahi mili."}`

Is version mein `/` aur `/index.html` ke liye direct routes shamil hain. Agar yeh message ab bhi aaye:

1. GitHub repository mein `server.js` ke andar `app.get(["/", "/index.html"]` search karein.
2. Confirm karein ke `vercel.json`, `server.js`, `package.json`, aur `public/` repository root mein hain, kisi nested folder ke andar nahi.
3. GitHub changes **Commit** karein. Vercel ke Deployments tab mein latest commit ka deployment **Ready** hone dein.
4. Deployment ka naya URL use karein; purana URL/deployment cache na test karein.
5. `/index.html` aur `/api/health` test karein.

## `storageConfigured: false` ya 503

Vercel Project → Settings → Environment Variables mein `SUPABASE_URL` aur `SUPABASE_SERVICE_ROLE_KEY` check karein. Supabase SQL Editor mein `supabase-schema.sql` run hua hona chahiye. Variables update karne ke baad redeploy karein.

## Security

Kabhi `SUPABASE_SERVICE_ROLE_KEY` ya `OPENAI_API_KEY` ko public repository, frontend JavaScript, ya screenshots mein expose na karein.
