-- =====================================================
-- MIGRACIÓN: Sistema de Contratos de Arriendo
-- Descripción: Crea las tablas para gestión de contratos
--              con histórico de configuraciones
-- Fecha: 2025-12-22
-- =====================================================

-- =====================================================
-- TABLAS STUB (Dependencias pendientes de completar)
-- =====================================================

-- Tabla stub: arrendatarios
-- TODO: Completar con campos (nombre, rut, email, telefono, etc.)
CREATE TABLE IF NOT EXISTS public.arrendatarios (
  arrendatario_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(org_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.arrendatarios IS 'Tabla stub - Pendiente completar con campos de arrendatario';

-- Tabla stub: cuentas_bancarias
-- TODO: Completar con campos (banco, tipo_cuenta, numero_cuenta, titular, rut, email, etc.)
CREATE TABLE IF NOT EXISTS public.cuentas_bancarias (
  cuenta_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(org_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.cuentas_bancarias IS 'Tabla stub - Pendiente completar con campos de cuenta bancaria';

-- Índices para tablas stub
CREATE INDEX idx_arrendatarios_org ON public.arrendatarios(org_id);
CREATE INDEX idx_cuentas_bancarias_org ON public.cuentas_bancarias(org_id);

-- =====================================================
-- TABLA: contratos
-- Descripción: Tabla principal con datos inmutables del contrato
-- =====================================================
CREATE TABLE IF NOT EXISTS public.contratos (
  contrato_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  propiedad_id UUID NOT NULL REFERENCES public.propiedades(propiedad_id) ON DELETE CASCADE,
  arrendatario_id UUID NOT NULL REFERENCES public.arrendatarios(arrendatario_id) ON DELETE RESTRICT,
  org_id UUID NOT NULL REFERENCES public.orgs(org_id) ON DELETE CASCADE,

  -- Estado del contrato
  estado TEXT NOT NULL CHECK (estado IN ('VIGENTE', 'VENCIDO', 'TERMINADO')) DEFAULT 'VIGENTE',

  -- Fechas del contrato
  fecha_inicio DATE NOT NULL,
  fecha_termino DATE,
  es_indefinido BOOLEAN NOT NULL DEFAULT false,
  renovacion_automatica BOOLEAN NOT NULL DEFAULT false,
  aviso_termino_dias INTEGER, -- días antes de terminar para avisar

  -- Configuración de cobro (calendario)
  dia_generacion INTEGER NOT NULL CHECK (dia_generacion >= 1 AND dia_generacion <= 28),
  dia_envio INTEGER CHECK (dia_envio >= 1 AND dia_envio <= 28), -- null = mismo día de generación
  limite_pago INTEGER NOT NULL CHECK (limite_pago >= 1 AND limite_pago <= 28),

  -- Reajuste IPC
  reajuste_ipc TEXT CHECK (reajuste_ipc IN ('SEMESTRAL', 'ANUAL')) DEFAULT NULL,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_fecha_termino CHECK (
    es_indefinido = true OR fecha_termino IS NOT NULL
  ),
  CONSTRAINT valid_fecha_inicio CHECK (
    fecha_termino IS NULL OR fecha_inicio < fecha_termino
  )
);

-- Índices para contratos
CREATE INDEX idx_contratos_propiedad ON public.contratos(propiedad_id);
CREATE INDEX idx_contratos_arrendatario ON public.contratos(arrendatario_id);
CREATE INDEX idx_contratos_org ON public.contratos(org_id);
CREATE INDEX idx_contratos_estado ON public.contratos(estado);
CREATE INDEX idx_contratos_vigentes ON public.contratos(org_id, estado) WHERE estado = 'VIGENTE';

-- =====================================================
-- TABLA: contratos_config_historico
-- Descripción: Configuraciones de cobro con versionado
--              Permite histórico de cambios en montos,
--              comisiones, multas, garantías, etc.
-- =====================================================
CREATE TABLE IF NOT EXISTS public.contratos_config_historico (
  config_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID NOT NULL REFERENCES public.contratos(contrato_id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  vigente_desde TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  vigente_hasta TIMESTAMPTZ DEFAULT NULL, -- NULL = configuración actual

  -- Monto arriendo
  moneda_arriendo TEXT NOT NULL CHECK (moneda_arriendo IN ('CLP', 'UF')),
  monto_arriendo NUMERIC(12, 2) NOT NULL CHECK (monto_arriendo > 0),
  metodo_calculo_uf TEXT CHECK (metodo_calculo_uf IN ('inicio_mes', 'dia_generacion')),

  -- Comisión
  tipo_comision TEXT CHECK (tipo_comision IN ('porcentaje', 'CLP', 'UF')),
  valor_comision NUMERIC(12, 2) CHECK (valor_comision >= 0),

  -- Multas por atraso
  multas_atraso BOOLEAN NOT NULL DEFAULT true,
  tipo_multa TEXT CHECK (tipo_multa IN ('legal', 'personalizado')),
  porcentaje_multa NUMERIC(5, 2) CHECK (porcentaje_multa >= 0 AND porcentaje_multa <= 100), -- solo si tipo_multa = personalizado
  maximo_multa NUMERIC(12, 2) CHECK (maximo_multa >= 0),
  dias_gracia_multa INTEGER NOT NULL DEFAULT 0 CHECK (dias_gracia_multa >= 0),

  -- Garantía
  tipo_garantia TEXT CHECK (tipo_garantia IN ('multiplo', 'UF', 'CLP')),
  monto_garantia NUMERIC(12, 2) CHECK (monto_garantia > 0),
  garantia_destinatario TEXT CHECK (garantia_destinatario IN ('dueño', 'administrador', '50/50')),

  -- Cuentas bancarias para payouts
  cuenta_dueno_id UUID REFERENCES public.cuentas_bancarias(cuenta_id) ON DELETE SET NULL,
  cuenta_admin_id UUID REFERENCES public.cuentas_bancarias(cuenta_id) ON DELETE SET NULL,

  -- Auditoría
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.users(user_id) ON DELETE SET NULL,

  -- Constraints
  CONSTRAINT unique_version_per_contrato UNIQUE (contrato_id, version),
  CONSTRAINT valid_vigencia CHECK (
    vigente_hasta IS NULL OR vigente_desde < vigente_hasta
  ),
  CONSTRAINT valid_metodo_uf CHECK (
    moneda_arriendo != 'UF' OR metodo_calculo_uf IS NOT NULL
  ),
  CONSTRAINT valid_multa_personalizada CHECK (
    tipo_multa != 'personalizado' OR porcentaje_multa IS NOT NULL
  ),
  CONSTRAINT valid_comision CHECK (
    tipo_comision IS NULL OR valor_comision IS NOT NULL
  ),
  CONSTRAINT valid_garantia CHECK (
    tipo_garantia IS NULL OR (monto_garantia IS NOT NULL AND garantia_destinatario IS NOT NULL)
  )
);

-- Índices para config histórico
CREATE INDEX idx_config_historico_contrato ON public.contratos_config_historico(contrato_id);
CREATE INDEX idx_config_historico_vigente ON public.contratos_config_historico(contrato_id, vigente_hasta) WHERE vigente_hasta IS NULL;
CREATE INDEX idx_config_historico_version ON public.contratos_config_historico(contrato_id, version DESC);

-- =====================================================
-- TABLA: avales
-- Descripción: Avales del contrato (relación 1-N)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.avales (
  aval_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID NOT NULL REFERENCES public.contratos(contrato_id) ON DELETE CASCADE,

  -- Datos del aval
  nombre TEXT NOT NULL,
  rut TEXT,
  email TEXT,
  telefono TEXT,
  direccion TEXT,

  -- Tipo de aval
  tipo TEXT CHECK (tipo IN ('personal', 'solidario', 'simple')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_avales_contrato ON public.avales(contrato_id);

COMMENT ON TABLE public.avales IS 'Avales del contrato de arriendo';

-- =====================================================
-- FUNCIÓN: Actualizar updated_at automáticamente
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para contratos
CREATE TRIGGER trigger_contratos_updated_at
  BEFORE UPDATE ON public.contratos
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- FUNCIÓN: Auto-incrementar versión en config histórico
-- =====================================================
CREATE OR REPLACE FUNCTION auto_increment_config_version()
RETURNS TRIGGER AS $$
DECLARE
  max_version INTEGER;
BEGIN
  -- Obtener la versión máxima actual para este contrato
  SELECT COALESCE(MAX(version), 0) INTO max_version
  FROM public.contratos_config_historico
  WHERE contrato_id = NEW.contrato_id;

  -- Asignar siguiente versión
  NEW.version = max_version + 1;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para auto-incrementar versión
CREATE TRIGGER trigger_auto_increment_version
  BEFORE INSERT ON public.contratos_config_historico
  FOR EACH ROW
  EXECUTE FUNCTION auto_increment_config_version();

-- =====================================================
-- RLS (Row Level Security)
-- =====================================================

-- Habilitar RLS
ALTER TABLE public.contratos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contratos_config_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arrendatarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cuentas_bancarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avales ENABLE ROW LEVEL SECURITY;

-- Políticas para contratos
CREATE POLICY "Usuarios pueden ver contratos de su organización"
  ON public.contratos
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id
      FROM public.user_org
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Usuarios pueden crear contratos en su organización"
  ON public.contratos
  FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id
      FROM public.user_org
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Usuarios pueden actualizar contratos de su organización"
  ON public.contratos
  FOR UPDATE
  USING (
    org_id IN (
      SELECT org_id
      FROM public.user_org
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Usuarios pueden eliminar contratos de su organización"
  ON public.contratos
  FOR DELETE
  USING (
    org_id IN (
      SELECT org_id
      FROM public.user_org
      WHERE user_id = auth.uid()
    )
  );

-- Políticas para config histórico
CREATE POLICY "Usuarios pueden ver config de contratos de su organización"
  ON public.contratos_config_historico
  FOR SELECT
  USING (
    contrato_id IN (
      SELECT contrato_id
      FROM public.contratos
      WHERE org_id IN (
        SELECT org_id
        FROM public.user_org
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Usuarios pueden crear config de contratos de su organización"
  ON public.contratos_config_historico
  FOR INSERT
  WITH CHECK (
    contrato_id IN (
      SELECT contrato_id
      FROM public.contratos
      WHERE org_id IN (
        SELECT org_id
        FROM public.user_org
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Usuarios pueden actualizar config de contratos de su organización"
  ON public.contratos_config_historico
  FOR UPDATE
  USING (
    contrato_id IN (
      SELECT contrato_id
      FROM public.contratos
      WHERE org_id IN (
        SELECT org_id
        FROM public.user_org
        WHERE user_id = auth.uid()
      )
    )
  );

-- Políticas para arrendatarios (stub)
CREATE POLICY "Usuarios pueden ver arrendatarios de su organización"
  ON public.arrendatarios
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id
      FROM public.user_org
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Usuarios pueden crear arrendatarios en su organización"
  ON public.arrendatarios
  FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id
      FROM public.user_org
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Usuarios pueden actualizar arrendatarios de su organización"
  ON public.arrendatarios
  FOR UPDATE
  USING (
    org_id IN (
      SELECT org_id
      FROM public.user_org
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Usuarios pueden eliminar arrendatarios de su organización"
  ON public.arrendatarios
  FOR DELETE
  USING (
    org_id IN (
      SELECT org_id
      FROM public.user_org
      WHERE user_id = auth.uid()
    )
  );

-- Políticas para cuentas_bancarias (stub)
CREATE POLICY "Usuarios pueden ver cuentas bancarias de su organización"
  ON public.cuentas_bancarias
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id
      FROM public.user_org
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Usuarios pueden crear cuentas bancarias en su organización"
  ON public.cuentas_bancarias
  FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id
      FROM public.user_org
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Usuarios pueden actualizar cuentas bancarias de su organización"
  ON public.cuentas_bancarias
  FOR UPDATE
  USING (
    org_id IN (
      SELECT org_id
      FROM public.user_org
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Usuarios pueden eliminar cuentas bancarias de su organización"
  ON public.cuentas_bancarias
  FOR DELETE
  USING (
    org_id IN (
      SELECT org_id
      FROM public.user_org
      WHERE user_id = auth.uid()
    )
  );

-- Políticas para avales
CREATE POLICY "Usuarios pueden ver avales de contratos de su organización"
  ON public.avales
  FOR SELECT
  USING (
    contrato_id IN (
      SELECT contrato_id
      FROM public.contratos
      WHERE org_id IN (
        SELECT org_id
        FROM public.user_org
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Usuarios pueden crear avales de contratos de su organización"
  ON public.avales
  FOR INSERT
  WITH CHECK (
    contrato_id IN (
      SELECT contrato_id
      FROM public.contratos
      WHERE org_id IN (
        SELECT org_id
        FROM public.user_org
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Usuarios pueden actualizar avales de contratos de su organización"
  ON public.avales
  FOR UPDATE
  USING (
    contrato_id IN (
      SELECT contrato_id
      FROM public.contratos
      WHERE org_id IN (
        SELECT org_id
        FROM public.user_org
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Usuarios pueden eliminar avales de contratos de su organización"
  ON public.avales
  FOR DELETE
  USING (
    contrato_id IN (
      SELECT contrato_id
      FROM public.contratos
      WHERE org_id IN (
        SELECT org_id
        FROM public.user_org
        WHERE user_id = auth.uid()
      )
    )
  );

-- =====================================================
-- COMENTARIOS EN TABLAS Y COLUMNAS
-- =====================================================

COMMENT ON TABLE public.contratos IS 'Tabla principal de contratos de arriendo. Contiene datos inmutables o que rara vez cambian.';
COMMENT ON TABLE public.contratos_config_historico IS 'Configuraciones de cobro con versionado. Permite histórico completo de cambios en montos, comisiones, multas, etc.';

COMMENT ON COLUMN public.contratos.estado IS 'VIGENTE: genera vouchers | VENCIDO: renovación pendiente | TERMINADO: finalizado';
COMMENT ON COLUMN public.contratos.reajuste_ipc IS 'Frecuencia de reajuste por IPC. Se calcula on-demand al generar voucher.';
COMMENT ON COLUMN public.contratos.dia_generacion IS 'Día del mes (1-28) en que se genera el voucher de cobro.';
COMMENT ON COLUMN public.contratos.limite_pago IS 'Día del mes hasta donde no se cobran multas por atraso.';

COMMENT ON COLUMN public.contratos_config_historico.vigente_hasta IS 'NULL = configuración actual. No-NULL = histórico.';
COMMENT ON COLUMN public.contratos_config_historico.version IS 'Auto-incrementa con cada nuevo registro. Version 1 = config inicial.';
COMMENT ON COLUMN public.contratos_config_historico.metodo_calculo_uf IS 'inicio_mes: UF del día 1 | dia_generacion: UF del día que se genera voucher.';
COMMENT ON COLUMN public.contratos_config_historico.tipo_multa IS 'legal: 37.92% anual | personalizado: usar porcentaje_multa.';
COMMENT ON COLUMN public.contratos_config_historico.tipo_garantia IS 'multiplo: X veces el arriendo | UF/CLP: monto fijo.';
COMMENT ON COLUMN public.contratos_config_historico.created_by IS 'Usuario que creó esta versión de configuración (auditoría).';

-- =====================================================
-- FIN DE MIGRACIÓN
-- =====================================================
