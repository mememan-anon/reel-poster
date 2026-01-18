process.env.TZ = "Asia/Manila";

import fs from "fs";
import path from "path";
import { main as runInternal } from "./run";
import { MAX_REELS } from "./config";

const TZ_PHILIPPINES = "Asia/Manila";
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
  try {
    return JSON.parse(fs.readFileSync(COUNTER_FILE, "utf8"));
  } catch {
    // Corrupt file fallback
    return { date: "", channel1: 0, channel2: 0 };
  }
}

function saveCounters(counters: any) {
  fs.writeFileSync(COUNTER_FILE, JSON.stringify(counters, null, 2));
}

function isPostingHour(hour: number) {
  //return hour >= 8 && hour <= 19; --posting every hour
  return hour >= 8 && hour <= 18 && hour % 2 === 0; // posting every 2 hours
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get YYYY-MM-DD in Manila time (NOT UTC)
 */
function getManilaDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ_PHILIPPINES,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * For clear debugging: show raw/local, ISO(UTC), and Manila time.
 */
function getManilaTimestamp(now: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ_PHILIPPINES,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);
}

/**
 * Get Manila hour/minute reliably (do not trust server timezone formatting)
 */
function getManilaParts(now: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ_PHILIPPINES,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "NaN");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "NaN");

  return { hour, minute };
}

async function main() {
  const now = new Date();
  const manilaStamp = getManilaTimestamp(now);
  const { hour, minute } = getManilaParts(now);
  const today = getManilaDate(now);

  console.log(
    `Scheduler tick raw="${now.toString()}" iso="${now.toISOString()}" manila="${manilaStamp}" (hour=${hour}, minute=${minute})`
  );

  // IMPORTANT FIX:
  // If PM2 starts the process manually (pm2 start/restart), it will run immediately.
  // We only want to post on the top of the hour to match cron_restart "0 * * * *".
  if (minute !== 0) {
    console.log("Not top of hour (minute != 0). Exiting without posting.");
    return;
  }

  let counters = loadCounters();

  // IMPORTANT FIX: reset counters based on Manila-local date (not UTC)
  if (counters.date !== today) {
    counters = { date: today, channel1: 0, channel2: 0 };
    saveCounters(counters);
    console.log(`New Manila day detected (${today}). Counters reset.`);
  }

  if (!isPostingHour(hour)) {
    console.log(`Outside posting hours in Manila.Skipping.`);
    return;
  }

  if (counters.channel1 < MAX_REELS) {
    await postOneReel("channel1");
    counters.channel1++;
    saveCounters(counters);
  } else {
    console.log("Channel1 daily limit reached. Skipping channel1.");
  }

  console.log("Waiting 10 minutes before posting channel2…");
  await sleep(10 * 60 * 1000);

  // Recompute time after sleep (optional safety)
  const afterSleep = new Date();
  const afterParts = getManilaParts(afterSleep);
  if (!isPostingHour(afterParts.hour)) {
    console.log(
      `After sleep, now outside posting hours (hour=${afterParts.hour}). Skipping channel2.`
    );
    return;
  }

  if (counters.channel2 < MAX_REELS) {
    await postOneReel("channel2");
    counters.channel2++;
    saveCounters(counters);
  } else {
    console.log("Channel2 daily limit reached. Skipping channel2.");
  }
}

main().catch((err) => console.error("Fatal:", err));
