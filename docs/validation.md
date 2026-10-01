# Validación del MVP

Verificado el 1 de octubre de 2026, Linux, Node 24.14.1.

- `pnpm typecheck`, `pnpm lint`, `pnpm format:check` y compilación de producción: correctos.
- `pnpm test`: 7 pruebas correctas, incluida integración Fastify/PostgreSQL en un schema temporal aislado. Cubre validación, PIN, archivos fuera de raíz, enlaces simbólicos, visibilidad, rangos HTTP, recuperación de importaciones y reintentos.
- `scripts/smoke.ts --youtube`: sesión/cookie, rechazo de otro origen, registro local, rangos normales y sufijos, HEAD/416, miniaturas, importación de un video archivado y reproducción YouTube real. Las URLs infantiles ocultas devuelven 404.
- Brave Work: acceso con PIN, edición de categoría, registro local, aprobación YouTube, navegación infantil y reproducción completa de ambos archivos. Revisión de disposición móvil y escritorio. No se probó un dispositivo físico ni cada codec/navegador.
- systemd de usuario: servicio activo y habilitado; `Linger=yes`. Los cuatro servicios Docker están saludables. No se reinició físicamente la PC.
- Backup inicial restaurado en proyecto Compose aislado: PostgreSQL, metadata Tube Archivist, reproducción HTTP 206 y checksums idénticos de MP4/JPG locales.
- Instalación limpia con `pnpm install --offline --frozen-lockfile` y build: correcta. Backup final restauró ambos MediaItems con los mismos IDs, categoría y visibilidad. Ambos reproductores devolvieron 206 y miniaturas 200, también después de recrear los cuatro contenedores. Entorno de prueba eliminado; instancia principal preservada.

El video YouTube de prueba es `jNQXAC9IVRw`. Se verificó extracción y descarga con Tube Archivist real; las pruebas de recuperación tras reinicio y fallo simulan el proveedor para controlar esos estados. Los archivos locales de prueba son sintéticos. Las pruebas no autorizan contenido futuro para niños: cada nuevo video requiere aprobación.
