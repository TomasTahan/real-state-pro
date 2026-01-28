/**
 * Renderizador de templates de email usando React Email
 */

import { render } from "@react-email/components";
import VoucherPaymentEmail from "./voucher-payment-email";

export interface VoucherEmailData {
  // Datos del arrendatario
  arrendatario_nombre: string;

  // Datos del voucher
  folio: string;
  periodo: string; // YYYY-MM
  monto_arriendo_clp: number;
  moneda: "CLP" | "UF";
  fecha_vencimiento: string; // YYYY-MM-DD

  // Datos de la organización
  org_nombre: string;
  logo_url?: string;

  // Link de pago (futuro)
  payment_link?: string;
}

/**
 * Formatea una fecha YYYY-MM-DD a formato legible en español
 * Ejemplo: 2026-01-05 -> 05 de Enero de 2026
 */
function formatDateToSpanish(dateString: string): string {
  const date = new Date(dateString + "T00:00:00");
  const months = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];

  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();

  return `${day} de ${month} de ${year}`;
}

/**
 * Formatea un período YYYY-MM a formato legible
 * Ejemplo: 2026-01 -> Enero 2026
 */
function formatPeriodToSpanish(periodo: string): string {
  const [year, month] = periodo.split("-");
  const months = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];

  const monthName = months[parseInt(month) - 1];
  return `${monthName} ${year}`;
}

/**
 * Renderiza el template de recordatorio de voucher usando React Email
 */
export async function renderVoucherReminderEmail(data: VoucherEmailData): Promise<string> {
  // Preparar datos formateados
  const periodo_formato = formatPeriodToSpanish(data.periodo);
  const fecha_vencimiento_formato = formatDateToSpanish(data.fecha_vencimiento);

  // Logo por defecto si no se especifica
  const logo_url =
    data.logo_url ||
    "https://bkqknkqmfqqehrbppndw.supabase.co/storage/v1/object/public/organization-logos/c&s_logo.PNG";

  // Payment link por defecto (futuro)
  const payment_link = data.payment_link || `https://tu-app.com/pagar/${data.folio}`;

  // Renderizar el componente React a HTML (ASÍNCRONO)
  const html = await render(
    VoucherPaymentEmail({
      arrendatarioNombre: data.arrendatario_nombre,
      folio: data.folio,
      periodoCobro: periodo_formato,
      fechaVencimiento: fecha_vencimiento_formato,
      montoTotal: data.monto_arriendo_clp,
      moneda: data.moneda,
      nombreOrganizacion: data.org_nombre,
      logoUrl: logo_url,
      urlPago: payment_link,
      colorPrimario: "#3182ce",
    })
  );

  return html;
}
