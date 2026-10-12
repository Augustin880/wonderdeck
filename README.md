# Wonderdeck · My Wild Atlas (Belgium)

A free, private, photography-based wildlife card album. No stock photos, microtransactions, accounts, or external services.

## Start playing on your phone — online once, then offline

This folder is an installable web app (PWA). To install it, it must be served over **HTTPS** so its offline service worker can work. You only need an internet connection for the first visit/install, not for ordinary gameplay afterwards.

### Easy GitHub Pages setup

1. Create a public repository on GitHub, e.g. `wonderdeck`.
2. Upload **all files in this folder** to the root of the repository (`index.html`, `app.js`, `data.js`, `style.css`, `sw.js`, `manifest.webmanifest`, and both icon files). Do not upload only `index.html`.
3. In repository **Settings → Pages**, choose **Deploy from a branch**, the **main** branch and **/(root)** folder. Save.
4. Open the published HTTPS address in your phone's browser while you have internet.
5. **iPhone (Safari):** Share → Add to Home Screen. **Android (Chrome):** menu → Install app or Add to Home screen.
6. Open the home-screen icon **once while online**. Afterward, the app interface and your saved photos work offline. You can use your camera and add new species with no internet.

**Private photos:** The site code is public when hosted on public GitHub Pages, but your photos and sightings are **not** uploaded to GitHub or any server. They're saved inside your phone's browser storage using IndexedDB. A GitHub Pages deployment serves the app only.

## Standalone desktop version

`wonderdeck-wild-atlas.html` (provided separately) is a self-contained file that can be opened without a web server in many desktop browsers. Some phone browsers treat local files as temporary/isolated and may not retain photo data. For reliable phone use, install the PWA as above.

## How to collect

- Start a new sighting by taking or choosing a photo you captured yourself.
- Work through animal type → subcategory (when applicable) → family → habitat → size.
- The album won't reveal locked animal names or photos. Only on the last identification step can you **choose** to reveal filtered possible species (a suggestion list, not automatic image recognition).
- If a matching species exists in the original hidden catalog (139 Belgian species) or among your added species, choose it. The photo reveals the card, or adds a new record to the same card.
- If the species is not in the catalog, create a card in that category. All numbers are recalculated automatically so taxonomically related cards stay together.
- The **All** tab shows the entire binder; category books include Birds, Mammals, Arthropods, Amphibians & Reptiles, Fish, and Molluscs, Worms & Sea Life. Merged category books also include subcategory tabs, and the photo-identification questionnaire includes a subcategory step (e.g. Insects, Arachnids, Crustaceans, or Myriapods). Existing custom species in older backups are mapped into the new books without changing their IDs.
- Open any collected card to view its photos, see notes and dates, add a repeat sighting, remove a record, or adjust the photo crop. Zoom from 100% to 400%, drag with a finger/mouse to move the image, use arrow buttons to pan in any direction, or choose Whole photo / Reset. Each individual sighting remembers its own framing, including in backups.

## Backup: important

**Settings / Backup → Export backup** downloads a JSON containing your species, sightings, and images. Keep a copy in a safe place. **Import backup** restores it but REPLACES the current album on that device.

Uninstalling the app, changing domains, clearing website data, and some phone storage-cleanup policies can erase locally stored data. Regular backups matter.

## Notes

- Photograph identification is **manual / questionnaire-assisted**, not AI recognition. Similar-looking species can overlap in the candidate list; the observer confirms the final identification.
- All card images come from **your own uploads**. The app does not fetch any wildlife images from the internet.
- Location notes are optional and typed manually; it never asks for GPS location.
- Uploaded images are resized on-device (maximum dimension 1900px, JPEG quality 0.87) to help storage last longer. Keep full-resolution originals in your phone's photo library.
- If your browser has disabled IndexedDB / website storage (private browsing or restrictive local-file policies), saving may be unavailable.

## Responsive album (v7)

On desktops the binder opens as two facing 3×3 pages. On phones and portrait tablets, one complete page of nine cards fills the screen width; tap Previous/Next or swipe horizontally to turn a page. Book and subgroup selectors are compact dropdowns on phones, while desktop keeps the tabs. Card numbers appear beneath photos.
