/**
 * Activities para el workflow de registro de usuario
 *
 * Las activities son funciones que ejecutan acciones reales:
 * - Llamadas a APIs externas
 * - Operaciones de base de datos
 * - Envío de emails
 * - Etc.
 */

export interface User {
  id: string;
  email: string;
  name: string;
}

/**
 * Valida si un email es válido
 */
export async function validateEmail(email: string): Promise<boolean> {
  console.log(`[Activity] Validando email: ${email}`);

  // Aquí podrías llamar a un servicio de validación real
  // Por ahora, validación simple
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isValid = emailRegex.test(email);

  if (!isValid) {
    throw new Error(`Email inválido: ${email}`);
  }

  return true;
}

/**
 * Crea un usuario en la base de datos
 */
export async function createUserInDatabase(user: User): Promise<User> {
  console.log(`[Activity] Creando usuario en DB: ${user.email}`);

  // Aquí harías la llamada real a tu DB (Supabase, etc.)
  // Por ejemplo:
  // const { data, error } = await supabase
  //   .from('users')
  //   .insert({ id: user.id, email: user.email, name: user.name })

  // Simulamos delay de DB
  await new Promise((resolve) => setTimeout(resolve, 1000));

  console.log(`[Activity] Usuario creado exitosamente: ${user.id}`);
  return user;
}

/**
 * Envía email de bienvenida
 */
export async function sendWelcomeEmail(email: string, name: string): Promise<void> {
  console.log(`[Activity] Enviando email de bienvenida a ${email}`);

  // Aquí usarías tu servicio de email (Resend, SendGrid, etc.)
  // Por ejemplo con Resend:
  // await resend.emails.send({
  //   from: 'onboarding@tuapp.com',
  //   to: email,
  //   subject: '¡Bienvenido!',
  //   html: `<h1>Hola ${name}!</h1>`
  // });

  await new Promise((resolve) => setTimeout(resolve, 500));
  console.log(`[Activity] Email de bienvenida enviado a ${email}`);
}

/**
 * Envía email de seguimiento
 */
export async function sendFollowUpEmail(email: string, name: string): Promise<void> {
  console.log(`[Activity] Enviando email de seguimiento a ${email}`);

  // Aquí enviarías el email de seguimiento
  // await resend.emails.send({
  //   from: 'team@tuapp.com',
  //   to: email,
  //   subject: '¿Cómo va todo?',
  //   html: `<h1>Hola ${name}, ¿cómo te está yendo?</h1>`
  // });

  await new Promise((resolve) => setTimeout(resolve, 500));
  console.log(`[Activity] Email de seguimiento enviado a ${email}`);
}

/**
 * Registra evento de analytics
 */
export async function trackUserRegistration(userId: string): Promise<void> {
  console.log(`[Activity] Registrando evento de analytics para usuario: ${userId}`);

  // Aquí enviarías a tu servicio de analytics (Mixpanel, Segment, etc.)
  // await analytics.track({
  //   userId,
  //   event: 'User Registered'
  // });

  await new Promise((resolve) => setTimeout(resolve, 200));
  console.log(`[Activity] Evento registrado en analytics`);
}
