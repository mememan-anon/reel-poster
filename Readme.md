pm2 start pm2.config.cjs
pm2 save
pm2 startup
<!-- stop stuff -->
pm2 stop reel-scheduler
pm2 delete reel-scheduler
pm2 save
<!-- runninf each independently -->
npx ts-node run.ts petsPage
npx ts-node run.ts comedyPage