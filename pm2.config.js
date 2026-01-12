const TZ_PHILIPPINES = "Asia/Manila";

module.exports = {
  apps: [
    {
      name: "reel-scheduler",
      script: "scheduler.ts",
      interpreter: "npx",
      interpreterArgs: "ts-node",
      cron_restart: "0 * * * *", // every hour, at minute 0
      timezone: TZ_PHILIPPINES,
      watch: false
    }
  ]
};
