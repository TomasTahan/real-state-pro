import { proxyActivities, sleep } from "@temporalio/workflow";
import type * as activities from "../activities/user-registration.activities";

/**
 * Configuración de las activities
 *
 * startToCloseTimeout: Tiempo máximo que puede tardar una activity
 * retry: Política de reintentos automáticos
 */
const {
  validateEmail,
  createUserInDatabase,
  sendWelcomeEmail,
  sendFollowUpEmail,
  trackUserRegistration,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes", // Timeout por activity
  retry: {
    initialInterval: "1s", // Primer reintento después de 1 segundo
    backoffCoefficient: 2, // Duplica el tiempo en cada reintento
    maximumAttempts: 3, // Máximo 3 intentos
    maximumInterval: "30s", // Máximo 30 segundos entre reintentos
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

  try {
    // PASO 1: Validar email
    console.log(`[Workflow] Iniciando registro para: ${email}`);
    await validateEmail(email);

    // PASO 2: Crear usuario en DB
    const user = await createUserInDatabase({ id: userId, email, name });

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

    return {
      success: true,
      userId,
      message: "Usuario registrado y email de seguimiento enviado",
    };
  } catch (error) {
    console.error(`[Workflow] Error en registro de usuario:`, error);

    return {
      success: false,
      userId,
      message: error instanceof Error ? error.message : "Error desconocido",
    };
  }
}
