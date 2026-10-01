# Wawatube — reglas del proyecto

## Interfaz infantil

- La UI infantil debe poder ser navegada por un niño que todavía no sabe leer. Usar íconos o imágenes reconocibles y botones grandes; no depender solo de texto ni de color para comunicar acciones. Conservar etiquetas accesibles para lectores de pantalla.

## Commits y entrega

- Después de terminar y verificar un fix o una feature, crear el commit automáticamente, sin pedir confirmación.
- Si el usuario pide un ajuste o corrección sobre el trabajo recién entregado, hacer amend al último commit de ese trabajo en vez de crear otro commit.
- No reescribir commits que ya fueron publicados en `main`: en ese caso, guardar el ajuste en un nuevo commit para conservar el historial compartido.
- Usar GitButler (`but`) para commits, amend, ramas y publicación.
- Commitear no implica publicar. Cuando el usuario pida pushear, hacer land directo a `main` con `but land <rama> --yes`, sin crear pull request.
- Antes de land, completar las verificaciones relevantes y preservar cambios ajenos. No forzar ni sobreescribir cambios remotos.
- No versionar `.env`, PIN, tokens, contraseñas, videos, backups ni archivos generados.
