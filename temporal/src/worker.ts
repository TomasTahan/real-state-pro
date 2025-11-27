import { Worker } from "@temporalio/worker";
import * as activities from "./activities/example.activities";

// Importar workflows
// Nota: Temporal carga workflows por ruta, no por import directo normalmente.
// Para simplificar, usamos require.resolve
async function run() {
  const worker = await Worker.create({
    workflowsPath: require.resolve("./workflows/example.workflow"),
    activities,
    taskQueue: "default", // nombre de la task queue
    namespace: process.env.TEMPORAL_NAMESPACE || "default",
  });

  console.log("[Temporal] Worker iniciado en taskQueue=default");
  await worker.run();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
