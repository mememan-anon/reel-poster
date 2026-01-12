const TZ_PHILIPPINES = "Asia/Manila";

module.exports = {
  apps: [
    {
      name: "reel-scheduler",
      script: "scheduler.ts",
      interpreter: "npx",
      interpreterArgs: "ts-node",   
      cron_restart: "0 * * * *",   // <-- RUN EVERY HOUR
      timezone: TZ_PHILIPPINES,    // <-- USE MANILA TIME     
      env: {
        TZ: TZ_PHILIPPINES
      },

      watch: false,
      autorestart: false           // cron should control execution
    }
  ]
};
