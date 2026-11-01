import type { HelpArticle } from "../types";

/**
 * Guides by task («quiero…»), not by screen. Button and tab names are written exactly as the app shows them;
 * when a screen changes, the guide that describes it changes in the same commit (rule in AGENTS.md).
 */
export const articles: HelpArticle[] = [
  {
    slug: "first-product",
    title: "Quiero subir mi primer producto",
    summary:
      "Un producto necesita un tipo (cómo es), un precio y, si quieres, stock y fotos. Con variantes (talla, color…) cada combinación lleva su propio precio y stock.",
    audiences: ["owner", "staff"],
    keywords: [
      "producto",
      "subir",
      "crear",
      "variantes",
      "talla",
      "color",
      "precio",
      "stock",
      "fotos",
      "imágenes",
    ],
    contexts: ["products", "product", "product-types", "attributes"],
    steps: [
      {
        text: "Si es tu primer producto, ve a la pestaña «Tipos de producto» y pulsa «Nuevo tipo». Marca «Se vende en variantes» si el producto tiene tallas, colores u otras opciones, y elige sus atributos (los atributos se crean antes en la pestaña «Atributos»).",
        screenshot: "product-types",
      },
      {
        text: "En la pestaña «Productos» pulsa «Nuevo producto», elige el tipo y escribe el nombre. La categoría, la marca y la descripción son opcionales.",
      },
      {
        text: "Pon el precio, el costo (solo lo ves tú, nunca el cliente) y el stock. Si no quieres llevar la cuenta del stock, marca «No controlar stock». Con variantes, pulsa «Generar variantes» y rellena cada fila, o usa «Precio para todas» para no repetirlo.",
        screenshot: "product-editor",
      },
      {
        text: "Elige el estado: «Borrador» para terminarlo después o «Publicado» para que salga ya en la tienda. Pulsa «Guardar».",
      },
      {
        text: "Con el producto guardado aparece «Imágenes»: sube las fotos (o «Tomar foto» en el teléfono). La primera es la que se ve en la tienda.",
      },
    ],
    tips: [
      "«Calcular» abre la calculadora: le das lo que te costó el paquete y cuántas unidades trae, y te propone el precio con el margen que quieras.",
      "Para ocultar un producto sin perderlo, ponlo en «Archivado»: desaparece de la tienda y los pedidos viejos lo conservan.",
    ],
    related: ["excel-catalog", "missing-section"],
  },
  {
    slug: "excel-catalog",
    title: "Tengo el catálogo en un Excel",
    summary:
      "Puedes subir muchos productos de una vez con la plantilla de Kshop: una fila por variante, y las filas con el mismo código forman un producto.",
    audiences: ["owner"],
    keywords: ["excel", "importar", "plantilla", "xlsx", "muchos productos", "catálogo", "carga masiva"],
    contexts: ["excel-import", "products"],
    steps: [
      {
        text: "Abre «Importar Excel», elige el tipo de producto y pulsa «Descargar plantilla»: trae una columna por cada atributo de ese tipo.",
        screenshot: "excel-import",
      },
      {
        text: "Rellena la plantilla en Excel o en Google Sheets (guárdala como .xlsx). Una fila por variante; repite el código de producto en las filas del mismo producto.",
      },
      {
        text: "Súbela en «Archivo Excel (.xlsx)». Elige qué hacer con los productos que ya existen (mismo SKU): dejarlos como están o actualizarlos con los datos del Excel.",
      },
      {
        text: "Revisa la «Vista previa». Las filas con error no se importan: corrígelas en el Excel y vuelve a subirlo. Cuando todo esté bien, confirma la importación y pulsa «Ver productos».",
      },
    ],
    tips: [
      "Marca «Crear las categorías, marcas, colecciones y valores de atributo que falten» para no tener que crearlos uno a uno antes.",
      "Las fotos se pueden poner como enlaces (URL) en la plantilla; Kshop las descarga al importar.",
      "Solo el dueño y los administradores pueden importar.",
    ],
    related: ["first-product"],
  },
  {
    slug: "new-order-arrived",
    title: "Me llegó un pedido",
    summary:
      "Cada pedido de la tienda entra en Pedidos como «Por confirmar». Lo confirmas con el cliente, cobras y lo vas moviendo hasta «Entregado».",
    audiences: ["owner", "staff"],
    keywords: [
      "pedido",
      "orden",
      "confirmar",
      "pagado",
      "entregado",
      "estado",
      "whatsapp",
      "cobrar",
      "cancelar",
    ],
    contexts: ["orders", "order", "home"],
    steps: [
      {
        text: "Abre Pedidos: la pestaña «Pendientes» tiene lo que espera por ti. El número junto a Pedidos en el menú dice cuántos hay por confirmar; los de más de 48 h llevan la marca «Más de 48 h».",
        screenshot: "orders-list",
      },
      {
        text: "Entra en el pedido y pulsa «WhatsApp al cliente» para hablar con él sin copiar su número.",
        screenshot: "order-detail",
      },
      {
        text: "Con todo hablado, pulsa «Confirmar». Si la entrega era «a convenir», Kshop te pide antes el precio del envío.",
      },
      {
        text: "Cuando te paguen, pulsa «Registrar pago» (moneda, método y, si quieres, el comprobante) o «Marcar pagado». Después «Preparar», «Enviar» y «Entregado» según avance.",
      },
    ],
    tips: [
      "Usa «Nota interna» para lo que el cliente no debe ver (por ejemplo, quién lo lleva).",
      "Si el cliente se arrepiente, «Cancelar» devuelve el stock; el motivo es opcional. Un pedido ya enviado o entregado no se puede cancelar.",
    ],
    related: ["manual-order", "counter-sale"],
  },
  {
    slug: "manual-order",
    title: "Quiero crear un pedido a mano",
    summary:
      "Para lo que te piden por WhatsApp o por teléfono: lo apuntas tú en el admin y sigue el mismo camino que un pedido de la tienda.",
    audiences: ["owner", "staff"],
    keywords: ["pedido manual", "nuevo pedido", "whatsapp", "teléfono", "apuntar", "descuento manual"],
    contexts: ["order-new", "orders"],
    steps: [
      {
        text: "En Pedidos abre la pestaña «Nuevo pedido». Busca los productos y pulsa «Añadir» en cada uno.",
        screenshot: "order-new",
      },
      {
        text: "Escribe el teléfono y el nombre del cliente.",
      },
      {
        text: "Elige la zona, el método de entrega y el de pago. Si quieres hacerle una rebaja, usa «Descuento manual» (porcentaje o cantidad) y apunta el motivo.",
      },
      {
        text: "Pulsa «Crear pedido». Las ofertas, el cupón, el envío y el total se calculan en ese momento; luego lo gestionas como cualquier otro pedido.",
      },
    ],
    related: ["new-order-arrived", "counter-sale"],
  },
  {
    slug: "counter-sale",
    title: "Quiero vender en el mostrador",
    summary:
      "La Caja es para lo que vendes en persona: buscas, cobras y el stock baja al momento. Funciona en la web y en Kshop Admin, también sin conexión.",
    audiences: ["owner", "staff"],
    keywords: ["caja", "mostrador", "vender", "pos", "cobrar", "vuelto", "sin conexión", "local"],
    contexts: ["pos", "sales-today"],
    steps: [
      {
        text: "Abre Caja › Vender. Busca por nombre o código y toca cada producto para sumarlo al ticket; cambia la cantidad si hace falta.",
        screenshot: "pos-sell-mobile",
      },
      {
        text: "Pulsa «Cobrar». Elige la «Moneda que entrega» el cliente y escribe el monto. Si paga en otra moneda, Kshop sugiere la tasa (puedes cambiarla) y te dice el vuelto; si da menos, «Añadir pago» suma otro pago, por ejemplo una parte en USD y otra en CUP.",
      },
      {
        text: "Pulsa «Confirmar venta». Queda como pedido de «Mostrador», ya entregado, y aparece en Ventas de hoy y en Caja › Resumen.",
      },
      {
        text: "Si te equivocaste, abre esa venta en Pedidos (filtro «Mostrador») y cancélala: el stock vuelve y el dueño la ve como cancelada.",
      },
    ],
    tips: [
      "Con Kshop Admin instalada en el teléfono puedes vender sin internet: las ventas se guardan y se suben solas cuando vuelve la conexión.",
      "La venta no necesita teléfono del cliente.",
    ],
    related: ["new-order-arrived", "missing-section"],
  },
  {
    slug: "my-team",
    title: "Quiero que mi empleado entre al admin",
    summary:
      "Cada persona entra con su propio usuario. El empleado vende y atiende pedidos; el administrador además gestiona el equipo, el plan y las importaciones.",
    audiences: ["owner"],
    keywords: ["equipo", "empleado", "invitar", "usuario", "permisos", "rol", "administrador", "contraseña"],
    contexts: ["team"],
    steps: [
      {
        text: "Abre Equipo y pulsa «Invitar persona».",
        screenshot: "team",
      },
      {
        text: "Escribe el email de la persona y elige el rol: «Empleado» o, si eres el dueño, «Administrador». Pulsa «Invitar».",
      },
      {
        text: "Kshop te da un enlace de un solo uso: mándaselo por WhatsApp desde el botón que aparece. Con él crea su contraseña y entra.",
      },
      {
        text: "Para quitar a alguien, pulsa «Quitar» en su fila. Sus ventas y pedidos se quedan como estaban.",
      },
    ],
    tips: ["Tu plan marca cuántas personas puedes tener en el equipo; tú, como dueño, no cuentas."],
    related: ["my-plan"],
  },
  {
    slug: "my-plan",
    title: "Quiero ver mi plan y cómo pago",
    summary:
      "En Plan y facturación ves tu plan, lo que usas de él, la próxima factura y cómo pagarla. Kshop cobra a mano: no hace falta tarjeta.",
    audiences: ["owner"],
    keywords: [
      "plan",
      "factura",
      "pagar",
      "suscripción",
      "precio",
      "caja",
      "base",
      "pro",
      "módulos",
      "subir de plan",
    ],
    contexts: ["billing"],
    steps: [
      {
        text: "Abre Plan y facturación (en el grupo Negocio del menú).",
        screenshot: "billing",
      },
      {
        text: "Arriba ves tu plan y la próxima factura. En «Cómo pagar» están las formas de pago; pulsa «Escribir a Kshop por WhatsApp» si tienes dudas o para avisar de que pagaste.",
      },
      {
        text: "«Uso del plan» dice cuántos productos y personas del equipo llevas. Para cambiar de plan o añadir un módulo suelto, pulsa «Solicitar» en el que quieras.",
      },
    ],
    related: ["missing-section", "my-team"],
  },
  {
    slug: "missing-section",
    title: "No encuentro una sección o tiene un candado",
    summary:
      "Algunas secciones dependen de tu plan y otras las configura Kshop por ti. Así sabes qué significa cada marca del menú.",
    audiences: ["owner", "staff"],
    keywords: [
      "candado",
      "bloqueado",
      "pro",
      "base",
      "plan",
      "no aparece",
      "gestionado",
      "admin",
      "oculta",
      "sección",
    ],
    contexts: ["home", "billing"],
    steps: [
      {
        text: "Si una sección lleva un candado con «BASE» o «PRO», tu plan no la incluye. Al tocarla te lleva a Plan y facturación, donde puedes pedirla.",
      },
      {
        text: "Si lleva la marca «Admin», está «Gestionada por admin»: Kshop la configura por ti y tu equipo solo puede consultarla.",
      },
      {
        text: "Si una sección no aparece en el menú, Kshop la tiene oculta para tu tienda o tu rol no la ve (Equipo y Plan y facturación son solo del dueño y los administradores). Pregunta a Kshop por WhatsApp si la necesitas.",
      },
    ],
    related: ["my-plan"],
  },
  {
    slug: "superadmin-new-store",
    title: "Quiero dar de alta una tienda",
    summary:
      "El superadmin crea la tienda, su dueño y su plan en un paso; el dueño recibe un enlace para crear su contraseña.",
    audiences: ["superadmin"],
    keywords: ["tienda nueva", "crear tienda", "alta", "dueño", "slug", "subdominio", "plan"],
    contexts: ["superadmin-stores", "superadmin-store-new"],
    steps: [
      {
        text: "En Tiendas pulsa «Nueva tienda».",
        screenshot: "superadmin-store-new",
      },
      {
        text: "Rellena «Nombre de la tienda», «Subdominio» (será {subdominio}.kshop.fullkod.com y no se puede repetir), «Email del dueño», el prefijo de pedidos y la moneda principal.",
      },
      {
        text: "Elige el plan y los «Días de prueba». Para un socio fundador escribe su precio congelado; marca «Cortesía» si la tienda no se factura nunca.",
      },
      {
        text: "Pulsa «Crear tienda». En «Tienda creada» pulsa «Enviar por WhatsApp» para mandarle al dueño su enlace de acceso.",
      },
      {
        text: "Desde la ficha de la tienda ajustas después su plan, sus facturas y «Menú de la tienda» (qué secciones ve su personal).",
      },
    ],
  },
];
