export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startAISummaryScheduler } = await import("./widgets/uoaisummary/singleton.mjs");
  await startAISummaryScheduler();
}
