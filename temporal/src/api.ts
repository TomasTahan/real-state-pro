import "dotenv/config";
import express from "express";
import { Connection, Client } from "@temporalio/client";

const app = express();
app.use(express.json());

async function getClient() {
  const connection = await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS || "localhost:7233",
    // Si configuras TLS en Temporal, acá va config extra
  });

  return new Client({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE || "default",
  });
}

// POST /workflows/create-user
app.post("/workflows/create-user", async (req, res) => {
  try {
    const { userId, email } = req.body;

    const client = await getClient();

    const handle = await client.workflow.start("createUserWorkflow", {
      args: [{ userId, email }],
      taskQueue: "default",
      workflowId: `create-user-${userId}-${Date.now()}`,
    });

    res.json({
      ok: true,
      workflowId: handle.workflowId,
      runId: handle.firstExecutionRunId,
    });
  } catch (err: any) {
    console.error("Error starting workflow:", err);
    res.status(500).json({ ok: false, error: err.message ?? "Unknown error" });
  }
});

const PORT = Number(process.env.API_PORT || 4000);

app.listen(PORT, () => {
  console.log(`[Temporal API] Listening on port ${PORT}`);
});
