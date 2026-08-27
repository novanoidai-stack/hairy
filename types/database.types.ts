export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      agenda_ojos_latido: {
        Row: {
          negocio_id: string
          ultimo_aviso: string
        }
        Insert: {
          negocio_id: string
          ultimo_aviso?: string
        }
        Update: {
          negocio_id?: string
          ultimo_aviso?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          accion: string
          created_at: string | null
          datos_anteriores: Json | null
          datos_nuevos: Json | null
          entidad: string
          entidad_id: string | null
          id: string
          negocio_id: string
          usuario_id: string | null
        }
        Insert: {
          accion: string
          created_at?: string | null
          datos_anteriores?: Json | null
          datos_nuevos?: Json | null
          entidad: string
          entidad_id?: string | null
          id?: string
          negocio_id: string
          usuario_id?: string | null
        }
        Update: {
          accion?: string
          created_at?: string | null
          datos_anteriores?: Json | null
          datos_nuevos?: Json | null
          entidad?: string
          entidad_id?: string | null
          id?: string
          negocio_id?: string
          usuario_id?: string | null
        }
        Relationships: []
      }
      auditoria_registros: {
        Row: {
          created_at: string
          detalles: Json | null
          id: string
          ip_origen: string | null
          modulo: string
          negocio_id: string
          tipo_evento: string
          usuario_id: string | null
          usuario_nombre: string | null
        }
        Insert: {
          created_at?: string
          detalles?: Json | null
          id?: string
          ip_origen?: string | null
          modulo: string
          negocio_id: string
          tipo_evento: string
          usuario_id?: string | null
          usuario_nombre?: string | null
        }
        Update: {
          created_at?: string
          detalles?: Json | null
          id?: string
          ip_origen?: string | null
          modulo?: string
          negocio_id?: string
          tipo_evento?: string
          usuario_id?: string | null
          usuario_nombre?: string | null
        }
        Relationships: []
      }
      avisos_prueba: {
        Row: {
          enviado_at: string
          etapa: number
          profile_id: string
        }
        Insert: {
          enviado_at?: string
          etapa: number
          profile_id: string
        }
        Update: {
          enviado_at?: string
          etapa?: number
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "avisos_prueba_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bloqueos: {
        Row: {
          created_at: string
          fecha_fin: string
          fecha_inicio: string
          id: string
          motivo: string | null
          profesional_id: string
        }
        Insert: {
          created_at?: string
          fecha_fin: string
          fecha_inicio: string
          id?: string
          motivo?: string | null
          profesional_id: string
        }
        Update: {
          created_at?: string
          fecha_fin?: string
          fecha_inicio?: string
          id?: string
          motivo?: string | null
          profesional_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bloqueos_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "profesionales"
            referencedColumns: ["id"]
          },
        ]
      }
      bloqueos_profesional: {
        Row: {
          created_at: string | null
          fin: string
          grupo_bloqueo_id: string | null
          id: string
          inicio: string
          motivo: string | null
          negocio_id: string
          profesional_id: string
          recurrencia: string | null
          recurrencia_padre_id: string | null
          tipo: string
        }
        Insert: {
          created_at?: string | null
          fin: string
          grupo_bloqueo_id?: string | null
          id?: string
          inicio: string
          motivo?: string | null
          negocio_id: string
          profesional_id: string
          recurrencia?: string | null
          recurrencia_padre_id?: string | null
          tipo?: string
        }
        Update: {
          created_at?: string | null
          fin?: string
          grupo_bloqueo_id?: string | null
          id?: string
          inicio?: string
          motivo?: string | null
          negocio_id?: string
          profesional_id?: string
          recurrencia?: string | null
          recurrencia_padre_id?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "bloqueos_profesional_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "profesionales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bloqueos_profesional_recurrencia_padre_id_fkey"
            columns: ["recurrencia_padre_id"]
            isOneToOne: false
            referencedRelation: "bloqueos_profesional"
            referencedColumns: ["id"]
          },
        ]
      }
      bonos: {
        Row: {
          cliente_id: string
          created_at: string
          estado: string
          fecha_caducidad: string | null
          id: string
          negocio_id: string
          precio_cents: number
          servicio_id: string
          sesiones_disponibles: number
          sesiones_totales: number
          updated_at: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          estado?: string
          fecha_caducidad?: string | null
          id?: string
          negocio_id: string
          precio_cents: number
          servicio_id: string
          sesiones_disponibles: number
          sesiones_totales: number
          updated_at?: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          estado?: string
          fecha_caducidad?: string | null
          id?: string
          negocio_id?: string
          precio_cents?: number
          servicio_id?: string
          sesiones_disponibles?: number
          sesiones_totales?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bonos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonos_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "servicios"
            referencedColumns: ["id"]
          },
        ]
      }
      campana_destinatarios: {
        Row: {
          campana_id: string
          cliente_id: string | null
          contacto: string
          created_at: string
          enviado_en: string | null
          estado: string
          id: string
          mensaje_final: string
          negocio_id: string
          nombre: string | null
        }
        Insert: {
          campana_id: string
          cliente_id?: string | null
          contacto: string
          created_at?: string
          enviado_en?: string | null
          estado?: string
          id?: string
          mensaje_final: string
          negocio_id: string
          nombre?: string | null
        }
        Update: {
          campana_id?: string
          cliente_id?: string | null
          contacto?: string
          created_at?: string
          enviado_en?: string | null
          estado?: string
          id?: string
          mensaje_final?: string
          negocio_id?: string
          nombre?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campana_destinatarios_campana_id_fkey"
            columns: ["campana_id"]
            isOneToOne: false
            referencedRelation: "campanas"
            referencedColumns: ["id"]
          },
        ]
      }
      campanas: {
        Row: {
          canal: string
          created_at: string
          created_by: string | null
          encolada_en: string | null
          estado: string
          id: string
          mensaje: string
          negocio_id: string
          nombre: string
          segmento: Json
          total_destinatarios: number
        }
        Insert: {
          canal?: string
          created_at?: string
          created_by?: string | null
          encolada_en?: string | null
          estado?: string
          id?: string
          mensaje: string
          negocio_id: string
          nombre: string
          segmento?: Json
          total_destinatarios?: number
        }
        Update: {
          canal?: string
          created_at?: string
          created_by?: string | null
          encolada_en?: string | null
          estado?: string
          id?: string
          mensaje?: string
          negocio_id?: string
          nombre?: string
          segmento?: Json
          total_destinatarios?: number
        }
        Relationships: []
      }
      captcha_tokens: {
        Row: {
          contexto: string
          created_at: string
          expires_at: string
          id: string
          used_at: string | null
        }
        Insert: {
          contexto?: string
          created_at?: string
          expires_at?: string
          id?: string
          used_at?: string | null
        }
        Update: {
          contexto?: string
          created_at?: string
          expires_at?: string
          id?: string
          used_at?: string | null
        }
        Relationships: []
      }
      categorias_servicio: {
        Row: {
          activo: boolean
          color: string
          created_at: string
          icono: string | null
          id: string
          negocio_id: string
          nombre: string
          orden: number
        }
        Insert: {
          activo?: boolean
          color: string
          created_at?: string
          icono?: string | null
          id?: string
          negocio_id: string
          nombre: string
          orden?: number
        }
        Update: {
          activo?: boolean
          color?: string
          created_at?: string
          icono?: string | null
          id?: string
          negocio_id?: string
          nombre?: string
          orden?: number
        }
        Relationships: []
      }
      chispa_acciones: {
        Row: {
          creada_en: string
          deshecha: boolean
          deshecha_en: string | null
          estado_previo: Json | null
          id: string
          negocio_id: string
          reversible: boolean
          target_id: string | null
          target_label: string | null
          tipo_accion: string
          usuario_id: string
        }
        Insert: {
          creada_en?: string
          deshecha?: boolean
          deshecha_en?: string | null
          estado_previo?: Json | null
          id?: string
          negocio_id: string
          reversible?: boolean
          target_id?: string | null
          target_label?: string | null
          tipo_accion: string
          usuario_id: string
        }
        Update: {
          creada_en?: string
          deshecha?: boolean
          deshecha_en?: string | null
          estado_previo?: Json | null
          id?: string
          negocio_id?: string
          reversible?: boolean
          target_id?: string | null
          target_label?: string | null
          tipo_accion?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chispa_acciones_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chispa_auditoria: {
        Row: {
          contexto: Json | null
          coste_usd: number
          created_at: string
          error_mensaje: string | null
          exito: boolean
          funcion_ia: string
          id: string
          latencia_ms: number | null
          modelo: string
          negocio_id: string
          proveedor: string
          superficie: string | null
          tokens_input: number
          tokens_output: number
          tokens_total: number
          usuario_id: string
        }
        Insert: {
          contexto?: Json | null
          coste_usd?: number
          created_at?: string
          error_mensaje?: string | null
          exito?: boolean
          funcion_ia: string
          id?: string
          latencia_ms?: number | null
          modelo: string
          negocio_id: string
          proveedor?: string
          superficie?: string | null
          tokens_input?: number
          tokens_output?: number
          tokens_total?: number
          usuario_id: string
        }
        Update: {
          contexto?: Json | null
          coste_usd?: number
          created_at?: string
          error_mensaje?: string | null
          exito?: boolean
          funcion_ia?: string
          id?: string
          latencia_ms?: number | null
          modelo?: string
          negocio_id?: string
          proveedor?: string
          superficie?: string | null
          tokens_input?: number
          tokens_output?: number
          tokens_total?: number
          usuario_id?: string
        }
        Relationships: []
      }
      chispa_memoria: {
        Row: {
          actualizado_en: string | null
          clave: string
          confianza: number | null
          created_at: string | null
          id: string
          negocio_id: string
          origen: string | null
          tipo: string
          usuario_id: string
          valor: Json
        }
        Insert: {
          actualizado_en?: string | null
          clave: string
          confianza?: number | null
          created_at?: string | null
          id?: string
          negocio_id: string
          origen?: string | null
          tipo: string
          usuario_id?: string
          valor: Json
        }
        Update: {
          actualizado_en?: string | null
          clave?: string
          confianza?: number | null
          created_at?: string | null
          id?: string
          negocio_id?: string
          origen?: string | null
          tipo?: string
          usuario_id?: string
          valor?: Json
        }
        Relationships: []
      }
      cierres_negocio: {
        Row: {
          created_at: string
          created_by: string | null
          fecha: string
          id: string
          motivo: string | null
          negocio_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          fecha: string
          id?: string
          motivo?: string | null
          negocio_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          fecha?: string
          id?: string
          motivo?: string | null
          negocio_id?: string
        }
        Relationships: []
      }
      cita_addons: {
        Row: {
          addon_id: string
          cita_id: string
          created_at: string
          id: string
        }
        Insert: {
          addon_id: string
          cita_id: string
          created_at?: string
          id?: string
        }
        Update: {
          addon_id?: string
          cita_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cita_addons_addon_id_fkey"
            columns: ["addon_id"]
            isOneToOne: false
            referencedRelation: "service_addons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cita_addons_cita_id_fkey"
            columns: ["cita_id"]
            isOneToOne: false
            referencedRelation: "citas"
            referencedColumns: ["id"]
          },
        ]
      }
      cita_consumos: {
        Row: {
          cantidad: number
          cita_id: string
          coste_micros: number
          creado_por: string | null
          created_at: string
          id: string
          negocio_id: string
          producto_id: string
        }
        Insert: {
          cantidad: number
          cita_id: string
          coste_micros?: number
          creado_por?: string | null
          created_at?: string
          id?: string
          negocio_id: string
          producto_id: string
        }
        Update: {
          cantidad?: number
          cita_id?: string
          coste_micros?: number
          creado_por?: string | null
          created_at?: string
          id?: string
          negocio_id?: string
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cita_consumos_cita_id_fkey"
            columns: ["cita_id"]
            isOneToOne: false
            referencedRelation: "citas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cita_consumos_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cita_consumos_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos_con_stock"
            referencedColumns: ["id"]
          },
        ]
      }
      cita_pago_enlaces: {
        Row: {
          cita_id: string
          created_at: string
          expira_at: string
          negocio_id: string
          tipo: string
          token: string
        }
        Insert: {
          cita_id: string
          created_at?: string
          expira_at?: string
          negocio_id: string
          tipo?: string
          token: string
        }
        Update: {
          cita_id?: string
          created_at?: string
          expira_at?: string
          negocio_id?: string
          tipo?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "cita_pago_enlaces_cita_id_fkey"
            columns: ["cita_id"]
            isOneToOne: false
            referencedRelation: "citas"
            referencedColumns: ["id"]
          },
        ]
      }
      cita_productos: {
        Row: {
          cantidad: number
          cita_id: string
          cobro_linea_id: string | null
          created_at: string
          id: string
          negocio_id: string
          nombre: string
          precio_cents: number
          producto_id: string
        }
        Insert: {
          cantidad?: number
          cita_id: string
          cobro_linea_id?: string | null
          created_at?: string
          id?: string
          negocio_id: string
          nombre: string
          precio_cents?: number
          producto_id: string
        }
        Update: {
          cantidad?: number
          cita_id?: string
          cobro_linea_id?: string | null
          created_at?: string
          id?: string
          negocio_id?: string
          nombre?: string
          precio_cents?: number
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cita_productos_cita_id_fkey"
            columns: ["cita_id"]
            isOneToOne: false
            referencedRelation: "citas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cita_productos_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cita_productos_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos_con_stock"
            referencedColumns: ["id"]
          },
        ]
      }
      citas: {
        Row: {
          canal: string
          cancelado_por: string | null
          cliente_id: string | null
          cobrada: boolean | null
          cobro_id: string | null
          confirmacion_enviada: boolean
          confirmada_at: string | null
          confirmada_cliente: boolean
          confirmado_por_cliente: boolean
          consentimiento_at: string | null
          consentimiento_datos: boolean | null
          creado_por: string | null
          created_at: string
          deposito_importe: number | null
          deposito_pagado: boolean
          deposito_requerido: boolean
          es_oferta_espera: boolean
          estado: string
          fin: string
          fin_activa: string | null
          fin_espera: string | null
          formula_notas: string | null
          formula_producto: string | null
          formula_resultado: string | null
          formula_tiempo_min: number | null
          formula_tono: string | null
          grupo_id: string | null
          id: string
          importe_final: number | null
          inicio: string
          lista_espera_revisada: boolean
          metodo_pago: string | null
          modificado_at: string | null
          modificado_por: string | null
          motivo_cancelacion: string | null
          negocio_id: string
          notas: string | null
          oculta_en_calendario: boolean
          orden_en_grupo: number | null
          presupuesto_id: string | null
          profesional_id: string | null
          recordatorio_enviado: boolean
          resena_enviada: boolean | null
          retraso_aviso_pendiente: boolean
          senal_enviada: boolean
          serie_id: string | null
          servicio_id: string | null
          updated_at: string
          variante_id: string | null
        }
        Insert: {
          canal?: string
          cancelado_por?: string | null
          cliente_id?: string | null
          cobrada?: boolean | null
          cobro_id?: string | null
          confirmacion_enviada?: boolean
          confirmada_at?: string | null
          confirmada_cliente?: boolean
          confirmado_por_cliente?: boolean
          consentimiento_at?: string | null
          consentimiento_datos?: boolean | null
          creado_por?: string | null
          created_at?: string
          deposito_importe?: number | null
          deposito_pagado?: boolean
          deposito_requerido?: boolean
          es_oferta_espera?: boolean
          estado?: string
          fin: string
          fin_activa?: string | null
          fin_espera?: string | null
          formula_notas?: string | null
          formula_producto?: string | null
          formula_resultado?: string | null
          formula_tiempo_min?: number | null
          formula_tono?: string | null
          grupo_id?: string | null
          id?: string
          importe_final?: number | null
          inicio: string
          lista_espera_revisada?: boolean
          metodo_pago?: string | null
          modificado_at?: string | null
          modificado_por?: string | null
          motivo_cancelacion?: string | null
          negocio_id: string
          notas?: string | null
          oculta_en_calendario?: boolean
          orden_en_grupo?: number | null
          presupuesto_id?: string | null
          profesional_id?: string | null
          recordatorio_enviado?: boolean
          resena_enviada?: boolean | null
          retraso_aviso_pendiente?: boolean
          senal_enviada?: boolean
          serie_id?: string | null
          servicio_id?: string | null
          updated_at?: string
          variante_id?: string | null
        }
        Update: {
          canal?: string
          cancelado_por?: string | null
          cliente_id?: string | null
          cobrada?: boolean | null
          cobro_id?: string | null
          confirmacion_enviada?: boolean
          confirmada_at?: string | null
          confirmada_cliente?: boolean
          confirmado_por_cliente?: boolean
          consentimiento_at?: string | null
          consentimiento_datos?: boolean | null
          creado_por?: string | null
          created_at?: string
          deposito_importe?: number | null
          deposito_pagado?: boolean
          deposito_requerido?: boolean
          es_oferta_espera?: boolean
          estado?: string
          fin?: string
          fin_activa?: string | null
          fin_espera?: string | null
          formula_notas?: string | null
          formula_producto?: string | null
          formula_resultado?: string | null
          formula_tiempo_min?: number | null
          formula_tono?: string | null
          grupo_id?: string | null
          id?: string
          importe_final?: number | null
          inicio?: string
          lista_espera_revisada?: boolean
          metodo_pago?: string | null
          modificado_at?: string | null
          modificado_por?: string | null
          motivo_cancelacion?: string | null
          negocio_id?: string
          notas?: string | null
          oculta_en_calendario?: boolean
          orden_en_grupo?: number | null
          presupuesto_id?: string | null
          profesional_id?: string | null
          recordatorio_enviado?: boolean
          resena_enviada?: boolean | null
          retraso_aviso_pendiente?: boolean
          senal_enviada?: boolean
          serie_id?: string | null
          servicio_id?: string | null
          updated_at?: string
          variante_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "citas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_cobro_id_fkey"
            columns: ["cobro_id"]
            isOneToOne: false
            referencedRelation: "cobros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_presupuesto_id_fkey"
            columns: ["presupuesto_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "profesionales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "servicios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_variante_id_fkey"
            columns: ["variante_id"]
            isOneToOne: false
            referencedRelation: "service_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      citas_historial: {
        Row: {
          campo: string
          cita_id: string
          created_at: string
          id: string
          motivo: string | null
          negocio_id: string
          valor_anterior: string | null
          valor_nuevo: string | null
        }
        Insert: {
          campo: string
          cita_id: string
          created_at?: string
          id?: string
          motivo?: string | null
          negocio_id: string
          valor_anterior?: string | null
          valor_nuevo?: string | null
        }
        Update: {
          campo?: string
          cita_id?: string
          created_at?: string
          id?: string
          motivo?: string | null
          negocio_id?: string
          valor_anterior?: string | null
          valor_nuevo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "citas_historial_cita_id_fkey"
            columns: ["cita_id"]
            isOneToOne: false
            referencedRelation: "citas"
            referencedColumns: ["id"]
          },
        ]
      }
      citas_propuestas_cambio: {
        Row: {
          bloqueo_id: string | null
          cita_id: string
          creada_por: string | null
          created_at: string
          estado: string
          expira_at: string
          id: string
          inicio_actual: string
          inicio_propuesto: string
          negocio_id: string
          profesional_id: string | null
          respondida_at: string | null
        }
        Insert: {
          bloqueo_id?: string | null
          cita_id: string
          creada_por?: string | null
          created_at?: string
          estado?: string
          expira_at: string
          id?: string
          inicio_actual: string
          inicio_propuesto: string
          negocio_id: string
          profesional_id?: string | null
          respondida_at?: string | null
        }
        Update: {
          bloqueo_id?: string | null
          cita_id?: string
          creada_por?: string | null
          created_at?: string
          estado?: string
          expira_at?: string
          id?: string
          inicio_actual?: string
          inicio_propuesto?: string
          negocio_id?: string
          profesional_id?: string | null
          respondida_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "citas_propuestas_cambio_cita_id_fkey"
            columns: ["cita_id"]
            isOneToOne: false
            referencedRelation: "citas"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_fotos: {
        Row: {
          cliente_id: string
          created_at: string
          created_by: string | null
          id: string
          negocio_id: string
          nota: string | null
          servicio_id: string | null
          storage_path: string
          url: string | null
        }
        Insert: {
          cliente_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          negocio_id: string
          nota?: string | null
          servicio_id?: string | null
          storage_path: string
          url?: string | null
        }
        Update: {
          cliente_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          negocio_id?: string
          nota?: string | null
          servicio_id?: string | null
          storage_path?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cliente_fotos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          alergias: string | null
          bebida_preferida: string | null
          bloqueado: boolean
          bloqueo_motivo: string | null
          canal_preferido: string | null
          consiente_ia: boolean
          consiente_ia_fecha: string | null
          consiente_ia_origen: string | null
          created_at: string
          deposito_perfil_override: string | null
          email: string | null
          etiquetas: string[]
          fecha_nacimiento: string | null
          frecuencia_dias: number | null
          id: string
          idioma: string | null
          negocio_id: string
          nivel_fidelizacion_override: string | null
          nombre: string
          noshows_count: number | null
          notas: string | null
          perfil_riesgo: string | null
          primera_visita: string | null
          profesional_habitual_id: string | null
          sensibilidades_cuero: string | null
          telefono: string | null
          ticket_medio: number | null
          total_visitas: number
          ultima_visita: string | null
          updated_at: string
        }
        Insert: {
          alergias?: string | null
          bebida_preferida?: string | null
          bloqueado?: boolean
          bloqueo_motivo?: string | null
          canal_preferido?: string | null
          consiente_ia?: boolean
          consiente_ia_fecha?: string | null
          consiente_ia_origen?: string | null
          created_at?: string
          deposito_perfil_override?: string | null
          email?: string | null
          etiquetas?: string[]
          fecha_nacimiento?: string | null
          frecuencia_dias?: number | null
          id?: string
          idioma?: string | null
          negocio_id: string
          nivel_fidelizacion_override?: string | null
          nombre: string
          noshows_count?: number | null
          notas?: string | null
          perfil_riesgo?: string | null
          primera_visita?: string | null
          profesional_habitual_id?: string | null
          sensibilidades_cuero?: string | null
          telefono?: string | null
          ticket_medio?: number | null
          total_visitas?: number
          ultima_visita?: string | null
          updated_at?: string
        }
        Update: {
          alergias?: string | null
          bebida_preferida?: string | null
          bloqueado?: boolean
          bloqueo_motivo?: string | null
          canal_preferido?: string | null
          consiente_ia?: boolean
          consiente_ia_fecha?: string | null
          consiente_ia_origen?: string | null
          created_at?: string
          deposito_perfil_override?: string | null
          email?: string | null
          etiquetas?: string[]
          fecha_nacimiento?: string | null
          frecuencia_dias?: number | null
          id?: string
          idioma?: string | null
          negocio_id?: string
          nivel_fidelizacion_override?: string | null
          nombre?: string
          noshows_count?: number | null
          notas?: string | null
          perfil_riesgo?: string | null
          primera_visita?: string | null
          profesional_habitual_id?: string | null
          sensibilidades_cuero?: string | null
          telefono?: string | null
          ticket_medio?: number | null
          total_visitas?: number
          ultima_visita?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clientes_nivel_fidelizacion_override_fkey"
            columns: ["nivel_fidelizacion_override"]
            isOneToOne: false
            referencedRelation: "niveles_fidelizacion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_profesional_habitual_id_fkey"
            columns: ["profesional_habitual_id"]
            isOneToOne: false
            referencedRelation: "profesionales"
            referencedColumns: ["id"]
          },
        ]
      }
      cobro_lineas: {
        Row: {
          cantidad: number
          cobro_id: string
          id: string
          nombre: string
          precio_cents: number
          ref_id: string | null
          tipo: string
        }
        Insert: {
          cantidad?: number
          cobro_id: string
          id?: string
          nombre: string
          precio_cents: number
          ref_id?: string | null
          tipo: string
        }
        Update: {
          cantidad?: number
          cobro_id?: string
          id?: string
          nombre?: string
          precio_cents?: number
          ref_id?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobro_lineas_cobro_id_fkey"
            columns: ["cobro_id"]
            isOneToOne: false
            referencedRelation: "cobros"
            referencedColumns: ["id"]
          },
        ]
      }
      cobros: {
        Row: {
          cita_id: string | null
          cliente_id: string | null
          cobrado_at: string
          created_at: string
          datafono_cents: number
          descuento_cents: number
          efectivo_cents: number
          estado: string
          grupo_id: string | null
          id: string
          idempotency_key: string | null
          metodo: string
          negocio_id: string
          nota: string | null
          online_cents: number
          origen: string
          profesional_id: string | null
          propina_cents: number
          sesion_caja_id: string | null
          total_cents: number
        }
        Insert: {
          cita_id?: string | null
          cliente_id?: string | null
          cobrado_at?: string
          created_at?: string
          datafono_cents?: number
          descuento_cents?: number
          efectivo_cents?: number
          estado?: string
          grupo_id?: string | null
          id?: string
          idempotency_key?: string | null
          metodo: string
          negocio_id: string
          nota?: string | null
          online_cents?: number
          origen?: string
          profesional_id?: string | null
          propina_cents?: number
          sesion_caja_id?: string | null
          total_cents: number
        }
        Update: {
          cita_id?: string | null
          cliente_id?: string | null
          cobrado_at?: string
          created_at?: string
          datafono_cents?: number
          descuento_cents?: number
          efectivo_cents?: number
          estado?: string
          grupo_id?: string | null
          id?: string
          idempotency_key?: string | null
          metodo?: string
          negocio_id?: string
          nota?: string | null
          online_cents?: number
          origen?: string
          profesional_id?: string | null
          propina_cents?: number
          sesion_caja_id?: string | null
          total_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "cobros_cita_id_fkey"
            columns: ["cita_id"]
            isOneToOne: false
            referencedRelation: "citas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobros_sesion_caja_id_fkey"
            columns: ["sesion_caja_id"]
            isOneToOne: false
            referencedRelation: "sesiones_caja"
            referencedColumns: ["id"]
          },
        ]
      }
      comisiones: {
        Row: {
          base_calculo_cents: number
          comision_base: string
          created_at: string
          detalles: Json | null
          estado: string
          id: string
          importe_comision_cents: number
          incluir_addons: boolean
          incluir_propinas: boolean
          negocio_id: string
          pagada_en: string | null
          periodo_fin: string
          periodo_inicio: string
          porcentaje_aplicado: number
          profesional_id: string
        }
        Insert: {
          base_calculo_cents?: number
          comision_base: string
          created_at?: string
          detalles?: Json | null
          estado?: string
          id?: string
          importe_comision_cents: number
          incluir_addons?: boolean
          incluir_propinas?: boolean
          negocio_id: string
          pagada_en?: string | null
          periodo_fin: string
          periodo_inicio: string
          porcentaje_aplicado: number
          profesional_id: string
        }
        Update: {
          base_calculo_cents?: number
          comision_base?: string
          created_at?: string
          detalles?: Json | null
          estado?: string
          id?: string
          importe_comision_cents?: number
          incluir_addons?: boolean
          incluir_propinas?: boolean
          negocio_id?: string
          pagada_en?: string | null
          periodo_fin?: string
          periodo_inicio?: string
          porcentaje_aplicado?: number
          profesional_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comisiones_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comisiones_por_categoria: {
        Row: {
          activo: boolean
          categoria_id: string
          created_at: string
          id: string
          negocio_id: string
          porcentaje: number
        }
        Insert: {
          activo?: boolean
          categoria_id: string
          created_at?: string
          id?: string
          negocio_id: string
          porcentaje: number
        }
        Update: {
          activo?: boolean
          categoria_id?: string
          created_at?: string
          id?: string
          negocio_id?: string
          porcentaje?: number
        }
        Relationships: []
      }
      comisiones_tramos: {
        Row: {
          activo: boolean
          created_at: string
          id: string
          negocio_id: string
          nivel: number
          porcentaje: number
          umbral_max_cents: number | null
          umbral_min_cents: number
        }
        Insert: {
          activo?: boolean
          created_at?: string
          id?: string
          negocio_id: string
          nivel: number
          porcentaje: number
          umbral_max_cents?: number | null
          umbral_min_cents?: number
        }
        Update: {
          activo?: boolean
          created_at?: string
          id?: string
          negocio_id?: string
          nivel?: number
          porcentaje?: number
          umbral_max_cents?: number | null
          umbral_min_cents?: number
        }
        Relationships: []
      }
      config_fiscal: {
        Row: {
          activo: boolean
          aplica_verifactu: boolean
          apoderamiento_ok: boolean
          created_at: string
          declaracion_responsable_ok: boolean
          domicilio_fiscal: string | null
          entorno_aeat: string
          modalidad: string
          negocio_id: string
          nif: string | null
          num_serie_formato: string
          proveedor_estado: string
          proveedor_fiscal: string | null
          razon_social: string | null
          regimen_iva: string
          representacion_doc_url: string | null
          representacion_ok: boolean
          serie_defecto: string
          territorio: string
          tipo_iva_defecto: number
          updated_at: string
        }
        Insert: {
          activo?: boolean
          aplica_verifactu?: boolean
          apoderamiento_ok?: boolean
          created_at?: string
          declaracion_responsable_ok?: boolean
          domicilio_fiscal?: string | null
          entorno_aeat?: string
          modalidad?: string
          negocio_id: string
          nif?: string | null
          num_serie_formato?: string
          proveedor_estado?: string
          proveedor_fiscal?: string | null
          razon_social?: string | null
          regimen_iva?: string
          representacion_doc_url?: string | null
          representacion_ok?: boolean
          serie_defecto?: string
          territorio?: string
          tipo_iva_defecto?: number
          updated_at?: string
        }
        Update: {
          activo?: boolean
          aplica_verifactu?: boolean
          apoderamiento_ok?: boolean
          created_at?: string
          declaracion_responsable_ok?: boolean
          domicilio_fiscal?: string | null
          entorno_aeat?: string
          modalidad?: string
          negocio_id?: string
          nif?: string | null
          num_serie_formato?: string
          proveedor_estado?: string
          proveedor_fiscal?: string | null
          razon_social?: string | null
          regimen_iva?: string
          representacion_doc_url?: string | null
          representacion_ok?: boolean
          serie_defecto?: string
          territorio?: string
          tipo_iva_defecto?: number
          updated_at?: string
        }
        Relationships: []
      }
      consentimientos_cliente: {
        Row: {
          aceptado: boolean
          cliente_id: string
          created_at: string | null
          fecha: string
          id: string
          metodo_obtencion: string | null
          negocio_id: string
          revocado: boolean | null
          revocado_at: string | null
          revocado_motivo: string | null
          tipo: string
          version_texto: string | null
        }
        Insert: {
          aceptado?: boolean
          cliente_id: string
          created_at?: string | null
          fecha?: string
          id?: string
          metodo_obtencion?: string | null
          negocio_id: string
          revocado?: boolean | null
          revocado_at?: string | null
          revocado_motivo?: string | null
          tipo: string
          version_texto?: string | null
        }
        Update: {
          aceptado?: boolean
          cliente_id?: string
          created_at?: string | null
          fecha?: string
          id?: string
          metodo_obtencion?: string | null
          negocio_id?: string
          revocado?: boolean | null
          revocado_at?: string | null
          revocado_motivo?: string | null
          tipo?: string
          version_texto?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consentimientos_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      conversaciones: {
        Row: {
          cliente_id: string | null
          contacto_email: string | null
          contacto_nombre: string | null
          contacto_telefono: string | null
          created_at: string
          estado: string
          id: string
          ip_origen: string | null
          leido_at: string | null
          negocio_id: string
          origen: string
          presupuesto_id: string | null
          ultimo_mensaje_at: string
        }
        Insert: {
          cliente_id?: string | null
          contacto_email?: string | null
          contacto_nombre?: string | null
          contacto_telefono?: string | null
          created_at?: string
          estado?: string
          id?: string
          ip_origen?: string | null
          leido_at?: string | null
          negocio_id: string
          origen: string
          presupuesto_id?: string | null
          ultimo_mensaje_at?: string
        }
        Update: {
          cliente_id?: string | null
          contacto_email?: string | null
          contacto_nombre?: string | null
          contacto_telefono?: string | null
          created_at?: string
          estado?: string
          id?: string
          ip_origen?: string | null
          leido_at?: string | null
          negocio_id?: string
          origen?: string
          presupuesto_id?: string | null
          ultimo_mensaje_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversaciones_presupuesto_id_fkey"
            columns: ["presupuesto_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
        ]
      }
      conversaciones_ia: {
        Row: {
          canal: string
          cita_id: string | null
          cliente_id: string | null
          created_at: string
          id: string
          negocio_id: string
          resumen: string | null
          telefono: string | null
          transcripcion: Json | null
          updated_at: string
        }
        Insert: {
          canal: string
          cita_id?: string | null
          cliente_id?: string | null
          created_at?: string
          id?: string
          negocio_id: string
          resumen?: string | null
          telefono?: string | null
          transcripcion?: Json | null
          updated_at?: string
        }
        Update: {
          canal?: string
          cita_id?: string | null
          cliente_id?: string | null
          created_at?: string
          id?: string
          negocio_id?: string
          resumen?: string | null
          telefono?: string | null
          transcripcion?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversaciones_ia_cita_id_fkey"
            columns: ["cita_id"]
            isOneToOne: false
            referencedRelation: "citas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversaciones_ia_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      cumpleanos_avisos: {
        Row: {
          anio: number
          cliente_id: string
          created_at: string
          descuento_pct: number
          estado: string
          id: string
          idioma: string | null
          negocio_id: string
          nombre: string | null
          sent_at: string | null
          telefono: string | null
          template: string
        }
        Insert: {
          anio: number
          cliente_id: string
          created_at?: string
          descuento_pct?: number
          estado?: string
          id?: string
          idioma?: string | null
          negocio_id: string
          nombre?: string | null
          sent_at?: string | null
          telefono?: string | null
          template?: string
        }
        Update: {
          anio?: number
          cliente_id?: string
          created_at?: string
          descuento_pct?: number
          estado?: string
          id?: string
          idioma?: string | null
          negocio_id?: string
          nombre?: string | null
          sent_at?: string | null
          telefono?: string | null
          template?: string
        }
        Relationships: []
      }
      dudas_demo: {
        Row: {
          created_at: string
          duda: string
          email: string | null
          email_error: string | null
          emailed: boolean
          id: string
          ip: string | null
          modo: string
          respuesta: string | null
          telefono: string | null
          tipo_contacto: string | null
        }
        Insert: {
          created_at?: string
          duda: string
          email?: string | null
          email_error?: string | null
          emailed?: boolean
          id?: string
          ip?: string | null
          modo?: string
          respuesta?: string | null
          telefono?: string | null
          tipo_contacto?: string | null
        }
        Update: {
          created_at?: string
          duda?: string
          email?: string | null
          email_error?: string | null
          emailed?: boolean
          id?: string
          ip?: string | null
          modo?: string
          respuesta?: string | null
          telefono?: string | null
          tipo_contacto?: string | null
        }
        Relationships: []
      }
      duraciones_profesional: {
        Row: {
          created_at: string | null
          duracion_activa_extra_min: number
          duracion_activa_min: number
          duracion_espera_min: number
          id: string
          profesional_id: string
          servicio_id: string
        }
        Insert: {
          created_at?: string | null
          duracion_activa_extra_min?: number
          duracion_activa_min: number
          duracion_espera_min?: number
          id?: string
          profesional_id: string
          servicio_id: string
        }
        Update: {
          created_at?: string | null
          duracion_activa_extra_min?: number
          duracion_activa_min?: number
          duracion_espera_min?: number
          id?: string
          profesional_id?: string
          servicio_id?: string
        }
        Relationships: []
      }
      errores_cliente: {
        Row: {
          creado_en: string
          estado: string
          huella: string | null
          id: number
          mensaje: string
          navegador: string | null
          negocio_id: string | null
          notas_staff: string | null
          origen: string
          pila: string | null
          resuelto_en: string | null
          resuelto_por: string | null
          ruta: string | null
          tipo: string
          user_id: string | null
        }
        Insert: {
          creado_en?: string
          estado?: string
          huella?: string | null
          id?: never
          mensaje: string
          navegador?: string | null
          negocio_id?: string | null
          notas_staff?: string | null
          origen?: string
          pila?: string | null
          resuelto_en?: string | null
          resuelto_por?: string | null
          ruta?: string | null
          tipo?: string
          user_id?: string | null
        }
        Update: {
          creado_en?: string
          estado?: string
          huella?: string | null
          id?: never
          mensaje?: string
          navegador?: string | null
          negocio_id?: string | null
          notas_staff?: string | null
          origen?: string
          pila?: string | null
          resuelto_en?: string | null
          resuelto_por?: string | null
          ruta?: string | null
          tipo?: string
          user_id?: string | null
        }
        Relationships: []
      }
      eventos_negocio: {
        Row: {
          actor: string
          creado_en: string | null
          datos: Json | null
          entidad: string | null
          entidad_id: string | null
          id: string
          motivo: string | null
          negocio_id: string
          resultado: string | null
          resumen: string
          tipo: string
        }
        Insert: {
          actor: string
          creado_en?: string | null
          datos?: Json | null
          entidad?: string | null
          entidad_id?: string | null
          id?: string
          motivo?: string | null
          negocio_id: string
          resultado?: string | null
          resumen: string
          tipo: string
        }
        Update: {
          actor?: string
          creado_en?: string | null
          datos?: Json | null
          entidad?: string | null
          entidad_id?: string | null
          id?: string
          motivo?: string | null
          negocio_id?: string
          resultado?: string | null
          resumen?: string
          tipo?: string
        }
        Relationships: []
      }
      facturas: {
        Row: {
          aeat_csv: string | null
          aeat_error_codigo: string | null
          aeat_error_desc: string | null
          aeat_estado: string | null
          base_imponible_cents: number
          cobro_id: string | null
          created_at: string
          cuota_iva_cents: number
          ejercicio: number
          entorno: string | null
          estado: string
          factura_anulada_id: string | null
          factura_rectificada_id: string | null
          fecha_expedicion: string
          fechahora_gen: string | null
          huella: string | null
          huella_anterior: string | null
          id: string
          id_emisor: string
          negocio_id: string
          nif_receptor: string | null
          nombre_receptor: string | null
          num_serie_completo: string | null
          numero: number | null
          operacion: string
          payload_xml: string | null
          qr_url: string | null
          respuesta: Json | null
          serie: string
          tipo: string
          tipo_iva: number
          total_cents: number
        }
        Insert: {
          aeat_csv?: string | null
          aeat_error_codigo?: string | null
          aeat_error_desc?: string | null
          aeat_estado?: string | null
          base_imponible_cents: number
          cobro_id?: string | null
          created_at?: string
          cuota_iva_cents: number
          ejercicio: number
          entorno?: string | null
          estado?: string
          factura_anulada_id?: string | null
          factura_rectificada_id?: string | null
          fecha_expedicion?: string
          fechahora_gen?: string | null
          huella?: string | null
          huella_anterior?: string | null
          id?: string
          id_emisor: string
          negocio_id: string
          nif_receptor?: string | null
          nombre_receptor?: string | null
          num_serie_completo?: string | null
          numero?: number | null
          operacion?: string
          payload_xml?: string | null
          qr_url?: string | null
          respuesta?: Json | null
          serie: string
          tipo?: string
          tipo_iva?: number
          total_cents: number
        }
        Update: {
          aeat_csv?: string | null
          aeat_error_codigo?: string | null
          aeat_error_desc?: string | null
          aeat_estado?: string | null
          base_imponible_cents?: number
          cobro_id?: string | null
          created_at?: string
          cuota_iva_cents?: number
          ejercicio?: number
          entorno?: string | null
          estado?: string
          factura_anulada_id?: string | null
          factura_rectificada_id?: string | null
          fecha_expedicion?: string
          fechahora_gen?: string | null
          huella?: string | null
          huella_anterior?: string | null
          id?: string
          id_emisor?: string
          negocio_id?: string
          nif_receptor?: string | null
          nombre_receptor?: string | null
          num_serie_completo?: string | null
          numero?: number | null
          operacion?: string
          payload_xml?: string | null
          qr_url?: string | null
          respuesta?: Json | null
          serie?: string
          tipo?: string
          tipo_iva?: number
          total_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "facturas_cobro_id_fkey"
            columns: ["cobro_id"]
            isOneToOne: false
            referencedRelation: "cobros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_factura_anulada_id_fkey"
            columns: ["factura_anulada_id"]
            isOneToOne: false
            referencedRelation: "facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_factura_rectificada_id_fkey"
            columns: ["factura_rectificada_id"]
            isOneToOne: false
            referencedRelation: "facturas"
            referencedColumns: ["id"]
          },
        ]
      }
      fichajes: {
        Row: {
          anulado_at: string | null
          anulado_por: string | null
          correccion_id: string | null
          corrige_a: string | null
          created_at: string
          dispositivo: string | null
          estado: string
          hash: string | null
          hash_anterior: string | null
          id: string
          ip: string | null
          marcado_at: string
          modalidad: string
          negocio_id: string
          nota: string | null
          origen: string
          profesional_id: string | null
          secuencia: number | null
          tipo: string
          user_id: string | null
        }
        Insert: {
          anulado_at?: string | null
          anulado_por?: string | null
          correccion_id?: string | null
          corrige_a?: string | null
          created_at?: string
          dispositivo?: string | null
          estado?: string
          hash?: string | null
          hash_anterior?: string | null
          id?: string
          ip?: string | null
          marcado_at?: string
          modalidad?: string
          negocio_id: string
          nota?: string | null
          origen?: string
          profesional_id?: string | null
          secuencia?: number | null
          tipo: string
          user_id?: string | null
        }
        Update: {
          anulado_at?: string | null
          anulado_por?: string | null
          correccion_id?: string | null
          corrige_a?: string | null
          created_at?: string
          dispositivo?: string | null
          estado?: string
          hash?: string | null
          hash_anterior?: string | null
          id?: string
          ip?: string | null
          marcado_at?: string
          modalidad?: string
          negocio_id?: string
          nota?: string | null
          origen?: string
          profesional_id?: string | null
          secuencia?: number | null
          tipo?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fichajes_corrige_a_fkey"
            columns: ["corrige_a"]
            isOneToOne: false
            referencedRelation: "fichajes"
            referencedColumns: ["id"]
          },
        ]
      }
      fichas_tecnicas_color: {
        Row: {
          base_natural: string | null
          cerrada: boolean | null
          cita_id: string | null
          cliente_id: string
          color_previo: string | null
          created_at: string | null
          formula: Json | null
          id: string
          incidencias: string | null
          incidencias_tags: string[] | null
          marca_producto: string | null
          negocio_id: string
          nivel_dano: number | null
          oxidante_proporcion: string | null
          oxidante_volumen: number | null
          porcentaje_canas: number | null
          profesional_id: string | null
          resultado_color: string | null
          resultado_notas: string | null
          resultado_satisfactorio: boolean | null
          tecnica_aplicacion: string[] | null
          tiempo_exposicion_min: number | null
          tipo_servicio: string
          updated_at: string | null
        }
        Insert: {
          base_natural?: string | null
          cerrada?: boolean | null
          cita_id?: string | null
          cliente_id: string
          color_previo?: string | null
          created_at?: string | null
          formula?: Json | null
          id?: string
          incidencias?: string | null
          incidencias_tags?: string[] | null
          marca_producto?: string | null
          negocio_id: string
          nivel_dano?: number | null
          oxidante_proporcion?: string | null
          oxidante_volumen?: number | null
          porcentaje_canas?: number | null
          profesional_id?: string | null
          resultado_color?: string | null
          resultado_notas?: string | null
          resultado_satisfactorio?: boolean | null
          tecnica_aplicacion?: string[] | null
          tiempo_exposicion_min?: number | null
          tipo_servicio: string
          updated_at?: string | null
        }
        Update: {
          base_natural?: string | null
          cerrada?: boolean | null
          cita_id?: string | null
          cliente_id?: string
          color_previo?: string | null
          created_at?: string | null
          formula?: Json | null
          id?: string
          incidencias?: string | null
          incidencias_tags?: string[] | null
          marca_producto?: string | null
          negocio_id?: string
          nivel_dano?: number | null
          oxidante_proporcion?: string | null
          oxidante_volumen?: number | null
          porcentaje_canas?: number | null
          profesional_id?: string | null
          resultado_color?: string | null
          resultado_notas?: string | null
          resultado_satisfactorio?: boolean | null
          tecnica_aplicacion?: string[] | null
          tiempo_exposicion_min?: number | null
          tipo_servicio?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fichas_tecnicas_color_cita_id_fkey"
            columns: ["cita_id"]
            isOneToOne: false
            referencedRelation: "citas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fichas_tecnicas_color_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fichas_tecnicas_color_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "profesionales"
            referencedColumns: ["id"]
          },
        ]
      }
      fuga_clientas_avisos: {
        Row: {
          cliente_id: string
          created_at: string
          dias_desde_ultima_visita: number
          enviado_at: string | null
          estado: string
          frecuencia_dias: number
          id: string
          negocio_id: string
          recompensa_sugerida_id: string | null
        }
        Insert: {
          cliente_id: string
          created_at?: string
          dias_desde_ultima_visita: number
          enviado_at?: string | null
          estado?: string
          frecuencia_dias: number
          id?: string
          negocio_id: string
          recompensa_sugerida_id?: string | null
        }
        Update: {
          cliente_id?: string
          created_at?: string
          dias_desde_ultima_visita?: number
          enviado_at?: string | null
          estado?: string
          frecuencia_dias?: number
          id?: string
          negocio_id?: string
          recompensa_sugerida_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fuga_clientas_avisos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuga_clientas_avisos_recompensa_sugerida_id_fkey"
            columns: ["recompensa_sugerida_id"]
            isOneToOne: false
            referencedRelation: "recompensas"
            referencedColumns: ["id"]
          },
        ]
      }
      gastos: {
        Row: {
          categoria: string
          concepto: string
          created_at: string
          es_recurrente: boolean
          fecha: string
          id: string
          importe_cents: number
          negocio_id: string
        }
        Insert: {
          categoria: string
          concepto: string
          created_at?: string
          es_recurrente?: boolean
          fecha?: string
          id?: string
          importe_cents: number
          negocio_id: string
        }
        Update: {
          categoria?: string
          concepto?: string
          created_at?: string
          es_recurrente?: boolean
          fecha?: string
          id?: string
          importe_cents?: number
          negocio_id?: string
        }
        Relationships: []
      }
      grupo_familiar_miembros: {
        Row: {
          cliente_id: string
          created_at: string | null
          grupo_id: string
          id: string
          relacion: string | null
        }
        Insert: {
          cliente_id: string
          created_at?: string | null
          grupo_id: string
          id?: string
          relacion?: string | null
        }
        Update: {
          cliente_id?: string
          created_at?: string | null
          grupo_id?: string
          id?: string
          relacion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grupo_familiar_miembros_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grupo_familiar_miembros_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos_familiares"
            referencedColumns: ["id"]
          },
        ]
      }
      grupos_familiares: {
        Row: {
          created_at: string | null
          id: string
          negocio_id: string
          nombre: string
          responsable_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          negocio_id: string
          nombre: string
          responsable_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          negocio_id?: string
          nombre?: string
          responsable_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grupos_familiares_responsable_id_fkey"
            columns: ["responsable_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      hallazgos_ia: {
        Row: {
          accion_sugerida: Json
          actualizado_en: string
          creado_en: string
          datos: Json
          detalle: string | null
          entidad: string | null
          entidad_id: string | null
          estado: string
          familia: string
          id: string
          negocio_id: string
          resuelto_en: string | null
          resumen: string
          severidad: string
          tipo: string
        }
        Insert: {
          accion_sugerida?: Json
          actualizado_en?: string
          creado_en?: string
          datos?: Json
          detalle?: string | null
          entidad?: string | null
          entidad_id?: string | null
          estado?: string
          familia: string
          id?: string
          negocio_id: string
          resuelto_en?: string | null
          resumen: string
          severidad: string
          tipo: string
        }
        Update: {
          accion_sugerida?: Json
          actualizado_en?: string
          creado_en?: string
          datos?: Json
          detalle?: string | null
          entidad?: string | null
          entidad_id?: string | null
          estado?: string
          familia?: string
          id?: string
          negocio_id?: string
          resuelto_en?: string | null
          resumen?: string
          severidad?: string
          tipo?: string
        }
        Relationships: []
      }
      hallazgos_notificaciones: {
        Row: {
          canal: string
          creado_en: string
          enviado_en: string | null
          estado: string
          hallazgo_id: string
          id: string
          negocio_id: string
          resumen: string
          tipo: string
        }
        Insert: {
          canal?: string
          creado_en?: string
          enviado_en?: string | null
          estado?: string
          hallazgo_id: string
          id?: string
          negocio_id: string
          resumen: string
          tipo: string
        }
        Update: {
          canal?: string
          creado_en?: string
          enviado_en?: string | null
          estado?: string
          hallazgo_id?: string
          id?: string
          negocio_id?: string
          resumen?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "hallazgos_notificaciones_hallazgo_id_fkey"
            columns: ["hallazgo_id"]
            isOneToOne: false
            referencedRelation: "hallazgos_ia"
            referencedColumns: ["id"]
          },
        ]
      }
      horarios_profesional: {
        Row: {
          dia_semana: number
          hora_fin: string
          hora_inicio: string
          id: string
          profesional_id: string
          turno: number
        }
        Insert: {
          dia_semana: number
          hora_fin: string
          hora_inicio: string
          id?: string
          profesional_id: string
          turno?: number
        }
        Update: {
          dia_semana?: number
          hora_fin?: string
          hora_inicio?: string
          id?: string
          profesional_id?: string
          turno?: number
        }
        Relationships: [
          {
            foreignKeyName: "horarios_profesional_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "profesionales"
            referencedColumns: ["id"]
          },
        ]
      }
      informes_periodicos_enviados: {
        Row: {
          enviado_at: string
          id: number
          negocio_id: string
          periodo_desde: string
          tipo: string
        }
        Insert: {
          enviado_at?: string
          id?: never
          negocio_id: string
          periodo_desde: string
          tipo: string
        }
        Update: {
          enviado_at?: string
          id?: never
          negocio_id?: string
          periodo_desde?: string
          tipo?: string
        }
        Relationships: []
      }
      inventario: {
        Row: {
          id: string
          modificado_por: string | null
          negocio_id: string
          producto_id: string
          ubicacion: string | null
          ultima_modificacion: string
          unidades: number
        }
        Insert: {
          id?: string
          modificado_por?: string | null
          negocio_id: string
          producto_id: string
          ubicacion?: string | null
          ultima_modificacion?: string
          unidades?: number
        }
        Update: {
          id?: string
          modificado_por?: string | null
          negocio_id?: string
          producto_id?: string
          ubicacion?: string | null
          ultima_modificacion?: string
          unidades?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventario_modificado_por_fkey"
            columns: ["modificado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos_con_stock"
            referencedColumns: ["id"]
          },
        ]
      }
      jornada_correcciones: {
        Row: {
          conforme_empresa: boolean
          conforme_trabajador: boolean
          created_at: string
          discrepancia: string | null
          estado: string
          fichaje_id: string | null
          fichaje_nuevo_id: string | null
          id: string
          motivo: string
          negocio_id: string
          profesional_id: string | null
          propuesta: Json
          resolucion_nota: string | null
          resuelta_at: string | null
          resuelta_por: string | null
          resuelta_por_nombre: string | null
          solicitada_por: string
          solicitada_por_nombre: string | null
          solicitada_por_rol: string
          tipo_solicitud: string
        }
        Insert: {
          conforme_empresa?: boolean
          conforme_trabajador?: boolean
          created_at?: string
          discrepancia?: string | null
          estado?: string
          fichaje_id?: string | null
          fichaje_nuevo_id?: string | null
          id?: string
          motivo: string
          negocio_id: string
          profesional_id?: string | null
          propuesta?: Json
          resolucion_nota?: string | null
          resuelta_at?: string | null
          resuelta_por?: string | null
          resuelta_por_nombre?: string | null
          solicitada_por: string
          solicitada_por_nombre?: string | null
          solicitada_por_rol: string
          tipo_solicitud: string
        }
        Update: {
          conforme_empresa?: boolean
          conforme_trabajador?: boolean
          created_at?: string
          discrepancia?: string | null
          estado?: string
          fichaje_id?: string | null
          fichaje_nuevo_id?: string | null
          id?: string
          motivo?: string
          negocio_id?: string
          profesional_id?: string | null
          propuesta?: Json
          resolucion_nota?: string | null
          resuelta_at?: string | null
          resuelta_por?: string | null
          resuelta_por_nombre?: string | null
          solicitada_por?: string
          solicitada_por_nombre?: string | null
          solicitada_por_rol?: string
          tipo_solicitud?: string
        }
        Relationships: [
          {
            foreignKeyName: "jornada_correcciones_fichaje_id_fkey"
            columns: ["fichaje_id"]
            isOneToOne: false
            referencedRelation: "fichajes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jornada_correcciones_fichaje_nuevo_id_fkey"
            columns: ["fichaje_nuevo_id"]
            isOneToOne: false
            referencedRelation: "fichajes"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_chat_hits: {
        Row: {
          creado_en: string
          id: number
          ip: string
        }
        Insert: {
          creado_en?: string
          id?: never
          ip: string
        }
        Update: {
          creado_en?: string
          id?: never
          ip?: string
        }
        Relationships: []
      }
      latido_envios: {
        Row: {
          id: boolean
          total: number
          ultimo_en: string
          ultimo_tipo: string | null
        }
        Insert: {
          id?: boolean
          total?: number
          ultimo_en?: string
          ultimo_tipo?: string | null
        }
        Update: {
          id?: boolean
          total?: number
          ultimo_en?: string
          ultimo_tipo?: string | null
        }
        Relationships: []
      }
      lista_espera: {
        Row: {
          avisado_at: string | null
          cliente_id: string | null
          created_at: string
          desde: string | null
          estado: string
          franja: string
          hasta: string | null
          id: string
          negocio_id: string
          nombre: string | null
          nota: string | null
          prioridad: number
          profesional_id: string | null
          servicio_id: string | null
          telefono: string | null
        }
        Insert: {
          avisado_at?: string | null
          cliente_id?: string | null
          created_at?: string
          desde?: string | null
          estado?: string
          franja?: string
          hasta?: string | null
          id?: string
          negocio_id: string
          nombre?: string | null
          nota?: string | null
          prioridad?: number
          profesional_id?: string | null
          servicio_id?: string | null
          telefono?: string | null
        }
        Update: {
          avisado_at?: string | null
          cliente_id?: string | null
          created_at?: string
          desde?: string | null
          estado?: string
          franja?: string
          hasta?: string | null
          id?: string
          negocio_id?: string
          nombre?: string | null
          nota?: string | null
          prioridad?: number
          profesional_id?: string | null
          servicio_id?: string | null
          telefono?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lista_espera_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lista_espera_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "profesionales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lista_espera_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "servicios"
            referencedColumns: ["id"]
          },
        ]
      }
      lista_espera_avisos: {
        Row: {
          cita_id: string | null
          created_at: string
          enviado_at: string | null
          estado: string
          fecha: string | null
          hora: string | null
          id: string
          lista_espera_id: string | null
          negocio_id: string
          nombre: string | null
          propuesta_id: string | null
          salon: string | null
          servicio: string | null
          telefono: string | null
          template: string
          ventana_texto: string | null
        }
        Insert: {
          cita_id?: string | null
          created_at?: string
          enviado_at?: string | null
          estado?: string
          fecha?: string | null
          hora?: string | null
          id?: string
          lista_espera_id?: string | null
          negocio_id: string
          nombre?: string | null
          propuesta_id?: string | null
          salon?: string | null
          servicio?: string | null
          telefono?: string | null
          template: string
          ventana_texto?: string | null
        }
        Update: {
          cita_id?: string | null
          created_at?: string
          enviado_at?: string | null
          estado?: string
          fecha?: string | null
          hora?: string | null
          id?: string
          lista_espera_id?: string | null
          negocio_id?: string
          nombre?: string | null
          propuesta_id?: string | null
          salon?: string | null
          servicio?: string | null
          telefono?: string | null
          template?: string
          ventana_texto?: string | null
        }
        Relationships: []
      }
      lista_espera_ofertas: {
        Row: {
          avisados: string[]
          bloqueo_hasta: string | null
          candidato_cita_id: string | null
          candidato_id: string | null
          created_at: string
          estado: string
          expira_at: string | null
          fin: string | null
          fin_activa: string | null
          fin_espera: string | null
          id: string
          inicio: string
          negocio_id: string
          origen_cita_id: string | null
          profesional_id: string | null
          servicio_id: string | null
        }
        Insert: {
          avisados?: string[]
          bloqueo_hasta?: string | null
          candidato_cita_id?: string | null
          candidato_id?: string | null
          created_at?: string
          estado?: string
          expira_at?: string | null
          fin?: string | null
          fin_activa?: string | null
          fin_espera?: string | null
          id?: string
          inicio: string
          negocio_id: string
          origen_cita_id?: string | null
          profesional_id?: string | null
          servicio_id?: string | null
        }
        Update: {
          avisados?: string[]
          bloqueo_hasta?: string | null
          candidato_cita_id?: string | null
          candidato_id?: string | null
          created_at?: string
          estado?: string
          expira_at?: string | null
          fin?: string | null
          fin_activa?: string | null
          fin_espera?: string | null
          id?: string
          inicio?: string
          negocio_id?: string
          origen_cita_id?: string | null
          profesional_id?: string | null
          servicio_id?: string | null
        }
        Relationships: []
      }
      logros: {
        Row: {
          activo: boolean
          color: string | null
          condicion: Json
          created_at: string
          descripcion: string | null
          icono: string | null
          id: string
          negocio_id: string
          nombre: string
          orden: number
          tipo: string
        }
        Insert: {
          activo?: boolean
          color?: string | null
          condicion?: Json
          created_at?: string
          descripcion?: string | null
          icono?: string | null
          id?: string
          negocio_id: string
          nombre: string
          orden?: number
          tipo: string
        }
        Update: {
          activo?: boolean
          color?: string | null
          condicion?: Json
          created_at?: string
          descripcion?: string | null
          icono?: string | null
          id?: string
          negocio_id?: string
          nombre?: string
          orden?: number
          tipo?: string
        }
        Relationships: []
      }
      logros_desbloqueados: {
        Row: {
          cliente_id: string
          desbloqueado_en: string
          detalles: Json | null
          id: string
          logro_id: string
          negocio_id: string
        }
        Insert: {
          cliente_id: string
          desbloqueado_en?: string
          detalles?: Json | null
          id?: string
          logro_id: string
          negocio_id: string
        }
        Update: {
          cliente_id?: string
          desbloqueado_en?: string
          detalles?: Json | null
          id?: string
          logro_id?: string
          negocio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "logros_desbloqueados_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "logros_desbloqueados_logro_id_fkey"
            columns: ["logro_id"]
            isOneToOne: false
            referencedRelation: "logros"
            referencedColumns: ["id"]
          },
        ]
      }
      mensajes_conversacion: {
        Row: {
          autor: string
          conversacion_id: string
          created_at: string
          cuerpo: string
          enviado_email_at: string | null
          id: string
          notificado_at: string | null
          tipo: string
        }
        Insert: {
          autor: string
          conversacion_id: string
          created_at?: string
          cuerpo: string
          enviado_email_at?: string | null
          id?: string
          notificado_at?: string | null
          tipo?: string
        }
        Update: {
          autor?: string
          conversacion_id?: string
          created_at?: string
          cuerpo?: string
          enviado_email_at?: string | null
          id?: string
          notificado_at?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "mensajes_conversacion_conversacion_id_fkey"
            columns: ["conversacion_id"]
            isOneToOne: false
            referencedRelation: "conversaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      movimientos_inventario: {
        Row: {
          creado_por: string | null
          created_at: string
          id: string
          motivo: string | null
          negocio_id: string
          notas: string | null
          producto_id: string
          referencia_id: string | null
          referencia_tipo: string | null
          tipo: string
          unidades: number
        }
        Insert: {
          creado_por?: string | null
          created_at?: string
          id?: string
          motivo?: string | null
          negocio_id: string
          notas?: string | null
          producto_id: string
          referencia_id?: string | null
          referencia_tipo?: string | null
          tipo: string
          unidades: number
        }
        Update: {
          creado_por?: string | null
          created_at?: string
          id?: string
          motivo?: string | null
          negocio_id?: string
          notas?: string | null
          producto_id?: string
          referencia_id?: string | null
          referencia_tipo?: string | null
          tipo?: string
          unidades?: number
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_inventario_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos_con_stock"
            referencedColumns: ["id"]
          },
        ]
      }
      negocio_config: {
        Row: {
          config: Json
          negocio_id: string
          updated_at: string | null
        }
        Insert: {
          config?: Json
          negocio_id: string
          updated_at?: string | null
        }
        Update: {
          config?: Json
          negocio_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      negocio_fotos: {
        Row: {
          alt: string | null
          created_at: string
          id: string
          negocio_id: string
          orden: number
          url: string
        }
        Insert: {
          alt?: string | null
          created_at?: string
          id?: string
          negocio_id: string
          orden?: number
          url: string
        }
        Update: {
          alt?: string | null
          created_at?: string
          id?: string
          negocio_id?: string
          orden?: number
          url?: string
        }
        Relationships: []
      }
      negocio_horarios: {
        Row: {
          abierto: boolean | null
          apertura: string | null
          cierre: string | null
          dia_semana: number
          id: string
          negocio_id: string
          pausa_fin: string | null
          pausa_inicio: string | null
          updated_at: string | null
        }
        Insert: {
          abierto?: boolean | null
          apertura?: string | null
          cierre?: string | null
          dia_semana: number
          id?: string
          negocio_id: string
          pausa_fin?: string | null
          pausa_inicio?: string | null
          updated_at?: string | null
        }
        Update: {
          abierto?: boolean | null
          apertura?: string | null
          cierre?: string | null
          dia_semana?: number
          id?: string
          negocio_id?: string
          pausa_fin?: string | null
          pausa_inicio?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      negocio_pasarela: {
        Row: {
          configurado: boolean
          negocio_id: string
          proveedor: string
          publishable_key: string | null
          redsys_fuc: string | null
          redsys_terminal: string | null
          redsys_test: boolean
          stripe_account_id: string | null
          stripe_conectado_at: string | null
          updated_at: string
        }
        Insert: {
          configurado?: boolean
          negocio_id: string
          proveedor?: string
          publishable_key?: string | null
          redsys_fuc?: string | null
          redsys_terminal?: string | null
          redsys_test?: boolean
          stripe_account_id?: string | null
          stripe_conectado_at?: string | null
          updated_at?: string
        }
        Update: {
          configurado?: boolean
          negocio_id?: string
          proveedor?: string
          publishable_key?: string | null
          redsys_fuc?: string | null
          redsys_terminal?: string | null
          redsys_test?: boolean
          stripe_account_id?: string | null
          stripe_conectado_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      negocio_portal: {
        Row: {
          analytics_config: Json | null
          captcha_activo: boolean | null
          captcha_site_key: string | null
          ciudad: string | null
          codigo_postal: string | null
          color_acento: string | null
          cp_fiscal: string | null
          created_at: string
          descripcion: string | null
          direccion: string | null
          direccion_fiscal: string | null
          directorio_visible: boolean
          fondo_portal_url: string | null
          idioma: string
          lat: number | null
          link_resena_google: string | null
          lng: number | null
          logo_url: string | null
          mostrar_precios: string
          negocio_id: string
          nif: string | null
          nombre_publico: string | null
          poblacion_fiscal: string | null
          portal_activo: boolean
          provincia: string | null
          razon_social: string | null
          slug: string
          telefono: string | null
          updated_at: string
          web: string | null
        }
        Insert: {
          analytics_config?: Json | null
          captcha_activo?: boolean | null
          captcha_site_key?: string | null
          ciudad?: string | null
          codigo_postal?: string | null
          color_acento?: string | null
          cp_fiscal?: string | null
          created_at?: string
          descripcion?: string | null
          direccion?: string | null
          direccion_fiscal?: string | null
          directorio_visible?: boolean
          fondo_portal_url?: string | null
          idioma?: string
          lat?: number | null
          link_resena_google?: string | null
          lng?: number | null
          logo_url?: string | null
          mostrar_precios?: string
          negocio_id: string
          nif?: string | null
          nombre_publico?: string | null
          poblacion_fiscal?: string | null
          portal_activo?: boolean
          provincia?: string | null
          razon_social?: string | null
          slug: string
          telefono?: string | null
          updated_at?: string
          web?: string | null
        }
        Update: {
          analytics_config?: Json | null
          captcha_activo?: boolean | null
          captcha_site_key?: string | null
          ciudad?: string | null
          codigo_postal?: string | null
          color_acento?: string | null
          cp_fiscal?: string | null
          created_at?: string
          descripcion?: string | null
          direccion?: string | null
          direccion_fiscal?: string | null
          directorio_visible?: boolean
          fondo_portal_url?: string | null
          idioma?: string
          lat?: number | null
          link_resena_google?: string | null
          lng?: number | null
          logo_url?: string | null
          mostrar_precios?: string
          negocio_id?: string
          nif?: string | null
          nombre_publico?: string | null
          poblacion_fiscal?: string | null
          portal_activo?: boolean
          provincia?: string | null
          razon_social?: string | null
          slug?: string
          telefono?: string | null
          updated_at?: string
          web?: string | null
        }
        Relationships: []
      }
      niveles_fidelizacion: {
        Row: {
          activo: boolean
          color: string | null
          created_at: string
          icono: string | null
          id: string
          negocio_id: string
          nombre: string
          orden: number
          sin_deposito: boolean
          umbral_gastado_cents: number | null
          umbral_visitas: number | null
        }
        Insert: {
          activo?: boolean
          color?: string | null
          created_at?: string
          icono?: string | null
          id?: string
          negocio_id: string
          nombre: string
          orden?: number
          sin_deposito?: boolean
          umbral_gastado_cents?: number | null
          umbral_visitas?: number | null
        }
        Update: {
          activo?: boolean
          color?: string | null
          created_at?: string
          icono?: string | null
          id?: string
          negocio_id?: string
          nombre?: string
          orden?: number
          sin_deposito?: boolean
          umbral_gastado_cents?: number | null
          umbral_visitas?: number | null
        }
        Relationships: []
      }
      notas_internas_cliente: {
        Row: {
          autor_id: string | null
          cliente_id: string
          contenido: string
          created_at: string | null
          id: string
          negocio_id: string
        }
        Insert: {
          autor_id?: string | null
          cliente_id: string
          contenido: string
          created_at?: string | null
          id?: string
          negocio_id: string
        }
        Update: {
          autor_id?: string | null
          cliente_id?: string
          contenido?: string
          created_at?: string | null
          id?: string
          negocio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notas_internas_cliente_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "profesionales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_internas_cliente_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      objetivos_profesional: {
        Row: {
          activo: boolean
          bonus_cents: number | null
          created_at: string
          id: string
          metrica: string
          negocio_id: string
          objetivo_valor: number
          profesional_id: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          bonus_cents?: number | null
          created_at?: string
          id?: string
          metrica: string
          negocio_id: string
          objetivo_valor: number
          profesional_id: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          bonus_cents?: number | null
          created_at?: string
          id?: string
          metrica?: string
          negocio_id?: string
          objetivo_valor?: number
          profesional_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "objetivos_profesional_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "profesionales"
            referencedColumns: ["id"]
          },
        ]
      }
      pagos: {
        Row: {
          cita_id: string | null
          cliente_id: string | null
          created_at: string
          estado: string
          id: string
          importe_cents: number
          metadata: Json
          metodo: string | null
          moneda: string
          negocio_id: string
          paid_at: string | null
          pasarela: string | null
          pasarela_ref: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          cita_id?: string | null
          cliente_id?: string | null
          created_at?: string
          estado?: string
          id?: string
          importe_cents: number
          metadata?: Json
          metodo?: string | null
          moneda?: string
          negocio_id: string
          paid_at?: string | null
          pasarela?: string | null
          pasarela_ref?: string | null
          tipo?: string
          updated_at?: string
        }
        Update: {
          cita_id?: string | null
          cliente_id?: string | null
          created_at?: string
          estado?: string
          id?: string
          importe_cents?: number
          metadata?: Json
          metodo?: string | null
          moneda?: string
          negocio_id?: string
          paid_at?: string | null
          pasarela?: string | null
          pasarela_ref?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pagos_cita_id_fkey"
            columns: ["cita_id"]
            isOneToOne: false
            referencedRelation: "citas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pagos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      planes_ia: {
        Row: {
          aplicado_en: string | null
          confianza: string
          coste_usd: number | null
          creado_en: string
          diagnostico: string
          disparador: string
          estado: string
          expira_en: string
          generado_por: string | null
          graduable_a_determinista: boolean | null
          id: string
          impacto_declarado_min: number
          impacto_min: number
          modelo: string | null
          movimientos: Json
          movimientos_podados: Json
          negocio_id: string
          razonamiento: string
          requiere_consentimiento: boolean
          resultado: string | null
          riesgos: Json
          score: number
          tipo_problema: string
          titulo: string
          tokens_in: number | null
          tokens_out: number | null
          zonas: Json
        }
        Insert: {
          aplicado_en?: string | null
          confianza?: string
          coste_usd?: number | null
          creado_en?: string
          diagnostico?: string
          disparador?: string
          estado?: string
          expira_en?: string
          generado_por?: string | null
          graduable_a_determinista?: boolean | null
          id?: string
          impacto_declarado_min?: number
          impacto_min?: number
          modelo?: string | null
          movimientos?: Json
          movimientos_podados?: Json
          negocio_id: string
          razonamiento?: string
          requiere_consentimiento?: boolean
          resultado?: string | null
          riesgos?: Json
          score?: number
          tipo_problema: string
          titulo: string
          tokens_in?: number | null
          tokens_out?: number | null
          zonas?: Json
        }
        Update: {
          aplicado_en?: string | null
          confianza?: string
          coste_usd?: number | null
          creado_en?: string
          diagnostico?: string
          disparador?: string
          estado?: string
          expira_en?: string
          generado_por?: string | null
          graduable_a_determinista?: boolean | null
          id?: string
          impacto_declarado_min?: number
          impacto_min?: number
          modelo?: string | null
          movimientos?: Json
          movimientos_podados?: Json
          negocio_id?: string
          razonamiento?: string
          requiere_consentimiento?: boolean
          resultado?: string | null
          riesgos?: Json
          score?: number
          tipo_problema?: string
          titulo?: string
          tokens_in?: number | null
          tokens_out?: number | null
          zonas?: Json
        }
        Relationships: []
      }
      presupuesto_conceptos: {
        Row: {
          activo: boolean
          created_at: string
          id: string
          negocio_id: string
          nombre: string
          precio_cents: number
        }
        Insert: {
          activo?: boolean
          created_at?: string
          id?: string
          negocio_id: string
          nombre: string
          precio_cents?: number
        }
        Update: {
          activo?: boolean
          created_at?: string
          id?: string
          negocio_id?: string
          nombre?: string
          precio_cents?: number
        }
        Relationships: []
      }
      presupuesto_lineas: {
        Row: {
          cantidad: number
          concepto_id: string | null
          created_at: string
          id: string
          nombre: string
          orden: number
          precio_cents: number
          presupuesto_id: string
        }
        Insert: {
          cantidad?: number
          concepto_id?: string | null
          created_at?: string
          id?: string
          nombre: string
          orden?: number
          precio_cents?: number
          presupuesto_id: string
        }
        Update: {
          cantidad?: number
          concepto_id?: string | null
          created_at?: string
          id?: string
          nombre?: string
          orden?: number
          precio_cents?: number
          presupuesto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "presupuesto_lineas_concepto_id_fkey"
            columns: ["concepto_id"]
            isOneToOne: false
            referencedRelation: "presupuesto_conceptos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuesto_lineas_presupuesto_id_fkey"
            columns: ["presupuesto_id"]
            isOneToOne: false
            referencedRelation: "presupuestos"
            referencedColumns: ["id"]
          },
        ]
      }
      presupuestos: {
        Row: {
          aceptado_at: string | null
          cita_id: string | null
          cliente_id: string | null
          cobro_id: string | null
          contacto_email: string | null
          contacto_nombre: string | null
          contacto_telefono: string | null
          creado_por: string | null
          created_at: string
          enviado_email_at: string | null
          enviado_whatsapp_at: string | null
          estado: string
          id: string
          modificado_at: string
          negocio_id: string
          notas: string | null
          numero: number | null
          pdf_path: string | null
          profesional_id: string | null
          titulo: string | null
          token: string
          total_cents: number
          valido_hasta: string | null
          whatsapp_solicitado: boolean
        }
        Insert: {
          aceptado_at?: string | null
          cita_id?: string | null
          cliente_id?: string | null
          cobro_id?: string | null
          contacto_email?: string | null
          contacto_nombre?: string | null
          contacto_telefono?: string | null
          creado_por?: string | null
          created_at?: string
          enviado_email_at?: string | null
          enviado_whatsapp_at?: string | null
          estado?: string
          id?: string
          modificado_at?: string
          negocio_id: string
          notas?: string | null
          numero?: number | null
          pdf_path?: string | null
          profesional_id?: string | null
          titulo?: string | null
          token?: string
          total_cents?: number
          valido_hasta?: string | null
          whatsapp_solicitado?: boolean
        }
        Update: {
          aceptado_at?: string | null
          cita_id?: string | null
          cliente_id?: string | null
          cobro_id?: string | null
          contacto_email?: string | null
          contacto_nombre?: string | null
          contacto_telefono?: string | null
          creado_por?: string | null
          created_at?: string
          enviado_email_at?: string | null
          enviado_whatsapp_at?: string | null
          estado?: string
          id?: string
          modificado_at?: string
          negocio_id?: string
          notas?: string | null
          numero?: number | null
          pdf_path?: string | null
          profesional_id?: string | null
          titulo?: string | null
          token?: string
          total_cents?: number
          valido_hasta?: string | null
          whatsapp_solicitado?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "presupuestos_cita_id_fkey"
            columns: ["cita_id"]
            isOneToOne: false
            referencedRelation: "citas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuestos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuestos_cobro_id_fkey"
            columns: ["cobro_id"]
            isOneToOne: false
            referencedRelation: "cobros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presupuestos_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "profesionales"
            referencedColumns: ["id"]
          },
        ]
      }
      productos: {
        Row: {
          activo: boolean
          capacidad_envase: number | null
          categoria: string | null
          codigo_barras: string | null
          coste_envase_cents: number | null
          created_at: string
          descripcion: string | null
          id: string
          imagen_url: string | null
          iva_porcentaje: number | null
          negocio_id: string
          nombre: string
          precio_cents: number
          proveedor: string | null
          stock_minimo: number
          unidad_medida: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          capacidad_envase?: number | null
          categoria?: string | null
          codigo_barras?: string | null
          coste_envase_cents?: number | null
          created_at?: string
          descripcion?: string | null
          id?: string
          imagen_url?: string | null
          iva_porcentaje?: number | null
          negocio_id: string
          nombre: string
          precio_cents?: number
          proveedor?: string | null
          stock_minimo?: number
          unidad_medida?: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          capacidad_envase?: number | null
          categoria?: string | null
          codigo_barras?: string | null
          coste_envase_cents?: number | null
          created_at?: string
          descripcion?: string | null
          id?: string
          imagen_url?: string | null
          iva_porcentaje?: number | null
          negocio_id?: string
          nombre?: string
          precio_cents?: number
          proveedor?: string | null
          stock_minimo?: number
          unidad_medida?: string
          updated_at?: string
        }
        Relationships: []
      }
      profesional_categorias_historial: {
        Row: {
          categoria_anterior: string | null
          categoria_nueva: string
          fecha_cambio: string
          id: string
          motivo: string | null
          negocio_id: string
          profesional_id: string
        }
        Insert: {
          categoria_anterior?: string | null
          categoria_nueva: string
          fecha_cambio?: string
          id?: string
          motivo?: string | null
          negocio_id: string
          profesional_id: string
        }
        Update: {
          categoria_anterior?: string | null
          categoria_nueva?: string
          fecha_cambio?: string
          id?: string
          motivo?: string | null
          negocio_id?: string
          profesional_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profesional_categorias_historial_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "profesionales"
            referencedColumns: ["id"]
          },
        ]
      }
      profesionales: {
        Row: {
          activo: boolean
          categoria: string | null
          color: string
          comision_pct: number | null
          created_at: string
          email: string | null
          especialidades: string[] | null
          foto_perfil: string | null
          id: string
          negocio_id: string
          nombre: string
          profile_id: string | null
          rol_acceso: string
          telefono: string | null
          tipo_relacion: string | null
        }
        Insert: {
          activo?: boolean
          categoria?: string | null
          color?: string
          comision_pct?: number | null
          created_at?: string
          email?: string | null
          especialidades?: string[] | null
          foto_perfil?: string | null
          id?: string
          negocio_id: string
          nombre: string
          profile_id?: string | null
          rol_acceso?: string
          telefono?: string | null
          tipo_relacion?: string | null
        }
        Update: {
          activo?: boolean
          categoria?: string | null
          color?: string
          comision_pct?: number | null
          created_at?: string
          email?: string | null
          especialidades?: string[] | null
          foto_perfil?: string | null
          id?: string
          negocio_id?: string
          nombre?: string
          profile_id?: string | null
          rol_acceso?: string
          telefono?: string | null
          tipo_relacion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profesionales_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_service_overrides: {
        Row: {
          activo: boolean | null
          duracion: number | null
          duracion_activa_extra_min: number | null
          duracion_espera_min: number | null
          id: string
          precio: number | null
          professional_id: string
          service_id: string
        }
        Insert: {
          activo?: boolean | null
          duracion?: number | null
          duracion_activa_extra_min?: number | null
          duracion_espera_min?: number | null
          id?: string
          precio?: number | null
          professional_id: string
          service_id: string
        }
        Update: {
          activo?: boolean | null
          duracion?: number | null
          duracion_activa_extra_min?: number | null
          duracion_espera_min?: number | null
          id?: string
          precio?: number | null
          professional_id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_service_overrides_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "profesionales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_service_overrides_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "servicios"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          apellido: string | null
          avatar_url: string | null
          cobro_manual: boolean
          cobro_manual_en: string | null
          cobro_manual_nota: string | null
          cobro_manual_por: string | null
          cobro_manual_previo: string | null
          codigo_postal: string | null
          codigo_referido: string | null
          created_at: string
          demo_visits_used: number
          descuento_pct: number
          descuento_referido_aplicado: boolean
          email: string
          es_cuenta_demo: boolean
          ia_nivel: string
          id: string
          meses_gratis_canjeados: number
          meses_gratis_ganados: number
          negocio_id: string | null
          nombre: string
          nombre_negocio: string | null
          paginas_manual_vistas: Json
          periodo_fin: string | null
          phone: string | null
          plan: string
          privacy_accepted_at: string | null
          privacy_policy_version: string | null
          referido_en: string | null
          referido_por: string | null
          role: string
          signup_fingerprint: string | null
          signup_ip: string | null
          signup_ua: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          suscripcion_estado: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          apellido?: string | null
          avatar_url?: string | null
          cobro_manual?: boolean
          cobro_manual_en?: string | null
          cobro_manual_nota?: string | null
          cobro_manual_por?: string | null
          cobro_manual_previo?: string | null
          codigo_postal?: string | null
          codigo_referido?: string | null
          created_at?: string
          demo_visits_used?: number
          descuento_pct?: number
          descuento_referido_aplicado?: boolean
          email: string
          es_cuenta_demo?: boolean
          ia_nivel?: string
          id: string
          meses_gratis_canjeados?: number
          meses_gratis_ganados?: number
          negocio_id?: string | null
          nombre: string
          nombre_negocio?: string | null
          paginas_manual_vistas?: Json
          periodo_fin?: string | null
          phone?: string | null
          plan?: string
          privacy_accepted_at?: string | null
          privacy_policy_version?: string | null
          referido_en?: string | null
          referido_por?: string | null
          role: string
          signup_fingerprint?: string | null
          signup_ip?: string | null
          signup_ua?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          suscripcion_estado?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          apellido?: string | null
          avatar_url?: string | null
          cobro_manual?: boolean
          cobro_manual_en?: string | null
          cobro_manual_nota?: string | null
          cobro_manual_por?: string | null
          cobro_manual_previo?: string | null
          codigo_postal?: string | null
          codigo_referido?: string | null
          created_at?: string
          demo_visits_used?: number
          descuento_pct?: number
          descuento_referido_aplicado?: boolean
          email?: string
          es_cuenta_demo?: boolean
          ia_nivel?: string
          id?: string
          meses_gratis_canjeados?: number
          meses_gratis_ganados?: number
          negocio_id?: string | null
          nombre?: string
          nombre_negocio?: string | null
          paginas_manual_vistas?: Json
          periodo_fin?: string | null
          phone?: string | null
          plan?: string
          privacy_accepted_at?: string | null
          privacy_policy_version?: string | null
          referido_en?: string | null
          referido_por?: string | null
          role?: string
          signup_fingerprint?: string | null
          signup_ip?: string | null
          signup_ua?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          suscripcion_estado?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_referido_por_fkey"
            columns: ["referido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_hits: {
        Row: {
          clave: string
          creado_en: string
          cubo: string
          id: number
        }
        Insert: {
          clave: string
          creado_en?: string
          cubo: string
          id?: never
        }
        Update: {
          clave?: string
          creado_en?: string
          cubo?: string
          id?: never
        }
        Relationships: []
      }
      recompensas: {
        Row: {
          activo: boolean
          created_at: string
          descripcion: string | null
          expira_meses: number | null
          id: string
          negocio_id: string
          nombre: string
          tipo: string
          umbral_visitas: number
          valor: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          descripcion?: string | null
          expira_meses?: number | null
          id?: string
          negocio_id: string
          nombre: string
          tipo: string
          umbral_visitas?: number
          valor: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          descripcion?: string | null
          expira_meses?: number | null
          id?: string
          negocio_id?: string
          nombre?: string
          tipo?: string
          umbral_visitas?: number
          valor?: string
        }
        Relationships: []
      }
      recompensas_canjeadas: {
        Row: {
          canjeado_en: string
          cita_id: string | null
          cliente_id: string
          estado: string
          id: string
          negocio_id: string
          notas: string | null
          recompensa_id: string
          usado_en: string | null
        }
        Insert: {
          canjeado_en?: string
          cita_id?: string | null
          cliente_id: string
          estado?: string
          id?: string
          negocio_id: string
          notas?: string | null
          recompensa_id: string
          usado_en?: string | null
        }
        Update: {
          canjeado_en?: string
          cita_id?: string | null
          cliente_id?: string
          estado?: string
          id?: string
          negocio_id?: string
          notas?: string | null
          recompensa_id?: string
          usado_en?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recompensas_canjeadas_cita_id_fkey"
            columns: ["cita_id"]
            isOneToOne: false
            referencedRelation: "citas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recompensas_canjeadas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recompensas_canjeadas_recompensa_id_fkey"
            columns: ["recompensa_id"]
            isOneToOne: false
            referencedRelation: "recompensas"
            referencedColumns: ["id"]
          },
        ]
      }
      recursos: {
        Row: {
          activo: boolean
          capacidad: number
          created_at: string
          id: string
          negocio_id: string
          nombre: string
          orden: number
          tipo: string
        }
        Insert: {
          activo?: boolean
          capacidad?: number
          created_at?: string
          id?: string
          negocio_id: string
          nombre: string
          orden?: number
          tipo: string
        }
        Update: {
          activo?: boolean
          capacidad?: number
          created_at?: string
          id?: string
          negocio_id?: string
          nombre?: string
          orden?: number
          tipo?: string
        }
        Relationships: []
      }
      resenas: {
        Row: {
          autor_nombre: string | null
          cita_id: string | null
          cliente_id: string | null
          comentario: string | null
          created_at: string
          fuente: string
          id: string
          ip_origen: string | null
          mecha_comentario: string | null
          mecha_disponibilidad_puntuacion: number | null
          mecha_facilidad_puntuacion: number | null
          mecha_mejora_comentario: string | null
          mecha_pagos_puntuacion: number | null
          mecha_puntuacion: number | null
          negocio_id: string
          profesional_comentario: string | null
          profesional_id: string | null
          profesional_puntuacion: number | null
          puntuacion: number
          respuesta_borrador: string | null
          salon_productos_puntuacion: number | null
          salon_trato_puntuacion: number | null
          servicio_id: string | null
          visible: boolean
        }
        Insert: {
          autor_nombre?: string | null
          cita_id?: string | null
          cliente_id?: string | null
          comentario?: string | null
          created_at?: string
          fuente?: string
          id?: string
          ip_origen?: string | null
          mecha_comentario?: string | null
          mecha_disponibilidad_puntuacion?: number | null
          mecha_facilidad_puntuacion?: number | null
          mecha_mejora_comentario?: string | null
          mecha_pagos_puntuacion?: number | null
          mecha_puntuacion?: number | null
          negocio_id: string
          profesional_comentario?: string | null
          profesional_id?: string | null
          profesional_puntuacion?: number | null
          puntuacion: number
          respuesta_borrador?: string | null
          salon_productos_puntuacion?: number | null
          salon_trato_puntuacion?: number | null
          servicio_id?: string | null
          visible?: boolean
        }
        Update: {
          autor_nombre?: string | null
          cita_id?: string | null
          cliente_id?: string | null
          comentario?: string | null
          created_at?: string
          fuente?: string
          id?: string
          ip_origen?: string | null
          mecha_comentario?: string | null
          mecha_disponibilidad_puntuacion?: number | null
          mecha_facilidad_puntuacion?: number | null
          mecha_mejora_comentario?: string | null
          mecha_pagos_puntuacion?: number | null
          mecha_puntuacion?: number | null
          negocio_id?: string
          profesional_comentario?: string | null
          profesional_id?: string | null
          profesional_puntuacion?: number | null
          puntuacion?: number
          respuesta_borrador?: string | null
          salon_productos_puntuacion?: number | null
          salon_trato_puntuacion?: number | null
          servicio_id?: string | null
          visible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "fk_resenas_negocio_portal"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocio_portal"
            referencedColumns: ["negocio_id"]
          },
          {
            foreignKeyName: "resenas_cita_id_fkey"
            columns: ["cita_id"]
            isOneToOne: false
            referencedRelation: "citas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resenas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resenas_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "profesionales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resenas_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "servicios"
            referencedColumns: ["id"]
          },
        ]
      }
      rpc_rate_hits: {
        Row: {
          bucket: string
          clave: string
          creado_en: string
          id: number
        }
        Insert: {
          bucket: string
          clave: string
          creado_en?: string
          id?: number
        }
        Update: {
          bucket?: string
          clave?: string
          creado_en?: string
          id?: number
        }
        Relationships: []
      }
      salon_acceso: {
        Row: {
          actualizado_en: string
          actualizado_por: string | null
          modo: string
          negocio_id: string
          pin_actualizado_en: string | null
          pin_hash: string | null
        }
        Insert: {
          actualizado_en?: string
          actualizado_por?: string | null
          modo?: string
          negocio_id: string
          pin_actualizado_en?: string | null
          pin_hash?: string | null
        }
        Update: {
          actualizado_en?: string
          actualizado_por?: string | null
          modo?: string
          negocio_id?: string
          pin_actualizado_en?: string | null
          pin_hash?: string | null
        }
        Relationships: []
      }
      salones_externos: {
        Row: {
          ciudad: string | null
          codigo_postal: string | null
          created_at: string
          direccion: string | null
          fuente: string
          fuente_id: string
          id: string
          lat: number | null
          lng: number | null
          nombre: string
          provincia: string | null
          reclamado_por: string | null
          telefono: string | null
          updated_at: string
          visible: boolean
          web: string | null
        }
        Insert: {
          ciudad?: string | null
          codigo_postal?: string | null
          created_at?: string
          direccion?: string | null
          fuente?: string
          fuente_id: string
          id?: string
          lat?: number | null
          lng?: number | null
          nombre: string
          provincia?: string | null
          reclamado_por?: string | null
          telefono?: string | null
          updated_at?: string
          visible?: boolean
          web?: string | null
        }
        Update: {
          ciudad?: string | null
          codigo_postal?: string | null
          created_at?: string
          direccion?: string | null
          fuente?: string
          fuente_id?: string
          id?: string
          lat?: number | null
          lng?: number | null
          nombre?: string
          provincia?: string | null
          reclamado_por?: string | null
          telefono?: string | null
          updated_at?: string
          visible?: boolean
          web?: string | null
        }
        Relationships: []
      }
      service_addons: {
        Row: {
          activo: boolean
          created_at: string
          duracion_min: number
          id: string
          negocio_id: string
          nombre: string
          precio: number
          servicio_id: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          duracion_min?: number
          id?: string
          negocio_id: string
          nombre: string
          precio?: number
          servicio_id: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          duracion_min?: number
          id?: string
          negocio_id?: string
          nombre?: string
          precio?: number
          servicio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_addons_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "servicios"
            referencedColumns: ["id"]
          },
        ]
      }
      service_category_pricing: {
        Row: {
          categoria: string
          created_at: string | null
          id: string
          negocio_id: string
          precio: number
          servicio_id: string
        }
        Insert: {
          categoria: string
          created_at?: string | null
          id?: string
          negocio_id: string
          precio: number
          servicio_id: string
        }
        Update: {
          categoria?: string
          created_at?: string | null
          id?: string
          negocio_id?: string
          precio?: number
          servicio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_category_pricing_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "servicios"
            referencedColumns: ["id"]
          },
        ]
      }
      service_variants: {
        Row: {
          activo: boolean
          created_at: string | null
          duracion_activa_extra_min: number
          duracion_activa_min: number
          duracion_espera_min: number
          id: string
          negocio_id: string
          nombre: string
          precio: number
          servicio_id: string
        }
        Insert: {
          activo?: boolean
          created_at?: string | null
          duracion_activa_extra_min?: number
          duracion_activa_min?: number
          duracion_espera_min?: number
          id?: string
          negocio_id: string
          nombre: string
          precio: number
          servicio_id: string
        }
        Update: {
          activo?: boolean
          created_at?: string | null
          duracion_activa_extra_min?: number
          duracion_activa_min?: number
          duracion_espera_min?: number
          id?: string
          negocio_id?: string
          nombre?: string
          precio?: number
          servicio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_variants_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "servicios"
            referencedColumns: ["id"]
          },
        ]
      }
      servicios: {
        Row: {
          activo: boolean
          bonus_puntos: number | null
          cancelacion_horas: number | null
          categoria: string | null
          categoria_id: string | null
          categoria_minima: string | null
          created_at: string
          descripcion: string | null
          duracion_activa_extra_min: number
          duracion_activa_min: number
          duracion_espera_min: number
          duracion_minima_min: number | null
          es_puntual: boolean
          foto_url: string | null
          id: string
          min_antelacion_min: number
          negocio_id: string
          nombre: string
          precio: number
          prepago_cantidad_fija: number | null
          prepago_porcentaje: number | null
          prepago_requerido: boolean | null
          recurso_fase: string
          recurso_tipo: string | null
          reservable_online: boolean | null
        }
        Insert: {
          activo?: boolean
          bonus_puntos?: number | null
          cancelacion_horas?: number | null
          categoria?: string | null
          categoria_id?: string | null
          categoria_minima?: string | null
          created_at?: string
          descripcion?: string | null
          duracion_activa_extra_min?: number
          duracion_activa_min: number
          duracion_espera_min?: number
          duracion_minima_min?: number | null
          es_puntual?: boolean
          foto_url?: string | null
          id?: string
          min_antelacion_min?: number
          negocio_id: string
          nombre: string
          precio: number
          prepago_cantidad_fija?: number | null
          prepago_porcentaje?: number | null
          prepago_requerido?: boolean | null
          recurso_fase?: string
          recurso_tipo?: string | null
          reservable_online?: boolean | null
        }
        Update: {
          activo?: boolean
          bonus_puntos?: number | null
          cancelacion_horas?: number | null
          categoria?: string | null
          categoria_id?: string | null
          categoria_minima?: string | null
          created_at?: string
          descripcion?: string | null
          duracion_activa_extra_min?: number
          duracion_activa_min?: number
          duracion_espera_min?: number
          duracion_minima_min?: number | null
          es_puntual?: boolean
          foto_url?: string | null
          id?: string
          min_antelacion_min?: number
          negocio_id?: string
          nombre?: string
          precio?: number
          prepago_cantidad_fija?: number | null
          prepago_porcentaje?: number | null
          prepago_requerido?: boolean | null
          recurso_fase?: string
          recurso_tipo?: string | null
          reservable_online?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "servicios_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias_servicio"
            referencedColumns: ["id"]
          },
        ]
      }
      servicios_combinables: {
        Row: {
          created_at: string | null
          id: string
          negocio_id: string
          orden_sugerido: number | null
          servicio_destino_id: string
          servicio_origen_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          negocio_id: string
          orden_sugerido?: number | null
          servicio_destino_id: string
          servicio_origen_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          negocio_id?: string
          orden_sugerido?: number | null
          servicio_destino_id?: string
          servicio_origen_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "servicios_combinables_servicio_destino_id_fkey"
            columns: ["servicio_destino_id"]
            isOneToOne: false
            referencedRelation: "servicios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servicios_combinables_servicio_origen_id_fkey"
            columns: ["servicio_origen_id"]
            isOneToOne: false
            referencedRelation: "servicios"
            referencedColumns: ["id"]
          },
        ]
      }
      servicios_sugeridos: {
        Row: {
          activo: boolean
          confianza: number
          created_at: string
          id: string
          negocio_id: string
          origen: string
          servicio_id: string
          sugerido_id: string
          updated_at: string
          visitas: number
        }
        Insert: {
          activo?: boolean
          confianza?: number
          created_at?: string
          id?: string
          negocio_id: string
          origen?: string
          servicio_id: string
          sugerido_id: string
          updated_at?: string
          visitas?: number
        }
        Update: {
          activo?: boolean
          confianza?: number
          created_at?: string
          id?: string
          negocio_id?: string
          origen?: string
          servicio_id?: string
          sugerido_id?: string
          updated_at?: string
          visitas?: number
        }
        Relationships: [
          {
            foreignKeyName: "servicios_sugeridos_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "servicios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servicios_sugeridos_sugerido_id_fkey"
            columns: ["sugerido_id"]
            isOneToOne: false
            referencedRelation: "servicios"
            referencedColumns: ["id"]
          },
        ]
      }
      sesiones_caja: {
        Row: {
          abierta_at: string
          abierta_por: string | null
          cerrada_at: string | null
          cerrada_por: string | null
          contado_datafono_cents: number | null
          contado_efectivo_cents: number | null
          created_at: string
          descuadre_cents: number | null
          ejercicio: number
          estado: string
          fondo_inicial_cents: number
          id: string
          negocio_id: string
          notas: string | null
          numero_z: number | null
          teorico_datafono_cents: number | null
          teorico_efectivo_cents: number | null
          teorico_online_cents: number | null
          teorico_propinas_cents: number | null
        }
        Insert: {
          abierta_at?: string
          abierta_por?: string | null
          cerrada_at?: string | null
          cerrada_por?: string | null
          contado_datafono_cents?: number | null
          contado_efectivo_cents?: number | null
          created_at?: string
          descuadre_cents?: number | null
          ejercicio?: number
          estado?: string
          fondo_inicial_cents?: number
          id?: string
          negocio_id: string
          notas?: string | null
          numero_z?: number | null
          teorico_datafono_cents?: number | null
          teorico_efectivo_cents?: number | null
          teorico_online_cents?: number | null
          teorico_propinas_cents?: number | null
        }
        Update: {
          abierta_at?: string
          abierta_por?: string | null
          cerrada_at?: string | null
          cerrada_por?: string | null
          contado_datafono_cents?: number | null
          contado_efectivo_cents?: number | null
          created_at?: string
          descuadre_cents?: number | null
          ejercicio?: number
          estado?: string
          fondo_inicial_cents?: number
          id?: string
          negocio_id?: string
          notas?: string | null
          numero_z?: number | null
          teorico_datafono_cents?: number | null
          teorico_efectivo_cents?: number | null
          teorico_online_cents?: number | null
          teorico_propinas_cents?: number | null
        }
        Relationships: []
      }
      solicitudes: {
        Row: {
          created_at: string
          email: string | null
          estado: string
          fecha_preferida: string | null
          herramienta_actual: string | null
          hora_preferida: string | null
          id: string
          ip_origen: string | null
          meta: Json
          nombre: string | null
          nota: string | null
          num_profesionales: string | null
          salon: string | null
          telefono: string | null
          tipo: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          estado?: string
          fecha_preferida?: string | null
          herramienta_actual?: string | null
          hora_preferida?: string | null
          id?: string
          ip_origen?: string | null
          meta?: Json
          nombre?: string | null
          nota?: string | null
          num_profesionales?: string | null
          salon?: string | null
          telefono?: string | null
          tipo: string
        }
        Update: {
          created_at?: string
          email?: string | null
          estado?: string
          fecha_preferida?: string | null
          herramienta_actual?: string | null
          hora_preferida?: string | null
          id?: string
          ip_origen?: string | null
          meta?: Json
          nombre?: string | null
          nota?: string | null
          num_profesionales?: string | null
          salon?: string | null
          telefono?: string | null
          tipo?: string
        }
        Relationships: []
      }
      soporte_mensajes: {
        Row: {
          asunto: string
          autor_email: string | null
          autor_nombre: string | null
          creado_en: string
          estado: string
          id: number
          leido_en: string | null
          mensaje: string
          negocio_id: string | null
          resuelto_en: string | null
          user_id: string | null
        }
        Insert: {
          asunto: string
          autor_email?: string | null
          autor_nombre?: string | null
          creado_en?: string
          estado?: string
          id?: never
          leido_en?: string | null
          mensaje: string
          negocio_id?: string | null
          resuelto_en?: string | null
          user_id?: string | null
        }
        Update: {
          asunto?: string
          autor_email?: string | null
          autor_nombre?: string | null
          creado_en?: string
          estado?: string
          id?: never
          leido_en?: string | null
          mensaje?: string
          negocio_id?: string | null
          resuelto_en?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      staff: {
        Row: {
          created_at: string
          email: string
          nombre: string | null
        }
        Insert: {
          created_at?: string
          email: string
          nombre?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          nombre?: string | null
        }
        Relationships: []
      }
      stripe_webhook_eventos: {
        Row: {
          event_id: string
          recibido_at: string
          tipo: string | null
        }
        Insert: {
          event_id: string
          recibido_at?: string
          tipo?: string | null
        }
        Update: {
          event_id?: string
          recibido_at?: string
          tipo?: string | null
        }
        Relationships: []
      }
      tickets_verifactu: {
        Row: {
          cobro_id: string
          created_at: string
          fecha_emision: string
          hash: string
          hash_anterior: string
          id: string
          negocio_id: string
          numero: number
          payload: Json
          serie: string
        }
        Insert: {
          cobro_id: string
          created_at?: string
          fecha_emision?: string
          hash: string
          hash_anterior?: string
          id?: string
          negocio_id: string
          numero: number
          payload?: Json
          serie?: string
        }
        Update: {
          cobro_id?: string
          created_at?: string
          fecha_emision?: string
          hash?: string
          hash_anterior?: string
          id?: string
          negocio_id?: string
          numero?: number
          payload?: Json
          serie?: string
        }
        Relationships: []
      }
      turnos_intercambio: {
        Row: {
          companero_id: string
          created_at: string
          estado: string
          fecha_companero: string
          fecha_solicitante: string
          id: string
          motivo: string | null
          negocio_id: string
          nota_rechazo: string | null
          respondido_companero_at: string | null
          respondido_gestor_at: string | null
          respondido_gestor_por: string | null
          solicitante_id: string
        }
        Insert: {
          companero_id: string
          created_at?: string
          estado?: string
          fecha_companero: string
          fecha_solicitante: string
          id?: string
          motivo?: string | null
          negocio_id: string
          nota_rechazo?: string | null
          respondido_companero_at?: string | null
          respondido_gestor_at?: string | null
          respondido_gestor_por?: string | null
          solicitante_id: string
        }
        Update: {
          companero_id?: string
          created_at?: string
          estado?: string
          fecha_companero?: string
          fecha_solicitante?: string
          id?: string
          motivo?: string | null
          negocio_id?: string
          nota_rechazo?: string | null
          respondido_companero_at?: string | null
          respondido_gestor_at?: string | null
          respondido_gestor_por?: string | null
          solicitante_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "turnos_intercambio_companero_id_fkey"
            columns: ["companero_id"]
            isOneToOne: false
            referencedRelation: "profesionales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turnos_intercambio_solicitante_id_fkey"
            columns: ["solicitante_id"]
            isOneToOne: false
            referencedRelation: "profesionales"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      productos_con_stock: {
        Row: {
          activo: boolean | null
          capacidad_envase: number | null
          categoria: string | null
          codigo_barras: string | null
          coste_envase_cents: number | null
          coste_unidad_micros: number | null
          created_at: string | null
          descripcion: string | null
          dias_stock: number | null
          envases_cerrados: number | null
          id: string | null
          imagen_url: string | null
          iva_porcentaje: number | null
          negocio_id: string | null
          nombre: string | null
          precio_cents: number | null
          proveedor: string | null
          resto_abierto: number | null
          stock_actual: number | null
          stock_bajo: boolean | null
          stock_minimo: number | null
          stock_ultima_modificacion: string | null
          ubicacion: string | null
          unidad_medida: string | null
          updated_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _campana_audiencia: {
        Args: { p_canal: string; p_negocio: string; p_seg: Json }
        Returns: {
          cliente_id: string
          contacto: string
          nombre: string
        }[]
      }
      _campana_gestor: { Args: never; Returns: string }
      _lista_espera_mejor_candidato: {
        Args: {
          p_avisados: string[]
          p_inicio: string
          p_negocio: string
          p_profesional: string
          p_servicio: string
        }
        Returns: string
      }
      _lista_espera_ofrecer: {
        Args: {
          p_cand: string
          p_oferta: string
          p_pide_senal: boolean
          p_ventana: number
        }
        Returns: undefined
      }
      _lista_espera_ventana_texto: { Args: { p_min: number }; Returns: string }
      _upsert_hallazgo: {
        Args: {
          p_accion: Json
          p_count: number
          p_detalle: string
          p_entidad: string
          p_familia: string
          p_items: Json
          p_negocio: string
          p_resumen: string
          p_severidad: string
          p_tipo: string
        }
        Returns: number
      }
      abrir_caja: { Args: { p_fondo_inicial_cents?: number }; Returns: Json }
      acceso_salon_estado: { Args: never; Returns: Json }
      aceptar_presupuesto_publico: { Args: { p_token: string }; Returns: Json }
      actualizar_consentimiento_ia: {
        Args: {
          p_cliente_id: string
          p_consentimiento: boolean
          p_origen: string
          p_telefono?: string
        }
        Returns: undefined
      }
      actualizar_medida_producto: {
        Args: {
          p_capacidad_envase?: number
          p_coste_envase_cents?: number
          p_producto_id: string
          p_unidad_medida: string
        }
        Returns: Json
      }
      actualizar_mi_perfil_profesional: {
        Args: {
          p_email?: string
          p_especialidades?: string[]
          p_telefono?: string
        }
        Returns: {
          activo: boolean
          categoria: string | null
          color: string
          comision_pct: number | null
          created_at: string
          email: string | null
          especialidades: string[] | null
          foto_perfil: string | null
          id: string
          negocio_id: string
          nombre: string
          profile_id: string | null
          rol_acceso: string
          telefono: string | null
          tipo_relacion: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profesionales"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      actualizar_producto: {
        Args: {
          p_activo?: boolean
          p_categoria?: string
          p_codigo_barras?: string
          p_descripcion?: string
          p_imagen_url?: string
          p_iva_porcentaje?: number
          p_nombre?: string
          p_precio_cents?: number
          p_producto_id: string
          p_proveedor?: string
          p_stock_minimo?: number
        }
        Returns: Json
      }
      agenda_briefing: { Args: { p_scope?: string }; Returns: Json }
      agenda_briefing_operativa: {
        Args: { p_negocio: string; p_prof?: string; p_scope?: string }
        Returns: Json
      }
      anonimizar_cliente: { Args: { p_cliente_id: string }; Returns: Json }
      anular_cobro: {
        Args: { p_cita_id: string; p_motivo?: string }
        Returns: Json
      }
      anular_liquidacion: { Args: { p_liquidacion_id: string }; Returns: Json }
      aplicar_suscripcion_stripe: {
        Args: {
          p_estado?: string
          p_ia_nivel?: string
          p_periodo_fin?: string
          p_plan?: string
          p_profile_id?: string
          p_stripe_customer_id: string
          p_stripe_subscription_id?: string
        }
        Returns: string
      }
      asignar_candidato_hueco: {
        Args: { p_candidato_id: string; p_cita_id: string }
        Returns: Json
      }
      autocompletar_citas: { Args: never; Returns: Json }
      avisar_lista_espera_candidata: {
        Args: { p_cita_origen_id: string; p_lista_espera_id: string }
        Returns: Json
      }
      avisos_prueba_pendientes: {
        Args: never
        Returns: {
          dias_restantes: number
          email: string
          etapa: number
          etapas_marcar: number[]
          nombre_negocio: string
          profile_id: string
        }[]
      }
      buscar_salones_publico: {
        Args: {
          p_categoria?: string
          p_ciudad?: string
          p_lat?: number
          p_limit?: number
          p_lng?: number
          p_offset?: number
          p_texto?: string
        }
        Returns: Json
      }
      caducar_propuestas_cambio: { Args: never; Returns: number }
      caducar_pruebas_vencidas: { Args: never; Returns: number }
      caja_sesion_abierta: { Args: never; Returns: Json }
      calcular_comisiones_periodo: {
        Args: { p_desde: string; p_hasta: string; p_profesional_id: string }
        Returns: Json
      }
      campana_cancelar: {
        Args: { p_id: string }
        Returns: {
          canal: string
          created_at: string
          created_by: string | null
          encolada_en: string | null
          estado: string
          id: string
          mensaje: string
          negocio_id: string
          nombre: string
          segmento: Json
          total_destinatarios: number
        }
        SetofOptions: {
          from: "*"
          to: "campanas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      campana_contar: {
        Args: { p_canal: string; p_segmento: Json }
        Returns: number
      }
      campana_crear: {
        Args: {
          p_canal: string
          p_mensaje: string
          p_nombre: string
          p_segmento: Json
        }
        Returns: {
          canal: string
          created_at: string
          created_by: string | null
          encolada_en: string | null
          estado: string
          id: string
          mensaje: string
          negocio_id: string
          nombre: string
          segmento: Json
          total_destinatarios: number
        }
        SetofOptions: {
          from: "*"
          to: "campanas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      campana_encolar: {
        Args: { p_id: string }
        Returns: {
          canal: string
          created_at: string
          created_by: string | null
          encolada_en: string | null
          estado: string
          id: string
          mensaje: string
          negocio_id: string
          nombre: string
          segmento: Json
          total_destinatarios: number
        }
        SetofOptions: {
          from: "*"
          to: "campanas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      campana_marcar_enviado: {
        Args: { p_destinatario: string; p_estado?: string }
        Returns: Json
      }
      campanas_destinatarios_pendientes: {
        Args: { p_limit?: number }
        Returns: Json
      }
      cancelar_cita_publica: {
        Args: {
          p_canal?: string
          p_cita_id: string
          p_motivo?: string
          p_slug: string
          p_telefono: string
        }
        Returns: Json
      }
      cancelar_intercambio_turno: { Args: { p_id: string }; Returns: Json }
      candidatos_para_hueco: { Args: { p_cita_id: string }; Returns: Json }
      canjear_recompensa: {
        Args: {
          p_cita_id?: string
          p_cliente_id: string
          p_recompensa_id: string
        }
        Returns: Json
      }
      cerrar_caja: {
        Args: {
          p_contado_datafono_cents?: number
          p_contado_efectivo_cents: number
          p_notas?: string
        }
        Returns: Json
      }
      check_landing_rate_limit: { Args: { p_ip: string }; Returns: boolean }
      check_rate_limit: {
        Args: {
          p_clave: string
          p_cubo: string
          p_max: number
          p_minutos: number
        }
        Returns: boolean
      }
      chispa_tts_keepwarm: { Args: never; Returns: undefined }
      cita_producto_add: {
        Args: { p_cita_id: string; p_producto_id: string }
        Returns: undefined
      }
      cita_producto_remove: {
        Args: { p_cita_id: string; p_producto_id: string }
        Returns: undefined
      }
      cita_publica: {
        Args: { p_cita_id: string; p_slug: string; p_telefono: string }
        Returns: Json
      }
      citas_de_cliente: {
        Args: { p_slug: string; p_telefono: string }
        Returns: Json
      }
      citas_por_confirmar_telefono: {
        Args: { p_telefono: string }
        Returns: Json
      }
      citas_riesgo_no_show: {
        Args: { p_desde: string; p_hasta: string }
        Returns: {
          cita_id: string
          cliente_id: string
          inicio: string
          nivel: string
          no_shows: number
          nombre: string
          score: number
        }[]
      }
      ciudades_directorio_publico: { Args: never; Returns: Json }
      ciudades_externas_publico: { Args: never; Returns: Json }
      claim_referral: { Args: { p_code: string }; Returns: Json }
      clientes_en_riesgo_fuga: {
        Args: never
        Returns: {
          cliente_id: string
          dias_desde_ultima_visita: number
          frecuencia_dias: number
          nombre: string
          recompensa_nombre: string
          recompensa_sugerida_id: string
        }[]
      }
      clientes_riesgo_no_show: {
        Args: never
        Returns: {
          antiguedad_dias: number
          cancelaciones_tardias: number
          cliente_id: string
          nivel: string
          no_shows: number
          score: number
          total_citas: number
        }[]
      }
      completar_datos_pago_publico: {
        Args: {
          p_acepto?: boolean
          p_email?: string
          p_nombre: string
          p_telefono: string
          p_token: string
        }
        Returns: Json
      }
      confirmar_cita_cliente: {
        Args: { p_cita_id: string; p_telefono: string }
        Returns: Json
      }
      confirmar_cita_oferta: {
        Args: { p_cita_id: string; p_telefono: string }
        Returns: Json
      }
      consumir_bono_cita: {
        Args: {
          p_bono_id: string
          p_cita_id: string
          p_descuento_cents?: number
          p_lineas_extra?: Json
          p_metodo?: string
          p_propina_cents?: number
        }
        Returns: string
      }
      consumir_captcha_token: { Args: { p_token: string }; Returns: boolean }
      coste_por_unidad_micros: {
        Args: { p_producto_id: string }
        Returns: number
      }
      crear_cita_publica: {
        Args: {
          p_canal?: string
          p_captcha_token?: string
          p_consiente_ia?: boolean
          p_email?: string
          p_inicio: string
          p_nombre: string
          p_notas?: string
          p_profesional_id: string
          p_servicio_id: string
          p_slug: string
          p_telefono: string
        }
        Returns: Json
      }
      crear_cita_publica_cadena: {
        Args: {
          p_canal?: string
          p_captcha_token?: string
          p_consiente_ia?: boolean
          p_email?: string
          p_inicio: string
          p_nombre: string
          p_notas?: string
          p_profesional_id: string
          p_servicio_ids: string[]
          p_slug: string
          p_telefono: string
        }
        Returns: Json
      }
      crear_cita_publica_grupo: {
        Args: {
          p_asistentes: Json
          p_captcha_token?: string
          p_consentimiento_datos?: boolean
          p_inicio: string
          p_reservante_email: string
          p_reservante_nombre: string
          p_reservante_telefono: string
          p_slug: string
        }
        Returns: Json
      }
      crear_cobro_desde_cita: {
        Args: {
          p_cita_id: string
          p_datafono_cents?: number
          p_descuento_cents?: number
          p_efectivo_cents?: number
          p_lineas_extra?: Json
          p_metodo: string
          p_propina_cents?: number
        }
        Returns: string
      }
      crear_cobro_desde_presupuesto: {
        Args: {
          p_descuento_cents?: number
          p_metodo?: string
          p_presupuesto_id: string
          p_propina_cents?: number
        }
        Returns: string
      }
      crear_cobro_walkin: {
        Args: {
          p_cliente_id?: string
          p_descuento_cents?: number
          p_lineas: Json
          p_metodo: string
          p_profesional_id?: string
          p_propina_cents?: number
        }
        Returns: string
      }
      crear_factura_borrador: {
        Args: {
          p_cobro_id: string
          p_nif_receptor?: string
          p_nombre_receptor?: string
          p_tipo?: string
        }
        Returns: string
      }
      crear_mensaje_soporte: {
        Args: { p_asunto: string; p_mensaje: string }
        Returns: number
      }
      crear_producto: {
        Args: {
          p_categoria?: string
          p_codigo_barras?: string
          p_descripcion?: string
          p_imagen_url?: string
          p_inicial_unidades?: number
          p_iva_porcentaje?: number
          p_nombre: string
          p_precio_cents?: number
          p_proveedor?: string
          p_stock_minimo?: number
          p_ubicacion?: string
        }
        Returns: Json
      }
      crear_resena_publica: {
        Args: {
          p_autor_nombre: string
          p_comentario: string
          p_mecha_comentario?: string
          p_mecha_disponibilidad_puntuacion?: number
          p_mecha_facilidad_puntuacion?: number
          p_mecha_mejora_comentario?: string
          p_mecha_pagos_puntuacion?: number
          p_mecha_puntuacion?: number
          p_profesional_comentario?: string
          p_profesional_id?: string
          p_profesional_puntuacion?: number
          p_puntuacion: number
          p_salon_productos_puntuacion?: number
          p_salon_trato_puntuacion?: number
          p_servicio_id?: string
          p_slug: string
        }
        Returns: Json
      }
      crear_solicitud_publica: {
        Args: {
          p_email: string
          p_fecha_preferida?: string
          p_herramienta_actual?: string
          p_hora_preferida?: string
          p_meta?: Json
          p_nombre: string
          p_nota?: string
          p_num_profesionales?: string
          p_salon: string
          p_telefono: string
          p_tipo: string
        }
        Returns: Json
      }
      cumpleanos_para_felicitar: {
        Args: { p_fecha?: string }
        Returns: {
          anio: number
          cliente_id: string
          created_at: string
          descuento_pct: number
          estado: string
          id: string
          idioma: string | null
          negocio_id: string
          nombre: string | null
          sent_at: string | null
          telefono: string | null
          template: string
        }[]
        SetofOptions: {
          from: "*"
          to: "cumpleanos_avisos"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cupo_ia_disponible: {
        Args: { p_funcion: string; p_max_hora?: number }
        Returns: boolean
      }
      demo_visit_limit: { Args: never; Returns: number }
      demo_visits_status: { Args: never; Returns: Json }
      deposito_dinamico_cents: {
        Args: { p_cliente_id: string; p_servicio_id: string }
        Returns: number
      }
      desconectar_stripe: { Args: { p_negocio_id: string }; Returns: Json }
      disponibilidad_publica: {
        Args: {
          p_fecha: string
          p_profesional_id?: string
          p_servicio_id: string
          p_slug: string
        }
        Returns: {
          en_reposo: boolean
          profesional_id: string
          profesional_nombre: string
          reposo_disponible_min: number
          slot: string
        }[]
      }
      disponibilidad_publica_cadena: {
        Args: {
          p_fecha: string
          p_profesional_id?: string
          p_servicio_ids: string[]
          p_slug: string
        }
        Returns: {
          en_reposo: boolean
          profesional_id: string
          profesional_nombre: string
          reposo_disponible_min: number
          slot: string
        }[]
      }
      duracion_efectiva_profesional: {
        Args: {
          p_base_activa: number
          p_base_espera: number
          p_base_extra: number
          p_profesional_id: string
          p_servicio_id: string
        }
        Returns: {
          activa: number
          espera: number
          extra: number
          total: number
        }[]
      }
      eliminar_objetivo_profesional: { Args: { p_id: string }; Returns: Json }
      eliminar_producto: { Args: { p_producto_id: string }; Returns: Json }
      eliminar_propia_cuenta: { Args: never; Returns: boolean }
      enlace_pago_token: {
        Args: { p_cita_id: string; p_tipo?: string }
        Returns: string
      }
      enviar_mensaje_contacto_publico: {
        Args: {
          p_cuerpo: string
          p_email: string
          p_nombre: string
          p_slug: string
          p_telefono: string
        }
        Returns: Json
      }
      equipo_cuentas: {
        Args: never
        Returns: {
          apellido: string
          email: string
          estado: string
          id: string
          invitada_en: string
          nombre: string
          plan: string
          profesional_id: string
          profesional_nombre: string
          role: string
          ultimo_acceso: string
        }[]
      }
      equipo_jornada_ranking: {
        Args: { p_desde: string; p_hasta: string }
        Returns: Json
      }
      escanear_hallazgos_ahora: {
        Args: never
        Returns: {
          accion_sugerida: Json
          actualizado_en: string
          creado_en: string
          datos: Json
          detalle: string | null
          entidad: string | null
          entidad_id: string | null
          estado: string
          familia: string
          id: string
          negocio_id: string
          resuelto_en: string | null
          resumen: string
          severidad: string
          tipo: string
        }[]
        SetofOptions: {
          from: "*"
          to: "hallazgos_ia"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      exige_mi_negocio: {
        Args: { p_negocio_id: string; p_solo_gestor?: boolean }
        Returns: undefined
      }
      expirar_citas_sin_senal: { Args: { p_minutos?: number }; Returns: Json }
      exportar_datos_cliente: { Args: { p_cliente_id: string }; Returns: Json }
      exportar_datos_negocio: { Args: never; Returns: Json }
      fichar_jornada: {
        Args: {
          p_dispositivo?: string
          p_modalidad?: string
          p_nota?: string
          p_origen?: string
          p_profesional_id?: string
          p_tipo: string
        }
        Returns: Json
      }
      fusionar_clientes: {
        Args: { p_duplicado: string; p_maestro: string }
        Returns: Json
      }
      gen_referral_code: { Args: never; Returns: string }
      generar_liquidacion: {
        Args: {
          p_periodo_fin: string
          p_periodo_inicio: string
          p_profesional_id: string
        }
        Returns: Json
      }
      generar_negocio_id_unico: {
        Args: {
          p_codigo_postal?: string
          p_excluir_id?: string
          p_nombre_negocio: string
        }
        Returns: string
      }
      generar_registro_alta: {
        Args: { p_factura_id: string }
        Returns: {
          fechahora_gen: string
          huella: string
          num_serie_completo: string
          numero: number
        }[]
      }
      generar_registro_anulacion: {
        Args: { p_factura_id: string }
        Returns: string
      }
      get_my_referral_stats: { Args: never; Returns: Json }
      get_my_referrals: {
        Args: never
        Returns: {
          created_at: string
          nivel: number
          nombre_negocio: string
          paga: boolean
          plan: string
        }[]
      }
      guardar_conexion_stripe: {
        Args: { p_account_id: string; p_negocio_id: string }
        Returns: Json
      }
      guardar_objetivo_profesional: {
        Args: {
          p_bonus_cents?: number
          p_metrica: string
          p_objetivo_valor: number
          p_profesional_id: string
        }
        Returns: Json
      }
      guardar_pasarela_redsys: {
        Args: {
          p_fuc: string
          p_secret_key: string
          p_terminal: string
          p_test?: boolean
        }
        Returns: Json
      }
      guardar_pasarela_stripe: {
        Args: {
          p_publishable_key?: string
          p_secret_key: string
          p_webhook_secret?: string
        }
        Returns: Json
      }
      hallazgos_del_negocio: {
        Args: { p_incluir_cerrados?: boolean }
        Returns: {
          accion_sugerida: Json
          actualizado_en: string
          creado_en: string
          datos: Json
          detalle: string | null
          entidad: string | null
          entidad_id: string | null
          estado: string
          familia: string
          id: string
          negocio_id: string
          resuelto_en: string | null
          resumen: string
          severidad: string
          tipo: string
        }[]
        SetofOptions: {
          from: "*"
          to: "hallazgos_ia"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      horas_llamada_ocupadas: { Args: { p_fecha: string }; Returns: string[] }
      identificar_cliente: {
        Args: { p_slug: string; p_telefono: string }
        Returns: Json
      }
      importar_citas_csv: {
        Args: { p_canal?: string; p_filas: Json; p_negocio_id: string }
        Returns: Json
      }
      importe_senal_servicio: {
        Args: { p_servicio_id: string }
        Returns: number
      }
      informe_periodico_destinatarios: {
        Args: never
        Returns: {
          email: string
          negocio_id: string
          nombre_negocio: string
          profile_id: string
        }[]
      }
      informe_rango_periodo: {
        Args: { p_tipo: string }
        Returns: {
          desde: string
          hasta: string
        }[]
      }
      informe_z: { Args: { p_sesion_id: string }; Returns: Json }
      iniciar_captura_hold: {
        Args: {
          p_cita_id?: string
          p_importe_cents?: number
          p_pago_id?: string
        }
        Returns: Json
      }
      iniciar_cobro_online: {
        Args: {
          p_cita_id: string
          p_descuento_cents?: number
          p_metodo?: string
          p_propina_cents?: number
        }
        Returns: Json
      }
      iniciar_cobro_terminal: {
        Args: {
          p_cita_id: string
          p_descuento_cents?: number
          p_propina_cents?: number
        }
        Returns: Json
      }
      iniciar_liberacion_hold: {
        Args: { p_cita_id?: string; p_pago_id?: string }
        Returns: Json
      }
      iniciar_reembolso_cobro: {
        Args: { p_cobro_id: string; p_importe_cents?: number }
        Returns: Json
      }
      is_shared_demo_visitor: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      is_team_member: { Args: never; Returns: boolean }
      jornada_config: { Args: never; Returns: Json }
      jornada_contexto: {
        Args: never
        Returns: {
          es_gestor: boolean
          negocio_id: string
          nombre: string
          profesional_id: string
          role: string
          uid: string
        }[]
      }
      jornada_estado: { Args: { p_profesional_id?: string }; Returns: Json }
      jornada_registro: {
        Args: {
          p_desde: string
          p_hasta: string
          p_incluir_anulados?: boolean
          p_profesional_id?: string
        }
        Returns: Json
      }
      jornada_resolver_profesional: {
        Args: {
          p_es_gestor: boolean
          p_mi_ficha: string
          p_negocio: string
          p_pedido: string
          p_uid: string
        }
        Returns: string
      }
      jornada_totales: {
        Args: { p_desde: string; p_hasta: string; p_profesional_id?: string }
        Returns: Json
      }
      jornada_tramos: {
        Args: {
          p_desde: string
          p_hasta: string
          p_negocio: string
          p_profesional?: string
          p_zona?: string
        }
        Returns: {
          clase: string
          dia: string
          en_curso: boolean
          fin: string
          incidencia: boolean
          ini: string
          minutos: number
          profesional_id: string
        }[]
      }
      jornada_verificar_integridad: { Args: never; Returns: Json }
      lista_espera_avisos_pendientes: {
        Args: { p_limit?: number }
        Returns: Json
      }
      lista_espera_unirse_publica: {
        Args: {
          p_cliente_nombre: string
          p_consentimiento_datos?: boolean
          p_desde?: string
          p_franja?: string
          p_hasta?: string
          p_profesional_id?: string
          p_servicio_id?: string
          p_slug: string
          p_telefono: string
        }
        Returns: Json
      }
      listar_clientes_ia: {
        Args: {
          p_limite?: number
          p_negocio: string
          p_orden?: string
          p_segmento?: string
        }
        Returns: Json
      }
      listar_correcciones_jornada: {
        Args: { p_estado?: string; p_limit?: number; p_profesional_id?: string }
        Returns: Json
      }
      listar_intercambios_turno: { Args: never; Returns: Json }
      marcar_cita_no_show: { Args: { p_cita_id: string }; Returns: Json }
      marcar_cumpleanos_enviado: { Args: { p_ids: string[] }; Returns: number }
      marcar_descuento_referido_aplicado: {
        Args: { p_aplicado: boolean; p_profile: string }
        Returns: undefined
      }
      marcar_hallazgo: {
        Args: { p_estado: string; p_id: string }
        Returns: Json
      }
      marcar_liquidacion_pagada: {
        Args: { p_liquidacion_id: string }
        Returns: Json
      }
      marcar_lista_espera_aviso_enviado: {
        Args: { p_id: string }
        Returns: Json
      }
      marcar_notificacion_enviada: {
        Args: { p_cita_id: string; p_tipo: string }
        Returns: Json
      }
      marcar_notificacion_hallazgo_enviada: {
        Args: { p_canal?: string; p_id: string }
        Returns: Json
      }
      marcar_presupuesto_enviado: {
        Args: { p_canal: string; p_presupuesto_id: string }
        Returns: Json
      }
      matching_lista_espera: { Args: { p_cita_id: string }; Returns: Json }
      mi_jornada_resumen: {
        Args: { p_desde: string; p_hasta: string; p_profesional_id?: string }
        Returns: Json
      }
      mint_ticket_verifactu: { Args: { p_cobro_id: string }; Returns: Json }
      mis_objetivos_progreso: { Args: never; Returns: Json }
      modificar_cita_publica: {
        Args: {
          p_canal?: string
          p_cita_id: string
          p_nuevo_inicio: string
          p_nuevo_profesional_id?: string
          p_slug: string
          p_telefono: string
        }
        Returns: Json
      }
      my_app_role: { Args: never; Returns: string }
      my_negocio_id: { Args: never; Returns: string }
      my_negocio_id_text: { Args: never; Returns: string }
      negocio_contacto_publico: { Args: { p_slug: string }; Returns: Json }
      normalizar_telefono: { Args: { p: string }; Returns: string }
      notificaciones_hallazgos_pendientes: {
        Args: { p_limit?: number }
        Returns: Json
      }
      notificaciones_pendientes: {
        Args: { p_limit?: number; p_recordatorio_horas?: number }
        Returns: Json
      }
      objetivo_valor_actual: {
        Args: {
          p_desde: string
          p_hasta: string
          p_metrica: string
          p_negocio: string
          p_profesional_id: string
          p_profile_id: string
        }
        Returns: number
      }
      objetivos_negocio_progreso: { Args: never; Returns: Json }
      obtener_auditoria_historica: {
        Args: {
          p_desde?: string
          p_hasta?: string
          p_limit?: number
          p_modulo?: string
        }
        Returns: Json
      }
      obtener_categorias_productos: { Args: never; Returns: Json }
      obtener_estadisticas_mecha: { Args: never; Returns: Json }
      obtener_inventario: {
        Args: { p_categoria?: string; p_solo_activos?: boolean }
        Returns: Json
      }
      obtener_liquidaciones: {
        Args: {
          p_estado?: string
          p_negocio_id?: string
          p_profesional_id?: string
        }
        Returns: Json
      }
      obtener_logros_desbloqueados: {
        Args: { p_cliente_id: string }
        Returns: Json
      }
      obtener_movimientos_inventario: {
        Args: {
          p_desde?: string
          p_hasta?: string
          p_limit?: number
          p_producto_id?: string
          p_tipo?: string
        }
        Returns: Json
      }
      obtener_nivel_cliente: { Args: { p_cliente_id: string }; Returns: Json }
      obtener_producto: { Args: { p_producto_id: string }; Returns: Json }
      obtener_recompensas_negocio: {
        Args: { p_negocio_id?: string; p_solo_activas?: boolean }
        Returns: Json
      }
      pago_info_publica: { Args: { p_token: string }; Returns: Json }
      pasarela_redsys_secret: {
        Args: { p_negocio_id: string }
        Returns: string
      }
      pasarela_stripe_account: {
        Args: { p_negocio_id: string }
        Returns: string
      }
      pasarela_stripe_secret: {
        Args: { p_negocio_id: string }
        Returns: string
      }
      pasarela_stripe_webhook_secret: {
        Args: { p_negocio_id: string }
        Returns: string
      }
      perfil_riesgo_cliente: {
        Args: {
          p_cliente_id: string
          p_umbral_alto?: number
          p_umbral_fiable?: number
        }
        Returns: string
      }
      plan_del_negocio: { Args: { p_negocio_id: string }; Returns: string }
      planes_ia_expirar: { Args: { p_negocio?: string }; Returns: number }
      planes_ia_marcar: {
        Args: { p_estado: string; p_plan_id: string; p_resultado?: string }
        Returns: Json
      }
      portal_dias_disponibles: {
        Args: {
          p_dias?: number
          p_profesional_id?: string
          p_servicio_id: string
          p_slug: string
        }
        Returns: {
          dia: string
        }[]
      }
      portal_dias_disponibles_cadena: {
        Args: {
          p_dias?: number
          p_profesional_id?: string
          p_servicio_ids: string[]
          p_slug: string
        }
        Returns: {
          dia: string
        }[]
      }
      portal_info: { Args: { p_slug: string }; Returns: Json }
      presupuesto_enviar_mensaje_publico: {
        Args: { p_cuerpo: string; p_tipo: string; p_token: string }
        Returns: Json
      }
      presupuesto_publico: { Args: { p_token: string }; Returns: Json }
      presupuestos_pendientes_envio: {
        Args: { p_limit?: number }
        Returns: Json
      }
      procesar_alertas_fuga: { Args: never; Returns: Json }
      procesar_hallazgos_negocio: {
        Args: { p_negocio: string }
        Returns: number
      }
      procesar_hallazgos_todos: { Args: never; Returns: Json }
      procesar_lista_espera: { Args: never; Returns: Json }
      productos_stock_bajo: { Args: never; Returns: Json }
      profesional_ofrece_servicio: {
        Args: { p_profesional_id: string; p_servicio_id: string }
        Returns: boolean
      }
      proponer_cambio_cita: {
        Args: {
          p_cita_id: string
          p_inicio_propuesto: string
          p_margen_reaccion_min?: number
        }
        Returns: Json
      }
      rate_limit_ok: {
        Args: {
          p_bucket: string
          p_clave: string
          p_max: number
          p_ventana: string
        }
        Returns: boolean
      }
      recalcular_sugerencias_servicios: {
        Args: { p_negocio?: string }
        Returns: number
      }
      recompute_referral_chain: {
        Args: { p_profile: string }
        Returns: undefined
      }
      recompute_referral_discount: {
        Args: { p_profile: string }
        Returns: undefined
      }
      record_signup_signal: {
        Args: { p_fingerprint?: string }
        Returns: undefined
      }
      recurso_hay_hueco: {
        Args: {
          p_desde: string
          p_excluir_cita?: string
          p_hasta: string
          p_tipo: string
        }
        Returns: boolean
      }
      recurso_tramo_de_cita: {
        Args: { p_cita_id: string }
        Returns: {
          desde: string
          hasta: string
          tipo: string
        }[]
      }
      recursos_capacidad: { Args: { p_tipo: string }; Returns: number }
      recursos_ocupados: {
        Args: {
          p_desde: string
          p_excluir_cita?: string
          p_hasta: string
          p_tipo: string
        }
        Returns: number
      }
      referral_downline: {
        Args: { p_max_depth?: number; p_root: string }
        Returns: {
          id: string
          nivel: number
        }[]
      }
      referral_paga: {
        Args: { p_estado: string; p_plan: string }
        Returns: boolean
      }
      referral_upline: {
        Args: { p_max_depth?: number; p_node: string }
        Returns: {
          id: string
          nivel: number
        }[]
      }
      registrar_accion_chispa: {
        Args: {
          p_estado_previo: Json
          p_negocio_id: string
          p_reversible?: boolean
          p_target_id?: string
          p_target_label?: string
          p_tipo_accion: string
          p_usuario_id: string
        }
        Returns: string
      }
      registrar_auditoria_ia: {
        Args: {
          p_contexto?: Json
          p_coste_usd?: number
          p_error_mensaje?: string
          p_exito?: boolean
          p_funcion_ia: string
          p_latencia_ms?: number
          p_modelo: string
          p_negocio_id: string
          p_superficie?: string
          p_tokens_input?: number
          p_tokens_output?: number
          p_usuario_id: string
        }
        Returns: string
      }
      registrar_aviso_fuga: {
        Args: { p_cliente_id: string; p_recompensa_id?: string }
        Returns: Json
      }
      registrar_captura_hold: {
        Args: { p_importe_cents?: number; p_pago_id: string }
        Returns: undefined
      }
      registrar_cobro_online: {
        Args: { p_metodo?: string; p_pago_id: string }
        Returns: string
      }
      registrar_consumo_cita: {
        Args: { p_cantidad: number; p_cita_id: string; p_producto_id: string }
        Returns: Json
      }
      registrar_conversacion_ia: {
        Args: {
          p_canal: string
          p_cita_id?: string
          p_resumen?: string
          p_slug: string
          p_telefono: string
          p_transcripcion?: Json
        }
        Returns: Json
      }
      registrar_error_cliente: {
        Args: {
          p_mensaje: string
          p_navegador?: string
          p_origen?: string
          p_pila?: string
          p_ruta?: string
          p_tipo?: string
        }
        Returns: undefined
      }
      registrar_evento_auditoria: {
        Args: { p_detalles?: Json; p_modulo: string; p_tipo_evento: string }
        Returns: Json
      }
      registrar_hold_colocado: {
        Args: { p_pago_id: string; p_payment_intent: string }
        Returns: undefined
      }
      registrar_liberacion_hold: {
        Args: { p_pago_id: string }
        Returns: undefined
      }
      registrar_movimiento_inventario: {
        Args: {
          p_motivo?: string
          p_notas?: string
          p_producto_id: string
          p_referencia_id?: string
          p_referencia_tipo?: string
          p_tipo: string
          p_unidades: number
        }
        Returns: Json
      }
      registrar_reembolso: {
        Args: {
          p_importe_cents: number
          p_payment_intent: string
          p_refund_id: string
        }
        Returns: string
      }
      registrar_respuesta_aeat: {
        Args: {
          p_aeat_estado: string
          p_csv?: string
          p_error_codigo?: string
          p_error_desc?: string
          p_factura_id: string
          p_payload_xml?: string
          p_qr_url?: string
          p_respuesta?: Json
        }
        Returns: undefined
      }
      requerir_pago_total_cita: {
        Args: {
          p_cita_id: string
          p_descuento_cents?: number
          p_metodo?: string
          p_propina_cents?: number
        }
        Returns: {
          cita_id: string | null
          cliente_id: string | null
          created_at: string
          estado: string
          id: string
          importe_cents: number
          metadata: Json
          metodo: string | null
          moneda: string
          negocio_id: string
          paid_at: string | null
          pasarela: string | null
          pasarela_ref: string | null
          tipo: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "pagos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      requerir_senal_cita: {
        Args: { p_cita_id: string }
        Returns: {
          cita_id: string | null
          cliente_id: string | null
          created_at: string
          estado: string
          id: string
          importe_cents: number
          metadata: Json
          metodo: string | null
          moneda: string
          negocio_id: string
          paid_at: string | null
          pasarela: string | null
          pasarela_ref: string | null
          tipo: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "pagos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_ip: { Args: never; Returns: string }
      resembrar_demo: { Args: never; Returns: string }
      resenas_por_profesional: {
        Args: { p_slug: string }
        Returns: {
          media: number
          profesional_id: string
          profesional_nombre: string
          total: number
        }[]
      }
      resenas_publicas: { Args: { p_slug: string }; Returns: Json }
      resolver_correccion_jornada: {
        Args: {
          p_aprobar: boolean
          p_id: string
          p_nota?: string
          p_profesional_id?: string
        }
        Returns: Json
      }
      resolver_enlace_pago: { Args: { p_token: string }; Returns: string }
      resolver_enlace_pago_full: {
        Args: { p_token: string }
        Returns: {
          cita_id: string
          tipo: string
        }[]
      }
      responder_intercambio_companero: {
        Args: { p_aceptar: boolean; p_id: string; p_nota?: string }
        Returns: Json
      }
      responder_intercambio_gestor: {
        Args: { p_aprobar: boolean; p_id: string; p_nota?: string }
        Returns: Json
      }
      responder_propuesta_cambio: {
        Args: {
          p_acepta: boolean
          p_propuesta_id: string
          p_slug: string
          p_telefono: string
        }
        Returns: Json
      }
      revisar_hueco_lista_espera: {
        Args: {
          p_negocio_id: string
          p_origen_cita_id: string
          p_profesional_id: string
          p_servicio_id: string
          p_slot_fin: string
          p_slot_fin_activa: string
          p_slot_fin_espera: string
          p_slot_inicio: string
        }
        Returns: Json
      }
      riesgo_no_show_cliente: { Args: { p_cliente_id: string }; Returns: Json }
      rpc_borrar_eventos_rgpd: {
        Args: { p_entidad: string; p_entidad_id: string; p_negocio_id: string }
        Returns: undefined
      }
      rpc_clientes_toca_recompra: {
        Args: { p_negocio_id?: string }
        Returns: {
          dias_desde_ultima_visita: number
          frecuencia_dias: number
          id: string
          nombre: string
        }[]
      }
      salon_directorio_publico: { Args: { p_slug: string }; Returns: Json }
      salones_externos_publico: {
        Args: {
          p_ciudad?: string
          p_limit?: number
          p_offset?: number
          p_texto?: string
        }
        Returns: Json
      }
      set_acceso_salon_modo: { Args: { p_modo: string }; Returns: Json }
      set_member_role: {
        Args: { new_role: string; target_user_id: string }
        Returns: {
          apellido: string | null
          avatar_url: string | null
          cobro_manual: boolean
          cobro_manual_en: string | null
          cobro_manual_nota: string | null
          cobro_manual_por: string | null
          cobro_manual_previo: string | null
          codigo_postal: string | null
          codigo_referido: string | null
          created_at: string
          demo_visits_used: number
          descuento_pct: number
          descuento_referido_aplicado: boolean
          email: string
          es_cuenta_demo: boolean
          ia_nivel: string
          id: string
          meses_gratis_canjeados: number
          meses_gratis_ganados: number
          negocio_id: string | null
          nombre: string
          nombre_negocio: string | null
          paginas_manual_vistas: Json
          periodo_fin: string | null
          phone: string | null
          plan: string
          privacy_accepted_at: string | null
          privacy_policy_version: string | null
          referido_en: string | null
          referido_por: string | null
          role: string
          signup_fingerprint: string | null
          signup_ip: string | null
          signup_ua: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          suscripcion_estado: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_negocio_config_key: {
        Args: { p_clave: string; p_negocio_id: string; p_valor: Json }
        Returns: undefined
      }
      set_pin_propietario: { Args: { p_pin: string }; Returns: undefined }
      sincronizar_plan_negocio: {
        Args: { p_negocio_id: string }
        Returns: number
      }
      solicitar_correccion_jornada: {
        Args: {
          p_fichaje_id?: string
          p_marcado_at?: string
          p_modalidad?: string
          p_motivo: string
          p_profesional_id?: string
          p_tipo?: string
          p_tipo_solicitud: string
        }
        Returns: Json
      }
      solicitar_intercambio_turno: {
        Args: {
          p_companero_id: string
          p_fecha_companero: string
          p_fecha_solicitante: string
          p_motivo?: string
        }
        Returns: Json
      }
      staff_add_member: {
        Args: { member_email: string; member_name?: string }
        Returns: {
          created_at: string
          email: string
          nombre: string | null
        }
        SetofOptions: {
          from: "*"
          to: "staff"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      staff_auditoria_completa: {
        Args: { p_dias?: number; p_negocio_id: string }
        Returns: {
          accion: string
          detalles: Json
          entidad: string
          entidad_id: string
          fecha: string
          metadata: Json
          resumen: string
          tipo_fuente: string
          usuario_email: string
          usuario_id: string
          usuario_nombre: string
        }[]
      }
      staff_auditoria_tokens: {
        Args: { p_dias?: number; p_negocio_id?: string }
        Returns: {
          coste_total_usd: number
          ejecuciones: number
          funcion_ia: string
          modelo: string
          negocio_id: string
          negocio_nombre: string
          tokens_total: number
          usuario_email: string
          usuario_id: string
          usuario_nombre: string
        }[]
      }
      staff_canjear_meses_referido: {
        Args: { p_meses: number; p_profile: string }
        Returns: Json
      }
      staff_delete_account: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      staff_delete_account_by_email: {
        Args: { target_email: string }
        Returns: undefined
      }
      staff_emails: { Args: never; Returns: string[] }
      staff_errores_cliente: {
        Args: {
          p_dias?: number
          p_estado?: string
          p_limit?: number
          p_origen?: string
          p_tipo?: string
        }
        Returns: {
          estado: string
          huella: string
          mensaje: string
          notas_staff: string
          origen: string
          pila: string
          primera_vez: string
          resuelto_en: string
          resuelto_por: string
          ruta: string
          salones: number
          tipo: string
          ultima_vez: string
          veces: number
        }[]
      }
      staff_extend_trial: {
        Args: { extra_days: number; target_user_id: string }
        Returns: {
          apellido: string | null
          avatar_url: string | null
          cobro_manual: boolean
          cobro_manual_en: string | null
          cobro_manual_nota: string | null
          cobro_manual_por: string | null
          cobro_manual_previo: string | null
          codigo_postal: string | null
          codigo_referido: string | null
          created_at: string
          demo_visits_used: number
          descuento_pct: number
          descuento_referido_aplicado: boolean
          email: string
          es_cuenta_demo: boolean
          ia_nivel: string
          id: string
          meses_gratis_canjeados: number
          meses_gratis_ganados: number
          negocio_id: string | null
          nombre: string
          nombre_negocio: string | null
          paginas_manual_vistas: Json
          periodo_fin: string | null
          phone: string | null
          plan: string
          privacy_accepted_at: string | null
          privacy_policy_version: string | null
          referido_en: string | null
          referido_por: string | null
          role: string
          signup_fingerprint: string | null
          signup_ip: string | null
          signup_ua: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          suscripcion_estado: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      staff_gasto_ia_llamadas: {
        Args: { p_dias?: number; p_limite?: number; p_negocio_id: string }
        Returns: {
          coste_usd: number
          creado: string
          error_mensaje: string
          exito: boolean
          funcion_ia: string
          id: string
          latencia_ms: number
          modelo: string
          superficie: string
          tokens_input: number
          tokens_output: number
          usuario_email: string
          usuario_nombre: string
        }[]
      }
      staff_gasto_ia_resumen: {
        Args: { p_dias?: number }
        Returns: {
          coste_usd: number
          funciones_distintas: number
          llamadas: number
          llamadas_fallidas: number
          modelos: string[]
          negocio_id: string
          negocio_nombre: string
          primera: string
          tokens_input: number
          tokens_output: number
          ultima: string
        }[]
      }
      staff_grant_full_access: {
        Args: {
          new_negocio_id?: string
          new_plan?: string
          target_user_id: string
        }
        Returns: {
          apellido: string | null
          avatar_url: string | null
          cobro_manual: boolean
          cobro_manual_en: string | null
          cobro_manual_nota: string | null
          cobro_manual_por: string | null
          cobro_manual_previo: string | null
          codigo_postal: string | null
          codigo_referido: string | null
          created_at: string
          demo_visits_used: number
          descuento_pct: number
          descuento_referido_aplicado: boolean
          email: string
          es_cuenta_demo: boolean
          ia_nivel: string
          id: string
          meses_gratis_canjeados: number
          meses_gratis_ganados: number
          negocio_id: string | null
          nombre: string
          nombre_negocio: string | null
          paginas_manual_vistas: Json
          periodo_fin: string | null
          phone: string | null
          plan: string
          privacy_accepted_at: string | null
          privacy_policy_version: string | null
          referido_en: string | null
          referido_por: string | null
          role: string
          signup_fingerprint: string | null
          signup_ip: string | null
          signup_ua: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          suscripcion_estado: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      staff_marcar_error: {
        Args: { p_estado: string; p_huella: string; p_notas?: string }
        Returns: Json
      }
      staff_marcar_soporte: {
        Args: { p_estado: string; p_id: number }
        Returns: undefined
      }
      staff_mensajes_soporte: {
        Args: { p_estado?: string; p_limit?: number }
        Returns: {
          asunto: string
          autor_email: string
          autor_nombre: string
          creado_en: string
          estado: string
          id: number
          mensaje: string
          negocio_id: string
          negocio_nombre: string
        }[]
      }
      staff_remove_member: { Args: { member_email: string }; Returns: boolean }
      staff_resumen_salones: {
        Args: never
        Returns: {
          cuentas: number
          limite_profesionales: number
          modo: string
          negocio_id: string
          profesionales_activos: number
          profesionales_totales: number
          tiene_pin: boolean
        }[]
      }
      staff_salud_envios: { Args: never; Returns: Json }
      staff_set_acceso_modo: {
        Args: { p_modo: string; p_negocio_id: string }
        Returns: Json
      }
      staff_set_cobro_manual: {
        Args: { p_nota?: string; p_pagado: boolean; p_profile: string }
        Returns: Json
      }
      staff_set_demo_visits: {
        Args: { new_used: number; target_user_id: string }
        Returns: {
          apellido: string | null
          avatar_url: string | null
          cobro_manual: boolean
          cobro_manual_en: string | null
          cobro_manual_nota: string | null
          cobro_manual_por: string | null
          cobro_manual_previo: string | null
          codigo_postal: string | null
          codigo_referido: string | null
          created_at: string
          demo_visits_used: number
          descuento_pct: number
          descuento_referido_aplicado: boolean
          email: string
          es_cuenta_demo: boolean
          ia_nivel: string
          id: string
          meses_gratis_canjeados: number
          meses_gratis_ganados: number
          negocio_id: string | null
          nombre: string
          nombre_negocio: string | null
          paginas_manual_vistas: Json
          periodo_fin: string | null
          phone: string | null
          plan: string
          privacy_accepted_at: string | null
          privacy_policy_version: string | null
          referido_en: string | null
          referido_por: string | null
          role: string
          signup_fingerprint: string | null
          signup_ip: string | null
          signup_ua: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          suscripcion_estado: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      staff_set_ia_nivel: {
        Args: { new_nivel: string; target_user_id: string }
        Returns: {
          apellido: string | null
          avatar_url: string | null
          cobro_manual: boolean
          cobro_manual_en: string | null
          cobro_manual_nota: string | null
          cobro_manual_por: string | null
          cobro_manual_previo: string | null
          codigo_postal: string | null
          codigo_referido: string | null
          created_at: string
          demo_visits_used: number
          descuento_pct: number
          descuento_referido_aplicado: boolean
          email: string
          es_cuenta_demo: boolean
          ia_nivel: string
          id: string
          meses_gratis_canjeados: number
          meses_gratis_ganados: number
          negocio_id: string | null
          nombre: string
          nombre_negocio: string | null
          paginas_manual_vistas: Json
          periodo_fin: string | null
          phone: string | null
          plan: string
          privacy_accepted_at: string | null
          privacy_policy_version: string | null
          referido_en: string | null
          referido_por: string | null
          role: string
          signup_fingerprint: string | null
          signup_ip: string | null
          signup_ua: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          suscripcion_estado: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      staff_set_limite_profesionales: {
        Args: { p_limite: number; p_negocio_id: string }
        Returns: Json
      }
      staff_set_plan: {
        Args: { new_plan: string; target_user_id: string }
        Returns: {
          apellido: string | null
          avatar_url: string | null
          cobro_manual: boolean
          cobro_manual_en: string | null
          cobro_manual_nota: string | null
          cobro_manual_por: string | null
          cobro_manual_previo: string | null
          codigo_postal: string | null
          codigo_referido: string | null
          created_at: string
          demo_visits_used: number
          descuento_pct: number
          descuento_referido_aplicado: boolean
          email: string
          es_cuenta_demo: boolean
          ia_nivel: string
          id: string
          meses_gratis_canjeados: number
          meses_gratis_ganados: number
          negocio_id: string | null
          nombre: string
          nombre_negocio: string | null
          paginas_manual_vistas: Json
          periodo_fin: string | null
          phone: string | null
          plan: string
          privacy_accepted_at: string | null
          privacy_policy_version: string | null
          referido_en: string | null
          referido_por: string | null
          role: string
          signup_fingerprint: string | null
          signup_ip: string | null
          signup_ua: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          suscripcion_estado: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      staff_set_referral_applied: {
        Args: { p_applied: boolean; p_profile: string }
        Returns: Json
      }
      staff_set_role: {
        Args: { new_role: string; target_user_id: string }
        Returns: {
          apellido: string | null
          avatar_url: string | null
          cobro_manual: boolean
          cobro_manual_en: string | null
          cobro_manual_nota: string | null
          cobro_manual_por: string | null
          cobro_manual_previo: string | null
          codigo_postal: string | null
          codigo_referido: string | null
          created_at: string
          demo_visits_used: number
          descuento_pct: number
          descuento_referido_aplicado: boolean
          email: string
          es_cuenta_demo: boolean
          ia_nivel: string
          id: string
          meses_gratis_canjeados: number
          meses_gratis_ganados: number
          negocio_id: string | null
          nombre: string
          nombre_negocio: string | null
          paginas_manual_vistas: Json
          periodo_fin: string | null
          phone: string | null
          plan: string
          privacy_accepted_at: string | null
          privacy_policy_version: string | null
          referido_en: string | null
          referido_por: string | null
          role: string
          signup_fingerprint: string | null
          signup_ip: string | null
          signup_ua: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          suscripcion_estado: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      staff_signup_clusters: {
        Args: never
        Returns: {
          cuentas: number
          negocios: string
          signal: string
          tipo: string
        }[]
      }
      sugerencias_portal: {
        Args: { p_servicio_ids: string[]; p_slug: string }
        Returns: {
          descripcion: string
          duracion_min: number
          id: string
          motivo: string
          nombre: string
          precio: number
          prepago: boolean
        }[]
      }
      terminal_contexto: { Args: never; Returns: Json }
      upsert_config_fiscal: {
        Args: {
          p_aplica_verifactu?: boolean
          p_domicilio_fiscal?: string
          p_modalidad?: string
          p_negocio_id: string
          p_nif?: string
          p_proveedor_fiscal?: string
          p_razon_social?: string
          p_regimen_iva?: string
          p_serie_defecto?: string
          p_territorio?: string
          p_tipo_iva_defecto?: number
        }
        Returns: {
          activo: boolean
          aplica_verifactu: boolean
          apoderamiento_ok: boolean
          created_at: string
          declaracion_responsable_ok: boolean
          domicilio_fiscal: string | null
          entorno_aeat: string
          modalidad: string
          negocio_id: string
          nif: string | null
          num_serie_formato: string
          proveedor_estado: string
          proveedor_fiscal: string | null
          razon_social: string | null
          regimen_iva: string
          representacion_doc_url: string | null
          representacion_ok: boolean
          serie_defecto: string
          territorio: string
          tipo_iva_defecto: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "config_fiscal"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_hallazgo_agenda: {
        Args: {
          p_count: number
          p_detalle: string
          p_items: Json
          p_negocio: string
          p_resumen: string
          p_severidad: string
          p_tipo: string
        }
        Returns: number
      }
      use_demo_visit: { Args: never; Returns: Json }
      vender_bono:
        | {
            Args: {
              p_cliente_id: string
              p_metodo: string
              p_precio_cents: number
              p_servicio_id: string
              p_sesiones: number
            }
            Returns: string
          }
        | {
            Args: {
              p_cliente_id: string
              p_metodo: string
              p_precio_cents: number
              p_servicio_id: string
              p_sesiones: number
            }
            Returns: string
          }
      verificar_logros_cliente: {
        Args: { p_cliente_id: string }
        Returns: Json
      }
      verificar_pin_propietario: { Args: { p_pin: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
