import { NativeConnection, Worker } from "@temporalio/worker";
import * as activities from "./activities/example.activities";

async function run() {
  // Conectar al servidor Temporal
  const connection = await NativeConnection.connect({
    address: process.env.TEMPORAL_ADDRESS || "localhost:7233",
  });

  const worker = await Worker.create({
    connection,
    workflowsPath: require.resolve("./workflows/example.workflow"),
    activities,
    taskQueue: "default",
    namespace: process.env.TEMPORAL_NAMESPACE || "default",
  });

  console.log(
    `[Temporal] Worker iniciado - taskQueue=default, address=${
      process.env.TEMPORAL_ADDRESS || "localhost:7233"
    }`
  );

  // Graceful shutdown
  const shutdown = async () => {
    console.log("[Temporal] Shutting down worker...");
    await worker.shutdown();
    await connection.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await worker.run();
}

run().catch((err) => {
  console.error("[Temporal] Worker error:", err);
  process.exit(1);
});
