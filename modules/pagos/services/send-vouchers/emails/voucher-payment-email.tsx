import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";

interface VoucherPaymentEmailProps {
  // Datos del arrendatario
  arrendatarioNombre: string;

  // Datos del voucher
  folio: string;
  periodoCobro: string; // "Enero 2026"
  fechaVencimiento: string; // "10 de Enero de 2026"
  montoTotal: number;
  moneda: string; // "CLP" | "UF"

  // Datos de la organización
  nombreOrganizacion: string;
  logoUrl?: string;
  urlPago: string;
  colorPrimario?: string;
}

export const VoucherPaymentEmail = ({
  arrendatarioNombre = "Juan Pérez",
  folio = "FOLIO-12345-2026-01",
  periodoCobro = "Enero 2026",
  fechaVencimiento = "10 de Enero de 2026",
  montoTotal = 500000,
  moneda = "CLP",
  nombreOrganizacion = "Real State Pro",
  logoUrl,
  urlPago = "https://tu-app.com/pagar/voucher-12345",
}: VoucherPaymentEmailProps) => {
  const previewText = `Tu voucher de arriendo - ${periodoCobro}`;

  const formatCurrency = (amount: number, currency: string) => {
    if (currency === "UF") {
      return `UF ${amount.toFixed(2)}`;
    }
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <Html lang="es">
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="color-scheme" content="light only" />
        <meta name="supported-color-schemes" content="light" />
        <style>{`
          /* RESETEO DE ESTILOS PARA CLIENTES DE CORREO */
          body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
          table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
          img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
          table { border-collapse: collapse !important; }

          /* FORZAR MODO CLARO - Prevenir modo oscuro */
          :root {
            color-scheme: light only;
            supported-color-schemes: light;
          }

          /* Forzar fondo blanco incluso en modo oscuro */
          body {
            background-color: #F4F4F7 !important;
          }

          /* GMAIL DARK MODE FIX - Selector específico para Gmail */
          u + .body .main-table { background-color: #ffffff !important; }
          u + .body .content { background-color: #ffffff !important; }
          u + .body .header { background-color: #ffffff !important; }
          u + .body .footer { background-color: #fafafa !important; }

          /* Forzar colores de texto en Gmail dark mode */
          u + .body h1 { color: #1a202c !important; }
          u + .body p { color: #555555 !important; }
          u + .body .detail-label { color: #666666 !important; }
          u + .body .detail-value { color: #2d3748 !important; }

          /* Tarjeta oscura - preservar en dark mode */
          u + .body .amount-card {
            background-color: #1a202c !important;
            background: linear-gradient(135deg, #0f131a 0%, #2d3748 100%) !important;
          }
          u + .body .white-text { color: #ffffff !important; }

          /* Prevenir que Gmail/Outlook cambien los colores en modo oscuro */
          @media (prefers-color-scheme: dark) {
            body {
              background-color: #F4F4F7 !important;
            }
            .main-table {
              background-color: #ffffff !important;
            }
            .amount-card {
              background-color: #1a202c !important;
              background: linear-gradient(135deg, #0f131a 0%, #2d3748 100%) !important;
            }
            .white-text {
              color: #ffffff !important;
            }
            .footer {
              background-color: #fafafa !important;
            }
            h1, p, td {
              color: inherit !important;
            }
          }

          /* RESPONSIVE */
          @media screen and (max-width: 600px) {
            .content { padding: 25px !important; }
            .header { padding: 25px !important; }
            .amount-value { font-size: 32px !important; }
            .main-table { width: 100% !important; border-radius: 0 !important; }
          }
        `}</style>
      </Head>
      <Preview>{previewText}</Preview>
      <Body style={main} className="body">
        <center style={wrapper}>
          <table
            style={mainTable}
            width="100%"
            className="main-table"
            bgcolor="#ffffff"
          >
            {/* HEADER CON LOGO */}
            <tbody>
              <tr>
                <td style={header} className="header">
                  {logoUrl && (
                    <Img
                      src={logoUrl}
                      alt={`Logo ${nombreOrganizacion}`}
                      width={100}
                      style={logo}
                    />
                  )}
                </td>
              </tr>

              {/* CONTENIDO PRINCIPAL */}
              <tr>
                <td style={content} className="content">
                  {/* SALUDO */}
                  <h1 style={h1}>Hola, {arrendatarioNombre}</h1>
                  <p style={paragraph}>
                    Esperamos que tengas un excelente día. A continuación, te
                    presentamos el detalle de tu arriendo para el periodo de{" "}
                    <strong>{periodoCobro}</strong>.
                  </p>

                  {/* TARJETA DE PAGO (HERO) CON DEGRADADO */}
                  <div style={amountCard} className="amount-card">
                    <span style={{ ...amountLabel, color: "#ffffff" }} className="white-text">
                      Total a Pagar
                    </span>
                    <span
                      style={{ ...amountValue, color: "#ffffff" }}
                      className="amount-value white-text"
                    >
                      {formatCurrency(montoTotal, moneda)}
                    </span>
                    <span style={{ ...dueDateBadge, color: "#ffffff" }} className="white-text">
                      Vence el {fechaVencimiento}
                    </span>
                  </div>

                  {/* DETALLES TÉCNICOS */}
                  <table style={detailsTable}>
                    <tbody>
                      <tr>
                        <td style={detailsLabel} className="detail-label">N° de Folio</td>
                        <td style={detailsValue} className="detail-value">#{folio}</td>
                      </tr>
                      <tr>
                        <td style={detailsLabel} className="detail-label">Periodo</td>
                        <td
                          style={{
                            ...detailsValue,
                            textTransform: "capitalize",
                          }}
                          className="detail-value"
                        >
                          {periodoCobro}
                        </td>
                      </tr>
                      <tr>
                        <td style={detailsLabel} className="detail-label">Moneda</td>
                        <td style={detailsValue} className="detail-value">{moneda}</td>
                      </tr>
                      <tr>
                        <td style={detailsLabel} className="detail-label">Fecha de Vencimiento</td>
                        <td style={{ ...detailsValue, color: "#e53e3e" }} className="detail-value">
                          {fechaVencimiento}
                        </td>
                      </tr>
                      <tr style={lastRow}>
                        <td style={detailsLabel} className="detail-label">Estado</td>
                        <td style={{ ...detailsValue, color: "#d69e2e" }} className="detail-value">
                          Pendiente de Pago
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  <br />
                  <br />

                  {/* BOTÓN DE LLAMADA A LA ACCIÓN CON DEGRADADO */}
                  <table width="100%" cellSpacing={0} cellPadding={0}>
                    <tbody>
                      <tr>
                        <td>
                          <Button
                            href={urlPago}
                            style={{ ...btnPrimary, color: "#ffffff" }}
                            className="white-text"
                          >
                            Pagar Ahora
                          </Button>
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  <p style={securityText}>
                    🔒 Transacción encriptada y segura.
                  </p>
                </td>
              </tr>

              {/* FOOTER */}
              <tr>
                <td style={footer} className="footer">
                  <p style={footerParagraph}>
                    Has recibido este correo porque eres arrendatario activo.
                    <br />
                    Si ya realizaste el pago, por favor omite este mensaje.
                  </p>
                  <p style={footerCopyright}>© 2025 {nombreOrganizacion}</p>
                </td>
              </tr>
            </tbody>
          </table>
        </center>
      </Body>
    </Html>
  );
};

export default VoucherPaymentEmail;

// ============================================================================
// ESTILOS
// ============================================================================

const main = {
  height: "100%",
  margin: "0",
  padding: "0",
  width: "100%",
  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  backgroundColor: "#F4F4F7 !important",
  color: "#333333 !important",
};

const wrapper = {
  width: "100%",
  backgroundColor: "#F4F4F7 !important",
  paddingBottom: "40px",
};

const mainTable = {
  backgroundColor: "#ffffff !important",
  margin: "0 auto",
  width: "100%",
  maxWidth: "600px",
  fontFamily: "sans-serif",
  color: "#333333 !important",
  borderRadius: "12px",
  overflow: "hidden",
  boxShadow: "0 8px 20px rgba(0,0,0,0.05)",
};

const header = {
  padding: "35px 40px",
  textAlign: "center" as const,
  borderBottom: "1px solid #f7f7f7",
  backgroundColor: "#ffffff !important",
};

const logo = {
  display: "block",
  margin: "0 auto",
  borderRadius: "4px",
};

const content = {
  padding: "40px",
  backgroundColor: "#ffffff !important",
};

const h1 = {
  fontSize: "24px",
  margin: "0 0 15px 0",
  fontWeight: "700",
  color: "#1a202c !important",
  letterSpacing: "-0.5px",
};

const paragraph = {
  fontSize: "15px",
  lineHeight: "1.6",
  margin: "0 0 25px 0",
  color: "#555555 !important",
};

// TARJETA OSCURA (HERO) CON DEGRADADO
const amountCard = {
  // Color de respaldo para clientes antiguos
  backgroundColor: "#1a202c !important",
  // Degradado sutil: De oscuro (#1a202c) a un gris azulado (#2d3748)
  background: "linear-gradient(135deg, #0f131a 0%, #2d3748 100%) !important",
  borderRadius: "12px",
  padding: "30px",
  textAlign: "center" as const,
  color: "#ffffff !important",
  marginBottom: "35px",
  boxShadow: "0 4px 15px rgba(0, 0, 0, 0.1)",
  border: "1px solid rgba(255,255,255,0.05)",
};

const amountLabel = {
  fontSize: "12px",
  textTransform: "uppercase" as const,
  letterSpacing: "1.5px",
  opacity: "0.7",
  marginBottom: "8px",
  display: "block",
  fontWeight: "600",
  color: "#ffffff !important",
};

const amountValue = {
  fontSize: "38px",
  fontWeight: "700",
  display: "block",
  letterSpacing: "-1px",
  textShadow: "0 2px 4px rgba(0,0,0,0.1)",
  color: "#ffffff !important",
};

const dueDateBadge = {
  backgroundColor: "rgba(255,255,255,0.1) !important",
  padding: "5px 14px",
  borderRadius: "30px",
  fontSize: "12px",
  display: "inline-block",
  marginTop: "12px",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "#ffffff !important",
};

// TABLA DE DETALLES
const detailsTable = {
  width: "100%",
  borderCollapse: "collapse" as const,
  backgroundColor: "#ffffff !important",
};

const detailsLabel = {
  padding: "14px 0",
  borderBottom: "1px solid #f0f0f0",
  fontSize: "15px",
  color: "#666666 !important",
  fontWeight: "500",
};

const detailsValue = {
  padding: "14px 0",
  borderBottom: "1px solid #f0f0f0",
  fontSize: "15px",
  textAlign: "right" as const,
  fontWeight: "700",
  color: "#2d3748 !important",
  letterSpacing: "-0.2px",
};

const lastRow = {
  borderBottom: "none",
};

// BOTÓN CON DEGRADADO
const btnPrimary = {
  backgroundColor: "#1a202c !important",
  background: "linear-gradient(135deg, #1a202c 0%, #3e4c63 100%) !important",
  color: "#ffffff !important",
  display: "inline-block",
  fontSize: "16px",
  fontWeight: "600",
  lineHeight: "52px",
  textAlign: "center" as const,
  textDecoration: "none",
  width: "100%",
  borderRadius: "8px",
  boxShadow: "0 4px 6px rgba(0,0,0,0.2)",
};

const securityText = {
  textAlign: "center" as const,
  marginTop: "25px",
  fontSize: "13px",
  color: "#a0aec0 !important",
};

const footer = {
  padding: "20px 40px 40px 40px",
  textAlign: "center" as const,
  fontSize: "12px",
  color: "#999999 !important",
  backgroundColor: "#fafafa !important",
  borderTop: "1px solid #f0f0f0",
};

const footerParagraph = {
  marginBottom: "12px",
  lineHeight: "1.5",
  color: "#999999 !important",
};

const footerCopyright = {
  fontWeight: "bold",
  color: "#cbd5e0 !important",
};
