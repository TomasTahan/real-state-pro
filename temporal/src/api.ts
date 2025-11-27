import "dotenv/config";
import express from "express";
import { Connection, Client } from "@temporalio/client";

const app = express();
app.use(express.json());

// Singleton client - se inicializa una vez
let client: Client | null = null;
let connection: Connection | null = null;

async function getClient(): Promise<Client> {
  if (client) return client;

  connection = await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS || "localhost:7233",
  });

  client = new Client({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE || "default",
  });

  console.log(
    `[Temporal API] Connected to ${
      process.env.TEMPORAL_ADDRESS || "localhost:7233"
    }`
  );

  return client;
}

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// POST /workflows/create-user (ejemplo simple)
app.post("/workflows/create-user", async (req, res) => {
  try {
    const { userId, email } = req.body;

    if (!userId || !email) {
      res
        .status(400)
        .json({ ok: false, error: "userId and email are required" });
      return;
    }

    const temporalClient = await getClient();

    const handle = await temporalClient.workflow.start("createUserWorkflow", {
      args: [{ userId, email }],
      taskQueue: "default",
      workflowId: `create-user-${userId}-${Date.now()}`,
    });

    res.json({
      ok: true,
      workflowId: handle.workflowId,
      runId: handle.firstExecutionRunId,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Error starting workflow:", err);
    res.status(500).json({ ok: false, error: message });
  }
});

// POST /workflows/register-user (workflow complejo)
app.post("/workflows/register-user", async (req, res) => {
  try {
    const { userId, email, name } = req.body;

    // Validación de entrada
    if (!userId || !email || !name) {
      res.status(400).json({
        ok: false,
        error: "userId, email and name are required",
      });
      return;
    }

    const temporalClient = await getClient();

    // Iniciar el workflow de registro
    const handle = await temporalClient.workflow.start("userRegistrationWorkflow", {
      args: [{ userId, email, name }],
      taskQueue: "default",
      workflowId: `user-registration-${userId}-${Date.now()}`,
    });

    res.json({
      ok: true,
      workflowId: handle.workflowId,
      runId: handle.firstExecutionRunId,
      message: "User registration workflow started",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Error starting user registration workflow:", err);
    res.status(500).json({ ok: false, error: message });
  }
});

const PORT = Number(process.env.API_PORT || 4000);

// Graceful shutdown
const shutdown = async () => {
  console.log("[Temporal API] Shutting down...");
  if (connection) {
    await connection.close();
  }
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

app.listen(PORT, () => {
  console.log(`[Temporal API] Listening on port ${PORT}`);
});
