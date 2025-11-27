import { proxyActivities, sleep, workflowInfo } from "@temporalio/workflow";
import type * as registrationActivities from "../activities/user-registration.activities";
import type * as webhookActivities from "../activities/webhook.activities";

/**
 * Configuración de las activities de registro
 */
const {
  validateEmail,
  createUserInDatabase,
  sendWelcomeEmail,
  sendFollowUpEmail,
  trackUserRegistration,
} = proxyActivities<typeof registrationActivities>({
  startToCloseTimeout: "5 minutes",
  retry: {
    initialInterval: "1s",
    backoffCoefficient: 2,
    maximumAttempts: 3,
    maximumInterval: "30s",
  },
});

/**
 * Configuración de las activities de webhook
 */
const { notifyNextJs } = proxyActivities<typeof webhookActivities>({
  startToCloseTimeout: "30 seconds",
  retry: {
    initialInterval: "1s",
    maximumAttempts: 5, // Más reintentos para webhooks
  },
});

/**
 * Input del workflow
 */
export interface UserRegistrationInput {
  userId: string;
  email: string;
  name: string;
}

/**
 * Output del workflow
 */
export interface UserRegistrationOutput {
  success: boolean;
  userId: string;
  message: string;
}

/**
 * Workflow de registro de usuario
 *
 * Este workflow:
 * 1. Valida el email
 * 2. Crea el usuario en la DB
 * 3. Envía email de bienvenida
 * 4. Registra en analytics
 * 5. Espera 7 días
 * 6. Envía email de seguimiento
 *
 * Ventajas de usar Temporal:
 * - Si falla en el paso 3, puede reintentar sin repetir los pasos 1-2
 * - Si tu servidor se cae, el workflow continúa desde donde quedó
 * - Los sleeps son "durables" - no consumen recursos mientras esperan
 */
export async function userRegistrationWorkflow(
  input: UserRegistrationInput
): Promise<UserRegistrationOutput> {
  const { userId, email, name } = input;
  const { workflowId } = workflowInfo();

  try {
    // PASO 1: Validar email
    console.log(`[Workflow] Iniciando registro para: ${email}`);
    await validateEmail(email);

    // PASO 2: Crear usuario en DB
    await createUserInDatabase({ id: userId, email, name });

    // PASO 3: Enviar email de bienvenida
    await sendWelcomeEmail(email, name);

    // PASO 4: Registrar en analytics
    await trackUserRegistration(userId);

    console.log(`[Workflow] Usuario registrado exitosamente: ${userId}`);

    // PASO 5: Esperar 7 días (en desarrollo usa menos tiempo)
    // En desarrollo: 30 segundos
    // En producción: 7 días = sleep("7 days")
    console.log(`[Workflow] Esperando 30 segundos antes del email de seguimiento...`);
    await sleep("30 seconds"); // Cambia a "7 days" en producción

    // PASO 6: Enviar email de seguimiento
    console.log(`[Workflow] Enviando email de seguimiento...`);
    await sendFollowUpEmail(email, name);

    const result = {
      success: true,
      userId,
      message: "Usuario registrado y email de seguimiento enviado",
    };

    // PASO 7: Notificar a Next.js que terminó
    await notifyNextJs({
      workflowId,
      userId,
      status: "completed",
      result,
    });

    return result;
  } catch (error) {
    console.error(`[Workflow] Error en registro de usuario:`, error);

    const result = {
      success: false,
      userId,
      message: error instanceof Error ? error.message : "Error desconocido",
    };

    // Notificar a Next.js sobre el error
    await notifyNextJs({
      workflowId,
      userId,
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return result;
  }
}
