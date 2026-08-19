// Catálogo de servicios técnicos especializados para Programmatic SEO Local.
// Define especificaciones técnicas, precios medios en España, duraciones,
// pasos de tratamiento, cuidados posteriores, generador de FAQs y Offers Schema.org.

export const SERVICIOS_TECNICOS = [
  {
    slug: 'balayage',
    nombre: 'Balayage',
    nombreCompleto: 'Balayage y Mechas Degradadas a Mano Alzada',
    tipoSchema: ['HairSalon', 'BeautySalon'],
    categoria: 'Coloración y Mechas',
    precioDesde: 75,
    precioHasta: 160,
    precioMedio: 95,
    duracionMinutos: 150,
    rangoDuracion: '2h - 3h 30min',
    subtitulo: 'Degradado luminoso y natural sin efecto raíz',
    descripcion: 'El balayage es la técnica de coloración francesa por excelencia: el color se aplica a mano alzada con pincel sobre mechones seleccionados, creando un degradado suave y multidimensional desde la raíz hasta las puntas. Aporta luz y movimiento al cabello con un crecimiento imperceptible que espacia las visitas al salón.',
    beneficios: [
      'Crecimiento natural sin corte de raíz ni efecto bloque.',
      'Personalización absoluta según el tono de piel y forma del rostro (Hair Contouring).',
      'Menor mantenimiento: retoque recomendado cada 4 a 6 meses.',
      'Máxima luminosidad y dimensión sin sobrecargar la fibra capilar.'
    ],
    pasos: [
      { paso: 'Diagnóstico capilar', detalle: 'Evaluación del estado de la fibra, fondo de aclaración y diseño personalizado del visagismo.' },
      { paso: 'Técnica a mano alzada', detalle: 'Aplicación artística del decolorante con pincel barriendo hacia medios y puntas.' },
      { paso: 'Fase de reposo térmico', detalle: 'Control visual de la aclaración para preservar la elasticidad y salud del cabello.' },
      { paso: 'Matiz tonalizante Gloss', detalle: 'Neutralización de reflejos indeseados y aporte de brillo espejo con pH ácido.' },
      { paso: 'Sellado y peinado final', detalle: 'Tratamiento sellador de cutícula y peinado con ondas desenfadadas para resaltar el relieve.' }
    ],
    cuidados: [
      'Utilizar champú sin sulfatos y mascarilla hidratante específica para cabello teñido.',
      'Aplicar protector térmico antes de usar secador o plancha.',
      'Matizar en el salón cada 6-8 semanas para mantener el tono frío o cálido perfecto.'
    ],
    generarFaqs: (ciudad, provincia, precioMedio, duracion) => [
      {
        q: `¿Cuánto cuesta hacerse un balayage en ${ciudad}?`,
        a: `En ${ciudad}, el precio medio de un balayage completo con matiz oscila entre los 75 € y 160 € (precio promedio de ${precioMedio} €). El coste final depende del largo, la densidad de tu melena y si se combina con corte o tratamiento reconstructor.`
      },
      {
        q: `¿Cuánto tiempo dura la sesión de balayage en salones de ${ciudad}?`,
        a: `Una sesión completa de balayage dura aproximadamente ${duracion} minutos (entre 2 y 3 horas y media). Incluye diagnóstico, aplicación minuciosa a mano alzada, tiempo de exposición, matizado en lavacabezas y peinado final.`
      },
      {
        q: `¿Qué diferencia hay entre balayage y mechas tradicionales o babylights?`,
        a: `Las mechas tradicionales y babylights parten desde la misma raíz con papel de aluminio, generando una línea marcada al crecer. El balayage se difumina progresivamente desde unos centímetros por debajo de la raíz, logrando una transición mucho más sutil y un mantenimiento semestral.`
      },
      {
        q: `¿Cada cuánto tiempo hay que retocar el balayage?`,
        a: `Gracias a su degradado progresivo, el balayage solo requiere retoque en el salón cada 4 a 6 meses. Se recomienda realizar una sesión rápida de matiz o gloss cada 6 a 8 semanas para reavivar el brillo del color.`
      },
      {
        q: `¿Cómo reservar cita para balayage en ${ciudad} con confirmación inmediata?`,
        a: `A través de Mecha puedes ver los salones especialistas en balayage en ${ciudad}, consultar precios cerrados, ver valoraciones reales y reservar directamente en la agenda online del estilista sin esperas telefónicas.`
      }
    ],
    generarOffers: (ciudad, path) => [
      {
        name: `Balayage Completo + Matiz Gloss en ${ciudad}`,
        description: `Técnica artesanal de balayage a mano alzada con matiz tonalizante de brillo y peinado profesional en ${ciudad}.`,
        price: '95.00',
        duration: 150
      },
      {
        name: `Retoque Balayage Media Melena en ${ciudad}`,
        description: `Mantenimiento de zonas de luz frontales y contorno de rostro en ${ciudad}.`,
        price: '75.00',
        duration: 110
      },
      {
        name: `Pack Balayage Premium + Tratamiento Olaplex en ${ciudad}`,
        description: `Balayage completo con protección intensiva de enlaces capilares Olaplex, matiz y peinado.`,
        price: '135.00',
        duration: 180
      }
    ]
  },
  {
    slug: 'mechas-babylights',
    nombre: 'Mechas Babylights',
    nombreCompleto: 'Mechas Babylights e Iluminación Micro-Fina',
    tipoSchema: ['HairSalon', 'BeautySalon'],
    categoria: 'Coloración y Mechas',
    precioDesde: 60,
    precioHasta: 130,
    precioMedio: 80,
    duracionMinutos: 135,
    rangoDuracion: '1h 45min - 2h 45min',
    subtitulo: 'Micro-reflejos ultra sutiles desde la raíz',
    descripcion: 'Las mechas babylights son reflejos microscópicos tejidos velo a velo desde la raíz con papeles térmicos. Imitan los reflejos naturales y luminosos que el sol crea en el cabello de los niños, aportando un rubio o castaño multidimensional con máxima sensación de volumen.',
    beneficios: [
      'Iluminación homogénea y multidimensional desde el nacimiento del cabello.',
      'Sensación de mayor densidad y volumen visual en cabellos finos.',
      'Transición suave y sofisticada que disimula las primeras canas.',
      'Adaptable tanto a rubios nórdicos como a tonos caramelo, miel y avellana.'
    ],
    pasos: [
      { paso: 'Diseño del mapa de mechas', detalle: 'Selección estratégica de secciones milimétricas según el corte y remolinos.' },
      { paso: 'Micro-tejido con papel térmico', detalle: 'Aislamiento de hebras ultra finas para una aclaración homogénea y limpia.' },
      { paso: 'Tiempo de exposición controlado', detalle: 'Vigilancia precisa para alcanzar la altura de tono deseada sin agredir la hebra.' },
      { paso: 'Baño de color o tóner matizador', detalle: 'Fijación del matiz exacto y sellado del brillo en el lavacabezas.' },
      { paso: 'Peinado con acabado pulido', detalle: 'Styling con brushing o plancha para lucir el destello de los reflejos.' }
    ],
    cuidados: [
      'Lavar con champú morado o azul una vez por semana para neutralizar tonos anaranjados.',
      'Nutrir con aceites de argán o camelia en medios y puntas.',
      'Retocar raíz aproximadamente cada 8 a 10 semanas.'
    ],
    generarFaqs: (ciudad, provincia, precioMedio, duracion) => [
      {
        q: `¿Cuánto cuestan las mechas babylights en ${ciudad}?`,
        a: `El precio medio de las mechas babylights en los salones de ${ciudad} oscila entre los 60 € y 130 € (promedio de ${precioMedio} €), incluyendo el matizado tonalizante y el lavado acondicionador.`
      },
      {
        q: `¿Qué diferencia hay entre mechas babylights y balayage?`,
        a: `Las babylights se tejen de forma ultra fina desde la raíz aportando luminosidad global y uniforme, mientras que el balayage se enfoca en degradar el color hacia medios y puntas dejando la raíz en su tono natural.`
      },
      {
        q: `¿Dañan las babylights el cabello fino o castigado?`,
        a: `Al tomar secciones de cabello extremadamente finas, la exposición al decolorante es más breve y controlada. Los salones de Mecha en ${ciudad} aplican protectores de enlaces para preservar la salud capilar durante todo el proceso.`
      },
      {
        q: `¿Cuánto dura la sesión en peluquería para babylights?`,
        a: `La sesión suele durar en torno a ${duracion} minutos (2 horas aprox.), ya que el proceso de tejer las micro-secciones con papel de plata requiere gran destreza y precisión técnica.`
      },
      {
        q: `¿Cómo reservar las mejores especialistas en babylights en ${ciudad}?`,
        a: `Con Mecha puedes comparar los salones con mejores valoraciones en mechas babylights en ${ciudad}, consultar su catálogo de trabajos y reservar cita previa online 24/7 sin llamadas.`
      }
    ],
    generarOffers: (ciudad, path) => [
      {
        name: `Mechas Babylights Completas + Matiz en ${ciudad}`,
        description: `Micro-reflejos luminosos desde la raíz en toda la cabeza con matizado gloss y peinado en ${ciudad}.`,
        price: '80.00',
        duration: 135
      },
      {
        name: `Babylights Corona y Contorno en ${ciudad}`,
        description: `Iluminación focalizada en la parte superior y frontal del rostro en ${ciudad}.`,
        price: '60.00',
        duration: 90
      }
    ]
  },
  {
    slug: 'alisado-keratina',
    nombre: 'Alisado de Keratina',
    nombreCompleto: 'Alisado de Keratina Profesional y Tratamiento Antiencrespamiento',
    tipoSchema: ['HairSalon', 'BeautySalon'],
    categoria: 'Tratamientos y Alisados',
    precioDesde: 85,
    precioHasta: 220,
    precioMedio: 130,
    duracionMinutos: 180,
    rangoDuracion: '2h 30min - 4h',
    subtitulo: 'Cabello 100% liso, sin encrespamiento y brillo espejo',
    descripcion: 'El alisado de keratina profesional es un tratamiento termoactivo que rellena la estructura capilar con keratina vegetal, aminoácidos y proteínas esenciales. Elimina el encrespamiento, relaja la onda o rizo y sella la cutícula, dejando el pelo suave, dócil y brillante durante 3 a 6 meses.',
    beneficios: [
      'Eliminación total del frizz incluso en días de alta humedad o lluvia.',
      'Reducción de más del 70% del tiempo de secado y peinado diario en casa.',
      'Aporte intensivo de nutrición, suavidad y brillo satinado.',
      'Fórmulas orgánicas 0% formol seguras y respetuosas con el cuero cabelludo.'
    ],
    pasos: [
      { paso: 'Lavado clarificante profundo', detalle: 'Apertura de cutícula con champú purificante para eliminar residuos e impurezas.' },
      { paso: 'Aplicación mecha a mecha', detalle: 'Distribución homogénea de la loción de keratina respetando 1 cm del cuero cabelludo.' },
      { paso: 'Tiempo de reposo de absorción', detalle: 'Pausa de 30 a 50 minutos para que los aminoácidos penetren en el córtex.' },
      { paso: 'Secado y sellado térmico con plancha', detalle: 'Sellado con pasadas precisas de plancha a temperatura calibrada para fijar la keratina.' },
      { paso: 'Aclarado y mascarilla neutralizante', detalle: 'Equilibrado de pH y secado al aire para comprobar el efecto liso perfecto.' }
    ],
    cuidados: [
      'Utilizar siempre champús y acondicionadores sin sales ni sulfatos (Sodium Chloride Free).',
      'Secar con secador dando calor ligero para reactivar la memoria térmica del tratamiento.',
      'Evitar mojar o recoger el pelo en coletas durante las primeras 48 horas si el fabricante lo indica.'
    ],
    generarFaqs: (ciudad, provincia, precioMedio, duracion) => [
      {
        q: `¿Cuánto cuesta un alisado de keratina en ${ciudad}?`,
        a: `En ${ciudad}, el precio del alisado de keratina profesional varía entre los 85 € y 220 € (media de ${precioMedio} €). El precio depende de la longitud del cabello (corto, medio o extra largo) y la tecnología empleada (keratina orgánica, nanoplastia o taninoplastia).`
      },
      {
        q: `¿Cuánto tiempo dura el efecto del alisado de keratina?`,
        a: `El efecto liso y anti-frizz dura entre 3 y 6 meses, dependiendo de la porosidad inicial del cabello y de si se usan champús libres de sulfatos y sales en casa.`
      },
      {
        q: `¿El alisado de keratina estropea el pelo o lo debilita?`,
        a: `No. Al contrario de los desrizados químicos antiguos con amoniaco, la keratina es una proteína reparadora que rellena las fisuras del cabello. Además, las fórmulas modernas son 100% libres de formol.`
      },
      {
        q: `¿Se puede teñir el pelo después de un alisado de keratina?`,
        a: `Se recomienda teñir el pelo una semana antes o esperar 10 a 14 días después del alisado para evitar que el proceso de sellado altere los pigmentos del color.`
      },
      {
        q: `¿Cómo reservar cita para alisado de keratina en ${ciudad}?`,
        a: `En Mecha puedes consultar los salones con mejores reseñas en alisado y tratamientos en ${ciudad}, revisar el tipo de producto que utilizan y reservar tu cita online con confirmación garantizada.`
      }
    ],
    generarOffers: (ciudad, path) => [
      {
        name: `Alisado de Keratina Orgánica en ${ciudad}`,
        description: `Tratamiento completo de alisado anti-frizz libre de formol con keratina vegetal y sellado térmico en ${ciudad}.`,
        price: '130.00',
        duration: 180
      },
      {
        name: `Tratamiento Botox Anti-Frizz Express en ${ciudad}`,
        description: `Sellado de cutícula y disciplina antiencrespamiento para cabello corto o media melena en ${ciudad}.`,
        price: '85.00',
        duration: 120
      }
    ]
  },
  {
    slug: 'barberias-degradado',
    aliasSlugs: ['barberias/degradado'],
    nombre: 'Corte Degradado / Fade',
    nombreCompleto: 'Corte Degradado Fade en Barbería Profesional',
    tipoSchema: ['HairSalon', 'BeautySalon'],
    categoria: 'Barbería y Peluquería Masculina',
    precioDesde: 14,
    precioHasta: 30,
    precioMedio: 18,
    duracionMinutos: 40,
    rangoDuracion: '30min - 50min',
    subtitulo: 'Transición milimétrica y perfilado con navaja',
    descripcion: 'El corte degradado (fade) es el servicio estrella de la barbería moderna: una transición continua y sin marcas desde el afeitado al ras en patillas y nuca hasta el largo superior. Incluye perfilado a navaja, lavado con champú refrescante y peinado con cera o pomada mate.',
    beneficios: [
      'Líneas limpias, simétricas y nítidas que realzan las facciones masculinas.',
      'Variedad de estilos adaptados a cada cabeza: Low Fade, Mid Fade, High Fade, Taper y Skin Fade.',
      'Acabado afeitadora (shaver) o navaja tradicional para máxima duración del apurado.',
      'Asesoramiento de visagismo y producto de peinado adecuado para tu tipo de pelo.'
    ],
    pasos: [
      { paso: 'Consulta de estilo y visagismo', detalle: 'Elección de la altura del degradado (Low, Mid, High) según la forma craneal.' },
      { paso: 'Desbaste y delimitación de líneas guía', detalle: 'Corte con máquina recortadora y establecimiento de la línea base cero.' },
      { paso: 'Borrado de líneas y graduación', detalle: 'Trabajo milimétrico con peines intermedios y juego de palanca clipper.' },
      { paso: 'Corte superior y texturizado', detalle: 'Corte a tijera o navaja en la parte superior para dar textura y volumen.' },
      { paso: 'Perfilado a navaja y peinado', detalle: 'Contornos nítidos con navaja de barbero, loción aftershave y pomada fijadora.' }
    ],
    cuidados: [
      'Para mantener el degradado perfecto, se recomienda repasar cada 10 a 15 días.',
      'Lavar a diario con champú suave y usar fijador mate soluble en agua.',
      'Aplicar tónico capilar para activar la circulación del cuero cabelludo.'
    ],
    generarFaqs: (ciudad, provincia, precioMedio, duracion) => [
      {
        q: `¿Cuánto cuesta un corte degradado fade en barbería en ${ciudad}?`,
        a: `En las barberías de ${ciudad}, el corte degradado tiene un precio medio de ${precioMedio} € (rango habitual de 14 € a 30 € según incluya lavado, peinado o arreglo de barba).`
      },
      {
        q: `¿Qué tipos de degradado (fade) hacen los barberos en ${ciudad}?`,
        a: `Los estilos más solicitados son Skin Fade (afeitado a cero en la base), Mid Fade (degradado a media altura equilibrado), Low Fade (degradado sutil bajo) y Taper Fade (degradado solo en patillas y nuca).`
      },
      {
        q: `¿Cuánto dura la cita de corte degradado en barbería?`,
        a: `La cita de corte fade dura entre 30 y 45 minutos (media de ${duracion} min), dedicando tiempo minucioso al borrado de líneas y al perfilado de contornos a navaja.`
      },
      {
        q: `¿Puedo combinar el corte degradado con arreglo de barba en ${ciudad}?`,
        a: `Sí. En Mecha puedes reservar packs combinados de Corte Degradado + Arreglo de Barba con toalla caliente y perfilado a navaja en una sola reserva.`
      },
      {
        q: `¿Cómo encontrar y reservar en las mejores barberías de ${ciudad}?`,
        a: `A través de Mecha puedes ver las mejores barberías de ${ciudad} en tiempo real, filtrar por fotos de trabajos, leer valoraciones de clientes y reservar cita online 24/7 sin esperas.`
      }
    ],
    generarOffers: (ciudad, path) => [
      {
        name: `Corte Degradado Skin Fade en ${ciudad}`,
        description: `Corte degradado a máquina con afeitadora/shaver, corte a tijera superior, perfilado a navaja y peinado en ${ciudad}.`,
        price: '18.00',
        duration: 40
      },
      {
        name: `Pack Corte Fade + Arreglo de Barba en ${ciudad}`,
        description: `Corte degradado completo más ritual de barba con toalla caliente, hidratación y perfilado a navaja en ${ciudad}.`,
        price: '28.00',
        duration: 60
      }
    ]
  },
  {
    slug: 'afeitado-clasico',
    nombre: 'Afeitado Clásico',
    nombreCompleto: 'Afeitado Clásico Tradicional a Navaja y Ritual de Toalla Caliente',
    tipoSchema: ['HairSalon', 'BeautySalon'],
    categoria: 'Barbería y Cuidado Masculino',
    precioDesde: 12,
    precioHasta: 26,
    precioMedio: 16,
    duracionMinutos: 35,
    rangoDuracion: '25min - 45min',
    subtitulo: 'Ritual sensorial tradicional con navaja y vapor',
    descripcion: 'El afeitado clásico a navaja es una experiencia de cuidado y relajación para el hombre. Incluye preparación de la piel con aceite pre-shave, aplicación de toallas calientes al vapor, enjabonado con brocha y jabón enriquecido, afeitado a navaja de doble pasada y masaje final con toalla fría y loción balsámica.',
    beneficios: [
      'Apurado perfecto sin irritaciones ni pelos enquistados.',
      'Exfoliación suave de las células muertas de la piel del rostro.',
      'Experiencia de bienestar y relajación gracias al contraste térmico de toallas.',
      'Hidratación profunda con cosmética masculina premium.'
    ],
    pasos: [
      { paso: 'Preparación pre-shave', detalle: 'Masaje facial con aceites esenciales de eucalipto o sándalo para ablandar la barba.' },
      { paso: 'Toalla caliente aromatizada', detalle: 'Vapor relajante que abre los poros y suaviza la fibra del vello facial.' },
      { paso: 'Enjabonado tradicional', detalle: 'Montado de espuma densa con brocha de tejón y jabón artesanal en bol de cerámica.' },
      { paso: 'Afeitado a navaja de barbero', detalle: 'Pasadas firmes a favor y a contrapelo con hoja desechable esterilizada.' },
      { paso: 'Toalla fría y bálsamo aftershave', detalle: 'Cierre de poros con toalla helada, piedra de alumbre y masaje hidratante.' }
    ],
    cuidados: [
      'No aplicar colonias alcohólicas directamente sobre el rostro recién afeitado.',
      'Mantener la piel hidratada con crema o gel calmante con aloe vera.',
      'Exfoliar la piel 2 veces por semana para prevenir el vello encarnado.'
    ],
    generarFaqs: (ciudad, provincia, precioMedio, duracion) => [
      {
        q: `¿Cuánto cuesta un afeitado clásico a navaja en ${ciudad}?`,
        a: `En las barberías tradicionales de ${ciudad}, el afeitado clásico con toalla caliente cuesta entre 12 € y 26 € (precio medio de ${precioMedio} €).`
      },
      {
        q: `¿En qué consiste el ritual de afeitado con toalla caliente?`,
        a: `Es un tratamiento en 5 pasos: toalla caliente con vapor aromático para abrir poros, espuma con brocha, afeitado a navaja en dos pasadas, toalla fría para tonificar y bálsamo aftershave con masaje facial relajante.`
      },
      {
        q: `¿Es recomendable el afeitado a navaja si tengo la piel sensible?`,
        a: `Sí. La preparación térmica con toallas calientes y los aceites protectores ablandan el pelo de modo que la navaja se desliza sin tirones, reduciendo notablemente las rojeces y cortes frente a las cuchillas multihoja desechables.`
      },
      {
        q: `¿Cuánto tiempo dura la sesión de afeitado en la barbería?`,
        a: `La sesión completa dura unos ${duracion} minutos, combinando la técnica de afeitado con momentos de descanso y cuidado de la piel.`
      },
      {
        q: `¿Cómo reservar cita para afeitado tradicional en ${ciudad}?`,
        a: `En Mecha puedes localizar las barberías más especializadas en afeitado a navaja en ${ciudad} y reservar tu hora al instante desde tu móvil.`
      }
    ],
    generarOffers: (ciudad, path) => [
      {
        name: `Afeitado Clásico Tradicional a Navaja en ${ciudad}`,
        description: `Ritual de afeitado completo con toalla caliente, doble pasada a navaja y masaje balsámico en ${ciudad}.`,
        price: '16.00',
        duration: 35
      },
      {
        name: `Ritual Barba Spa + Mascarilla Facial en ${ciudad}`,
        description: `Afeitado clásico combinado con exfoliación e hidratación profunda de la piel en ${ciudad}.`,
        price: '24.00',
        duration: 50
      }
    ]
  },
  {
    slug: 'unas-semipermanentes',
    nombre: 'Uñas Semipermanentes',
    nombreCompleto: 'Manicura Rusa y Esmaltado de Uñas Semipermanentes',
    tipoSchema: ['BeautySalon', 'HairSalon'],
    categoria: 'Manicura y Estética de Uñas',
    precioDesde: 18,
    precioHasta: 45,
    precioMedio: 26,
    duracionMinutos: 60,
    rangoDuracion: '45min - 1h 30min',
    subtitulo: 'Manicura de precisión con brillo intacto 3-4 semanas',
    descripcion: 'El servicio de uñas semipermanentes combina la manicura rusa o combinada (limpieza exhaustiva de cutículas con torno) y la aplicación de esmalte en gel con curado en lámpara LED/UV. Aporta máxima durabilidad, brillo de larga duración y resistencia sin descascarillarse.',
    beneficios: [
      'Esmalte impecable y brillante durante 3 a 4 semanas sin saltar.',
      'Limpieza profunda del contorno de la uña con manicura rusa.',
      'Refuerzo con base rubber o nivelación para evitar roturas en uñas débiles.',
      'Centenares de colores en tendencia y opciones de nail art creativo.'
    ],
    pasos: [
      { paso: 'Retirada de esmalte previo', detalle: 'Retirada cuidadosa con torno de carburo o fresas cerámicas sin limar la uña natural.' },
      { paso: 'Manicura rusa o combinada', detalle: 'Limpieza y pulido de cutículas con fresas diamantadas y corte con tijera rusa.' },
      { paso: 'Preparación y base niveladora', detalle: 'Deshidratador, primer y capa de base rubber para crear la curvatura perfecta.' },
      { paso: 'Esmaltado en 2 capas', detalle: 'Aplicación precisa de color de alta pigmentación bajo cutícula y secado en lámpara LED.' },
      { paso: 'Top Coat Gloss y aceite nutritivo', detalle: 'Sellado con brillo ultra resistente y masaje con aceite de cutículas.' }
    ],
    cuidados: [
      'Aplicar aceite de cutículas todas las noches para mantener la hidratación.',
      'Usar guantes para fregar o manipular productos químicos de limpieza.',
      'No arrancar ni despegar el esmalte en casa para no levantar capas de queratina natural.'
    ],
    generarFaqs: (ciudad, provincia, precioMedio, duracion) => [
      {
        q: `¿Cuánto cuesta hacerse las uñas semipermanentes en ${ciudad}?`,
        a: `En ${ciudad}, el precio de la manicura con esmalte semipermanente oscila entre los 18 € y 45 € (media de ${precioMedio} €). El precio varía si incluye manicura rusa, retirada de esmalte anterior o nail art.`
      },
      {
        q: `¿Cuánto tiempo duran las uñas semipermanentes?`,
        a: `La manicura semipermanente se mantiene perfecta e intacta entre 3 y 4 semanas, momento en el que se recomienda rellenar o retirar debido al crecimiento natural de la uña.`
      },
      {
        q: `¿Qué es la manicura rusa y por qué es mejor?`,
        a: `La manicura rusa utiliza un torno con fresas especiales para limpiar la cutícula al milímetro. Esto permite aplicar el esmalte justo bajo el pliegue de la piel, retrasando la aparición de la raíz al crecer la uña.`
      },
      {
        q: `¿Daña el esmalte semipermanente la uña natural?`,
        a: `No si se aplica y retira por profesionales cualificados. El daño solo ocurre si se arrancan los esmaltes en casa a la fuerza o si se lima en exceso la placa ungueal.`
      },
      {
        q: `¿Cómo reservar en los mejores salones de uñas de ${ciudad}?`,
        a: `En Mecha puedes explorar los salones de manicura y uñas con mejores valoraciones en ${ciudad}, consultar fotos de sus decoraciones y reservar al instante con confirmación por WhatsApp.`
      }
    ],
    generarOffers: (ciudad, path) => [
      {
        name: `Manicura Rusa + Esmaltado Semipermanente en ${ciudad}`,
        description: `Tratamiento completo de cutículas con torno, base niveladora rubber y esmaltado semipermanente en ${ciudad}.`,
        price: '26.00',
        duration: 60
      },
      {
        name: `Retirada + Manicura Semipermanente con Refuerzo en ${ciudad}`,
        description: `Retirada segura de set anterior, manicura combinada y refuerzo para uñas quebradizas en ${ciudad}.`,
        price: '32.00',
        duration: 75
      }
    ]
  },
  {
    slug: 'tratamiento-olaplex',
    nombre: 'Tratamiento Olaplex',
    nombreCompleto: 'Tratamiento Olaplex Reconstructor de Enlaces Capilares',
    tipoSchema: ['HairSalon', 'BeautySalon'],
    categoria: 'Salud y Reconstrucción Capilar',
    precioDesde: 25,
    precioHasta: 65,
    precioMedio: 38,
    duracionMinutos: 45,
    rangoDuracion: '30min - 1h',
    subtitulo: 'Reparación molecular de puentes de disulfuro',
    descripcion: 'El tratamiento Olaplex de salón es el sistema de reconstrucción capilar patentado número uno a nivel mundial. Su molécula activa repara y reconecta los enlaces de disulfuro rotos por procesos químicos (tintes, decoloraciones, alisados) y térmicos (planchas y secadores), devolviendo la fuerza y elasticidad al pelo desde el interior.',
    beneficios: [
      'Reparación real a nivel molecular, no un recubrimiento cosmético temporal.',
      'Permite decolorar o teñir minimizando drásticamente la rotura capilar.',
      'Recupera la textura, fuerza, brillo y movimiento del cabello castigado.',
      'Apto para todo tipo de pelos: lisos, rizados, finos, gruesos o decolorados.'
    ],
    pasos: [
      { paso: 'Diagnóstico de rotura', detalle: 'Comprobación de la elasticidad y porosidad de la fibra capilar.' },
      { paso: 'Aplicación Olaplex Nº1 Bond Multiplier', detalle: 'Infusión pura concentrada en lavacabezas para reconectar enlaces rotos.' },
      { paso: 'Aplicación Olaplex Nº2 Bond Perfector', detalle: 'Crema acondicionadora de salón que sella y maximiza la reparación interna.' },
      { paso: 'Lavado con Olaplex Nº4 y Nº5', detalle: 'Champú y acondicionador hidratantes con pH equilibrado y sin sulfatos.' },
      { paso: 'Sellado con Olaplex Nº7 Bonding Oil', detalle: 'Gotas de aceite ultraligero que aportan protección térmica y brillo cegador.' }
    ],
    cuidados: [
      'Complementar en casa con Olaplex Nº3 Hair Perfector una vez por semana antes del lavado.',
      'Evitar el uso de planchas a temperaturas superiores a 180ºC en cabellos muy aclarados.',
      'Repetir la sesión en salón antes y después de cada cambio de color importante.'
    ],
    generarFaqs: (ciudad, provincia, precioMedio, duracion) => [
      {
        q: `¿Cuánto cuesta un tratamiento Olaplex en salón en ${ciudad}?`,
        a: `En ${ciudad}, el tratamiento intensivo Olaplex Nº1 y Nº2 en peluquería tiene un precio entre los 25 € y 65 € (media de ${precioMedio} €). También se ofrece como suplemento protector en decoloraciones por unos 15 € a 25 €.`
      },
      {
        q: `¿Qué hace exactamente Olaplex en el cabello?`,
        a: `Olaplex contiene una molécula patentada (Bis-Aminopropyl Diglycol Dimaleate) que busca y reconecta los puentes de disulfuro rotos en la queratina del pelo, restaurando la estructura interna del cabello dañado.`
      },
      {
        q: `¿Se puede hacer Olaplex el mismo día de las mechas o tinte?`,
        a: `Sí, es el momento ideal. Los estilistas de Mecha en ${ciudad} mezclan Olaplex Nº1 directamente con la decoloración o el tinte para proteger el pelo mientras aclara, aplicando luego el Nº2 en lavacabezas.`
      },
      {
        q: `¿Cuántas sesiones de Olaplex se necesitan para recuperar el pelo?`,
        a: `Desde la primera sesión se nota un cabello notablemente más resistente y suave. Para cabellos muy dañados o chiclosos por decoloraciones agresivas, se recomienda un ciclo de 2 a 3 sesiones espaciadas cada 15 días.`
      },
      {
        q: `¿Cómo reservar tratamiento Olaplex en salones certificados de ${ciudad}?`,
        a: `A través de Mecha puedes encontrar salones oficiales que trabajan con la línea profesional de Olaplex en ${ciudad} y reservar cita online en tiempo real.`
      }
    ],
    generarOffers: (ciudad, path) => [
      {
        name: `Tratamiento Reconstructor Olaplex Nº1 + Nº2 en ${ciudad}`,
        description: `Sesión intensiva en lavacabezas de reconstrucción de enlaces moleculares con lavado y peinado en ${ciudad}.`,
        price: '38.00',
        duration: 45
      },
      {
        name: `Pack Corte + Tratamiento Olaplex Restaurador en ${ciudad}`,
        description: `Corte de saneamiento de puntas combinado con terapia intensiva Olaplex en ${ciudad}.`,
        price: '58.00',
        duration: 70
      }
    ]
  },
  {
    slug: 'botox-capilar',
    nombre: 'Botox Capilar',
    nombreCompleto: 'Botox Capilar Hidratante, Rejuvenecedor y Rellenador',
    tipoSchema: ['HairSalon', 'BeautySalon'],
    categoria: 'Salud y Rejuvenecimiento Capilar',
    precioDesde: 35,
    precioHasta: 85,
    precioMedio: 55,
    duracionMinutos: 75,
    rangoDuracion: '1h - 1h 45min',
    subtitulo: 'Relleno de fibra con ácido hialurónico y colágeno',
    descripcion: 'El botox capilar es un tratamiento intensivo 100% libre de químicos agresivos formulado con ácido hialurónico, colágeno hidrolizado, pantenol y vitaminas. Rellena las cutículas porosas y envejecidas, devolviendo la densidad, el grosor y el brillo natural al cabello sin cambiar su textura (no alisa el rizo).',
    beneficios: [
      'Rellena la fibra capilar desde el interior aportando cuerpo y grosor.',
      'Hidratación profunda que resucita melenas secas, deshidratadas o quebradizas.',
      'Conserva la forma natural del cabello: define los rizos y suaviza los lisos.',
      'Aporta un tacto de seda y un brillo reflectante desde la primera aplicación.'
    ],
    pasos: [
      { paso: 'Lavado alcalino suave', detalle: 'Apertura de cutículas para facilitar la absorción del concentrado vitamínico.' },
      { paso: 'Aplicación mecha a mecha', detalle: 'Distribución meticulosa del cóctel de ácido hialurónico y colágeno.' },
      { paso: 'Aporte de calor térmico', detalle: 'Pausa de 20 a 30 minutos con gorro térmico o vapor para fijar los nutrientes.' },
      { paso: 'Aclarado parcial', detalle: 'Retirada del exceso de producto reteniendo los activos en el córtex capilar.' },
      { paso: 'Sellado con secador y brushing', detalle: 'Peinado pulido para sellar la cutícula con calor moderado.' }
    ],
    cuidados: [
      'Lavar con champús hidratantes con pH neutro o ácido.',
      'Aplicar una mascarilla nutritiva una vez por semana.',
      'Repetir la sesión cada 6 a 8 semanas para mantener el cabello con cuerpo y vitalidad.'
    ],
    generarFaqs: (ciudad, provincia, precioMedio, duracion) => [
      {
        q: `¿Cuánto cuesta un tratamiento de botox capilar en ${ciudad}?`,
        a: `En ${ciudad}, el tratamiento de botox capilar profesional cuesta entre 35 € y 85 € (media de ${precioMedio} €), dependiendo de la densidad y largo de la melena.`
      },
      {
        q: `¿El botox capilar alisa el pelo o cambia su forma?`,
        a: `No. El botox capilar no contiene agentes alisadores. Es un tratamiento de nutrición y relleno: a los cabellos rizados les aporta definición sin frizz, y a los cabellos lisos les da cuerpo, soltura y peso.`
      },
      {
        q: `¿Cuánto tiempo duran los resultados del botox capilar?`,
        a: `Los resultados de suavidad, brillo y densidad duran entre 1 y 2 meses (4 a 8 semanas), desvaneciéndose de forma gradual con los lavados.`
      },
      {
        q: `¿Qué diferencia hay entre botox capilar y alisado de keratina?`,
        a: `El alisado de keratina modifica la estructura de la fibra para dejar el pelo completamente liso y dura de 3 a 6 meses. El botox capilar es una hidratación extrema antiedad que rellena la fibra sin modificar el patrón de onda o rizo.`
      },
      {
        q: `¿Cómo reservar cita de botox capilar en ${ciudad}?`,
        a: `Con Mecha puedes localizar las peluquerías expertas en salud capilar y botox en ${ciudad}, comparar opiniones y reservar cita online al instante.`
      }
    ],
    generarOffers: (ciudad, path) => [
      {
        name: `Tratamiento Botox Capilar Reconstructor en ${ciudad}`,
        description: `Terapia intensiva antiedad con ácido hialurónico, colágeno, secado y peinado en ${ciudad}.`,
        price: '55.00',
        duration: 75
      },
      {
        name: `Pack Botox Capilar + Corte de Puntas en ${ciudad}`,
        description: `Tratamiento de relleno capilar combinado con corte y peinado con brillo en ${ciudad}.`,
        price: '72.00',
        duration: 90
      }
    ]
  }
];
