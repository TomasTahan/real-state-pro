export async function sendWelcomeEmail(email: string) {
  // Aquí iría tu lógica real (resend, mailgun, supabase, lo que sea)
  console.log(`[Activity] Enviando email de bienvenida a ${email}`);
  // Simular delay
  await new Promise((r) => setTimeout(r, 1000));
}
