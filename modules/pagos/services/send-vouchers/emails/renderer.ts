/**
 * Renderizador de templates de email
 *
 * Este módulo se encarga de cargar y renderizar templates HTML
 * reemplazando las variables con los datos del voucher.
 */

import { readFileSync } from "fs";
import { join } from "path";

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
  const date = new Date(dateString + 'T00:00:00');
  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
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
  const [year, month] = periodo.split('-');
  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const monthName = months[parseInt(month) - 1];
  return `${monthName} ${year}`;
}

/**
 * Formatea monto a CLP con separadores de miles
 * Ejemplo: 850000 -> $850.000
 */
function formatAmountCLP(amount: number): string {
  return `$${amount.toLocaleString('es-CL')}`;
}

/**
 * Renderiza el template de recordatorio de voucher
 */
export function renderVoucherReminderEmail(data: VoucherEmailData): string {
  // Leer el template HTML
  // En desarrollo, __dirname apunta a la carpeta donde está el archivo TS
  // En producción, apuntará a donde esté el archivo compilado
  const templatePath = join(__dirname, 'voucher-reminder.html');
  let html: string;

  try {
    html = readFileSync(templatePath, 'utf-8');
  } catch (error) {
    // Fallback: intentar desde la raíz del proyecto
    const fallbackPath = join(process.cwd(), 'modules/pagos/services/send-vouchers/emails/voucher-reminder.html');
    html = readFileSync(fallbackPath, 'utf-8');
  }

  // Preparar datos formateados
  const periodo_formato = formatPeriodToSpanish(data.periodo);
  const fecha_vencimiento_formato = formatDateToSpanish(data.fecha_vencimiento);
  const monto_formato = formatAmountCLP(data.monto_arriendo_clp);

  // Logo por defecto si no se especifica
  const logo_url = data.logo_url || 'https://bkqknkqmfqqehrbppndw.supabase.co/storage/v1/object/public/organization-logos/c&s_logo.PNG';

  // Payment link por defecto (futuro)
  const payment_link = data.payment_link || `https://tu-app.com/pagar/${data.folio}`;

  // Reemplazar todas las variables
  const replacements: Record<string, string> = {
    '{{arrendatario_nombre}}': data.arrendatario_nombre,
    '{{folio}}': data.folio,
    '{{periodo_formato}}': periodo_formato,
    '{{fecha_vencimiento_formato}}': fecha_vencimiento_formato,
    '{{monto_formato}}': monto_formato,
    '{{moneda}}': data.moneda,
    '{{org_nombre}}': data.org_nombre,
    '{{logo_url}}': logo_url,
    '{{payment_link}}': payment_link,
  };

  // Aplicar todos los reemplazos
  Object.entries(replacements).forEach(([key, value]) => {
    html = html.replace(new RegExp(key, 'g'), value);
  });

  return html;
}
