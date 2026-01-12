const TZ_PHILIPPINES = "Asia/Manila";

module.exports = {
  apps: [
    {
      name: "reel-scheduler",
      script: "scheduler.ts",
      interpreter: "npx",
      interpreterArgs: "ts-node",
      cron_restart: "0 * * * *", // run every hour, minute 0
      timezone: TZ_PHILIPPINES,  // cron evaluated in Manila time
      env: {
        TZ: TZ_PHILIPPINES,      // Node Date() uses Manila time
      },
      watch: false,
      autorestart: false,        // cron controls restarts
    },
  ],
};
