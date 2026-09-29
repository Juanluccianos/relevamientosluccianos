# Relevamientos Lucciano's

App para relevar locales: el supervisor completa el checklist desde el celular (anda sin señal), saca fotos y la app calcula el puntaje. Los jefes ven el resumen del mes, el ranking y exportan a Excel.

Stack: GitHub Pages (frontend) + Cloudflare Worker con D1 (backend) + Google Drive (fotos). Costo extra: cero.

## Qué hay en cada carpeta

| Archivo | Para qué sirve | Dónde va |
|---|---|---|
| `index.html`, `app.js`, `sw.js`, `manifest.json`, `icon-192.png`, `icon-512.png` | La app | Raíz del repo (GitHub Pages) |
| `worker/worker.js`, `worker/wrangler.toml`, `worker/schema.sql` | El backend | Carpeta `worker/` del repo; se publica con wrangler |
| `datos/usuarios.csv`, `datos/locales.csv`, `datos/checklist.csv` | Carga inicial (sacada de Linkup) | Se pegan desde Cuenta → Administración. **No subir a GitHub** |

---

## 1. Base de datos (D1)

En la terminal, parado en la carpeta `worker`:

```
npx wrangler d1 create relevamientos
```

Copiá el `database_id` que te devuelve y pegalo en `wrangler.toml`. Después creá las tablas:

```
npx wrangler d1 execute relevamientos --remote --file=schema.sql
```

## 2. Carpeta de Drive para las fotos

La app sube las fotos con una **cuenta de servicio de Google**. Si viáticos ya usa una, reusá el mismo JSON.

1. En Drive, dentro de una **unidad compartida** (las cuentas de servicio no tienen espacio propio en "Mi unidad"), creá la carpeta `Relevamientos - Fotos`.
2. Compartila con el email de la cuenta de servicio (termina en `iam.gserviceaccount.com`) con rol **Administrador de contenido**.
3. Abrí la carpeta y copiá el ID de la URL: lo que sigue a `/folders/`. Pegalo en `DRIVE_FOLDER_ID` dentro de `wrangler.toml`.

Si no tenés cuenta de servicio: Google Cloud Console → proyecto de la empresa → habilitar **Google Drive API** → Credenciales → Crear cuenta de servicio → Claves → Agregar clave JSON.

## 3. Secretos del Worker

```
npx wrangler secret put TOKEN_SECRET
npx wrangler secret put SETUP_KEY
```

- `TOKEN_SECRET`: cualquier texto largo y aleatorio (40 caracteres o más). Si lo cambiás, todos tienen que volver a loguearse.
- `SETUP_KEY`: una clave que vas a usar una sola vez para crear tu usuario administrador.

El JSON de Google, desde PowerShell (así se pega entero, con los saltos de línea):

```
Get-Content .\clave-cuenta-servicio.json -Raw | npx wrangler secret put GOOGLE_SA_JSON
```

## 4. Publicar el Worker

```
npx wrangler deploy
```

Te devuelve una URL tipo `https://relevamientos-api.TU-SUBDOMINIO.workers.dev`. Probala agregando `/api/health`: tiene que responder `{"ok":true,...}`.

## 5. Publicar la app

1. Abrí `app.js` y cambiá la constante `API` (línea 6) por la URL del Worker.
2. Subí los archivos de la raíz al repo `relevamientos-luccianos`.
3. En GitHub: Settings → Pages → Branch `main`, carpeta `/ (root)`.
4. Verificá que `ALLOWED_ORIGIN` en `wrangler.toml` sea `https://juanluccianos.github.io` (sin barra ni nombre de repo). Si lo cambiás, volvé a correr `npx wrangler deploy`.

## 6. Primer uso

1. Entrá a la app → **¿Primera vez? Configurar la app** → completá con la `SETUP_KEY`. Esto funciona una sola vez, cuando no hay usuarios.
2. **Cuenta → Administración → Usuarios → Cargar varios usuarios**: pegá `datos/usuarios.csv` y elegí una clave inicial para todos. Va primero porque los locales se asignan por email.
3. **Locales**: pegá `datos/locales.csv`. Ya trae coordenadas, tipo, país y supervisores (varios separados por "/").
4. **Checklist**: pegá `datos/checklist.csv` con **Reemplazar el checklist entero** tildado.

Para sacar lat/lng de un local: en Google Maps, clic derecho sobre el local → el primer renglón son las coordenadas.

---

## Cómo calcula el puntaje (igual que Linkup)

- Cada ítem vale puntos (2, 3, 4, 5…). **Cumple** suma todos, **Parcial** la mitad, **No cumple** cero y **N/A** no cuenta.
- Cada capítulo da un porcentaje: puntos obtenidos sobre puntos posibles.
- El total pondera los capítulos por su peso (11 cada uno y 12 Actitudes). Si un capítulo entero es N/A, queda afuera y los demás se reparten su peso.
- Tope en 100. Si falla un ítem marcado como crítico, el local queda como máximo en 79.
- Escalas: Aprobado 90–100, Observado 80–89, Atención urgente 51–79, Crítico 0–50.
- Cada relevamiento guarda los puntos y pesos vigentes ese día: si mañana cambia el checklist, los puntajes históricos no se mueven.
- Verificado contra un relevamiento real de Linkup (Baxar Mercado, 83,14%).

## Roles

- **Supervisor**: releva (puede relevar cualquier local, para cubrir vacaciones) y ve sus locales.
- **Jefe**: ve todo, el resumen y exporta.
- **Administrador**: además carga usuarios, locales y checklist.

## Actualizar la app

Cada vez que cambies `index.html` o `app.js`, subí el número de `CACHE` en `sw.js` (por ejemplo `relevamientos-v2`). Si no, los celulares siguen usando la versión guardada una vuelta más.

## Si algo falla

| Síntoma | Causa probable |
|---|---|
| "No hay conexión con el servidor" apenas abrís | La URL de `API` en `app.js` está mal, o `ALLOWED_ORIGIN` no coincide con el dominio de Pages |
| Los relevamientos se envían pero las fotos quedan pendientes | Revisá `GOOGLE_SA_JSON`, que la carpeta esté en una unidad compartida y compartida con la cuenta de servicio |
| "Google rechazó la cuenta de servicio" | La Drive API no está habilitada en el proyecto de Google Cloud |
| Logs en vivo del Worker | `npx wrangler tail` |
