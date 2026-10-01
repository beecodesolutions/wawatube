# Wawatube

Biblioteca familiar autohospedada. Los padres eligen; los niños ven únicamente videos aprobados y disponibles. YouTube se descarga con Tube Archivist; los videos familiares permanecen como archivos ordinarios. Ambos usan las mismas categorías y reproductor.

## Requisitos

Linux con systemd, Node **24 LTS**, pnpm **10.30.1**, Docker Engine + Compose v2 o posterior, FFmpeg/ffprobe y Git. Reservar aproximadamente 4 GB de RAM para infraestructura y espacio para videos. En Debian/Ubuntu, instalar FFmpeg con `sudo apt install ffmpeg`; instalar Docker desde sus instrucciones oficiales. No instalar un Node antiguo de la distribución.

Elasticsearch requiere `vm.max_map_count` suficiente. Consultar `sysctl vm.max_map_count`; la recomendación actual de Elastic es `1048576` o mayor. No bajar una configuración existente más alta.

## Instalación y desarrollo

Desde la raíz del repositorio:

```bash
cp .env.example .env
chmod 600 .env
# Editar .env: tres contraseñas distintas y DATABASE_URL coherente.
docker compose --env-file .env -f docker/docker-compose.yml up -d
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm pin
pnpm dev
```

Usamos `--env-file .env` explícito: evita depender del directorio desde donde Compose busque variables. La aplicación se ejecuta directamente en el host; Docker contiene solamente PostgreSQL, Redis, Elasticsearch y Tube Archivist.

Vite sirve la UI en el puerto que indique su salida y delega `/api` al puerto API `3100`. Configurar `PUBLIC_ORIGIN` con la URL exacta usada en el navegador (incluido puerto) y reiniciar API al cambiarla. No usar un origen comodín.

```bash
docker compose --env-file .env -f docker/docker-compose.yml down
```

`down` preserva volúmenes; **no usar `down -v`** para mantenimiento ordinario.

## Configurar Tube Archivist

1. Abrir `http://127.0.0.1:18000` en el servidor y entrar con `TA_USERNAME`/`TA_PASSWORD`.
2. Copiar API Token desde Settings/Application/Integrations a `TUBE_ARCHIVIST_TOKEN` en `.env`.
3. Reiniciar API. El token nunca se devuelve al frontend.

Desde otra computadora, usar túnel SSH local si hace falta administrar Tube Archivist; su puerto queda enlazado a localhost. No publicar Elasticsearch, Redis ni PostgreSQL en la LAN. `TA_USERNAME`/`TA_PASSWORD` inicializan la cuenta una vez; cambiarlos en `.env` no cambia una cuenta ya creada.

La integración está basada en Tube Archivist **v0.5.12**, Elasticsearch **8.19.0**, Redis **8.10.2** y PostgreSQL **17.11**. Las versiones están fijadas; revisar notas de actualización y hacer backup antes de cambiarlas. La API upstream no garantiza compatibilidad entre versiones.

## Usar la biblioteca

- Niños: `/`. Categoría → video → reproductor nativo, sin contenido recomendado ni navegación externa.
- Padres: `/parent`. PIN → biblioteca, categorías e importaciones. No hay botón administrativo en la UI infantil.
- YouTube: pegar URL de video individual → esperar metadata → elegir categorías y visibilidad → confirmar. Playlists se posponen.
- Locales: colocar `.mp4`, `.mkv`, `.webm` o `.mov` debajo de `LOCAL_MEDIA_ROOT`; buscar candidatos en el área de padres y registrar los deseados. El navegador no puede elegir directorios arbitrarios del servidor.
- Ocultar conserva archivo y registro; eliminar de biblioteca conserva archivo original/archivo de Tube Archivist.

`LOCAL_MEDIA_ROOT` relativo se resuelve desde la raíz del proyecto. Puede apuntar a una carpeta externa. Identificadores locales son rutas relativas internas: mover toda la raíz conserva referencias; renombrar/mover un archivo dentro de ella requiere actualizar su registro. El servidor rechaza traversal y enlaces simbólicos que salgan de la raíz. No otorgar a usuarios no confiables permisos de escritura sobre ella.

Miniatura local opcional: mismo nombre con extensión `.jpg` o `.png`, por ejemplo `viaje.mp4` + `viaje.jpg`. Sin miniatura se muestra un placeholder. ffprobe extrae metadata; no hay transcodificación. Un contenedor admitido no garantiza codecs reproducibles: MP4 H.264/AAC suele ser la opción más interoperable. Si el navegador rechaza un archivo, convertirlo externamente.

La aprobación se valida también en URLs directas, miniaturas y cada nueva petición de reproducción. Ocultar un video no puede retirar bytes que el navegador ya descargó/bufferizó.

## Producción en otra PC

```bash
git clone <url-del-repositorio> wawatube
cd wawatube
cp .env.example .env
chmod 600 .env
# Configurar contraseñas, raíces y PUBLIC_ORIGIN=http://IP-LAN:3100
docker compose --env-file .env -f docker/docker-compose.yml up -d
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm pin
pnpm build
sudo env NODE_BIN="$(command -v node)" ./scripts/install-service.sh
journalctl -u wawatube -f
```

Instalar dependencias de desarrollo antes del build: TypeScript/Vite son herramientas de compilación. El servicio usa Node directamente y sirve frontend compilado; no requiere Vite en producción. `install-service.sh` usa el usuario que ejecutó sudo, nunca root. El usuario necesita lectura de `.env`, código y media. La ruta de Node se fija en la unidad: reinstalar la unidad si cambia esa ruta.

```bash
sudo systemctl restart wawatube
sudo ./scripts/uninstall-service.sh
```

Desinstalar el servicio no elimina datos ni contenedores. Docker debe arrancar al iniciar el equipo; los contenedores usan `restart: unless-stopped`. La app reintenta el arranque si PostgreSQL aún no está listo.

Sin sudo, se admite `./scripts/install-service.sh --user`. Administrar con `systemctl --user` y `journalctl --user -u wawatube`; desinstalar con `./scripts/uninstall-service.sh --user`. Para arrancar sin iniciar sesión, el usuario debe tener `Linger=yes` (`loginctl show-user "$USER" -p Linger`). Si no está habilitado, un administrador debe habilitarlo explícitamente. No se cambia esa política automáticamente.

Acceso previsto: LAN privada, sin redirección de puertos en el router. `HOST` puede fijarse a la IP LAN para limitar interfaz de escucha. El PIN y las cookies por HTTP no están cifrados en tránsito; para redes no confiables, usar HTTPS y `SECURE_COOKIES=true`. No hay OAuth, cuentas cloud ni acceso público. Descargar YouTube requiere Internet; ver media ya almacenada no debería requerirlo.

## Backup y restauración

El backup contiene credenciales: guardar en almacenamiento privado. Nunca subirlo al repositorio. Detener Node antes de ambos procedimientos; la utilidad rechaza una API activa en el puerto configurado.

```bash
sudo systemctl stop wawatube
./scripts/backup.sh /ruta/privada/backup-2026-10-01 --include-local
sudo systemctl start wawatube
```

Sin `--include-local`, los videos familiares **no se duplican**: deben copiarse/montarse por separado en la nueva PC. Los videos de Tube Archivist sí se incluyen siempre.

El script produce un dump lógico PostgreSQL, copias frías de volúmenes Tube Archivist/cache/Elasticsearch/Redis, videos YouTube, configuración y manifest con SHA-256. Detiene los escritores de Tube Archivist y reinicia solamente los servicios que estaban activos. El destino debe estar vacío y fuera de las raíces de media. No editar/copiar videos locales durante el backup.

Para restaurar, usar checkout limpio con las mismas versiones y el mismo `docker-compose.yml` del backup (el script compara su SHA-256), copiar `config.env` del backup a `.env` y ejecutar `chmod 600 .env`. Ajustar rutas/puertos/IP solamente en `.env`; conservar secretos de Tube Archivist/Elasticsearch. **Usar solamente backups propios y confiables.** El restore exige destinos vacíos y no sobrescribe bibliotecas existentes.

```bash
# En instalación nueva, antes de arrancar Tube Archivist:
mkdir -p data/youtube # crear la ruta de TA_MEDIA_ROOT; ajustar si es externa
docker compose --env-file .env -f docker/docker-compose.yml up -d postgres
docker compose --env-file .env -f docker/docker-compose.yml create redis elasticsearch tubearchivist
./scripts/restore.sh /ruta/privada/backup-2026-10-01 --confirm-empty
docker compose --env-file .env -f docker/docker-compose.yml up -d
pnpm db:migrate
pnpm pin
pnpm build
sudo env NODE_BIN="$(command -v node)" ./scripts/install-service.sh
```

En una instalación nueva, configurar `MEDIA_UID` y `MEDIA_GID` con `id -u` e `id -g` del usuario que ejecutará el servicio antes de iniciar Compose; ese usuario debe poder leer `.env` y las raíces de media. Si el restore falla después de escribir PostgreSQL o algún archivo, no repetirlo sobre ese destino: conservarlo para diagnóstico y preparar una instalación nueva con base y volúmenes vacíos antes de reintentar. El script no borra datos automáticamente.

Restablecer PIN invalida sesiones restauradas. Si media local no está incluida, copiarla primero preservando estructura relativa. Código/build/node_modules se regeneran; originales familiares, aprobación/categorías y videos que desaparezcan de YouTube no se pueden regenerar confiablemente. Respaldar `/cache`: contiene datos persistentes, no solo archivos descartables.

## Comprobaciones

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm format:check
pnpm build
```

Las pruebas de API crean y eliminan un schema temporal aislado en `DATABASE_URL`; requieren PostgreSQL activo. `WAWATUBE_TEST_PIN=... pnpm test:smoke --youtube` prueba el servidor compilado por HTTP: ejecutar únicamente sobre una biblioteca descartable con `prueba-colores.mp4` y su JPG bajo `LOCAL_MEDIA_ROOT`. Ese smoke crea y elimina registros de prueba y necesita Tube Archivist configurado. No ejecutarlo contra una biblioteca con datos personales. Ver [alcance de la validación realizada](docs/validation.md).

## Fuentes del contrato upstream

- [Release v0.5.12](https://github.com/tubearchivist/tubearchivist/releases/tag/v0.5.12)
- [Compose oficial del tag](https://github.com/tubearchivist/tubearchivist/blob/v0.5.12/docker-compose.yml)
- [Autenticación API](https://docs.tubearchivist.com/api/introduction/)
- [Endpoints de cola](https://github.com/tubearchivist/tubearchivist/blob/v0.5.12/backend/download/views.py)
- [Protección de archivos Nginx](https://github.com/tubearchivist/tubearchivist/blob/v0.5.12/docker_assets/nginx.conf)
- [Requisitos Elasticsearch](https://www.elastic.co/docs/deploy-manage/deploy/self-managed/install-elasticsearch-docker-prod)
