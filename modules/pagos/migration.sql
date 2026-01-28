-- ============================================================================
-- MÓDULO: PAGOS (Vouchers, Portal de Pago, Payouts)
-- Fecha: 2025-12-18
-- Descripción: Schema para gestión de cobros de arriendo, vouchers y payouts
-- ============================================================================

-- ============================================================================
-- TIPOS ENUMERADOS
-- ============================================================================

-- Estados del voucher
CREATE TYPE estado_voucher AS ENUM (
    'GENERADO',   -- Recién creado, pendiente de envío
    'ENVIADO',    -- Email enviado al arrendatario
    'VENCIDO',    -- Pasó fecha_vencimiento sin pago
    'PAGADO',     -- Pagado exitosamente
    'ANULADO'     -- Cancelado manualmente
);

-- Estados del payout
CREATE TYPE estado_payout AS ENUM (
    'PENDIENTE',    -- Esperando transferencia a ETPAY
    'EN_PROCESO',   -- Transferencia iniciada en ETPAY
    'COMPLETADO',   -- Transferencia exitosa
    'FALLIDO'       -- Error en transferencia
);

-- Tipo de payout
CREATE TYPE tipo_payout AS ENUM (
    'PROPIETARIO',   -- Liquidación al dueño de la propiedad
    'ADMINISTRACION' -- Comisión para la administración
);

-- ============================================================================
-- TABLA: vouchers
-- Descripción: Documentos de cobro generados mensualmente por contrato
-- ============================================================================

CREATE TABLE vouchers (
    voucher_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Folio único legible: FOLIO-{propiedad_id}-{YYYY}-{MM}
    folio TEXT UNIQUE NOT NULL,

    -- Referencias
    contrato_id UUID NOT NULL REFERENCES contratos(contrato_id) ON DELETE RESTRICT,
    propiedad_id BIGINT NOT NULL REFERENCES propiedades(propiedad_id) ON DELETE RESTRICT,
    organizacion_id UUID NOT NULL REFERENCES organizaciones(organizacion_id) ON DELETE RESTRICT,

    -- Snapshot de configuración usada (para trazabilidad)
    config_version_usada INTEGER NOT NULL,

    -- Estado y periodo
    estado estado_voucher NOT NULL DEFAULT 'GENERADO',
    periodo TEXT NOT NULL, -- Formato: YYYY-MM

    -- Fechas
    fecha_generacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fecha_envio_programada DATE,           -- Cuándo se debe enviar el email
    fecha_envio_efectiva TIMESTAMPTZ,      -- Cuándo se envió realmente
    fecha_vencimiento DATE NOT NULL,       -- Límite de pago sin multa
    fecha_pago TIMESTAMPTZ,                -- Cuándo se realizó el pago

    -- Monto arriendo (snapshot al momento de generar)
    moneda TEXT NOT NULL CHECK (moneda IN ('CLP', 'UF')),
    valor_uf_generacion NUMERIC(10,4),     -- Valor UF al generar (si moneda = UF)
    monto_arriendo NUMERIC(12,2) NOT NULL, -- Monto en la moneda del contrato
    monto_arriendo_clp NUMERIC(12,2) NOT NULL, -- Siempre en CLP (base para multas)

    -- Cargos/descuentos de bitácora (snapshot al generar)
    -- Formato: [{id, monto, descripcion, tipo: 'cargo'|'descuento'}]
    items_bitacora JSONB DEFAULT '[]',

    -- Datos de pago
    monto_pagado NUMERIC(12,2),            -- Total efectivamente pagado
    detalle_pago JSONB,                    -- Desglose completo del pago (incluye servicios básicos)

    -- Integración ETPAY
    etpay_token TEXT,                      -- Token de la transacción
    etpay_payment_id TEXT,                 -- ID de pago en ETPAY
    etpay_payment_details JSONB,           -- Respuesta completa de ETPAY

    -- Auditoría
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT voucher_periodo_formato CHECK (periodo ~ '^\d{4}-\d{2}$'),
    CONSTRAINT voucher_unico_por_periodo UNIQUE (propiedad_id, periodo)
);

-- Comentarios de tabla
COMMENT ON TABLE vouchers IS 'Documentos de cobro mensuales generados por contrato de arriendo';
COMMENT ON COLUMN vouchers.folio IS 'Identificador único legible: FOLIO-{propiedad_id}-{YYYY}-{MM}';
COMMENT ON COLUMN vouchers.config_version_usada IS 'Versión de contratos_config_historico usada al generar';
COMMENT ON COLUMN vouchers.items_bitacora IS 'Snapshot de cargos/descuentos de bitácora al momento de generar';
COMMENT ON COLUMN vouchers.detalle_pago IS 'Desglose completo: arriendo, multa, servicios básicos, cargos, descuentos';

-- ============================================================================
-- TABLA: payouts
-- Descripción: Registro de transferencias a propietarios y administración
-- ============================================================================

CREATE TABLE payouts (
    payout_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Referencias
    voucher_id UUID NOT NULL REFERENCES vouchers(voucher_id) ON DELETE RESTRICT,
    organizacion_id UUID NOT NULL REFERENCES organizaciones(organizacion_id) ON DELETE RESTRICT,
    cuenta_bancaria_id UUID REFERENCES cuentas_bancarias(cuenta_id), -- Puede ser null si aún no se define

    -- Tipo y monto
    tipo tipo_payout NOT NULL,
    monto NUMERIC(12,2) NOT NULL,

    -- Estado
    estado estado_payout NOT NULL DEFAULT 'PENDIENTE',

    -- Integración ETPAY
    etpay_transfer_id TEXT,                -- ID de transferencia en ETPAY
    etpay_response JSONB,                  -- Respuesta completa de ETPAY

    -- Fechas
    fecha_programada DATE,                 -- Cuándo se debe ejecutar
    fecha_ejecucion TIMESTAMPTZ,           -- Cuándo se ejecutó

    -- Error tracking
    error_mensaje TEXT,
    reintentos INTEGER DEFAULT 0,

    -- Auditoría
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE payouts IS 'Transferencias de dinero a propietarios y administración post-pago';
COMMENT ON COLUMN payouts.tipo IS 'PROPIETARIO: liquidación al dueño, ADMINISTRACION: comisión';
COMMENT ON COLUMN payouts.etpay_transfer_id IS 'ID devuelto por ETPAY al iniciar la transferencia';

-- ============================================================================
-- ALTERACIÓN: consultas_deuda
-- Descripción: Agregar campos para tracking de pago de servicios básicos
-- ============================================================================

-- Agregar columnas para marcar consultas como pagadas
ALTER TABLE consultas_deuda
    ADD COLUMN IF NOT EXISTS pagado BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS voucher_id UUID REFERENCES vouchers(voucher_id),
    ADD COLUMN IF NOT EXISTS fecha_pago TIMESTAMPTZ;

COMMENT ON COLUMN consultas_deuda.pagado IS 'Indica si esta deuda fue pagada junto con un voucher';
COMMENT ON COLUMN consultas_deuda.voucher_id IS 'Referencia al voucher donde se pagó esta deuda';
COMMENT ON COLUMN consultas_deuda.fecha_pago IS 'Fecha en que se pagó esta deuda';

-- Índice para consultas de servicios pagados
CREATE INDEX IF NOT EXISTS idx_consultas_deuda_voucher ON consultas_deuda(voucher_id)
    WHERE voucher_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_consultas_deuda_pagado ON consultas_deuda(servicio_id, pagado)
    WHERE pagado = FALSE;

-- ============================================================================
-- ÍNDICES
-- ============================================================================

-- Vouchers
CREATE INDEX idx_vouchers_contrato ON vouchers(contrato_id);
CREATE INDEX idx_vouchers_propiedad ON vouchers(propiedad_id);
CREATE INDEX idx_vouchers_organizacion ON vouchers(organizacion_id);
CREATE INDEX idx_vouchers_estado ON vouchers(estado);
CREATE INDEX idx_vouchers_periodo ON vouchers(periodo);

-- Índices parciales para queries específicas
CREATE INDEX idx_vouchers_pendientes_envio ON vouchers(fecha_envio_programada)
    WHERE estado = 'GENERADO' AND fecha_envio_efectiva IS NULL;

CREATE INDEX idx_vouchers_por_vencer ON vouchers(fecha_vencimiento)
    WHERE estado IN ('GENERADO', 'ENVIADO');

CREATE INDEX idx_vouchers_vencidos ON vouchers(fecha_vencimiento)
    WHERE estado = 'VENCIDO';

-- Payouts
CREATE INDEX idx_payouts_voucher ON payouts(voucher_id);
CREATE INDEX idx_payouts_organizacion ON payouts(organizacion_id);
CREATE INDEX idx_payouts_estado ON payouts(estado);
CREATE INDEX idx_payouts_pendientes ON payouts(fecha_programada)
    WHERE estado = 'PENDIENTE';

-- ============================================================================
-- FUNCIONES
-- ============================================================================

-- Función para calcular multa de un voucher
-- Consulta la configuración desde contratos_config_historico
CREATE OR REPLACE FUNCTION calcular_multa_voucher(p_voucher_id UUID)
RETURNS TABLE (
    dias_atraso INTEGER,
    monto_multa NUMERIC,
    tasa_aplicada NUMERIC,
    multa_maxima NUMERIC
) AS $$
DECLARE
    v_voucher vouchers;
    v_config RECORD;
    v_dias INTEGER;
    v_multa NUMERIC;
    v_tasa_diaria NUMERIC;
BEGIN
    -- Obtener voucher
    SELECT * INTO v_voucher FROM vouchers WHERE voucher_id = p_voucher_id;

    -- Si no existe o ya pagó, no hay multa
    IF v_voucher IS NULL OR v_voucher.estado = 'PAGADO' THEN
        RETURN QUERY SELECT 0, 0::NUMERIC, 0::NUMERIC, NULL::NUMERIC;
        RETURN;
    END IF;

    -- Obtener config del contrato en la versión usada
    SELECT
        multas_atraso,
        dias_gracia_multa,
        porcentaje_multa,
        maximo_multa
    INTO v_config
    FROM contratos_config_historico
    WHERE contrato_id = v_voucher.contrato_id
      AND version = v_voucher.config_version_usada;

    -- Si no tiene multas habilitadas
    IF NOT COALESCE(v_config.multas_atraso, false) THEN
        RETURN QUERY SELECT 0, 0::NUMERIC, 0::NUMERIC, NULL::NUMERIC;
        RETURN;
    END IF;

    -- Calcular días de atraso (después de vencimiento + días de gracia)
    v_dias := GREATEST(0,
        CURRENT_DATE - (v_voucher.fecha_vencimiento + COALESCE(v_config.dias_gracia_multa, 0))
    );

    -- Si no hay días de atraso
    IF v_dias = 0 THEN
        RETURN QUERY SELECT
            0,
            0::NUMERIC,
            v_config.porcentaje_multa,
            v_config.maximo_multa;
        RETURN;
    END IF;

    -- Calcular multa: (tasa_anual / 365) * dias * monto_arriendo_clp
    v_tasa_diaria := COALESCE(v_config.porcentaje_multa, 0) / 100.0 / 365.0;
    v_multa := v_voucher.monto_arriendo_clp * v_tasa_diaria * v_dias;

    -- Aplicar tope máximo si existe
    IF v_config.maximo_multa IS NOT NULL THEN
        v_multa := LEAST(v_multa, v_config.maximo_multa);
    END IF;

    RETURN QUERY SELECT
        v_dias,
        ROUND(v_multa, 0)::NUMERIC, -- Sin decimales para CLP
        v_config.porcentaje_multa,
        v_config.maximo_multa;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION calcular_multa_voucher IS 'Calcula la multa actual de un voucher basándose en días de atraso y config del contrato';

-- Función para generar folio
CREATE OR REPLACE FUNCTION generar_folio_voucher(p_propiedad_id BIGINT, p_periodo TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN 'FOLIO-' || p_propiedad_id || '-' || REPLACE(p_periodo, '-', '-');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- VISTAS
-- ============================================================================

-- Vista principal para el portal de pago
CREATE OR REPLACE VIEW voucher_pago_view AS
SELECT
    v.voucher_id,
    v.folio,
    v.contrato_id,
    v.propiedad_id,
    v.organizacion_id,
    v.config_version_usada,
    v.estado,
    v.periodo,
    v.fecha_generacion,
    v.fecha_envio_programada,
    v.fecha_envio_efectiva,
    v.fecha_vencimiento,
    v.fecha_pago,
    v.moneda,
    v.valor_uf_generacion,
    v.monto_arriendo,
    v.monto_arriendo_clp,
    v.items_bitacora,
    v.monto_pagado,
    v.detalle_pago,

    -- Calcular totales de items_bitacora
    COALESCE((
        SELECT SUM((item->>'monto')::NUMERIC)
        FROM jsonb_array_elements(v.items_bitacora) AS item
        WHERE item->>'tipo' = 'cargo'
    ), 0) AS total_cargos,

    COALESCE((
        SELECT SUM((item->>'monto')::NUMERIC)
        FROM jsonb_array_elements(v.items_bitacora) AS item
        WHERE item->>'tipo' = 'descuento'
    ), 0) AS total_descuentos,

    -- Multa calculada on-demand
    (calcular_multa_voucher(v.voucher_id)).dias_atraso,
    (calcular_multa_voucher(v.voucher_id)).monto_multa,

    -- Datos de la propiedad
    p.direccion,
    p.numero,
    p.depto,
    p.comuna,
    p.ciudad,

    -- Datos del arrendatario
    c.arrendatario_id,
    a.nombre AS arrendatario_nombre,
    a.email AS arrendatario_email,
    a.telefono AS arrendatario_telefono

FROM vouchers v
JOIN contratos c ON c.contrato_id = v.contrato_id
JOIN propiedades p ON p.propiedad_id = v.propiedad_id
JOIN arrendatarios a ON a.arrendatario_id = c.arrendatario_id;

COMMENT ON VIEW voucher_pago_view IS 'Vista para portal de pago con datos calculados y relacionados';

-- Vista de servicios con última deuda consultada (no pagada)
CREATE OR REPLACE VIEW servicios_deuda_actual AS
SELECT DISTINCT ON (s.servicio_id)
    s.servicio_id,
    s.propiedad_id,
    s.tipo_servicio,
    s.compania,
    s.activo,
    cd.consulta_id,
    cd.monto_deuda,
    cd.fecha_consulta,
    cd.metadata,
    cd.error,
    cd.pagado
FROM servicios s
LEFT JOIN consultas_deuda cd ON cd.servicio_id = s.servicio_id AND cd.pagado = FALSE
WHERE s.activo = true
ORDER BY s.servicio_id, cd.fecha_consulta DESC NULLS LAST;

COMMENT ON VIEW servicios_deuda_actual IS 'Última deuda NO pagada de cada servicio activo';

-- Vista resumen de payouts por voucher
CREATE OR REPLACE VIEW payouts_resumen AS
SELECT
    p.voucher_id,
    v.folio,
    v.periodo,
    v.monto_pagado,
    COUNT(*) AS total_payouts,
    SUM(CASE WHEN p.tipo = 'PROPIETARIO' THEN p.monto ELSE 0 END) AS monto_propietario,
    SUM(CASE WHEN p.tipo = 'ADMINISTRACION' THEN p.monto ELSE 0 END) AS monto_admin,
    BOOL_AND(p.estado = 'COMPLETADO') AS todos_completados,
    MAX(p.fecha_ejecucion) AS ultima_ejecucion
FROM payouts p
JOIN vouchers v ON v.voucher_id = p.voucher_id
GROUP BY p.voucher_id, v.folio, v.periodo, v.monto_pagado;

COMMENT ON VIEW payouts_resumen IS 'Resumen de payouts agrupados por voucher';

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;

-- Políticas para vouchers
CREATE POLICY "Usuarios ven vouchers de su organización" ON vouchers
    FOR SELECT USING (
        organizacion_id IN (
            SELECT uo.organizacion_id
            FROM user_organizacion uo
            WHERE uo.user_id = auth.uid()
        )
    );

CREATE POLICY "Usuarios insertan vouchers en su organización" ON vouchers
    FOR INSERT WITH CHECK (
        organizacion_id IN (
            SELECT uo.organizacion_id
            FROM user_organizacion uo
            WHERE uo.user_id = auth.uid()
        )
    );

CREATE POLICY "Usuarios actualizan vouchers de su organización" ON vouchers
    FOR UPDATE USING (
        organizacion_id IN (
            SELECT uo.organizacion_id
            FROM user_organizacion uo
            WHERE uo.user_id = auth.uid()
        )
    );

-- Políticas para payouts
CREATE POLICY "Usuarios ven payouts de su organización" ON payouts
    FOR SELECT USING (
        organizacion_id IN (
            SELECT uo.organizacion_id
            FROM user_organizacion uo
            WHERE uo.user_id = auth.uid()
        )
    );

CREATE POLICY "Usuarios insertan payouts en su organización" ON payouts
    FOR INSERT WITH CHECK (
        organizacion_id IN (
            SELECT uo.organizacion_id
            FROM user_organizacion uo
            WHERE uo.user_id = auth.uid()
        )
    );

CREATE POLICY "Usuarios actualizan payouts de su organización" ON payouts
    FOR UPDATE USING (
        organizacion_id IN (
            SELECT uo.organizacion_id
            FROM user_organizacion uo
            WHERE uo.user_id = auth.uid()
        )
    );

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger para actualizar updated_at
CREATE TRIGGER update_vouchers_updated_at
    BEFORE UPDATE ON vouchers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payouts_updated_at
    BEFORE UPDATE ON payouts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- DATOS INICIALES (si se requieren)
-- ============================================================================

-- No hay datos iniciales requeridos para este módulo
