# VioletTech — Sistema de Gestión de Gastos

Prototipo académico del MVP del Sprint 2, desarrollado con HTML5, CSS3 y JavaScript. Los datos de prueba se guardan localmente en el navegador mediante `localStorage`.

## Funcionalidades

- Registro de una cuenta y redirección al inicio de sesión al finalizar.
- Inicio de sesión con usuario o email y contraseña.
- Flujo local de recuperación: usuario/email, nueva contraseña y confirmación.
- Reglas de contraseña visualizadas en tiempo real: mínimo de 8 caracteres, mayúscula, minúscula, número y carácter especial.
- Mostrar/ocultar contraseña mediante el icono de ojo.
- Dashboard, lista de movimientos, búsqueda, filtro por tipo y formulario separado para ingresar ingresos y egresos.
- Validaciones de monto, categoría y fecha no posterior al día actual.
- Confirmaciones, mensajes de error y persistencia de los movimientos.
- Modo claro (blanco/lila) y modo oscuro (negro/violeta), con preferencia conservada localmente.
- Diseño adaptable a computadoras y pantallas móviles.

## Ejecutar con Visual Studio Code

1. Descomprimí el ZIP y abrí la carpeta `violettech-prototipo` en Visual Studio Code (**Archivo → Abrir carpeta…**).
2. Instalá la extensión **Live Server** si todavía no la tenés.
3. Abrí `index.html`, hacé clic derecho y seleccioná **Open with Live Server**.
4. El navegador abrirá una dirección local similar a `http://127.0.0.1:5500`.

## Probar el recorrido

1. Entrá a **Registrate**, completá nombre de usuario, email y contraseña válida.
2. Al registrarte, la aplicación volverá a **Iniciar sesión** y dejará el email cargado. Ingresá la contraseña para entrar.
3. En la pantalla principal, pulsá **Registrar movimiento**, elegí ingreso o egreso y completá los datos obligatorios.
4. Comprobá el mensaje de guardado y que el registro aparezca en la lista.
5. Recargá el navegador y verificá que la sesión local y los movimientos continúen disponibles.
6. Probá **¿Olvidaste tu contraseña?** con una cuenta que hayas registrado; ingresá usuario/email, una contraseña nueva válida y la confirmación. Después volvé al inicio de sesión y entrá con la contraseña nueva.
7. Cambiá el tema claro/oscuro y usá la búsqueda/filtro en Movimientos.

## Limitaciones importantes

Este es un prototipo estático, no una autenticación de producción. La recuperación de contraseña se simula en el navegador y no envía email ni verifica la identidad de quien solicita el cambio. `localStorage` no es un almacenamiento seguro para credenciales y los datos no se sincronizan entre dispositivos. No uses contraseñas reales ni información sensible. La aplicación no utiliza SQLite, backend ni necesita publicarse en Internet para la demostración.

## Subir el código a GitHub

1. Creá en GitHub un repositorio vacío, por ejemplo `violettech-sistema-gastos`.
2. Abrí **Terminal → Nueva terminal** en Visual Studio Code desde la carpeta del proyecto.
3. Si es un repositorio nuevo, ejecutá estos comandos y reemplazá `USUARIO` por tu nombre real de GitHub:

```bash
git init
git add .
git commit -m "MVP VioletTech: autenticacion y movimientos"
git branch -M main
git remote add origin https://github.com/USUARIO/violettech-sistema-gastos.git
git push -u origin main
```

Si la carpeta ya está conectada a un repositorio, no repitas `git init` ni `git remote add origin`; usá `git add .`, `git commit -m "Actualiza flujo de autenticacion"` y `git push`.

## Estructura

```text
violettech-prototipo/
├── index.html
├── styles.css
├── app.js
├── README.md
└── assets/
    └── logo.svg
```
