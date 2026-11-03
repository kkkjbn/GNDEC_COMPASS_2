# Image inventory and provenance

This file explains the images collected under `D:\testings\gne2` and what each group is for. The deployed app only uses the copies in `compass-v2/public/img/` (and the generated `dist/img/` build).

## 1. Top-level working images (`D:\testings\gne2`)

| File | What it shows | Used in the app? |
| --- | --- | --- |
| `admissions.jpg` | Official GNDEC admission-enquiry poster: NAAC A grade, admission phone/WhatsApp numbers, `admission.gndec.ac.in`, and the admission office at Training & Placement, Seminar Hall, ground floor, PG Block. | No. Kept as a research/source image. |
| `auditorium.jpg` | Group photograph on stage at the 550th Parkash Purb commemorative seminar, 3 October 2019. | No. Research only. |
| `campus-life.jpg` | Bhangra/giddha team performing on an outdoor stage during a college festival. | No. Research only. |
| `library.jpg` | Central Library building exterior, red-brick and cream facade with a lawn. | No. A different library-sign photo is used in the gallery. |
| `workshop.jpg` | Faculty/technicians standing around a BMW TwinPower Turbo engine cutaway in the mechanical/automobile workshop. | No. Research only. |
| `_contact.jpg` | Large contact sheet that previews the whole candidate set: campus, events, classrooms, labs, workshops and logos. | No. Working index. |
| `hero/` | Empty leftover folder. | No. |

## 2. Research and provenance (`gndec-one\_research`)

### `gallery/` — 481 files from the official GNDEC photo gallery
The JSON files (`38.json`, `39.json`, `41.json`, `42.json`) record the original `gndec.ac.in/gallery/picture.php?...` pages and uploaded image URLs. Each set was downloaded, made into a contact sheet, and some images were cropped to read room numbers.

| Sub-group | What it documents |
| --- | --- |
| Set **38** (238 originals + `big-*` enlargements) | Classrooms, seminar halls, drawing halls, workshops, laboratories, ICT computer rooms, server room and corridor details. Used to build the room-photo library. |
| Set **39** | Auditorium exterior/interior, open-air theatre, gym, shooting range, tennis courts, swimming pool, football/cricket grounds and sports complex. |
| Set **41** | A room-by-room classroom survey with visible `ROOM NO.` overlays (F-, G- and S-block rooms, tutorial room, seminar hall). This is the most useful set for matching photos to timetable room codes. |
| Set **42** | A second/variant classroom survey, largely overlapping with set 41. |
| `*-sheet.jpg` | Contact sheets for the four sets. |
| `*-zoom-*.jpg` | Enlarged crops of room-number signs, ICT labs and classroom details used to confirm labels. |
| `*.json` | Source page URLs and download metadata. |

### `commons/` — 10 files, 8 unique images
Public-domain / CC BY 2.0 photographs of the GNDEC campus from Wikimedia Commons, including the illuminated fountain at night, campus roads, lawns, the academic building and the entrance area. `meta.json` records the Commons title, licence and photographer. `hi/` contains 17 higher-resolution/alternate versions.

### `contact/` — 24 images
Miscellaneous campus and event photos collected from the college contact/gallery pages: auditorium crowds, convocation, sports day, prize distributions, cultural events and campus views. Mostly research/reference, not all used.

### Top-level `gndec-one`
- `_sheet.jpg` — a labelled index of the candidate source images with their original filenames (admissions poster, sports day, prize distributions, Gabaria, principal, staff, cultural events, library logos, digital-library logos, repository/thesis logos).
- `_test-commons.jpg`, `_testthumb.jpg` — test downloads/previews of Commons images.

## 3. Production assets (`gndec-one\public\assets`)

| Folder | Count | What it is |
| --- | ---: | --- |
| `img/` | 21 | Curated source images: clean main entrance, new-gate plaque ceremony, admissions poster, auditorium, campus life, convocation, library, workshop/engine, sports, computer lab, campus map, college logo and branded OG image. Several are duplicates under different names. |
| `img/gallery/` | 18 | The gallery actually shown in the app: academic-block courtyard, auditorium interiors, campus roads/courtyard, football ground, gym, library sign, night campus, open-air theatre, principal's bungalow, red corridor, sports complex/field, swimming pool, tennis courts. |
| `img/rooms/` | 51 | Real classroom/lab photos with room-number overlays: F101–F118, G1–G18 and S201–S219 (not every code exists). These support the “see the room” feature. |
| `img/webp/` | 89 | Compressed WebP variants: 20 hero/source images, 18 gallery images, 51 room images. |
| `icons/` | 11 | PWA icons: 32, 48, 96, 144, 180, 192, 256, 384, 512, Apple touch icon and maskable icon. |
| `map/tiles/` | 80 | OpenStreetMap raster tiles (8 × 10 grid) around the campus, used by the Leaflet map. These are map tiles, not photographs. |

## 4. Deployed copies (`compass-v2/public/img` and `dist/img`)

Only these are served by Compass 2.0:

- `img/hero/` — 7 images used for the home hero and fallbacks.
- `img/gallery/` — 18 curated campus photos.
- `img/rooms/` — 51 room photos.

The rest of the collection under `gndec-one/_research` and the top-level files is research material and is not shipped.

## 5. Important naming caveats

- `gndec_2022_newgate.jpg`, `new-gate.jpg` and `_research/img/gndec_2022_newgate.jpg` show a **group at a plaque/stone-laying ceremony**, not a clean photo of a gate. The app now uses `gndec_gne_front.jpg` for the main-gate hero and social preview instead.
- `gndec_full.jpg` is the **2019 seminar group**, not a full-campus panorama.
- `main-gate.jpg`, `admin.jpg` and `gndec_gne_front.jpg` are the **same clean entrance photo** under different names.
- `workshop.jpg`, `gndec_engine.jpg` and `_research/img/gndec_engine.jpg` are the **same workshop/engine photo**.
- Room-to-building links are still inferred from room-code patterns, not surveyed door-by-door. The photos help recognition but do not prove indoor routes.
- GNDEC gallery images are credited to the college's public gallery. Wikimedia Commons images are public domain or CC BY 2.0 as recorded in `commons/meta.json`. Re-check reuse permission before republishing outside this project.
- `admissions.jpg` contains public admission phone numbers; it is kept out of the deployed app to avoid presenting stale contact details as current.

## 6. What to collect next

The images do not cover the admissions counter, every block entrance, indoor corridors, lifts/ramps, accessible routes, bus stops, or current office interiors. See [`MISSING-INFO.md`](./MISSING-INFO.md) for the field collection list.
