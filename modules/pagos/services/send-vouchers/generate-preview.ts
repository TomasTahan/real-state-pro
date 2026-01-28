/**
 * Script para generar un archivo HTML de preview del email
 */

import { renderVoucherReminderEmail } from "./emails/renderer-react";
import { writeFileSync } from "fs";
import { join } from "path";

async function generatePreview() {
  console.log("🎨 Generando preview del email...\n");

  const html = await renderVoucherReminderEmail({
    arrendatario_nombre: "Juan Pérez González",
    folio: "FOLIO-12345-2026-01",
    periodo: "2026-01",
    monto_arriendo_clp: 850000,
    moneda: "CLP",
    fecha_vencimiento: "2026-01-05",
    org_nombre: "C&S Inmobiliaria",
  });

  const outputPath = join(__dirname, "emails", "preview.html");
  writeFileSync(outputPath, html, "utf-8");

  console.log(`✅ Preview generado exitosamente en:`);
  console.log(`   ${outputPath}\n`);
  console.log("📂 Abre el archivo en tu navegador para ver el resultado\n");
}

generatePreview().catch((error) => {
  console.error("\n💥 Error:", error);
  process.exit(1);
});
