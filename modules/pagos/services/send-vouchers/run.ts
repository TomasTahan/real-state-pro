/**
 * Script ejecutable para enviar vouchers localmente
 *
 * Uso:
 * pnpm send-vouchers                           # Envía todos los vouchers programados para hoy
 * pnpm send-vouchers --org <uuid>              # Envía vouchers de una organización
 * pnpm send-vouchers --voucher <uuid>          # Reenvía un voucher específico
 * pnpm send-vouchers --voucher <uuid> --force  # Fuerza reenvío aunque ya esté enviado
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { sendVouchers } from "./index";

// Cargar variables de entorno desde .env.local
config({ path: ".env" });

// Parse argumentos de línea de comandos
const args = process.argv.slice(2);
const params: Record<string, string | boolean> = {};

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--org" && args[i + 1]) {
    params.org_id = args[i + 1];
    i++;
  } else if (args[i] === "--voucher" && args[i + 1]) {
    params.voucher_id = args[i + 1];
    i++;
  } else if (args[i] === "--force") {
    params.force = true;
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("📧 ENVIADOR DE VOUCHERS - TEST LOCAL");
  console.log("=".repeat(60));
  console.log("");

  // Verificar variables de entorno
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendApiKey = process.env.RESEND_API_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("❌ Error: Variables de entorno no encontradas");
    console.error(
      "   Asegúrate de tener NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env"
    );
    process.exit(1);
  }

  console.log("✅ Variables de entorno cargadas");
  console.log(`📍 Supabase URL: ${supabaseUrl}`);
  console.log("🔑 Usando Service Role Key (bypasa RLS)");

  if (resendApiKey) {
    console.log("📧 Resend API Key configurada");
  } else {
    console.warn("⚠️  Resend API Key NO configurada (solo funcionará n8n)");
  }
  console.log("");

  // Crear cliente de Supabase con Service Role Key (bypasa RLS para testing)
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  console.log("📋 Parámetros de ejecución:");
  if (params.org_id) {
    console.log(`   - Organización: ${params.org_id}`);
  }
  if (params.voucher_id) {
    console.log(`   - Voucher: ${params.voucher_id}`);
  }
  if (params.force) {
    console.log(`   - Forzar reenvío: SÍ`);
  }
  if (Object.keys(params).length === 0) {
    console.log("   - Modo: TODOS los vouchers programados para hoy");
  }
  console.log("");

  console.log("⏳ Ejecutando envío de vouchers...");
  console.log("");

  const startTime = Date.now();

  // Ejecutar servicio
  const result = await sendVouchers(supabase, {
    org_id: params.org_id as string | undefined,
    voucher_id: params.voucher_id as string | undefined,
    force: params.force as boolean | undefined,
  });

  const duration = Date.now() - startTime;

  console.log("");
  console.log("=".repeat(60));
  console.log("📊 RESULTADOS");
  console.log("=".repeat(60));
  console.log("");

  if (result.success) {
    console.log(`✅ Ejecución exitosa en ${duration}ms`);
  } else {
    console.log(`⚠️  Ejecución completada con errores en ${duration}ms`);
  }

  console.log("");
  console.log(`📈 Estadísticas:`);
  console.log(`   - Vouchers enviados: ${result.sent}`);
  console.log(`   - Vouchers saltados: ${result.skipped}`);
  console.log(`   - Errores: ${result.errors.length}`);
  console.log("");

  if (result.vouchers.length > 0) {
    console.log("📝 Vouchers enviados:");
    console.log("");
    result.vouchers.forEach((voucher, index) => {
      console.log(`   ${index + 1}. ${voucher.folio}`);
      console.log(`      - Propiedad: ${voucher.propiedad_id}`);
      if (voucher.email) {
        console.log(`      - Email: ${voucher.email}`);
      }
      if (voucher.whatsapp) {
        console.log(`      - WhatsApp: ${voucher.whatsapp}`);
      }
      console.log(`      - Métodos: ${voucher.metodo_envio.join(", ")}`);
      console.log("");
    });
  }

  if (result.errors.length > 0) {
    console.log("❌ Errores encontrados:");
    console.log("");
    result.errors.forEach((error, index) => {
      console.log(`   ${index + 1}. Voucher: ${error.voucher_id}`);
      console.log(`      Propiedad: ${error.propiedad_id}`);
      console.log(`      Error: ${error.error}`);
      console.log("");
    });
  }

  console.log("=".repeat(60));

  // Exit con código apropiado
  process.exit(result.success ? 0 : 1);
}

// Ejecutar
main().catch((error) => {
  console.error("");
  console.error("💥 ERROR FATAL:");
  console.error(error);
  console.error("");
  process.exit(1);
});
