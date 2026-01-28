-- ============================================
-- MÓDULO: BITÁCORA DE PROPIEDADES
-- Versión: 1.0
-- Fecha: 2025-12-21
-- ============================================

-- ============================================
-- TIPOS ENUM
-- ============================================

-- Tipo de movimiento (cargo o descuento)
CREATE TYPE tipo_movimiento_bitacora AS ENUM ('cargo', 'descuento');

-- Modo de aplicación del cargo/descuento
CREATE TYPE modo_aplicacion_bitacora AS ENUM ('proximo', 'periodo', 'cuotas');

-- Estado del evento de bitácora (respecto a cargos/descuentos)
CREATE TYPE estado_bitacora AS ENUM ('pendiente', 'parcial', 'aplicado', 'cancelado');

-- Estado de la relación bitácora-voucher
CREATE TYPE estado_bitacora_voucher AS ENUM ('aplicado', 'pagado');

-- ============================================
-- TABLA: categorias_bitacora
-- Catálogo de categorías para eventos
-- ============================================

CREATE TABLE categorias_bitacora (
  categoria_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id UUID REFERENCES organizaciones(organizacion_id) ON DELETE CASCADE,

  -- Datos
  nombre VARCHAR(50) NOT NULL,
  descripcion TEXT,
  icono VARCHAR(50), -- Nombre del icono (lucide/tabler)
  color VARCHAR(7), -- Hex color (#RRGGBB)

  -- Control
  es_sistema BOOLEAN NOT NULL DEFAULT FALSE,
  activa BOOLEAN NOT NULL DEFAULT TRUE,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT categorias_nombre_org_unique UNIQUE (organizacion_id, nombre)
);

-- Índices
CREATE INDEX idx_categorias_org ON categorias_bitacora(organizacion_id) WHERE organizacion_id IS NOT NULL;
CREATE INDEX idx_categorias_sistema ON categorias_bitacora(es_sistema) WHERE es_sistema = TRUE;

-- Comentarios
COMMENT ON TABLE categorias_bitacora IS 'Catálogo de categorías para eventos de bitácora';
COMMENT ON COLUMN categorias_bitacora.organizacion_id IS 'NULL para categorías del sistema';
COMMENT ON COLUMN categorias_bitacora.es_sistema IS 'TRUE = categoría predefinida, no eliminable';

-- ============================================
-- INSERTAR CATEGORÍAS PREDEFINIDAS DEL SISTEMA
-- ============================================

INSERT INTO categorias_bitacora (organizacion_id, nombre, descripcion, icono, color, es_sistema) VALUES
  (NULL, 'Reparación', 'Arreglos y mantenimientos realizados', 'wrench', '#F59E0B', TRUE),
  (NULL, 'Visita', 'Inspecciones y visitas a la propiedad', 'eye', '#3B82F6', TRUE),
  (NULL, 'Incidente', 'Problemas, emergencias o situaciones inesperadas', 'alert-triangle', '#EF4444', TRUE),
  (NULL, 'Administrativo', 'Trámites, gestiones y documentación', 'file-text', '#8B5CF6', TRUE),
  (NULL, 'Nota', 'Observaciones y notas generales', 'sticky-note', '#6B7280', TRUE),
  (NULL, 'Pago', 'Eventos relacionados con pagos y cobros', 'credit-card', '#10B981', TRUE);

-- ============================================
-- TABLA: bitacora_propiedades
-- Eventos registrados por propiedad
-- ============================================

CREATE TABLE bitacora_propiedades (
  bitacora_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizacion_id UUID NOT NULL REFERENCES organizaciones(organizacion_id) ON DELETE CASCADE,
  propiedad_id UUID NOT NULL REFERENCES propiedades(propiedad_id) ON DELETE CASCADE,
  contrato_id UUID REFERENCES contratos(contrato_id) ON DELETE SET NULL,

  -- Evento
  categoria_id UUID NOT NULL REFERENCES categorias_bitacora(categoria_id) ON DELETE RESTRICT,
  titulo VARCHAR(200) NOT NULL,
  descripcion TEXT,
  fecha_evento DATE NOT NULL,

  -- Cargo/Descuento (opcional)
  tipo_movimiento tipo_movimiento_bitacora,
  monto_total NUMERIC(12, 2),
  moneda VARCHAR(3) NOT NULL DEFAULT 'CLP' CHECK (moneda IN ('CLP', 'UF')),

  -- Configuración de aplicación
  modo_aplicacion modo_aplicacion_bitacora,
  periodo_objetivo VARCHAR(7), -- YYYY-MM para modo 'periodo'
  numero_cuotas INT CHECK (numero_cuotas IS NULL OR numero_cuotas >= 2),
  cuotas_restantes INT CHECK (cuotas_restantes IS NULL OR cuotas_restantes >= 0),
  monto_por_cuota NUMERIC(12, 2),

  -- Estado
  estado estado_bitacora NOT NULL DEFAULT 'aplicado',

  -- Seguimiento post-pago
  notas_seguimiento TEXT,

  -- Auditoría
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Constraints de coherencia
  CONSTRAINT bitacora_monto_requiere_tipo CHECK (
    (tipo_movimiento IS NULL AND monto_total IS NULL) OR
    (tipo_movimiento IS NOT NULL AND monto_total IS NOT NULL AND monto_total > 0)
  ),
  CONSTRAINT bitacora_modo_requiere_monto CHECK (
    (modo_aplicacion IS NULL AND monto_total IS NULL) OR
    (modo_aplicacion IS NOT NULL AND monto_total IS NOT NULL)
  ),
  CONSTRAINT bitacora_periodo_requerido CHECK (
    modo_aplicacion != 'periodo' OR periodo_objetivo IS NOT NULL
  ),
  CONSTRAINT bitacora_cuotas_requeridas CHECK (
    modo_aplicacion != 'cuotas' OR (numero_cuotas IS NOT NULL AND numero_cuotas >= 2)
  ),
  CONSTRAINT bitacora_periodo_formato CHECK (
    periodo_objetivo IS NULL OR periodo_objetivo ~ '^\d{4}-\d{2}$'
  )
);

-- Índices
CREATE INDEX idx_bitacora_propiedad ON bitacora_propiedades(propiedad_id);
CREATE INDEX idx_bitacora_contrato ON bitacora_propiedades(contrato_id) WHERE contrato_id IS NOT NULL;
CREATE INDEX idx_bitacora_org ON bitacora_propiedades(organizacion_id);
CREATE INDEX idx_bitacora_fecha ON bitacora_propiedades(fecha_evento DESC);
CREATE INDEX idx_bitacora_pendientes ON bitacora_propiedades(contrato_id, estado)
  WHERE tipo_movimiento IS NOT NULL AND estado IN ('pendiente', 'parcial');
CREATE INDEX idx_bitacora_categoria ON bitacora_propiedades(categoria_id);

-- Comentarios
COMMENT ON TABLE bitacora_propiedades IS 'Registro histórico de eventos por propiedad (hoja de vida)';
COMMENT ON COLUMN bitacora_propiedades.contrato_id IS 'Contrato vigente al momento del evento, NULL si propiedad vacía';
COMMENT ON COLUMN bitacora_propiedades.tipo_movimiento IS 'NULL = evento informativo sin cargo/descuento';
COMMENT ON COLUMN bitacora_propiedades.modo_aplicacion IS 'Cómo aplicar el cargo: próximo voucher, período específico, o cuotas';
COMMENT ON COLUMN bitacora_propiedades.periodo_objetivo IS 'YYYY-MM para modo periodo (ej: 2024-03)';
COMMENT ON COLUMN bitacora_propiedades.cuotas_restantes IS 'Cuántas cuotas faltan por aplicar';
COMMENT ON COLUMN bitacora_propiedades.estado IS 'aplicado = sin cargo O cargo completamente cobrado';

-- ============================================
-- TABLA: bitacora_archivos
-- Archivos adjuntos a eventos
-- ============================================

CREATE TABLE bitacora_archivos (
  archivo_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bitacora_id UUID NOT NULL REFERENCES bitacora_propiedades(bitacora_id) ON DELETE CASCADE,

  -- Archivo
  nombre_original VARCHAR(255) NOT NULL,
  nombre_storage VARCHAR(255) NOT NULL, -- Nombre en Supabase Storage
  tipo_mime VARCHAR(100) NOT NULL,
  tamaño_bytes BIGINT NOT NULL CHECK (tamaño_bytes > 0),

  -- Metadata
  descripcion TEXT,

  -- Auditoría
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT
);

-- Índices
CREATE INDEX idx_archivos_bitacora ON bitacora_archivos(bitacora_id);

-- Comentarios
COMMENT ON TABLE bitacora_archivos IS 'Archivos adjuntos a eventos de bitácora';
COMMENT ON COLUMN bitacora_archivos.nombre_storage IS 'Path completo en Supabase Storage';

-- ============================================
-- TABLA: bitacora_voucher
-- Relación entre bitácora y vouchers (para tracking de cuotas)
-- ============================================

CREATE TABLE bitacora_voucher (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bitacora_id UUID NOT NULL REFERENCES bitacora_propiedades(bitacora_id) ON DELETE CASCADE,
  voucher_id UUID NOT NULL REFERENCES vouchers(voucher_id) ON DELETE CASCADE,

  -- Datos del momento de aplicación
  cuota_numero INT, -- Número de cuota (1, 2, 3...), NULL si no es cuotas
  monto_aplicado NUMERIC(12, 2) NOT NULL CHECK (monto_aplicado > 0),

  -- Estado
  estado estado_bitacora_voucher NOT NULL DEFAULT 'aplicado',

  -- Fechas
  fecha_aplicacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fecha_pago TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT bitacora_voucher_unique UNIQUE (bitacora_id, voucher_id, cuota_numero)
);

-- Índices
CREATE INDEX idx_bv_bitacora ON bitacora_voucher(bitacora_id);
CREATE INDEX idx_bv_voucher ON bitacora_voucher(voucher_id);
CREATE INDEX idx_bv_pendientes ON bitacora_voucher(voucher_id, estado) WHERE estado = 'aplicado';

-- Comentarios
COMMENT ON TABLE bitacora_voucher IS 'Tracking de qué cargos/descuentos están en qué vouchers';
COMMENT ON COLUMN bitacora_voucher.cuota_numero IS 'Número de cuota (1, 2, 3...), NULL si pago único';
COMMENT ON COLUMN bitacora_voucher.estado IS 'aplicado = en voucher pendiente, pagado = voucher fue pagado';

-- ============================================
-- TRIGGERS
-- ============================================

-- Trigger: Auto-calcular monto_por_cuota al crear/actualizar
CREATE OR REPLACE FUNCTION calcular_monto_cuota()
RETURNS TRIGGER AS $$
BEGIN
  -- Solo calcular si es modo cuotas y hay monto
  IF NEW.modo_aplicacion = 'cuotas' AND NEW.monto_total IS NOT NULL AND NEW.numero_cuotas IS NOT NULL THEN
    NEW.monto_por_cuota := ROUND(NEW.monto_total / NEW.numero_cuotas, 0); -- Sin decimales para CLP

    -- Si es INSERT, inicializar cuotas_restantes
    IF TG_OP = 'INSERT' THEN
      NEW.cuotas_restantes := NEW.numero_cuotas;
    END IF;
  ELSE
    NEW.monto_por_cuota := NULL;
    NEW.cuotas_restantes := NULL;
  END IF;

  -- Si tiene cargo/descuento y es nuevo, estado debe ser pendiente
  IF TG_OP = 'INSERT' AND NEW.tipo_movimiento IS NOT NULL THEN
    NEW.estado := 'pendiente';
  END IF;

  -- Actualizar updated_at
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bitacora_calcular_cuota
  BEFORE INSERT OR UPDATE ON bitacora_propiedades
  FOR EACH ROW
  EXECUTE FUNCTION calcular_monto_cuota();

-- Trigger: Actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_bitacora_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bitacora_updated_at
  BEFORE UPDATE ON bitacora_propiedades
  FOR EACH ROW
  EXECUTE FUNCTION update_bitacora_timestamp();

-- ============================================
-- FUNCIONES
-- ============================================

-- Función: Aplicar cargos/descuentos pendientes a un voucher
CREATE OR REPLACE FUNCTION aplicar_bitacora_a_voucher(
  p_voucher_id UUID,
  p_contrato_id UUID,
  p_periodo VARCHAR(7)
)
RETURNS TABLE (
  bitacora_id UUID,
  tipo tipo_movimiento_bitacora,
  monto NUMERIC,
  cuota_numero INT,
  total_cuotas INT
) AS $$
DECLARE
  r RECORD;
  v_cuota_actual INT;
  v_monto_aplicar NUMERIC;
BEGIN
  -- Buscar cargos/descuentos pendientes para este contrato
  FOR r IN
    SELECT b.*
    FROM bitacora_propiedades b
    WHERE b.contrato_id = p_contrato_id
      AND b.tipo_movimiento IS NOT NULL
      AND b.estado IN ('pendiente', 'parcial')
      AND (
        -- Modo próximo: siempre aplicar
        b.modo_aplicacion = 'proximo'
        OR
        -- Modo período: cuando llegue el período
        (b.modo_aplicacion = 'periodo' AND b.periodo_objetivo <= p_periodo)
        OR
        -- Modo cuotas: mientras queden cuotas
        (b.modo_aplicacion = 'cuotas' AND b.cuotas_restantes > 0)
      )
    ORDER BY b.created_at
  LOOP
    -- Calcular monto y cuota a aplicar
    IF r.modo_aplicacion = 'cuotas' THEN
      v_cuota_actual := r.numero_cuotas - r.cuotas_restantes + 1;
      v_monto_aplicar := r.monto_por_cuota;
    ELSE
      v_cuota_actual := NULL;
      v_monto_aplicar := r.monto_total;
    END IF;

    -- Insertar en bitacora_voucher
    INSERT INTO bitacora_voucher (
      bitacora_id,
      voucher_id,
      cuota_numero,
      monto_aplicado,
      estado
    ) VALUES (
      r.bitacora_id,
      p_voucher_id,
      v_cuota_actual,
      v_monto_aplicar,
      'aplicado'
    );

    -- Actualizar estado de bitácora
    IF r.modo_aplicacion = 'cuotas' THEN
      UPDATE bitacora_propiedades
      SET
        cuotas_restantes = cuotas_restantes - 1,
        estado = CASE
          WHEN cuotas_restantes - 1 = 0 THEN 'aplicado'::estado_bitacora
          ELSE 'parcial'::estado_bitacora
        END
      WHERE bitacora_propiedades.bitacora_id = r.bitacora_id;
    ELSE
      UPDATE bitacora_propiedades
      SET estado = 'aplicado'
      WHERE bitacora_propiedades.bitacora_id = r.bitacora_id;
    END IF;

    -- Retornar datos aplicados
    bitacora_id := r.bitacora_id;
    tipo := r.tipo_movimiento;
    monto := v_monto_aplicar;
    cuota_numero := v_cuota_actual;
    total_cuotas := r.numero_cuotas;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$ LANGUAGE plpgsql;

-- Función: Marcar cargos de un voucher como pagados y generar snapshot
CREATE OR REPLACE FUNCTION marcar_bitacora_pagada(p_voucher_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_snapshot JSONB;
  v_total_cargos NUMERIC := 0;
  v_total_descuentos NUMERIC := 0;
BEGIN
  -- Construir snapshot de items pagados
  SELECT jsonb_build_object(
    'cargos', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'bitacora_id', bv.bitacora_id,
          'titulo', b.titulo,
          'descripcion', b.descripcion,
          'monto', bv.monto_aplicado,
          'cuota', CASE
            WHEN bv.cuota_numero IS NOT NULL
            THEN bv.cuota_numero::text || '/' || b.numero_cuotas::text
            ELSE NULL
          END
        )
      ) FILTER (WHERE b.tipo_movimiento = 'cargo'),
      '[]'::jsonb
    ),
    'descuentos', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'bitacora_id', bv.bitacora_id,
          'titulo', b.titulo,
          'descripcion', b.descripcion,
          'monto', bv.monto_aplicado,
          'cuota', CASE
            WHEN bv.cuota_numero IS NOT NULL
            THEN bv.cuota_numero::text || '/' || b.numero_cuotas::text
            ELSE NULL
          END
        )
      ) FILTER (WHERE b.tipo_movimiento = 'descuento'),
      '[]'::jsonb
    )
  )
  INTO v_snapshot
  FROM bitacora_voucher bv
  JOIN bitacora_propiedades b ON b.bitacora_id = bv.bitacora_id
  WHERE bv.voucher_id = p_voucher_id
    AND bv.estado = 'aplicado';

  -- Calcular totales
  SELECT
    COALESCE(SUM(CASE WHEN b.tipo_movimiento = 'cargo' THEN bv.monto_aplicado ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN b.tipo_movimiento = 'descuento' THEN bv.monto_aplicado ELSE 0 END), 0)
  INTO v_total_cargos, v_total_descuentos
  FROM bitacora_voucher bv
  JOIN bitacora_propiedades b ON b.bitacora_id = bv.bitacora_id
  WHERE bv.voucher_id = p_voucher_id
    AND bv.estado = 'aplicado';

  -- Agregar totales al snapshot
  v_snapshot := v_snapshot || jsonb_build_object(
    'total_cargos', v_total_cargos,
    'total_descuentos', v_total_descuentos
  );

  -- Marcar como pagados
  UPDATE bitacora_voucher
  SET
    estado = 'pagado',
    fecha_pago = NOW()
  WHERE voucher_id = p_voucher_id
    AND estado = 'aplicado';

  RETURN v_snapshot;
END;
$$ LANGUAGE plpgsql;

-- Función: Cancelar cargos pendientes de un contrato (al terminar contrato)
CREATE OR REPLACE FUNCTION cancelar_bitacora_contrato(p_contrato_id UUID)
RETURNS INT AS $$
DECLARE
  v_count INT;
BEGIN
  -- Eliminar vínculos no pagados
  DELETE FROM bitacora_voucher bv
  USING bitacora_propiedades b
  WHERE bv.bitacora_id = b.bitacora_id
    AND b.contrato_id = p_contrato_id
    AND bv.estado = 'aplicado';

  -- Marcar bitácoras como canceladas
  UPDATE bitacora_propiedades
  SET
    estado = 'cancelado',
    notas_seguimiento = COALESCE(notas_seguimiento || E'\n', '') ||
      '[' || NOW()::date || '] Cancelado por término de contrato'
  WHERE contrato_id = p_contrato_id
    AND tipo_movimiento IS NOT NULL
    AND estado IN ('pendiente', 'parcial');

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- VISTAS
-- ============================================

-- Vista: Cargos/descuentos pendientes para portal de pago
CREATE OR REPLACE VIEW voucher_cargos_pendientes AS
SELECT
  v.voucher_id,
  v.folio,
  v.periodo,
  v.estado AS estado_voucher,

  -- Datos de bitácora
  bv.id AS bitacora_voucher_id,
  b.bitacora_id,
  b.titulo,
  b.descripcion,
  b.tipo_movimiento,
  bv.monto_aplicado,
  b.moneda,
  bv.cuota_numero,
  b.numero_cuotas,

  -- Categoría
  c.nombre AS categoria_nombre,
  c.icono AS categoria_icono,
  c.color AS categoria_color

FROM vouchers v
JOIN bitacora_voucher bv ON bv.voucher_id = v.voucher_id
JOIN bitacora_propiedades b ON b.bitacora_id = bv.bitacora_id
JOIN categorias_bitacora c ON c.categoria_id = b.categoria_id
WHERE v.estado IN ('GENERADO', 'ENVIADO', 'VENCIDO')
  AND bv.estado = 'aplicado';

COMMENT ON VIEW voucher_cargos_pendientes IS 'Cargos y descuentos de bitácora aplicados a vouchers pendientes de pago';

-- Vista: Bitácoras pendientes de aplicar a vouchers
CREATE OR REPLACE VIEW bitacora_por_aplicar AS
SELECT
  b.*,
  c.nombre AS categoria_nombre,
  c.icono AS categoria_icono,
  c.color AS categoria_color,
  p.direccion,
  p.numero,
  cont.arrendatario_id
FROM bitacora_propiedades b
JOIN categorias_bitacora c ON c.categoria_id = b.categoria_id
JOIN propiedades p ON p.propiedad_id = b.propiedad_id
LEFT JOIN contratos cont ON cont.contrato_id = b.contrato_id
WHERE b.tipo_movimiento IS NOT NULL
  AND b.estado IN ('pendiente', 'parcial')
  AND (
    -- Modo próximo: siempre listo para aplicar
    b.modo_aplicacion = 'proximo'
    OR
    -- Modo período: cuando llegue el período
    (b.modo_aplicacion = 'periodo' AND b.periodo_objetivo <= TO_CHAR(CURRENT_DATE, 'YYYY-MM'))
    OR
    -- Modo cuotas: mientras queden cuotas
    (b.modo_aplicacion = 'cuotas' AND b.cuotas_restantes > 0)
  );

COMMENT ON VIEW bitacora_por_aplicar IS 'Cargos y descuentos pendientes de aplicar a vouchers';

-- Vista: Resumen de bitácora por propiedad
CREATE OR REPLACE VIEW bitacora_resumen AS
SELECT
  b.bitacora_id,
  b.organizacion_id,
  b.propiedad_id,
  b.contrato_id,
  b.titulo,
  b.descripcion,
  b.fecha_evento,
  b.tipo_movimiento,
  b.monto_total,
  b.moneda,
  b.modo_aplicacion,
  b.numero_cuotas,
  b.cuotas_restantes,
  b.estado,
  b.created_at,

  -- Categoría
  c.nombre AS categoria_nombre,
  c.icono AS categoria_icono,
  c.color AS categoria_color,

  -- Propiedad
  p.direccion,
  p.numero AS numero_propiedad,

  -- Contrato/Arrendatario
  a.nombre AS arrendatario_nombre,

  -- Archivos
  (SELECT COUNT(*) FROM bitacora_archivos ba WHERE ba.bitacora_id = b.bitacora_id) AS cantidad_archivos,

  -- Pagos
  (SELECT COUNT(*) FROM bitacora_voucher bv WHERE bv.bitacora_id = b.bitacora_id AND bv.estado = 'pagado') AS cuotas_pagadas,

  -- Usuario creador
  u.email AS creado_por_email

FROM bitacora_propiedades b
JOIN categorias_bitacora c ON c.categoria_id = b.categoria_id
JOIN propiedades p ON p.propiedad_id = b.propiedad_id
LEFT JOIN contratos cont ON cont.contrato_id = b.contrato_id
LEFT JOIN arrendatarios a ON a.arrendatario_id = cont.arrendatario_id
LEFT JOIN users u ON u.id = b.created_by;

COMMENT ON VIEW bitacora_resumen IS 'Vista resumen de bitácora con datos relacionados';

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Habilitar RLS en todas las tablas
ALTER TABLE categorias_bitacora ENABLE ROW LEVEL SECURITY;
ALTER TABLE bitacora_propiedades ENABLE ROW LEVEL SECURITY;
ALTER TABLE bitacora_archivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE bitacora_voucher ENABLE ROW LEVEL SECURITY;

-- Políticas para categorias_bitacora
CREATE POLICY "Categorías del sistema visibles para todos"
  ON categorias_bitacora FOR SELECT
  USING (es_sistema = TRUE);

CREATE POLICY "Categorías de organización visibles para miembros"
  ON categorias_bitacora FOR SELECT
  USING (
    organizacion_id IN (
      SELECT uo.organizacion_id
      FROM user_organizacion uo
      WHERE uo.user_id = auth.uid()
    )
  );

CREATE POLICY "Crear categorías en mi organización"
  ON categorias_bitacora FOR INSERT
  WITH CHECK (
    organizacion_id IN (
      SELECT uo.organizacion_id
      FROM user_organizacion uo
      WHERE uo.user_id = auth.uid()
    )
  );

CREATE POLICY "Editar categorías de mi organización"
  ON categorias_bitacora FOR UPDATE
  USING (
    es_sistema = FALSE AND
    organizacion_id IN (
      SELECT uo.organizacion_id
      FROM user_organizacion uo
      WHERE uo.user_id = auth.uid()
    )
  );

CREATE POLICY "Eliminar categorías de mi organización"
  ON categorias_bitacora FOR DELETE
  USING (
    es_sistema = FALSE AND
    organizacion_id IN (
      SELECT uo.organizacion_id
      FROM user_organizacion uo
      WHERE uo.user_id = auth.uid()
    )
  );

-- Políticas para bitacora_propiedades
CREATE POLICY "Ver bitácora de mi organización"
  ON bitacora_propiedades FOR SELECT
  USING (
    organizacion_id IN (
      SELECT uo.organizacion_id
      FROM user_organizacion uo
      WHERE uo.user_id = auth.uid()
    )
  );

CREATE POLICY "Crear bitácora en mi organización"
  ON bitacora_propiedades FOR INSERT
  WITH CHECK (
    organizacion_id IN (
      SELECT uo.organizacion_id
      FROM user_organizacion uo
      WHERE uo.user_id = auth.uid()
    )
  );

CREATE POLICY "Editar bitácora de mi organización"
  ON bitacora_propiedades FOR UPDATE
  USING (
    organizacion_id IN (
      SELECT uo.organizacion_id
      FROM user_organizacion uo
      WHERE uo.user_id = auth.uid()
    )
  );

CREATE POLICY "Eliminar bitácora de mi organización"
  ON bitacora_propiedades FOR DELETE
  USING (
    organizacion_id IN (
      SELECT uo.organizacion_id
      FROM user_organizacion uo
      WHERE uo.user_id = auth.uid()
    )
  );

-- Políticas para bitacora_archivos (heredan de bitacora_propiedades)
CREATE POLICY "Ver archivos de bitácora de mi organización"
  ON bitacora_archivos FOR SELECT
  USING (
    bitacora_id IN (
      SELECT b.bitacora_id
      FROM bitacora_propiedades b
      WHERE b.organizacion_id IN (
        SELECT uo.organizacion_id
        FROM user_organizacion uo
        WHERE uo.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Crear archivos en bitácora de mi organización"
  ON bitacora_archivos FOR INSERT
  WITH CHECK (
    bitacora_id IN (
      SELECT b.bitacora_id
      FROM bitacora_propiedades b
      WHERE b.organizacion_id IN (
        SELECT uo.organizacion_id
        FROM user_organizacion uo
        WHERE uo.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Eliminar archivos de bitácora de mi organización"
  ON bitacora_archivos FOR DELETE
  USING (
    bitacora_id IN (
      SELECT b.bitacora_id
      FROM bitacora_propiedades b
      WHERE b.organizacion_id IN (
        SELECT uo.organizacion_id
        FROM user_organizacion uo
        WHERE uo.user_id = auth.uid()
      )
    )
  );

-- Políticas para bitacora_voucher (heredan de bitacora_propiedades)
CREATE POLICY "Ver relación bitácora-voucher de mi organización"
  ON bitacora_voucher FOR SELECT
  USING (
    bitacora_id IN (
      SELECT b.bitacora_id
      FROM bitacora_propiedades b
      WHERE b.organizacion_id IN (
        SELECT uo.organizacion_id
        FROM user_organizacion uo
        WHERE uo.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Crear relación bitácora-voucher en mi organización"
  ON bitacora_voucher FOR INSERT
  WITH CHECK (
    bitacora_id IN (
      SELECT b.bitacora_id
      FROM bitacora_propiedades b
      WHERE b.organizacion_id IN (
        SELECT uo.organizacion_id
        FROM user_organizacion uo
        WHERE uo.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Actualizar relación bitácora-voucher de mi organización"
  ON bitacora_voucher FOR UPDATE
  USING (
    bitacora_id IN (
      SELECT b.bitacora_id
      FROM bitacora_propiedades b
      WHERE b.organizacion_id IN (
        SELECT uo.organizacion_id
        FROM user_organizacion uo
        WHERE uo.user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Eliminar relación bitácora-voucher de mi organización"
  ON bitacora_voucher FOR DELETE
  USING (
    bitacora_id IN (
      SELECT b.bitacora_id
      FROM bitacora_propiedades b
      WHERE b.organizacion_id IN (
        SELECT uo.organizacion_id
        FROM user_organizacion uo
        WHERE uo.user_id = auth.uid()
      )
    )
  );

-- ============================================
-- GRANTS (para service role y authenticated)
-- ============================================

-- Service role tiene acceso completo (para crons y funciones del sistema)
GRANT ALL ON categorias_bitacora TO service_role;
GRANT ALL ON bitacora_propiedades TO service_role;
GRANT ALL ON bitacora_archivos TO service_role;
GRANT ALL ON bitacora_voucher TO service_role;

-- Authenticated users tienen acceso controlado por RLS
GRANT SELECT, INSERT, UPDATE, DELETE ON categorias_bitacora TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON bitacora_propiedades TO authenticated;
GRANT SELECT, INSERT, DELETE ON bitacora_archivos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON bitacora_voucher TO authenticated;

-- Acceso a vistas
GRANT SELECT ON voucher_cargos_pendientes TO authenticated, service_role;
GRANT SELECT ON bitacora_por_aplicar TO authenticated, service_role;
GRANT SELECT ON bitacora_resumen TO authenticated, service_role;

-- ============================================
-- FIN DE MIGRACIÓN
-- ============================================
