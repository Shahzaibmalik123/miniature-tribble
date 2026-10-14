# Awais Nagar Agent — Vercel Fix (Roman Urdu)

## Is ZIP ko sahi tarah upload karein

Is ZIP ke andar files seedha root par hain. GitHub repository ke main page par `package.json`, `server.js`, `vercel.json`, `supabase-schema.sql`, aur `public` folder seedha dikhne chahiye. `Awais_Nagar_Vercel_RootFix` naam ka extra parent folder repository mein upload na karein.

## Deployment

1. ZIP download karke **Extract All** karein.
2. GitHub par repository kholein. Purani code files ko replace karein aur naye `public` folder ke andar `index.html`, `style.css`, aur `app.js` upload karein. Sab kuch repository ke root mein ho.
3. Commit changes karein.
4. Vercel project ke Settings → General mein **Root Directory** repository ka root (`./`) ho. Agar GitHub repo mein project kisi subfolder ke andar hai, to ya to files root par move karein ya Root Directory ko us subfolder par set karein.
5. Vercel → Deployments mein latest commit ka deployment dobara deploy hone dein.
6. Website ka homepage aur `https://YOUR-DOMAIN.vercel.app/api/health` test karein.

## Is fix mein kya badla hai?

Vercel `public/` folder ke static assets ko CDN se serve karta hai. Express Function ke andar `sendFile('/var/task/public/index.html')` use karne se `ENOENT` aa sakta tha agar static files Function bundle mein shamil na hon. Is build mein Vercel par `sendFile` routes hata diye gaye hain; local development par Express ab bhi `public/` serve karta hai.

## Supabase

Database aur file uploads ke liye Vercel → Settings → Environment Variables mein ye variables hon: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET` (`agent-files`). Agar ab bhi `/api/health` par error aaye, Supabase SQL Editor mein `supabase-schema.sql` run hua ho, confirm karein. Secret key ko GitHub par upload na karein.

## Agar homepage phir bhi 404 ho

Check karein ke Vercel Project → Settings → General mein Root Directory sahi hai aur GitHub ke project root mein `public/index.html` maujood hai. Latest deployment ke Build Logs aur Runtime Logs check karein.
