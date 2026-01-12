const TZ_PHILIPPINES = "Asia/Manila";

module.exports = {
  apps: [
    {
      name: "reel-scheduler",
      script: "scheduler.ts",
      interpreter: "npx",
      interpreterArgs: "ts-node",
      cron_restart: "0 * * * *",
      timezone: TZ_PHILIPPINES,
      watch: false,
      autorestart: true,
      max_restarts: 5
    }
  ]
};
