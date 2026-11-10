# VioletTech — Sistema de Gestión de Gastos

Prototipo académico desarrollado con HTML, CSS y JavaScript. Conserva el núcleo original del MVP y agrega reglas de negocio para separar el acceso por rol y sede. La información se guarda en `localStorage` del navegador.

## Roles y permisos

- **Administradora:** única cuenta con acceso a las tres sedes, selector de clínicas, métricas y balances, auditoría, actualización de estados y observaciones.
- **Encargada:** puede registrar ingresos y egresos en su sede, adjuntar comprobantes y descargar el informe PDF de los movimientos de esa sede.
- **Médico:** puede consultar en modo lectura únicamente los movimientos de su sede.

En el registro se elige el rol. Para Encargada y Médico, la sede es obligatoria. Solo puede existir una cuenta Administradora; el formulario muestra una aclaración y bloquea un segundo registro con ese rol.

## Funcionalidades agregadas

- Selector de Sede 1, Sede 2 y Sede 3 para la Administradora.
- Navegación a pantallas secundarias de Clínicas, Métricas y balances, y Auditoría.
- Filtro de métricas por fechas y sede, tarjetas de ingresos/egresos/balance, distribución por categoría y tendencia mensual.
- Carga opcional de comprobantes JPG, PNG, WEBP, GIF o PDF, con límite de 2 MB, vista previa y descarga desde cada movimiento.
- Flujo de estados **Cargado → En revisión → Validado**, editable solo por la Administradora.
- Observaciones internas e historial de acciones con usuario, fecha y hora.
- Exportación imprimible del informe, que permite elegir “Guardar como PDF” en el navegador.
- Compatibilidad de pantallas secundarias y visor con los temas claro y oscuro. El botón para mostrar contraseña permanece visible.

## Ejecutar con Visual Studio Code

1. Descomprimí el ZIP y abrí la carpeta `SGG-VioletTech` en Visual Studio Code.
2. Abrí `index.html` con Live Server (o serví la carpeta desde un servidor local).
3. Registrá la primera cuenta como Administradora. Luego registrá Encargadas y Médicos asignándoles una sede.
4. Iniciá sesión con cada cuenta para comprobar que aparezcan únicamente sus opciones.

## Recorrido de prueba recomendado

1. Registrá una cuenta Administradora y comprobá que el formulario muestre que no se permite una segunda.
2. Registrá una Encargada de Sede 1 y un Médico de Sede 1.
3. Ingresá como Encargada, cargá un ingreso y un egreso; en uno adjuntá un comprobante.
4. Descargá el comprobante y el informe PDF desde Movimientos.
5. Ingresá como Médico y confirmá que vea los movimientos de Sede 1, sin botones para registrar o editar.
6. Volvé a ingresar como Administradora, elegí Sede 1, revisá Métricas y balances y actualizá un estado desde Auditoría.
7. Agregá una observación y comprobá que quede en el historial.
8. Cambiá entre tema claro y oscuro y revisá las pantallas secundarias y el visor.

## Limitaciones del prototipo

Los roles y permisos se aplican en la interfaz y en la lógica JavaScript, pero no son seguridad real: los usuarios y movimientos se guardan en `localStorage`, no se sincronizan entre dispositivos y pueden ser modificados desde las herramientas del navegador. No uses datos personales, credenciales reales ni información clínica o financiera sensible. La vista previa de PDF utiliza el visor PDF integrado del navegador, cuyo contenido interno puede conservar el estilo propio del navegador aunque el marco de VioletTech respete el tema.

## Estructura

```text
SGG-VioletTech/
├── index.html
├── styles.css
├── app.js
├── business-rules.js
├── README.md
└── assets/
    └── logo.svg
```
