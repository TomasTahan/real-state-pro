/**
 * Script de prueba para verificar que el renderizado de HTML funciona correctamente
 */

import { renderVoucherReminderEmail } from "./emails/renderer-react";

async function testRender() {
  console.log("🧪 Probando renderizado de email...\n");

  const html = await renderVoucherReminderEmail({
    arrendatario_nombre: "Juan Pérez González",
    folio: "FOLIO-12345-2026-01",
    periodo: "2026-01",
    monto_arriendo_clp: 850000,
    moneda: "CLP",
    fecha_vencimiento: "2026-01-05",
    org_nombre: "C&S Inmobiliaria",
  });

  console.log("✅ HTML generado correctamente\n");
  console.log("📏 Longitud del HTML:", html.length, "caracteres\n");
  console.log("🔍 Primeros 500 caracteres:\n");
  console.log(html.substring(0, 500));
  console.log("\n...\n");
  console.log("🔍 Últimos 200 caracteres:\n");
  console.log(html.substring(html.length - 200));

  // Verificar que contiene elementos clave
  const checks = [
    { name: "Contiene nombre del arrendatario", test: html.includes("Juan Pérez González") },
    { name: "Contiene folio", test: html.includes("FOLIO-12345-2026-01") },
    { name: "Contiene monto", test: html.includes("850") || html.includes("850.000") },
    { name: "Contiene botón de pago", test: html.includes("Pagar Ahora") },
    { name: "Es HTML válido", test: html.includes("<!DOCTYPE") || html.includes("<html") },
  ];

  console.log("\n✅ Verificaciones:\n");
  checks.forEach((check) => {
    console.log(`  ${check.test ? "✅" : "❌"} ${check.name}`);
  });

  const allPassed = checks.every((c) => c.test);

  if (allPassed) {
    console.log("\n🎉 Todas las verificaciones pasaron!\n");
  } else {
    console.log("\n❌ Algunas verificaciones fallaron\n");
    process.exit(1);
  }
}

testRender().catch((error) => {
  console.error("\n💥 Error durante el test:\n", error);
  process.exit(1);
});
