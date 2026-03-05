export interface TransferData {
  razonSocial: string;
  rut: string;
  banco: string;
  tipoCuenta: string;
  numeroCuenta: string;
  email: string;
}

export interface CommuneInfo {
  displayName: string;
  study: string; // paragraphs separated by \n\n, ## for headings
  reservaAmount: string;
  transferData: TransferData;
  docsIndependiente: string[];
  docsDependiente: string[];
}

const BANCO_CHILE: TransferData = {
  razonSocial: 'Proppi SpA',
  rut: '77.875.395-2',
  banco: 'Banco de Chile',
  tipoCuenta: 'Cuenta Corriente',
  numeroCuenta: '00-765-02719-04',
  email: 'contacto@proppi.cl',
};

export const COMMUNE_INFO: Record<string, CommuneInfo> = {
  'la cisterna': {
    displayName: 'La Cisterna',
    reservaAmount: '$100.000',
    transferData: BANCO_CHILE,
    study: `## Ubicación y conectividad que empujan la demanda
La Cisterna está en el eje Gran Avenida – Américo Vespucio, con acceso directo a autopistas y a la Estación Intermodal La Cisterna, que integra Metro, buses y comercio en un mismo punto. Esto facilita los traslados y sostiene una demanda de arriendo constante en el entorno.

## Servicios a la mano
**Colegios:** la comuna cuenta con 61 establecimientos educacionales, clave para familias que arrendan cerca del colegio. **Farmacias:** 25–30 farmacias operativas (Cruz Verde, Salcobrand, Ahumada y varias independientes). **Centros comerciales:** polo comercial relevante en la Intermodal La Cisterna, con 100+ tiendas, más strip centers a lo largo de Gran Avenida.

## Crecimiento y plusvalía
Para evaluar escenarios de inversión, consideramos una plusvalía de **6% anual** como supuesto conservador. Esto, combinado con la alta demanda de arriendo por conectividad, favorece horizontes de 3–5 años para estrategias de renta y potencial revalorización del activo.

## Déficit habitacional
La Cisterna presenta un déficit habitacional cuantitativo de ~1.919 hogares (6,9% de sus hogares). La necesidad de vivienda es real en el territorio, lo que sostiene la demanda estructural de arriendo.

## Proyectos y mejoras en carpeta
Modernización continua de la Estación de Intercambio Modal La Cisterna. **"Nueva Gran Avenida" 2025:** plan de mejoramiento de fachadas y entorno en todo el eje, mejorando percepción urbana. Licitaciones municipales 2025 para mejorar entorno de la Intermodal, incrementando seguridad peatonal.

## Por qué invertir aquí
Con movilidad puerta a puerta, servicios completos y alta rotación de arriendo en torno a la Intermodal y Gran Avenida, La Cisterna ofrece flujos de demanda estables. Si sumamos una plusvalía supuesta de 6%, el mix renta + valorización la vuelve una opción muy competitiva dentro del sur de Santiago.`,
    docsIndependiente: [
      'Últimas 2 DAI',
      'RUT de la empresa',
      'Resumen anual de boletas del año pasado y de este (se saca en el SII)',
      'Últimas 12 cotizaciones AFP',
      'Cuenta o documento que acredite domicilio',
      'Comprobante de transferencia de reserva',
      'Fotocopia del Carnet de Identidad (ambos lados)',
      'Certificado de deuda CMF',
    ],
    docsDependiente: [
      'Fotocopia del Carnet de Identidad (ambos lados)',
      'Cuenta o documento que acredite domicilio',
      'Últimas 3 liquidaciones de sueldo',
      'Últimas 12 cotizaciones AFP',
      'Comprobante de transferencia de reserva',
      'Certificado de deuda CMF',
    ],
  },

  'cerrillos': {
    displayName: 'Cerrillos',
    reservaAmount: '$100.000',
    transferData: BANCO_CHILE,
    study: `## Ubicación Estratégica
Cerrillos se encuentra en una ubicación privilegiada con acceso a la Autopista Central y la Ruta 78. La inauguración de la **Línea 6 del Metro** con estación Cerrillos ha mejorado significativamente la conectividad del sector.

## Crecimiento y Plusvalía
Cerrillos ha mostrado un gran potencial de crecimiento. La llegada del Metro y los nuevos desarrollos urbanos han impulsado la plusvalía, con un **crecimiento estimado del 41% en los últimos 4 años**.

## Calidad de Vida
La comuna ofrece una excelente calidad de vida con acceso al **Parque Bicentenario de Cerrillos**, una de las principales áreas verdes de Santiago, ideal para recreación y deportes.

## Diversidad de Servicios
**15 colegios** con opciones educativas accesibles. **5 centros de salud**. Supermercados como Lider, Jumbo y Santa Isabel. Nuevos espacios comerciales en desarrollo.

## Proyectos de Mejora
**Extensión de la Línea 6 del Metro (en evaluación):** conectará con Maipú y San Bernardo. **Nuevo Centro Cívico y Comercial 2026:** edificios institucionales, espacios para oficinas y área comercial. **Expansión del Parque Bicentenario 2027:** inversión de más de $20.000 millones, nuevas áreas verdes y espacios culturales. **Metrotren Melipilla–Alameda 2026:** reducirá el trayecto Melipilla–Santiago de 2 horas a 45 minutos, con estación clave en Cerrillos.`,
    docsIndependiente: [
      'Últimas 2 DAI',
      'RUT de la empresa',
      'Resumen anual de boletas del año pasado y de este (se saca en el SII)',
      'Últimas 12 cotizaciones AFP',
      'Cuenta o documento que acredite domicilio',
      'Comprobante de transferencia de reserva',
      'Fotocopia del Carnet de Identidad (ambos lados)',
      'Certificado de deuda CMF',
    ],
    docsDependiente: [
      'Fotocopia del Carnet de Identidad (ambos lados)',
      'Cuenta o documento que acredite domicilio',
      'Últimas 3 liquidaciones de sueldo',
      'Últimas 12 cotizaciones AFP',
      'Comprobante de transferencia de reserva',
      'Certificado de deuda CMF',
    ],
  },

  'coquimbo': {
    displayName: 'Coquimbo',
    reservaAmount: '$100.000',
    transferData: BANCO_CHILE,
    study: `## Ubicación Estratégica
Coquimbo está ubicada en posición privilegiada en la Región de Coquimbo, con fácil acceso a la **Ruta 5** (10–15 minutos en auto). La cercanía al puerto y la Avenida Costanera refuerzan su rol estratégico para el comercio, el turismo y la inversión.

## Crecimiento y Plusvalía
Coquimbo ha experimentado un aumento del **24% en promedio en los últimos 4 años (6% anual)**. Este crecimiento se debe a su ubicación estratégica, oferta turística y al **flujo constante de migración minera** (Mina Los Pelambres, Mina El Romeral, Proyecto El Espino).

## Calidad de Vida
La comuna combina tranquilidad costera con áreas verdes y ambiente turístico. Destacan la playa La Herradura, el sector de Peñuelas, y el patrimonio histórico como la Cruz del Tercer Milenio y el Barrio Inglés.

## Diversidad de Servicios
**Educación:** UCN, Universidad de La Serena, INACAP, Universidad Pedro de Valdivia. **Salud:** Hospital San Pablo y clínicas especializadas. **Comercio:** Jumbo, Líder y Tottus, más amplia oferta gastronómica y hotelera.

## Proyectos de Mejora
**Extensión del Aeropuerto La Florida 2025.** **Renovación del Puerto de Coquimbo 2026.** **Costanera Sur 2024:** nueva vía que agilizará el tránsito con La Serena. **Tren Rápido Coquimbo–Santiago 2030:** conectará la región con la capital en menos de 4 horas.`,
    docsIndependiente: [
      'Últimas 2 DAI',
      'RUT de la empresa',
      'Resumen anual de boletas del año pasado y de este (se saca en el SII)',
      'Últimas 12 cotizaciones AFP',
      'Cuenta o documento que acredite domicilio',
      'Comprobante de transferencia de reserva',
      'Completar estado de situación',
      'Fotocopia del Carnet de Identidad (ambos lados)',
      'Certificado de deuda CMF',
    ],
    docsDependiente: [
      'Fotocopia del Carnet de Identidad (ambos lados)',
      'Últimas 6 liquidaciones de sueldo',
      'Últimas 12 cotizaciones AFP',
      'Comprobante de transferencia de reserva',
      'Completar estado de situación',
      'Certificado de deuda CMF',
    ],
  },

  'huechuraba': {
    displayName: 'Huechuraba',
    reservaAmount: '$100.000',
    transferData: BANCO_CHILE,
    study: `## Ubicación Estratégica
Huechuraba está al norte de Santiago con acceso directo a la **Autopista Vespucio Norte** y la **Ruta 5**. El tiempo estimado de traslado a Las Condes es de 15 a 25 minutos en condiciones normales.

## Crecimiento y Plusvalía
En los últimos 4 años, la plusvalía ha sido de aproximadamente **29% (7,25% anual)**. La demanda de propiedades sigue en aumento gracias a su accesibilidad y desarrollo.

## Calidad de Vida
La comuna ofrece áreas verdes como el **Parque Metropolitano Norte** y el **Parque del Recuerdo**, con amplios espacios de recreación. Es atractiva tanto para familias como para jóvenes profesionales.

## Diversidad de Servicios
**20 colegios.** **7 centros de salud.** Farmacias Salcobrand, Ahumada y Cruz Verde. Supermercados Lider, Jumbo, Santa Isabel y Unimarc.

## Proyectos de Mejora
**Extensión de la Línea 3 del Metro 2027:** nuevas estaciones Cardenal Caro, Independencia y Vespucio Norte. **Nueva Estación Intermodal Vespucio Norte 2025.** **Teleférico Ciudad Empresarial:** mejorará conectividad con el sector Oriente. **Llegada U. Autónoma y U. San Sebastián 2024:** convertirá Ciudad Empresarial en el segundo mayor polo universitario de Santiago.`,
    docsIndependiente: [
      'Últimas 2 DAI',
      'RUT de la empresa',
      'Resumen anual de boletas del año pasado y de este (se saca en el SII)',
      'Últimas 12 cotizaciones AFP',
      'Cuenta o documento que acredite domicilio',
      'Comprobante de transferencia de reserva',
      'Completar estado de situación',
      'Fotocopia del Carnet de Identidad (ambos lados)',
      'Certificado de deuda CMF',
    ],
    docsDependiente: [
      'Fotocopia del Carnet de Identidad (ambos lados)',
      'Últimas 6 liquidaciones de sueldo',
      'Últimas 12 cotizaciones AFP',
      'Comprobante de transferencia de reserva',
      'Completar estado de situación',
      'Certificado de deuda CMF',
    ],
  },

  'macul': {
    displayName: 'Macul / Quilín',
    reservaAmount: '$250.000',
    transferData: BANCO_CHILE,
    study: `## Seguridad de Arriendo y Calidad del Arrendatario
Macul es una comuna predominantemente residencial y de clase media, con población que ha crecido un **18,2% respecto al Censo 2017** (137.735 hab. en 2023). La presencia del **Campus San Joaquín de la UC** e **INTA de la Universidad de Chile** atrae estudiantes universitarios y jóvenes profesionales, perfil de arrendatario estable y responsable.

## Plusvalía
La comuna ha experimentado un desarrollo urbano significativo con nuevos proyectos de alta calidad. Macul ha sido mencionada como una de las comunas con mayor plusvalía en Chile, con incrementos que pueden llegar al **10% anual** en sectores con buena conectividad.

## Impacto de la Nueva Línea de Metro (Línea 8)
La futura **Línea 8** que atravesará Macul tendrá un impacto significativo: la cercanía a una estación de metro puede aumentar la plusvalía hasta en un **20%**. El tramo inicial (11 estaciones, Puente Alto–Ñuñoa) se espera en servicio en **2032**.

## Conectividad Estratégica
Macul limita con Ñuñoa, San Joaquín, Peñalolén y La Florida. Sus avenidas principales (Av. Macul, Av. Quilín, Av. Departamental) le otorgan ya una excelente conectividad, que la Línea 8 potenciará aún más.

## Por qué invertir aquí
Los departamentos de 1 y 2 dormitorios ofrecen un buen balance entre **rentabilidad inmediata por arriendo** y **potencial de valorización futura**, ideales para jóvenes profesionales o pequeñas familias.`,
    docsIndependiente: [
      'Últimas 2 DAI',
      'RUT de la empresa',
      'Resumen anual de boletas del año pasado y de este (se saca en el SII)',
      'Últimas 12 cotizaciones AFP',
      'Cuenta o documento que acredite domicilio',
      'Comprobante de transferencia de reserva',
      'Fotocopia del Carnet de Identidad (ambos lados)',
      'Certificado de deuda CMF',
    ],
    docsDependiente: [
      'Fotocopia del Carnet de Identidad (ambos lados)',
      'Cuenta o documento que acredite domicilio',
      'Últimas 3 liquidaciones de sueldo',
      'Últimas 12 cotizaciones AFP',
      'Comprobante de transferencia de reserva',
      'Certificado de deuda CMF',
    ],
  },

  'san bernardo': {
    displayName: 'San Bernardo',
    reservaAmount: '$100.000',
    transferData: BANCO_CHILE,
    study: `## Conectividad y Plusvalía Ferroviaria
El principal motor de valorización de San Bernardo es su excelente conectividad. El **Metrotren Nos** da acceso directo y rápido a la Estación Central. La futura conexión con el **Tren Santiago–Melipilla** solidificará aún más su posición como nodo de transporte vital en el Gran Santiago.

## Crecimiento Urbano y Plusvalía Atractiva
San Bernardo está experimentando una notable transformación urbana con nuevos proyectos inmobiliarios de alta calidad. El precio por m² (UF/m²) sigue siendo **competitivo**, con gran potencial de plusvalía en el mediano y largo plazo.

## Demanda de Arriendo Sólida y Diversa
La comuna atrae a familias jóvenes y profesionales que valoran la **mejor calidad de vida, espacios más amplios y excelente conectividad**, sin renunciar a la cercanía al centro. Esta demanda constante asegura alta ocupación y excelente seguridad de arriendo.

## Infraestructura y Servicios en Expansión
El crecimiento residencial ha sido acompañado por nuevos centros comerciales, supermercados, colegios y parques, elevando el atractivo de la comuna para futuros arrendatarios.

## Por qué invertir aquí
Su poderosa conectividad ferroviaria, su atractiva plusvalía y su creciente demanda de arriendo la convierten en una de las opciones más rentables del mercado actual en el sur de Santiago.`,
    docsIndependiente: [
      'Últimas 2 DAI',
      'RUT de la empresa',
      'Resumen anual de boletas del año pasado y de este (se saca en el SII)',
      'Últimas 12 cotizaciones AFP',
      'Cuenta o documento que acredite domicilio',
      'Comprobante de transferencia de reserva',
      'Fotocopia del Carnet de Identidad (ambos lados)',
      'Certificado de deuda CMF',
    ],
    docsDependiente: [
      'Fotocopia del Carnet de Identidad (ambos lados)',
      'Cuenta o documento que acredite domicilio',
      'Últimas 3 liquidaciones de sueldo',
      'Últimas 12 cotizaciones AFP',
      'Comprobante de transferencia de reserva',
      'Certificado de deuda CMF',
    ],
  },

  'santiago': {
    displayName: 'Santiago Centro',
    reservaAmount: '$100.000',
    transferData: BANCO_CHILE,
    study: `## Conectividad total y ubicación estratégica
Santiago Centro es el corazón de la ciudad. Cuenta con múltiples líneas de Metro (**L1, L2, L3, L5 y L6**), excelente conexión vial y acceso directo a distintos polos laborales y educacionales. Esta conectividad asegura una demanda de arriendo permanente y transversal.

## Alta demanda de arriendo y baja vacancia
La comuna concentra universidades, institutos, oficinas y servicios públicos y privados. Esto genera una demanda constante de **estudiantes, profesionales jóvenes y trabajadores**, con alta ocupación y muy buena seguridad de arriendo.

## Mercado líquido y atractivo para inversionistas
Santiago Centro es uno de los sectores con mayor rotación inmobiliaria del país. La plusvalía histórica se mueve en torno al **4% anual**, respaldada por su ubicación, conectividad y demanda estructural.

## Infraestructura consolidada y vida urbana activa
Cuenta con comercio, centros médicos, hospitales, universidades, parques, espacios culturales y patrimoniales. Sigue siendo una comuna muy atractiva para vivir y arrendar en distintos ciclos de mercado.

## Por qué invertir aquí
Invertir en Santiago Centro es apostar por un activo **sólido, estable y líquido**, ideal para generar renta mensual y mantener una valorización consistente en el tiempo.`,
    docsIndependiente: [
      'Últimas 2 DAI',
      'RUT de la empresa',
      'Resumen anual de boletas del año pasado y de este (se saca en el SII)',
      'Últimas 12 cotizaciones AFP',
      'Cuenta o documento que acredite domicilio',
      'Comprobante de transferencia de reserva',
      'Fotocopia del Carnet de Identidad (ambos lados)',
      'Certificado de deuda CMF',
    ],
    docsDependiente: [
      'Fotocopia del Carnet de Identidad (ambos lados)',
      'Cuenta o documento que acredite domicilio',
      'Últimas 3 liquidaciones de sueldo',
      'Últimas 12 cotizaciones AFP',
      'Comprobante de transferencia de reserva',
      'Certificado de deuda CMF',
    ],
  },

  'temuco': {
    displayName: 'Temuco',
    reservaAmount: '$100.000',
    transferData: BANCO_CHILE,
    study: `## Liderazgo en Plusvalía Fuera de Santiago
Temuco se ubica entre las ciudades con **mayor crecimiento en valor de propiedades** fuera de la Región Metropolitana, garantizando retorno sobre la inversión a mediano y largo plazo.

## Más Potencial de Crecimiento por UF/m²
El precio por metro cuadrado en Temuco es **considerablemente más bajo** que en Santiago. La misma inversión puede generar mayor utilidad por plusvalía: menor inversión inicial, mayor potencial de crecimiento de precio.

## Sólida Demanda por Arriendo
**Capital Universitaria:** hogar de la **Universidad de La Frontera** y la **Universidad Católica de Temuco**, asegurando flujo constante de estudiantes y académicos. **Polo Económico Regional:** como principal ciudad de La Araucanía, concentra la actividad comercial, de servicios y salud, atrayendo jóvenes profesionales y familias.

## Calidad de Vida y Proyección
Temuco ofrece un equilibrio ideal entre desarrollo urbano y acceso a la naturaleza, atrayendo arrendatarios que valoran el ritmo de región sin sacrificar las comodidades de una ciudad moderna.

## Por qué invertir aquí
La excelente plusvalía, la **baja barrera de entrada por metro cuadrado** y una demanda de arriendo robusta la convierten en una de las mejores opciones para diversificar la cartera inmobiliaria.`,
    docsIndependiente: [
      'Últimas 2 DAI',
      'RUT de la empresa',
      'Resumen anual de boletas del año pasado y de este (se saca en el SII)',
      'Últimas 12 cotizaciones AFP',
      'Cuenta o documento que acredite domicilio',
      'Comprobante de transferencia de reserva',
      'Completar estado de situación',
      'Fotocopia del Carnet de Identidad (ambos lados)',
      'Certificado de deuda CMF',
    ],
    docsDependiente: [
      'Fotocopia del Carnet de Identidad (ambos lados)',
      'Últimas 6 liquidaciones de sueldo',
      'Últimas 12 cotizaciones AFP',
      'Comprobante de transferencia de reserva',
      'Completar estado de situación',
      'Certificado de deuda CMF',
    ],
  },

  'ñuñoa': {
    displayName: 'Ñuñoa',
    reservaAmount: '$100.000',
    transferData: BANCO_CHILE,
    study: `## Ubicación Estratégica
Ñuñoa está situada en una zona central de Santiago, con fácil acceso a Providencia y Las Condes. Esto garantiza una alta demanda de propiedades gracias a su conveniencia y conectividad.

## Crecimiento y Plusvalía
La comuna ha mostrado un constante aumento en plusvalía. En los últimos 5 años, la plusvalía en Ñuñoa ha sido de aproximadamente **30% (6% anual)**. La demanda por viviendas sigue creciendo, impulsando el valor de las inversiones.

## Calidad de Vida
Ñuñoa ofrece excelente calidad de vida con abundantes áreas verdes, entorno seguro y rica oferta cultural y recreativa. Ideal tanto para familias como para profesionales.

## Diversidad de Servicios
Centros comerciales, restaurantes (**Barrio Italia, Plaza Ñuñoa**), colegios y centros de salud. Todo lo necesario a pasos.

## Proyectos de Mejora
**Nueva Línea 7 y 8 del Metro:** mejorará significativamente la conectividad; la Línea 8 estará a menos de 5 minutos del proyecto Optimus. **Ampliación Línea 3.** **Modernización Av. Irarrázaval.** **Desarrollo del Centro Comercial Vivo Santiago.**

## Por qué invertir aquí
Alta demanda consolidada, una de las **5 mejores comunas para vivir en Santiago**, con plusvalía sostenida y proyectos de metro que impulsarán aún más la valorización.`,
    docsIndependiente: [
      'Últimas 2 DAI',
      'RUT de la empresa',
      'Resumen anual de boletas del año pasado y de este (se saca en el SII)',
      'Últimas 12 cotizaciones AFP',
      'Cuenta o documento que acredite domicilio',
      'Comprobante de transferencia de reserva',
      'Completar estado de situación',
      'Fotocopia del Carnet de Identidad (ambos lados)',
      'Certificado de deuda CMF',
    ],
    docsDependiente: [
      'Fotocopia del Carnet de Identidad (ambos lados)',
      'Últimas 3 liquidaciones de sueldo',
      'Últimas 12 cotizaciones AFP',
      'Comprobante de transferencia de reserva',
      'Completar estado de situación',
      'Certificado de deuda CMF',
    ],
  },
};

/**
 * Returns commune info for the given commune name, using normalized matching.
 * Returns null if no match found.
 */
export function getCommuneInfo(commune: string | null | undefined): CommuneInfo | null {
  if (!commune) return null;
  const normalized = commune.toLowerCase().trim()
    .replace(/quilín|quilin/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Direct match
  if (COMMUNE_INFO[normalized]) return COMMUNE_INFO[normalized];

  // Partial match
  for (const key of Object.keys(COMMUNE_INFO)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return COMMUNE_INFO[key];
    }
  }

  // Handle Santiago / Santiago Centro variations
  if (normalized.includes('santiago')) return COMMUNE_INFO['santiago'];
  // Handle Macul / Quilín variations
  if (normalized.includes('macul') || normalized.includes('quil')) return COMMUNE_INFO['macul'];

  return null;
}
