process.env.TZ = "Asia/Manila";

import fs from "fs";
import path from "path";
import { main as runInternal } from "./run";

const COUNTER_FILE = path.join(__dirname, "daily_counters.json");

async function postOneReel(channel: "channel1" | "channel2") {
  console.log(`\n=== Starting post for ${channel} ===`);
  process.argv[2] = channel;
  await runInternal();
  console.log(`=== Finished post for ${channel} ===\n`);
}

function loadCounters() {
  if (!fs.existsSync(COUNTER_FILE)) {
    return { date: "", channel1: 0, channel2: 0 };
  }
  return JSON.parse(fs.readFileSync(COUNTER_FILE, "utf8"));
}

function saveCounters(counters: any) {
  fs.writeFileSync(COUNTER_FILE, JSON.stringify(counters, null, 2));
}

function isPostingHour(hour: number) {
  return hour >= 8 && hour <= 19;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const now = new Date();
  const hour = now.getHours();
  const today = now.toISOString().split("T")[0];

  console.log(`Scheduler tick at: ${now}`);

  let counters = loadCounters();

  if (counters.date !== today) {
    counters = { date: today, channel1: 0, channel2: 0 };
    saveCounters(counters);
  }

  if (!isPostingHour(hour)) {
    console.log("Outside posting hours. Skipping.");
    return;
  }

  if (counters.channel1 < 12) {
    await postOneReel("channel1");
    counters.channel1++;
    saveCounters(counters);
  }

  console.log("Waiting 10 minutes before posting channel2…");
  await sleep(10 * 60 * 1000);

  if (counters.channel2 < 12) {
    await postOneReel("channel2");
    counters.channel2++;
    saveCounters(counters);
  }
}

main().catch(err => console.error("Fatal:", err));
