export async function register() {
  // Only the Node.js server touches the database (not the Edge runtime, not the build).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { bootstrap } = await import("./server/bootstrap");
  await bootstrap();
}
