/**
 * Activities para notificar a Next.js cuando un workflow termina
 */

export interface WebhookPayload {
  workflowId: string;
  userId: string;
  status: "completed" | "failed";
  result?: unknown;
  error?: string;
}

/**
 * Notifica a Next.js que un workflow terminó
 */
export async function notifyNextJs(payload: WebhookPayload): Promise<void> {
  console.log(`[Activity] Notificando a Next.js sobre workflow: ${payload.workflowId}`);

  const webhookUrl = process.env.NEXTJS_WEBHOOK_URL || "http://localhost:3000/api/webhooks/temporal";

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Agrega autenticación si quieres:
        // "Authorization": `Bearer ${process.env.WEBHOOK_SECRET}`
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Webhook failed with status ${response.status}`);
    }

    console.log(`[Activity] Next.js notificado exitosamente`);
  } catch (error) {
    console.error(`[Activity] Error al notificar a Next.js:`, error);
    throw error; // Temporal lo reintentará automáticamente
  }
}
