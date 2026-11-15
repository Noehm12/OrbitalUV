# OrbitalUV

Proyecto del equipo OrbitalUV para el NASA Space Apps Challenge 2026.

Eliges las fechas de una misión y la web te dice dónde aterrizar cerca del polo sur de la Luna:
en qué sitios habría luz solar (energía) y la Tierra a la vista (comunicación directa) durante
esos días. Cada zona recomendada trae un punto principal y varios de reserva.

Todos los datos son de la NASA (relieve LOLA, mapas de iluminación PGDA, efemérides NAIF y
JPL Horizons) más los nombres oficiales de la IAU. Los cálculos los hacemos nosotros con esos
datos. Las fuentes están en [SOURCES.md](SOURCES.md) y cada archivo de datos explicado en
[DATA.md](DATA.md).

No es una herramienta oficial de la NASA ni certifica nada: estima visibilidad geométrica, no
seguridad de aterrizaje, energía generada ni cobertura de radio.

## Cómo abrirla

Hace falta Python 3.8 o más reciente. No hay que instalar nada más.

- Windows: doble clic en `RUN.bat`
- Mac / Linux: `./run_mac_linux.sh`
- Desde una terminal: `python app.py`

Se abre en el navegador (http://localhost:8000, o el siguiente puerto libre). Deja la ventana
abierta mientras la uses. Funciona sin internet.

Hace falta el servidor local porque el navegador no deja que una página abierta desde el disco
cargue sus propios archivos de datos.

## Qué hace

1. **Tu misión**: eliges fecha de llegada y duración (entre 2025 y 2040).
2. **Resultados**: hasta 6 zonas ordenadas por el tiempo con Sol y Tierra a la vez, con su %
   de luz, de Tierra, la noche más larga, la mejor ventana para aterrizar, gráficas y el
   horizonte visto desde el punto.
3. **Mapa lunar**: capas de luz, Tierra, Sol y Tierra a la vez y relieve. Puedes ver la media de
   la NASA (18,6 años) o calcular los mapas para tus fechas. También hay una simulación de luz y
   sombra de un día.
4. **Ciencia**: de dónde salen los datos, cómo se calcula y qué limitaciones tiene.
5. **Equipo**: se edita en `config/team.json`.

## Cómo funciona, en corto

- Con el mapa de alturas LOLA (80 m) trazamos el horizonte de cada punto: hasta dónde tapan el
  cielo las montañas en cada dirección, hasta 150 km y teniendo en cuenta la curvatura.
- Con los kernels NAIF (DE440) calculamos dónde están el Sol y la Tierra vistos desde la Luna,
  cada 6 h de 2025 a 2040. Coinciden con JPL Horizons con menos de 0,001° de diferencia.
- En cada instante comprobamos si el Sol y la Tierra quedan por encima del horizonte.
- Nuestros mapas se comparan con los oficiales de la NASA: 1,4 puntos de diferencia media en luz
  y 2,7 en Tierra.

Lo largo está en la página Ciencia de la web.

## Carpetas

```
OrbitalUV/
├── app.py, RUN.bat, run_mac_linux.sh   arrancar la web
├── build_data.py                       regenerar web/data desde los archivos de la NASA
├── config/team.json                    datos del equipo
├── data/nasa/                          archivos pequeños de la NASA (los grandes se descargan)
├── data/exports/                       tablas en CSV para abrir con Excel
├── services/  utils/  components/      código Python del cálculo
├── scripts/                            utilidades sueltas
├── tests/                              pruebas
└── web/                                la web (HTML, CSS, JS y los datos ya calculados)
```

## Regenerar los datos

La web ya trae todo calculado. Solo hace falta si cambias algo del cálculo.

```
pip install -r requirements.txt
python build_data.py              todo
python build_data.py ephem        tabla del Sol y la Tierra (kernels NAIF)
python build_data.py site         mapas, candidatos y capas de la web (LOLA + PGDA 69)
python build_data.py horizons     horizontes de 1 km para los mapas por fechas (LOLA)
python build_data.py csv          tablas de data/exports/
```

Los archivos grandes (el relieve LOLA de 181 MB, los mapas PGDA 69 y dos kernels NAIF) no
están en el repositorio: los enlaces están en SOURCES.md y van en `data/nasa/`.

Si no tienes el relieve LOLA, `python scripts/rebuild_date_horizons.py` saca unos horizontes
aproximados a partir de la copia de 400 m que va dentro de `site.json`. Salen de media unos
0,3° más bajos, así que la web los marca como aproximados.

## Pruebas

```
python -m pytest
node tests/test_rasters.js
node tests/test_web_maps.js
```

## Limitaciones conocidas

- El relieve es de 80 m: no se ven cráteres de menos de unos 200 m ni rocas.
- La pendiente se mide en unos 560 m alrededor de cada punto.
- La luz se calcula a ras de suelo, sin paneles elevados.
- El Sol cuenta como un punto, sin penumbra ni intensidad.
- Los mapas por fechas usan celdas de 1 km; los puntos numerados usan su propio horizonte.
