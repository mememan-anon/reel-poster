const TZ_PHILIPPINES = "Asia/Manila";

module.exports = {
  apps: [
    {
      name: "reel-scheduler",
      script: "scheduler.ts",
      interpreter: "npx",
      interpreterArgs: "ts-node",
      env: {
        TZ: TZ_PHILIPPINES
      },
      watch: false
    }
  ]
};
