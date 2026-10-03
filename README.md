# Blackfart

Blackfart is an open-source community sound archive. Members sign in with ChatGPT, submit a story, a recording made in the app, or a previous audio/video upload, and vote on approved entries in the Fartifyty chart. A private review desk controls what becomes public. The world map uses only member-approved entries with an explicit rough-location opt-in; stored pins are rounded to a 0.5° grid (about 55 km at the equator), grouped, and linked to Google Maps at that rounded point.

## Run locally

Requires Node.js 22.13 or newer.

```sh
npm run install:ci
npm run dev
```

The local Sites preview uses a mock ChatGPT identity. Visit `/signin-with-chatgpt?return_to=/` to sign in as `Seedy`, or `/signout-with-chatgpt?return_to=/` to sign out. Local media and database state are for development only. The main submission flow starts on the map: click, tap, or press Enter to choose a rough pin, then add a short story in the inline composer. Drag or tap again to move the pin without losing the story or clip. Signing in restores the pin and story from session storage; add media after sign-in. Submit explicitly with consent; entries remain pending until reviewed. Cancel or a successful submission clears the draft. Drafts expire after 24 hours.

## EFM

Open `/efm` for a four-track, sixteen-step sampler. The previous `/symphony` address redirects here. Three restrained presets (Easy Groove, After Hours, Soft Bounce) start at natural pitch with fewer overlapping notes. Notes, tempo, pitch, level, mute, and sample choices can be edited during playback. EFM uses six short CC0 sample edits with softened high frequencies, smooth fades, and balanced levels; the original ten recordings remain in the sound lab. Prepared notes retain their full attack and release, and previews use the same master level as the mix. Own audio files up to 8 MB stay in the browser and are never uploaded or submitted; compositions and imported files are not retained after leaving the studio.

Export renders four bars to a stereo 44.1 kHz PCM WAV in the browser, with an audio preview and save link. It needs no account or server storage. Web Audio playback starts only after a user gesture and stops when leaving the studio. The audio engine tests use simulated clocks and contexts; browser playback, file import, export, and responsive checks are separate.

Run the sampler tests with `node --experimental-strip-types --test tests/symphony-*.test.mjs`.

“Listen & match” opens the microphone on request, analyzes bass-energy transients locally, and starts EFM after two consistent tempo estimates. The sampler shares the microphone’s audio clock to align its beat and follow subsequent estimates (60–180 BPM). No mic audio is recorded, uploaded, saved, or played through the speakers. Stop listening releases every microphone track; leaving the studio also stops playback. A steady, audible beat works best; noisy rooms, syncopation, and strong subdivisions can make estimates uncertain or produce half/double time. Headphones for EFM prevent it feeding back into its own detector. Tap tempo, half/double speed, and the tempo slider switch to manual control. WAV export contains only the EFM composition.

Randomize groove keeps the current tempo and imported samples while generating restrained rhythms from the six-sound kit. Undo restores the previous instruments and notes. Automated coverage includes synthetic tempo/phase detection, trailing silence/noise rejection, playback alignment, live edits, microphone cancellation/disconnection, and resource cleanup. Acoustic matching with real songs remains dependent on the device and room.

`public/audio/efm/manifest.json` documents each note's source, edit, and measured audio levels. The optional `scripts/build-efm-kit.py` rebuilds the kit from the credited originals; its dependencies are listed at the top of that script. These tools are not required to run the website.

## Storage and moderation

Production entry metadata, member IDs, private account emails, votes, and review state use Cloudflare D1. Audio and video bytes use Cloudflare R2. Schema changes are kept in `drizzle/` and applied by the Sites publish workflow. The publisher's ChatGPT email is configured as the private `BF_ADMIN_EMAIL` runtime setting to enable moderation.

Uploaded media stays private while pending review. The chart never receives member email, user IDs, or upload keys. Map selection does not request device location. A manually selected pin is rounded before saving; the separate full submission dialog also offers optional device location. Only a coarsened map pin is stored. Audio/video may be labeled as recorded in-app or previously uploaded, but that label is not automatic proof that a clip is authentic. Approved entries are marked `unverified` unless a moderator listens and explicitly marks a recording `listener-confirmed`; that status means only that the moderator judged it consistent with a fart, not that it is scientifically or forensically authenticated. Story-only entries cannot receive a listener check.

The interactive map uses Leaflet with OpenStreetMap tiles by default and shows required map attribution. Set `NEXT_PUBLIC_OSM_TILE_URL` before the build to use another compatible tile provider. Check that provider's terms and capacity needs before scaling traffic.

## Fart Coin and cause

Fart Coin is the planned cash-convertible auction currency. Bids and cash conversion are disabled in this release until conversion terms, a payment route, prize details, and the exact charitable share and named colon-cancer beneficiary can be published.

## Sound credits

The soundboard includes ten Freesound reference clips released under CC0 1.0. They are separate from member submissions. `public/audio/sources.json` lists each creator, source page, preview, licence, and any creator authenticity description. Those descriptions are not independent verification. Read the [CC0 1.0 licence](https://creativecommons.org/publicdomain/zero/1.0/).

## License

Application code is MIT licensed. The sample recordings are CC0 1.0. See `LICENSE` and `public/audio/`.
