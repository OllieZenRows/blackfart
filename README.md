# Blackfart

Blackfart is an open-source community sound archive. Members sign in with ChatGPT, submit a story, a recording made in the app, or a previous audio/video upload, and vote on approved entries in the Fartifyty chart. A private review desk controls what becomes public. The world map uses only member-approved entries with an explicit rough-location opt-in; stored pins are rounded to a 0.5° grid (about 55 km at the equator).

## Run locally

Requires Node.js 22.13 or newer.

```sh
npm run install:ci
npm run dev
```

The local Sites preview uses a mock ChatGPT identity. Visit `/signin-with-chatgpt?return_to=/` to sign in as `Seedy`, or `/signout-with-chatgpt?return_to=/` to sign out. Local media and database state are for development only.

## Storage and moderation

Production entry metadata, member IDs, private account emails, votes, and review state use Cloudflare D1. Audio and video bytes use Cloudflare R2. Schema changes are kept in `drizzle/` and applied by the Sites publish workflow. The publisher's ChatGPT email is configured as the private `BF_ADMIN_EMAIL` runtime setting to enable moderation.

Uploaded media stays private while pending review. The chart never receives member email, user IDs, or upload keys. The user must opt in to browser location; only a coarsened map pin is stored. Audio/video may be labeled as recorded in-app or previously uploaded, but that label is not automatic proof that a clip is authentic.

## Fart Coin and cause

Fart Coin is the planned cash-convertible auction currency. Bids and cash conversion are disabled in this release until conversion terms, a payment route, prize details, and the exact charitable share and named colon-cancer beneficiary can be published.

## Sound credits

The six bundled sample recordings are from Freesound contributors Breviceps and DSISStudios and are released under CC0 1.0. `public/audio/sources.json` lists each creator, original source page, and licence; the edited Morning Trumpet cut is also described there. Read the [CC0 1.0 licence](https://creativecommons.org/publicdomain/zero/1.0/).

## License

Application code is MIT licensed. The sample recordings are CC0 1.0. See `LICENSE` and `public/audio/`.
