# Schema de Base de Datos - Real State Pro

Este documento describe las tablas principales de Supabase y sus relaciones.

## Diagrama de Relaciones (Simplificado)

```
organizaciones (1) ──< (N) users ──< (N) user_organizacion
                │
                ├──< (N) propietarios (1) ──< (N) propiedades (1) ──< (N) contratos
                │                                    │                      │
                │                                    │                      ├──< (N) vouchers ──< (N) payouts
                │                                    │                      │
                │                                    │                      └──< (N) avales
                │                                    │
                │                                    ├──< (N) bitacora_propiedades
                │                                    │
                │                                    └──< (N) servicios ──< (N) consultas_deuda
                │
                ├──< (N) arrendatarios
                │
                └──< (N) cuentas_bancarias
```

## Tablas Core

### `organizaciones`
**Propósito**: Entidad raíz del multi-tenant. Cada empresa de corretaje es una organización.

**Campos clave**:
- `organizacion_id` (PK, UUID)
- `nombre`: Nombre de la empresa
- `logo_url`: Logo almacenado en Supabase Storage
- `email_provider`: 'RESEND' | 'WEBHOOK' (n8n)
- `webhook_url`: URL para envío de emails vía webhook

**Relaciones**:
- Tiene muchos: users, propiedades, contratos, vouchers, etc.

**Seguridad**:
- RLS habilitado
- Usuarios solo ven organizaciones a las que pertenecen

---

### `users`
**Propósito**: Usuarios del sistema (corredores, admins).

**Campos clave**:
- `user_id` (PK, UUID) - FK a `auth.users`
- `nombre`, `apellido`
- `correo`
- `user_type`: 'corredor' | 'propietario'

**Relaciones**:
- Pertenece a: `auth.users` (Supabase Auth)
- Muchos a muchos con: `organizaciones` (via `user_organizacion`)

---

### `user_organizacion`
**Propósito**: Tabla pivot para relación many-to-many entre users y organizaciones.

**Campos clave**:
- `user_org_id` (PK)
- `user_id` (FK)
- `organizacion_id` (FK)
- `rol`: Rol del usuario en esa organización

---

### `propietarios`
**Propósito**: Dueños de las propiedades.

**Campos clave**:
- `propietario_id` (PK, UUID)
- `organizacion_id` (FK)
- `user_id` (FK, nullable): Vincula a cuenta de usuario para acceso futuro
- `nombre`, `apellidos`, `rut`, `correo`
- `tipo_propietario`: 'PERSONA_NATURAL' | 'EMPRESA'

**Relaciones**:
- Pertenece a: `organizaciones`
- Tiene muchos: `propiedades`, `cuentas_bancarias`
- Puede tener: `user` (para login futuro)

---

### `arrendatarios`
**Propósito**: Inquilinos que arriendan propiedades.

**Campos clave**:
- `arrendatario_id` (PK, UUID)
- `organizacion_id` (FK)
- `nombre`, `apellidos`, `rut`, `correo`
- `direccion_domicilio`, `comuna_domicilio`, `region_domicilio`

**Relaciones**:
- Pertenece a: `organizaciones`
- Tiene muchos: `contratos`, `vouchers`

---

### `propiedades`
**Propósito**: Propiedades inmobiliarias administradas.

**Campos clave**:
- `propiedad_id` (PK, bigint)
- `organizacion_id` (FK)
- `propietario_id` (FK)
- `contrato_actual_id` (FK): Referencia al contrato activo
- `tipo_propiedad`: Casa, Departamento, Oficina, etc.
- `calle`, `numero`, `bloque`, `comuna`, `region`
- `dormitorios`, `banos`, `estacionamientos`, `bodegas`
- `superficie_util`, `terraza`, `total`
- `rol`: Rol de avalúo fiscal
- `estacionamiento_numeros` (JSONB): Array de números
- `bodega_numeros` (JSONB): Array de números

**Relaciones**:
- Pertenece a: `organizaciones`, `propietarios`
- Tiene uno: `contratos` (actual)
- Tiene muchos: `contratos` (histórico), `bitacora_propiedades`, `servicios`, `vouchers`

---

## Tablas de Contratos y Cobros

### `contratos`
**Propósito**: Configuración completa del contrato de arriendo.

**Campos clave**:
- `contrato_id` (PK, UUID)
- `organizacion_id` (FK)
- `propiedad_id` (FK)
- `arrendatario_id` (FK)
- `estado`: 'VIGENTE' | 'TERMINADO' | 'SUSPENDIDO'

**Montos y Moneda**:
- `moneda_arriendo`: 'CLP' | 'UF'
- `monto_arriendo`: Monto original
- `monto_reajustado`: Monto con IPC aplicado (solo CLP)
- `variacion_ipc_clp`: 'SEMESTRAL' | 'ANUAL' (opcional)
- `tipo_valor_uf`: Si es UF, tipo de valor

**Fechas**:
- `fecha_inicio`, `fecha_termino`
- `es_indefinido`: Boolean
- `renovacion_automatica`: Boolean

**Configuración de Vouchers**:
- `generacion_voucher_tipo`: 'PRIMER_DIA_MES' | 'ULTIMO_DIA_MES' | 'DIA_ESPECIFICO'
- `generacion_voucher_valor`: Día específico si aplica
- `envio_voucher_tipo`: Tipos similares
- `envio_voucher_valor`: Valor específico
- `limite_pago_tipo`: 'DIAS_DESPUES_EMISION' | 'DIA_ESPECIFICO_MES' | 'ULTIMO_DIA_MES'
- `limite_pago_valor`: Valor específico

**Multas**:
- `incluye_multa_atraso`: Boolean
- `tipo_calculo_multa`: 'LEGAL_ANUAL' (37.92%) | 'PERSONALIZADO'
- `tasa_interes_anual`: Tasa personalizada
- `dias_gracia`: Días sin multa después del vencimiento
- `tope_maximo_multa`: Límite como % del arriendo

**Descuentos**:
- `tiene_descuento`: Boolean
- `tipo_descuento`: 'MONTO_FIJO_CLP' | 'MONTO_FIJO_UF' | 'PORCENTAJE' | 'ARRIENDO_GRATIS'
- `valor_descuento`: Valor según tipo
- `duracion_descuento_tipo`: 'CANTIDAD_MESES' | 'RANGO_FECHAS' | 'PERIODOS_ESPECIFICOS'
- `duracion_descuento_meses`, `duracion_descuento_fecha_inicio`, `duracion_descuento_fecha_fin`
- `duracion_descuento_periodos` (JSONB): Array de meses [1,3,6]
- `inicio_descuento_tipo`: 'INICIO_CONTRATO' | 'FECHA_PERSONALIZADA' | 'PRIMER_VOUCHER'

**Garantías**:
- `tiene_garantia`: Boolean
- `monto_garantia`: Valor absoluto o multiplicador
- `moneda_garantia`: 'CLP' | 'UF' | 'MULTIPLO' (ej: 1.5x arriendo)
- `garantia_destinatario`: 'ARRENDADOR' | 'ADMINISTRACION'

**Comisiones**:
- `tipo_comision_admin`: 'PORCENTAJE' | 'MONTO_FIJO'
- `valor_comision_admin`: Valor según tipo
- `porcentaje_impuesto_comision`: IVA u otro impuesto

**Cuentas Bancarias**:
- `cuenta_dueño_liquidacion_id` (FK): Cuenta donde se liquida al propietario
- `cuenta_admin_pago_id` (FK): Cuenta donde se paga comisión a admin

**Relaciones**:
- Pertenece a: `organizaciones`, `propiedades`, `arrendatarios`
- Tiene muchos: `vouchers`, `avales`
- Referencias: `cuentas_bancarias` (2x)

---

### `vouchers`
**Propósito**: Documentos de cobro generados automáticamente.

**Campos clave**:
- `voucher_id` (PK, UUID)
- `folio`: Número de folio único
- `organizacion_id`, `contrato_id`, `arrendatario_id`, `propiedad_id` (FKs)
- `estado`: 'GENERADO' | 'ENVIADO' | 'PAGADO' | 'VENCIDO' | 'ANULADO'

**Fechas**:
- `periodo_cobro`: Mes que se está cobrando
- `fecha_generacion`: Cuándo se creó
- `fecha_envio_programada`: Cuándo debe enviarse
- `fecha_envio_efectiva`: Cuándo se envió realmente
- `fecha_vencimiento`: Límite de pago
- `fecha_pago`: Cuándo se pagó (si aplica)

**Montos**:
- `moneda`: 'CLP' | 'UF'
- `valor_uf_aplicado`: Valor UF si moneda es UF
- `monto_arriendo`: Monto base del arriendo
- `monto_multa_atraso`: Multa calculada
- `monto_adicionales`: Cargos de bitácora
- `total_servicios_basicos`: Suma de servicios seleccionados
- `subtotal`: arriendo + adicionales + servicios
- `monto_total_a_pagar`: subtotal + multa
- `monto_pagado`: Monto efectivamente pagado

**Servicios Básicos**:
- `servicios_basicos` (JSONB): Array de servicios con deudas
- `servicios_basicos_consultados`: Boolean
- `fecha_consulta_servicios`: Timestamp

**Cargos/Reembolsos**:
- `detalle_cargos_reembolsos` (JSONB): Array desde bitácora

**Multas**:
- `dias_atraso_efectivos`: Días de atraso (descontando gracia)

**Pago**:
- `metodo_pago`: Método usado
- `referencia_pago`: Referencia de ETPAY
- `etpay_signature_token`: Token único de ETPAY
- `payment_details` (JSONB): Detalles completos del pago

**Validación de Cuenta**:
- `primer_pago` (JSONB): Info del pago de $1 para validación

**Relaciones**:
- Pertenece a: `organizaciones`, `contratos`, `arrendatarios`, `propiedades`
- Tiene muchos: `payouts`

---

### `payouts`
**Propósito**: Transferencias a propietarios y administración.

**Campos clave**:
- `payout_id` (PK, UUID)
- `organizacion_id`, `voucher_id`, `propietario_id` (FKs)
- `tipo_pago`: 'PROPIETARIO' | 'ADMINISTRACION'
- `estado`: 'pending' | 'processing' | 'completed' | 'failed'

**ETPAY**:
- `etpay_id`: ID en ETPAY (idTEF)
- `etpay_reference`: Referencia generada por nosotros
- `etpay_response` (JSONB): Respuesta al crear
- `etpay_bank_response` (JSONB): Respuesta del banco

**Beneficiario**:
- `cuenta_bancaria_id` (FK)
- `beneficiario_rut`, `beneficiario_nombre`, `beneficiario_email`
- `beneficiario_banco_sbif`: Código SBIF (ej: 001)
- `beneficiario_banco_nombre`
- `beneficiario_cuenta`

**Montos**:
- `monto`: Cantidad a transferir
- `moneda`: 'CLP' típicamente

**Relaciones**:
- Pertenece a: `organizaciones`, `vouchers`, `propietarios`, `cuentas_bancarias`

---

## Tablas de Gestión

### `bitacora_propiedades`
**Propósito**: Registro histórico de eventos por propiedad.

**Campos clave**:
- `entrada_id` (PK, bigint)
- `organizacion_id`, `propiedad_id`, `autor_id` (FKs)
- `categoria`: 'MANTENIMIENTO' | 'INCIDENTE' | 'VISITA' | 'ADMINISTRATIVO' | 'COMUNICACION' | 'DOCUMENTO' | 'OTRO'
- `fecha_evento`: Cuándo ocurrió
- `titulo`, `descripcion`

**Cargos/Reembolsos**:
- `costo`: Monto del cargo/reembolso
- `tipo_transaccion`: 'CARGO' | 'REEMBOLSO'
- `procesado_en_voucher`: Boolean (si ya se incluyó en voucher)

**Relaciones**:
- Pertenece a: `organizaciones`, `propiedades`, `users` (autor)

---

### `cuentas_bancarias`
**Propósito**: Cuentas para recibir pagos (propietarios y administración).

**Campos clave**:
- `cuenta_id` (PK, UUID)
- `organizacion_id`, `propietario_id` (FKs, propietario opcional)
- `nombre_cuenta`: Alias
- `nombre_completo`: Titular
- `rut_cuenta`
- `numero_cuenta`
- `tipo_cuenta`: Corriente, Vista, etc.
- `banco`: Nombre del banco

**Relaciones**:
- Pertenece a: `organizaciones`
- Puede pertenecer a: `propietarios`
- Usada en: `contratos`, `payouts`

---

### `avales`
**Propósito**: Avales/garantes de contratos.

**Campos clave**:
- `aval_id` (PK, UUID)
- `contrato_id`, `organizacion_id` (FKs)
- `rut`, `nombre`, `apellido`, `correo`, `telefono`

**Relaciones**:
- Pertenece a: `contratos`, `organizaciones`

---

## Tablas de Servicios Básicos

### `servicios`
**Propósito**: Configuración de servicios básicos por propiedad.

**Campos clave**:
- `servicio_id` (PK, bigint)
- `propiedad_id` (FK)
- `tipo_servicio`: 'Agua', 'Luz', 'Gas', 'Gastos Comunes'
- `compania`: Nombre de la empresa
- `credenciales` (JSONB): Usuario/password/número cliente para scraping
- `activo`: Boolean
- `gestionar`: ¿Quién gestiona el servicio?
- `monto`: Monto fijo mensual (si aplica)

**Relaciones**:
- Pertenece a: `propiedades`
- Tiene muchos: `consultas_deuda`

---

### `empresas_servicio`
**Propósito**: Catálogo de empresas de servicios y sus URLs en Servipag.

**Campos clave**:
- `empresa_id` (PK, bigint)
- `nombre`: Ej: 'Aguas Andinas', 'Metrogas'
- `tipo_servicio`: 'Agua', 'Gas', 'Electricidad'
- `url_servipag`: URL completa del portal
- `campo_identificador`: Qué pide (RUT, Número Cliente, etc.)
- `activo`: Boolean

**Relaciones**:
- No tiene FKs, es catálogo

---

### `consultas_deuda`
**Propósito**: Historial de consultas al browser bot.

**Campos clave**:
- `consulta_id` (PK, UUID)
- `servicio_id`, `propiedad_id` (FKs)
- `monto_deuda`: Resultado de la consulta
- `fecha_consulta`: Timestamp
- `metadata` (JSONB): Info extra (fecha vencimiento, etc.)
- `error`: Mensaje de error si falló

**Relaciones**:
- Pertenece a: `servicios`, `propiedades`

---

## Tablas Auxiliares

### `invitaciones`
**Propósito**: Invitaciones pendientes para unirse a organizaciones.

**Campos clave**:
- `invitacion_id` (PK, UUID)
- `organizacion_id` (FK)
- `token`: Token único
- `expires_at`: Fecha de expiración
- `status`: 'pendiente' | 'aceptada' | 'rechazada'
- `rol`: Rol que tendrá al aceptar

---

### `propietario_invitaciones`
**Propósito**: Invitaciones para propietarios a crear cuenta.

**Campos clave**:
- `invitacion_id` (PK, UUID)
- `propietario_id`, `organizacion_id` (FKs)
- `token`: Token único
- `expires_at`, `status`

---

### `logs`
**Propósito**: Registro de errores y eventos del sistema.

**Campos clave**:
- `log_id` (PK, bigint)
- `fuente`: Módulo/función origen
- `importancia`: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL'
- `resumen`: Mensaje corto
- `detalles` (JSONB): Contexto completo

**Uso**:
- Todos los errores deben loguearse aquí
- Permite debugging proactivo
- No tiene FK a organizaciones (logs globales)

---

## Reglas de RLS (Row Level Security)

Todas las tablas (excepto `logs`, `empresas_servicio`) tienen RLS habilitado.

**Regla general**:
```sql
-- Los usuarios solo ven datos de sus organizaciones
CREATE POLICY "Users can only see own org data"
ON tabla_name
FOR ALL
USING (
  organizacion_id IN (
    SELECT organizacion_id
    FROM user_organizacion
    WHERE user_id = auth.uid()
  )
);
```

**IMPORTANTE**: Siempre filtrar por `organizacion_id` en queries del cliente.

---

## Índices Importantes

Las siguientes columnas tienen índices para optimizar queries:

- `organizacion_id` (en todas las tablas multi-tenant)
- `propiedad_id` (en bitácora, servicios, vouchers)
- `contrato_id` (en vouchers, avales)
- `estado` (en vouchers, contratos)
- `fecha_vencimiento` (en vouchers) - para cron de multas
- `periodo_cobro` (en vouchers) - para evitar duplicados

---

## Queries Comunes

### Obtener propiedades con contratos activos
```sql
SELECT
  p.*,
  c.* as contrato,
  prop.nombre as propietario_nombre,
  arr.nombre as arrendatario_nombre
FROM propiedades p
LEFT JOIN contratos c ON c.contrato_id = p.contrato_actual_id
LEFT JOIN propietarios prop ON prop.propietario_id = p.propietario_id
LEFT JOIN arrendatarios arr ON arr.arrendatario_id = c.arrendatario_id
WHERE p.organizacion_id = 'uuid'
```

### Obtener vouchers pendientes de pago
```sql
SELECT
  v.*,
  p.calle || ' ' || p.numero as direccion,
  a.nombre || ' ' || a.primer_apellido as arrendatario
FROM vouchers v
JOIN propiedades p ON p.propiedad_id = v.propiedad_id
JOIN arrendatarios a ON a.arrendatario_id = v.arrendatario_id
WHERE v.organizacion_id = 'uuid'
  AND v.estado IN ('GENERADO', 'ENVIADO')
  AND v.fecha_vencimiento > NOW()
ORDER BY v.fecha_vencimiento ASC
```

### Obtener bitácora con cargos pendientes
```sql
SELECT *
FROM bitacora_propiedades
WHERE organizacion_id = 'uuid'
  AND costo IS NOT NULL
  AND procesado_en_voucher = false
ORDER BY fecha_evento DESC
```

---

**Última actualización**: 2025-12-17
