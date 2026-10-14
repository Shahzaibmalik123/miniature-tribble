# Troubleshooting — Roman Urdu

- **`ENOENT: no such file or directory, stat '/var/task/public/index.html'`**: Vercel Function public file ko disk se serve karne ki koshish kar rahi thi. Is build mein Vercel par `sendFile` routes hata diye gaye hain. Confirm karein ke newest ZIP ki files root par upload hui hain aur naya deployment bana hai.
- **Homepage 404**: `public/index.html` GitHub repo ke root ke andar `public/` folder mein hona chahiye; Vercel Root Directory sahi select honi chahiye.
- **`/api/health` returns 503**: `SUPABASE_URL` aur `SUPABASE_SERVICE_ROLE_KEY` Vercel Environment Variables mein add karein. Check karein `supabase-schema.sql` run ki hui hai.
- **Upload fails**: Supabase Storage mein `agent-files` bucket schema/setup ke mutabiq mojood ho.
- Secret keys, passwords, ya `.env` ko GitHub par commit na karein.
