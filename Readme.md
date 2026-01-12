pm2 start pm2.config.js
pm2 save
pm2 startup
<!-- runninf each independently -->
npx ts-node run.ts channel1
npx ts-node run.ts channel2