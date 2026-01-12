import fs from "fs";
import path from "path";
import { main as runInternal } from "./run";

// CommonJS already has __dirname
const COUNTER_FILE = path.join(__dirname, "daily_counters.json");

export async function postOneReel(channel: "channel1" | "channel2") {
  console.log(`\n=== Starting post for ${channel} ===`);

  // Simulate CLI argument so run.ts works the same way
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

function isPostingHour(hour: number): boolean {
  return hour >= 8 && hour <= 19; // 8am–7pm
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const now = new Date();
  const hour = now.getHours();
  const today = now.toISOString().split("T")[0];

  console.log(`Scheduler tick at: ${now.toString()}`);

  let counters = loadCounters();

  // Reset daily counters
  if (counters.date !== today) {
    counters = { date: today, channel1: 0, channel2: 0 };
    saveCounters(counters);
    console.log("New day → counters reset.");
  }

  if (!isPostingHour(hour)) {
    console.log("Outside posting hours. Skipping.");
    return;
  }

  // -------------------------
  // CHANNEL 1
  // -------------------------
  if (counters.channel1 < 12) {
    console.log(`Posting channel1 (#${counters.channel1 + 1})`);
    await postOneReel("channel1");
    counters.channel1++;
    saveCounters(counters);
  } else {
    console.log("Channel1 quota reached.");
  }

  // Wait 10 minutes
  console.log("Waiting 10 minutes before posting channel2…");
  await sleep(10 * 60 * 1000);

  // -------------------------
  // CHANNEL 2
  // -------------------------
  if (counters.channel2 < 12) {
    console.log(`Posting channel2 (#${counters.channel2 + 1})`);
    await postOneReel("channel2");
    counters.channel2++;
    saveCounters(counters);
  } else {
    console.log("Channel2 quota reached.");
  }
}

main();
