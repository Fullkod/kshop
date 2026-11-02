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
      "¿Vendes ropa y zapatos? Crea dos atributos llamados «Talla» con distinto «Código» (talla-ropa y talla-calzado) y pon cada uno en su tipo de producto: así cada producto ofrece solo sus tallas.",
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
        text: "Súbela en «Archivo Excel (.xlsx)». Elige qué hacer con los productos que ya existen (mismo SKU): dejarlos como están o actualizarlos con los datos del Excel. Pulsa «Revisar archivo».",
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
        text: "«Uso del plan» dice cuántos productos y personas del equipo llevas. Para cambiar de plan o añadir un módulo suelto, pulsa «Solicitar» en el que quieras: se abre WhatsApp con el mensaje para Kshop ya escrito.",
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
    related: ["superadmin-store", "superadmin-plans"],
  },

  // --- Store admin: selling ------------------------------------------------------------------------------------
  {
    slug: "my-customers",
    title: "Quiero ver a mis clientes",
    summary:
      "En Clientes están quienes tienen cuenta en tu tienda. Los que compran sin cuenta solo aparecen en sus pedidos.",
    audiences: ["owner", "staff"],
    keywords: ["clientes", "cuenta", "contraseña", "bloquear", "código de recuperación", "teléfono"],
    contexts: ["customers"],
    steps: [
      {
        text: "Abre Clientes (en el grupo Ventas del menú) y busca por nombre o teléfono.",
      },
      {
        text: "Si un cliente olvidó su contraseña, pulsa «Código de recuperación»: Kshop genera un código para que la cambie y te deja mandárselo por WhatsApp.",
      },
      {
        text: "Si alguien hace pedidos falsos, pulsa «Bloquear»: ya no puede comprar con esa cuenta. «Desbloquear» lo deshace.",
      },
    ],
    related: ["new-order-arrived"],
  },
  {
    slug: "payment-methods",
    title: "Quiero decir cómo me pueden pagar",
    summary:
      "Los métodos de pago son lo que el cliente elige al hacer el pedido: efectivo, transferencia, Zelle… con tus instrucciones.",
    audiences: ["owner"],
    keywords: ["método de pago", "pagar", "transferencia", "efectivo", "zelle", "instrucciones", "cobrar"],
    contexts: ["payment-methods"],
    steps: [
      {
        text: "En Pedidos abre la pestaña «Métodos de pago» y pulsa «Nuevo método».",
      },
      {
        text: "Ponle nombre y escribe las «Instrucciones»: número de tarjeta, a quién transferir, cuándo se paga. El cliente las ve al hacer el pedido y en la página de su pedido.",
      },
      {
        text: "En «Monedas» marca en cuáles aceptas ese método (ninguna = todas). Pulsa «Guardar».",
      },
    ],
    tips: ["Desmarca «Activo» para dejar de ofrecer un método sin borrarlo."],
    related: ["shipping", "multi-currency"],
  },
  {
    slug: "shipping",
    title: "Quiero organizar las entregas",
    summary:
      "Las zonas dicen a dónde entregas; los métodos de entrega, cómo (mensajería con precio, recogida o «a convenir») y cuánto cuesta.",
    audiences: ["owner"],
    keywords: ["entrega", "envío", "mensajería", "zona", "municipio", "recogida", "a convenir", "domicilio"],
    contexts: ["shipping", "warehouses"],
    steps: [
      {
        text: "Abre Entregas. En «Zonas» pulsa «Nueva zona» por cada municipio o área donde entregas.",
      },
      {
        text: "En «Métodos de entrega» pulsa «Nuevo método»: elige el tipo, la zona (o todas), el precio y los días mínimos y máximos.",
      },
      {
        text: "Para que el cliente recoja en tu local, primero marca un almacén como «Punto de recogida para clientes» en Productos, pestaña «Almacenes». Luego crea un método de tipo recogida y elige ese punto.",
      },
      {
        text: "Si eliges «a convenir», el precio se pone en cada pedido: Kshop te lo pide al confirmarlo.",
      },
    ],
    related: ["new-order-arrived", "payment-methods"],
  },
  {
    slug: "promotion",
    title: "Quiero hacer una oferta",
    summary:
      "Una promoción baja el precio sola, sin código: el cliente ve el precio tachado en la tienda mientras dure.",
    audiences: ["owner"],
    keywords: ["oferta", "promoción", "rebaja", "descuento", "black friday", "precio tachado"],
    contexts: ["discounts"],
    steps: [
      {
        text: "Abre Ofertas y pulsa «Nueva promoción».",
        screenshot: "discounts",
      },
      {
        text: "Escribe el nombre (lo ve el cliente) y elige a qué se aplica: una categoría, una colección, una marca o productos sueltos.",
      },
      {
        text: "Elige el «Tipo de descuento» (porcentaje o cantidad fija) y el valor, y cuándo «Empieza» y, si quieres, cuándo «Termina» (hora de Cuba).",
      },
      {
        text: "Pulsa «Guardar». La promoción aparece como Programada, Activa o Terminada según las fechas.",
      },
    ],
    tips: [
      "Desmarca «Activa» para pausarla sin borrarla.",
      "Si a un producto le tocan varias, se aplica la que deja el precio más bajo; la «Prioridad» solo desempata.",
      "Tu equipo ve las ofertas, pero solo el dueño y los administradores las cambian.",
    ],
    related: ["voucher"],
  },
  {
    slug: "voucher",
    title: "Quiero crear un cupón",
    summary: "Un cupón es un código que el cliente escribe en el carrito para llevarse un descuento.",
    audiences: ["owner"],
    keywords: ["cupón", "código", "descuento", "bienvenida", "envío gratis"],
    contexts: ["vouchers"],
    steps: [
      {
        text: "En Cupones pulsa «Nuevo cupón».",
      },
      {
        text: "Escribe el «Código» (por ejemplo BIENVENIDA10) y el nombre, y elige de qué se descuenta y cuánto. Para envío gratis, porcentaje 100 sobre el envío.",
      },
      {
        text: "Si quieres, limita los productos, un mínimo de productos, los usos en total y los usos por cliente. Pulsa «Guardar».",
      },
      {
        text: "Comparte el código con tus clientes. En la lista ves cuántas veces se ha usado.",
      },
    ],
    related: ["promotion", "manual-order"],
  },
  {
    slug: "whatsapp-notices",
    title: "Quiero que me avisen y avisar a mis clientes por WhatsApp",
    summary:
      "Kshop manda avisos por WhatsApp desde su número: a ti, cuando entra un pedido o un pago, y al cliente, cuando su pedido cambia de estado.",
    audiences: ["owner"],
    keywords: ["whatsapp", "aviso", "notificación", "mensaje", "plantilla", "contacto", "historial"],
    contexts: ["whatsapp", "whatsapp-templates", "whatsapp-log"],
    steps: [
      {
        text: "En Avisos WhatsApp, pestaña «Contactos», pulsa «Nuevo contacto» y añade los teléfonos que deben recibir los pedidos nuevos. Sin contactos, nadie de la tienda recibe esos avisos.",
      },
      {
        text: "En «Mensajes» ves cada aviso (pedido recibido, pago recibido, enviado…). Pulsa «Editar» en uno para cambiar su texto con las «Variables disponibles» o desactivarlo; la «Vista previa» lo muestra con datos de ejemplo.",
        screenshot: "whatsapp-templates",
      },
      {
        text: "«Volver al texto de Kshop» deshace tus cambios en ese mensaje.",
      },
      {
        text: "En «Historial» ves cada aviso enviado. Si uno falló, pulsa «Reintentar» o «Abrir en WhatsApp» para mandarlo tú.",
      },
    ],
    related: ["new-order-arrived"],
  },

  // --- Store admin: catalog --------------------------------------------------------------------------------------
  {
    slug: "organize-catalog",
    title: "Quiero ordenar mi catálogo",
    summary:
      "Categorías, marcas y colecciones ayudan al cliente a encontrar lo que busca y llenan las secciones de la portada.",
    audiences: ["owner", "staff"],
    keywords: ["categoría", "marca", "colección", "subcategoría", "ordenar", "filtrar", "atributo"],
    contexts: ["categories", "brands", "collections", "attributes"],
    steps: [
      {
        text: "En Productos, pestaña «Categorías», pulsa «Nueva categoría». Pueden tener hasta 3 niveles (Mujer › Vestidos › Largos): elige la de arriba en «Dentro de». La foto sale en la sección «Categorías» de la portada.",
      },
      {
        text: "En «Marcas» crea las marcas de tus productos; con logo, salen en la sección «Marcas» de la portada.",
      },
      {
        text: "Una colección agrupa productos de distintas categorías (Verano, Novedades…). Márcala «Automática» para que incluya sola los productos que cumplan sus reglas: de una categoría o marca, con etiquetas, en oferta, destacados o con stock.",
      },
      {
        text: "Después, en cada producto elige su categoría, su marca y sus colecciones.",
      },
    ],
    tips: ["Desmarca «Visible en la tienda» para preparar una marca o colección sin que se vea todavía."],
    related: ["first-product", "appearance"],
  },
  {
    slug: "warehouses",
    title: "Tengo varios almacenes",
    summary:
      "Con el plan Pro llevas el stock de cada almacén, mueves mercancía entre ellos y ves cada entrada y salida.",
    audiences: ["owner"],
    keywords: ["almacén", "stock", "inventario", "traspaso", "movimientos", "local", "recogida"],
    contexts: ["warehouses", "multi-warehouse", "multi-warehouse-movements", "multi-warehouse-transfer"],
    steps: [
      {
        text: "Crea cada almacén en Productos, pestaña «Almacenes»: nombre, dirección, si es punto de recogida y si está activo (su stock cuenta para la venta).",
      },
      {
        text: "En Almacenes (el módulo del menú), «Resumen» muestra unidades y reservas de cada almacén, y qué almacén sirve cada zona de entrega.",
      },
      {
        text: "Para mover mercancía, abre «Traspasar»: elige «Desde» y «Hacia», añade los productos con su cantidad y confirma.",
      },
      {
        text: "«Movimientos» lista cada entrada y salida de stock (ventas, cancelaciones, traspasos, ajustes), con filtros por almacén, tipo y fecha.",
      },
    ],
    related: ["first-product", "shipping"],
  },
  {
    slug: "multi-currency",
    title: "Quiero vender en USD y en CUP",
    summary:
      "Tu tienda tiene una moneda principal; con el plan Pro también vendes y cobras en otras, con la tasa que tú decides.",
    audiences: ["owner"],
    keywords: ["moneda", "usd", "cup", "eur", "tasa", "cambio", "eltoque", "redondear"],
    contexts: ["currencies", "multi-currency"],
    steps: [
      {
        text: "En Productos, pestaña «Monedas», ves tu «Moneda principal» y puedes elegir a cuánto redondear los precios.",
      },
      {
        text: "En Monedas (el módulo del menú) activa «Vender en …» en cada moneda que quieras ofrecer y pon su tasa. Pulsa «Actualizar tasa» cuando cambie; si Kshop te sugiere la del día, «Usar esta tasa».",
      },
      {
        text: "Los precios en otras monedas se calculan con la tasa. Si quieres uno fijo, ponlo en «Precios en otras monedas» del producto.",
      },
      {
        text: "Al cobrar en la Caja o con «Registrar pago», elige la moneda que entrega el cliente: Kshop convierte con la tasa y te dice el vuelto.",
      },
    ],
    tips: ["El «Historial de tasas» guarda cada cambio, quién lo hizo y cuándo."],
    related: ["counter-sale", "payment-methods"],
  },

  // --- Store admin: the store ------------------------------------------------------------------------------------
  {
    slug: "appearance",
    title: "Quiero cambiar cómo se ve mi tienda",
    summary:
      "En Apariencia eliges los colores y el estilo, armas la portada, pones banners y decides qué sale en los menús.",
    audiences: ["owner"],
    keywords: ["apariencia", "tema", "colores", "portada", "banner", "menú", "páginas", "diseño", "logo"],
    contexts: ["themes", "themes-home", "themes-banners", "themes-menus", "themes-pages"],
    steps: [
      {
        text: "En Apariencia, pestaña «Tema», elige los colores y el estilo de tu tienda.",
      },
      {
        text: "En «Portada» elige el «Tipo» (carrusel, categorías, productos, beneficios, oferta con cuenta atrás…) y pulsa «Añadir sección». Cámbialas de orden con las flechas y pulsa «Editar» para su contenido.",
        screenshot: "themes-home",
      },
      {
        text: "En «Banners» pulsa «Nuevo banner» para las imágenes grandes de arriba; en «Menús» decides qué enlaces van arriba y en el pie.",
      },
      {
        text: "El pie va en columnas: en «Menú del pie» pulsa «Añadir columna o enlace», escribe el título y añade sus enlaces con «Añadir enlace a la columna». Un enlace sin nada debajo sale en la columna «Tienda».",
      },
      {
        text: "En «Páginas» pulsa «Nueva página» para textos fijos: quiénes somos, envíos, devoluciones. Da formato con la barra (Negrita, Título, Lista, Enlace, Botón) y mira a la derecha cómo queda. Luego añádelas al menú del pie.",
      },
      {
        text: "Pulsa «Ver la tienda ↗» para ver el resultado.",
      },
    ],
    tips: [
      "Si Apariencia lleva la marca «Admin», Kshop la configura por ti: pídele los cambios por WhatsApp.",
      "En una página, un enlace solo en su párrafo se ve como botón (verde si es de WhatsApp) y, bajo un título «Preguntas frecuentes», cada subtítulo es una pregunta que se abre y se cierra.",
    ],
    related: ["organize-catalog", "custom-domain"],
  },
  {
    slug: "custom-domain",
    title: "Quiero mi dominio propio",
    summary: "Tu tienda puede verse en tu propio dominio (mitienda.com) además de su dirección de Kshop.",
    audiences: ["owner"],
    keywords: ["dominio", "dns", "www", "dirección", "url", "mitienda.com"],
    contexts: ["custom-domain"],
    steps: [
      {
        text: "Compra el dominio donde prefieras. En Dominio propio escríbelo sin «www» y pulsa «Conectar dominio».",
      },
      {
        text: "Kshop te muestra unos registros (Tipo, Nombre, Valor): cópialos en la configuración DNS de donde compraste el dominio.",
      },
      {
        text: "Pulsa «Comprobar». Los cambios de DNS pueden tardar unas horas; cuando estén, el dominio pasa a «Activo».",
      },
    ],
    tips: [
      "El admin sigue en la dirección de Kshop; el dominio propio es para tus clientes.",
      "«Quitar» desconecta el dominio y la tienda vuelve a verse solo en su dirección de Kshop.",
    ],
    related: ["appearance"],
  },
  {
    slug: "mobile-app",
    title: "Quiero la app de mi tienda",
    summary:
      "Tus clientes con Android pueden instalar una app con el nombre y el icono de tu tienda. Y tú tienes Kshop Admin para llevar la tienda desde el teléfono.",
    audiences: ["owner"],
    keywords: ["app", "aplicación", "android", "apk", "descargar", "kshop admin", "qr", "teléfono"],
    contexts: ["mobile-app"],
    steps: [
      {
        text: "En App móvil pulsa «Pedir mi app». Kshop la prepara con tu nombre y tu logo; mientras tanto la verás como «Pedida».",
      },
      {
        text: "Cuando esté «Publicada», comparte la página de descarga por WhatsApp, en tus redes o impresa con el código QR. Los clientes con Android también ven un aviso en tu tienda para descargarla.",
      },
      {
        text: "Para ti y tu equipo, pulsa «Descargar Kshop Admin»: pedidos, la caja (también sin conexión), stock, precios y fotos desde el teléfono.",
      },
    ],
    related: ["counter-sale"],
  },
  {
    slug: "my-earnings",
    title: "Quiero ver cuánto gané",
    summary:
      "Ventas de hoy da el pulso del día; Finanzas (plan Pro) suma ventas, cobros, costos y gastos de cualquier periodo.",
    audiences: ["owner"],
    keywords: ["ganancia", "finanzas", "ventas", "margen", "gastos", "inventario", "cierre", "cuánto vendí"],
    contexts: [
      "sales-today",
      "finance",
      "finance-breakdown",
      "finance-expenses",
      "finance-inventory",
      "finance-margin",
    ],
    steps: [
      {
        text: "En Finanzas, «Resumen», elige el periodo (Hoy, 7 días, Este mes, Mes pasado o unas fechas): ves lo vendido, lo cobrado, lo pendiente de cobro, el margen bruto y la ganancia neta, y el cierre de cada día.",
        screenshot: "finance",
      },
      {
        text: "En «Gastos» pulsa «Añadir gasto» para apuntar lo que pagas (alquiler, transporte…): se restan de la ganancia neta.",
      },
      {
        text: "«Margen» muestra cuánto dejó cada producto o categoría; «Desglose», las ventas por método de pago, zona, canal y moneda.",
      },
      {
        text: "«Inventario» dice cuántas unidades tienes y cuánto valen a costo y a precio de venta, y qué está agotado o con pocas unidades.",
      },
    ],
    tips: [
      "El margen solo cuenta bien si cada producto tiene su costo.",
      "Para lo de hoy sin entrar en Finanzas, mira Ventas de hoy o Inicio.",
      "«Ver todo en» pasa las cifras a otra moneda; «Exportar a Excel» descarga el periodo.",
    ],
    related: ["first-product", "counter-sale"],
  },

  // --- Superadmin ------------------------------------------------------------------------------------------------
  {
    slug: "superadmin-store",
    title: "Quiero cambiar el plan o el menú de una tienda",
    summary:
      "La ficha de cada tienda reúne su plan, sus módulos, regalos y descuentos, sus facturas y qué secciones ve su personal.",
    audiences: ["superadmin"],
    keywords: ["tienda", "plan", "módulo", "regalo", "cortesía", "menú", "suspender", "dueño", "excel"],
    contexts: ["superadmin-stores", "superadmin-store"],
    steps: [
      {
        text: "En Tiendas abre la tienda. En «Plan y uso» pulsa «Cambiar plan» o elige pago mensual o anual; en «Módulos», da o quita módulos sueltos (sus datos se conservan).",
      },
      {
        text: "En «Regalos y descuentos» añade uno con su tipo, su motivo y, si quieres, hasta cuándo dura. En «Condiciones de esta tienda», un precio propio, límites o una baja programada.",
      },
      {
        text: "En «Menú de la tienda» decide cada sección: Visible, «Gestionado por admin» (el personal solo consulta) u Oculta. Las básicas son siempre visibles.",
      },
      {
        text: "«Enviar acceso al dueño» le manda un enlace nuevo para entrar; «Entrar al admin» te abre su admin, donde también puedes importarle un Excel.",
      },
    ],
    tips: [
      "«Suspender a mano» deja la tienda sin vender y su admin en solo lectura hasta «Reactivar tienda».",
    ],
    related: ["superadmin-new-store", "superadmin-billing"],
  },
  {
    slug: "superadmin-plans",
    title: "Quiero cambiar los planes y los precios",
    summary:
      "Planes y módulos define qué incluye cada plan y cuánto cuesta, y el precio de cada módulo suelto.",
    audiences: ["superadmin"],
    keywords: ["planes", "precios", "módulos", "caja", "base", "pro", "anual", "límite"],
    contexts: ["superadmin-plans"],
    steps: [
      {
        text: "En Planes y módulos, en cada plan, cambia el precio en «USD al mes» y «USD al año» (vacío = sin pago anual), y los límites de productos y de equipo.",
        screenshot: "superadmin-plans",
      },
      {
        text: "Marca los «Módulos incluidos» y si el plan es «Visible para las tiendas» (en la landing y en su Plan y facturación). Pulsa «Guardar» con el nombre del plan.",
      },
      {
        text: "En «Módulos sueltos» pon el precio al mes de cada módulo que se puede comprar aparte (vacío = solo dentro de un plan). Pulsa «Guardar precios».",
      },
    ],
    tips: [
      "Los cambios valen para las próximas facturas: los precios congelados de fundador y los módulos ya contratados no cambian.",
      "En el pago anual los módulos sueltos cuentan 10 meses.",
    ],
    related: ["superadmin-store", "superadmin-billing"],
  },
  {
    slug: "superadmin-billing",
    title: "Quiero cobrar a las tiendas",
    summary:
      "Kshop cobra a mano: cada tienda recibe su factura y, cuando paga, la marcas tú. Las que no pagan se pueden suspender.",
    audiences: ["superadmin"],
    keywords: ["cobros", "facturas", "pagar", "vencidas", "suspender", "efectivo", "anular", "ajuste"],
    contexts: ["superadmin-billing", "superadmin-store"],
    steps: [
      {
        text: "En Cobros, «Por cobrar» y «Vencidas» muestran las facturas pendientes.",
      },
      {
        text: "Cuando una tienda pague, pulsa «Registrar pago» en su factura: importe, forma de pago, fecha y referencia.",
      },
      {
        text: "«Ajuste» añade una línea a la factura (negativo = a favor de la tienda). «Anular» la deja sin efecto; Kshop pregunta antes.",
      },
      {
        text: "En «Ciclo de cobro» pon el WhatsApp de soporte y el texto «Cómo pagar» que ve cada tienda en su Plan y facturación.",
      },
    ],
    tips: ["Desde la ficha de una tienda, «Emitir factura ahora» crea su próxima factura sin esperar."],
    related: ["superadmin-store", "superadmin-plans"],
  },
  {
    slug: "superadmin-domains",
    title: "Quiero revisar los dominios propios",
    summary: "Dominios lista los dominios propios de todas las tiendas y su estado.",
    audiences: ["superadmin"],
    keywords: ["dominio", "dns", "verificar", "comprobar"],
    contexts: ["superadmin-domains"],
    steps: [
      {
        text: "En Dominios ves cada dominio con su tienda, sus registros DNS y su estado.",
      },
      {
        text: "Pulsa «Comprobar» para volver a mirar el DNS de uno que espera, o «Quitar» para desconectarlo (Kshop pregunta antes).",
      },
    ],
    tips: [
      "Antes de activar el primer dominio propio en producción, quita KSHOP_CUSTOM_DOMAIN_REDIRECT=off en Vercel y vuelve a desplegar.",
    ],
    related: ["custom-domain"],
  },
  {
    slug: "superadmin-apps",
    title: "Quiero publicar una app",
    summary:
      "Apps reúne las apps de las tiendas que las pidieron y Kshop Admin, con sus versiones (APK) publicadas u ocultas.",
    audiences: ["superadmin"],
    keywords: ["app", "apk", "android", "versión", "publicar", "ocultar", "kshop admin"],
    contexts: ["superadmin-apps"],
    steps: [
      {
        text: "Genera el APK con el workflow «Android app» de GitHub Actions y súbelo con pnpm app:publish (ver docs/APPS.md). La versión aparece «Oculta».",
      },
      {
        text: "En Apps, revisa la versión (número y tamaño) y pulsa «Publicar»: desde ese momento es la que descargan los clientes o el equipo.",
      },
      {
        text: "Si una versión da problemas, pulsa «Ocultar» para retirarla de la descarga.",
      },
    ],
    related: ["mobile-app"],
  },
  {
    slug: "superadmin-whatsapp",
    title: "Quiero poner el WhatsApp en real o en simulado",
    summary:
      "El WhatsApp de la plataforma manda todos los avisos de las tiendas. En «Simulado» se generan pero no se envían.",
    audiences: ["superadmin"],
    keywords: ["whatsapp", "openwa", "simulado", "real", "apagado", "prueba", "avisos"],
    contexts: ["superadmin-whatsapp"],
    steps: [
      {
        text: "En WhatsApp elige el «Modo»: Apagado (no se generan avisos), Simulado (se generan, no se envían) o Real (se envían por OpenWA).",
      },
      {
        text: "Revisa la URL de OpenWA, la sesión y los mensajes por minuto de la plataforma y de cada tienda.",
      },
      {
        text: "Para probar, escribe un teléfono y pulsa «Enviar prueba».",
      },
    ],
    tips: [
      "Antes de correr scripts de prueba (e2e, qa) pon «Simulado»: crean pedidos con teléfonos que recibirían mensajes de verdad. Vuelve a «Real» al terminar.",
    ],
    related: ["whatsapp-notices"],
  },
];
