/**
 * Script para resetear vouchers a estado GENERADO
 *
 * Uso:
 * pnpm tsx modules/pagos/services/send-vouchers/reset-vouchers.ts
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

// Cargar variables de entorno
config({ path: ".env" });

async function resetVouchers() {
  console.log("=".repeat(60));
  console.log("🔄 RESETEAR VOUCHERS A ESTADO GENERADO");
  console.log("=".repeat(60));
  console.log("");

  // Verificar variables de entorno
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("❌ Error: Variables de entorno no encontradas");
    console.error(
      "   Asegúrate de tener NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env"
    );
    process.exit(1);
  }

  console.log("✅ Variables de entorno cargadas");
  console.log(`📍 Supabase URL: ${supabaseUrl}`);
  console.log("");

  // Crear cliente de Supabase con Service Role Key
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  console.log("⏳ Obteniendo vouchers...");

  // Obtener todos los vouchers que NO están en estado GENERADO
  const { data: vouchers, error: fetchError } = await supabase
    .from("vouchers")
    .select("voucher_id, folio, estado, periodo")
    .neq("estado", "GENERADO");

  if (fetchError) {
    console.error("❌ Error al obtener vouchers:", fetchError.message);
    process.exit(1);
  }

  if (!vouchers || vouchers.length === 0) {
    console.log("✅ No hay vouchers para resetear. Todos ya están en GENERADO");
    console.log("");
    return;
  }

  console.log(`📋 Se encontraron ${vouchers.length} vouchers para resetear:`);
  console.log("");

  // Mostrar vouchers
  vouchers.forEach((v, i) => {
    console.log(`   ${i + 1}. ${v.folio} - Estado: ${v.estado} - Periodo: ${v.periodo}`);
  });

  console.log("");
  console.log("⏳ Reseteando vouchers a estado GENERADO...");
  console.log("");

  // Resetear todos los vouchers a GENERADO
  const { error: updateError } = await supabase
    .from("vouchers")
    .update({
      estado: "GENERADO",
      fecha_envio_efectiva: null,
    })
    .in(
      "voucher_id",
      vouchers.map((v) => v.voucher_id)
    );

  if (updateError) {
    console.error("❌ Error al resetear vouchers:", updateError.message);
    process.exit(1);
  }

  console.log("=".repeat(60));
  console.log("✅ VOUCHERS RESETEADOS EXITOSAMENTE");
  console.log("=".repeat(60));
  console.log("");
  console.log(`📊 Total reseteado: ${vouchers.length} vouchers`);
  console.log("");
  console.log("Ahora puedes ejecutar:");
  console.log("  pnpm send-vouchers");
  console.log("");
}

// Ejecutar
resetVouchers().catch((error) => {
  console.error("");
  console.error("💥 ERROR FATAL:");
  console.error(error);
  console.error("");
  process.exit(1);
});
