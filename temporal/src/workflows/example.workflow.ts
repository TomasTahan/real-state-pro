import { proxyActivities } from "@temporalio/workflow";
import type * as activities from "../activities/example.activities";

// Configuro las activities que se van a usar desde el workflow
const { sendWelcomeEmail } = proxyActivities<typeof activities>({
  startToCloseTimeout: "1 minute",
});

export interface CreateUserWorkflowInput {
  userId: string;
  email: string;
}

export async function createUserWorkflow(input: CreateUserWorkflowInput) {
  // Aquí podrías hacer lógica más compleja, steps, waits, etc.
  await sendWelcomeEmail(input.email);

  // Puedes devolver algo si quieres
  return { status: "ok", userId: input.userId };
}
