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

## Playlists — 1 de octubre de 2026

- Suite actual: 10 pruebas aprobadas. PostgreSQL real en schemas temporales; proveedor YouTube simulado. Cubre autenticación/origen, URL y categoría inválidas, categoría opcional, conservación de categorías y visibilidad existentes, deduplicación, reanudación con una nueva instancia del servicio, publicación de videos y reintento asíncrono sin nueva aprobación manual.
- Contrato de Tube Archivist v0.5.12: extracción sin autodescarga ni suscripción, consulta de tarea por ID y lectura de playlist después de `SUCCESS`. Pruebas cubren tarea pendiente/no encontrada, fallo, estado desconocido, metadata vieja, playlist vacía y timeout.
- `pnpm typecheck`, `pnpm lint` y `pnpm format:check`: correctos. API, contratos y frontend compilados en `/tmp`, sin reemplazar la versión que sirve la instancia instalada.
- Brave Work, escritorio: formulario Playlist, envío sin categoría y con categoría/visibilidad seleccionadas, confirmación y estado de preparación. API simulada para esta prueba visual; no se descargó una playlist real. La captura móvil no pudo completarse por timeout del navegador; tamaño restaurado.
- La aprobación de una playlist autoriza sus videos actuales como lote. No suscribe automáticamente videos futuros. Para activar el cambio en una instalación existente, aplicar migraciones, compilar y reiniciar.

## Portadas de categorías — 1 de octubre de 2026

- Suite API: 10 pruebas aprobadas con PostgreSQL en schemas temporales. Cubre portada automática, selección manual, reset, primer video sin thumbnail, selección ajena/inexistente, video oculto/no disponible, desasignación y eliminación de la selección.
- TypeScript, lint, formato de archivos modificados y build: correctos.
- Brave Work, escritorio, API ficticia aislada: selección y persistencia de otro video, imagen en listado infantil, fallback a emoji y etiqueta automática. Captura móvil bloqueada por timeout; tamaño restaurado.
- Migración nueva: `0002_category_thumbnails.sql`. Instancia existente requiere `pnpm db:migrate` y reinicio para activar backend actualizado. No se aplicó migración ni reinició servicio durante esta validación.

## Final de video — 1 de octubre de 2026

- `pnpm --filter @wawatube/web typecheck`, ESLint y Prettier de archivos modificados: correctos. Build Vite en `/tmp`, sin reemplazar instancia instalada.
- Comprobación reproducible: ejecutar `pnpm --filter @wawatube/web dev`, abrir `/checks/video-ending.html` y pulsar «Comprobar final de video». Usa API ficticia y evento `ended` sintético; no modifica biblioteca ni prueba codecs.
- Brave Work, escritorio y viewports de 390 × 844 y 844 × 390: pasan íconos con etiquetas accesibles, verde/rojo, botones de 112 px, Sí → inicio, No → despedida, foco y reinicio. Overlay revisado visualmente en escritorio.
- Corrección de orientación: video y diálogo comparten contenedor fullscreen; `ended` conserva elemento y dimensiones, sin llamar a `exitFullscreen()`. La prueba de regresión simula Fullscreen API para verificar ese contrato y falla si se vuelve a salir al terminar. Navegadores sin fullscreen de elementos usan el contenedor ampliado dentro de la ventana.
- Fullscreen nativo y giro físico no verificados: automatización rechazó `requestFullscreen()` con `not granted`. Para comprobación manual, desmarcar «Simular API fullscreen» y marcar «Exigir fullscreen nativo». No se probó iOS/Android físico; no se afirma soporte de bloqueo de orientación del sistema.
