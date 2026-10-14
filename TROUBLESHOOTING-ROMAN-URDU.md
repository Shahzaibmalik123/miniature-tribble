# Troubleshooting — Roman Urdu

## Agar `ENOENT: no such file or directory, stat '/var/task/public/index.html'` aaye

1. Confirm karein ke latest ZIP ki extracted files sahi GitHub repository mein commit hui hain.
2. `public/index.html`, `public/style.css` aur `public/app.js` GitHub par maujood hon.
3. Vercel ke Project Settings → Git mein wahi repository selected ho jismein aapne files update ki hain.
4. Deployments mein latest commit ko redeploy karein.
5. Homepage aur `/index.html` test karein. CSS/JS load na ho to direct `/style.css` aur `/app.js` paths check karein.

## Agar `/api/health` 503 de

Supabase `SUPABASE_URL` aur `SUPABASE_SERVICE_ROLE_KEY` Vercel Environment Variables mein set hon. `supabase-schema.sql` Supabase SQL Editor mein run ki gayi ho. Values ko public GitHub repository mein na rakhein.

## Agar error phir bhi aaye

Vercel Runtime Logs mein latest request ka exact red error message copy karein. API keys, passwords ya secret values share na karein.
