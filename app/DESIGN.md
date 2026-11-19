# Plates on the iPhone: live data, safe answers and push

Increment 1 draws the simple view (work, agents, decisions) from a bundled
sample and sends nothing. This note says how increment 2 reads the owner's
real workspace and answers a decision without weakening anything the hosted
site already protects. Nothing here is built yet: no route, no migration, no
sign-in. The choices marked **Owner decision** are the owner's to make first.

## What exists today

- The hosted site signs the owner in with GitHub. The browser holds an opaque
  cookie; the server holds a sealed session record with the owner's GitHub
  token, its single-use refresh token and a CSRF value. Every write checks the
  session, the page origin and the CSRF value.
- An answer goes through `POST /api/home/answer`. Not now is written at once;
  every other answer returns a **preview**, and a second call to the apply
  route confirms exactly that preview. Decision and merge writes stay off
  until the owner enables them.
- A device key (the Devices page) lets a Mac push its waiting sessions and
  post channel lines. It names a device, carries no GitHub authority and can
  do nothing else; revoking it on the Devices page ends it.
- Web Push tells the installed web app that something waits: at most one
  notification per item, fixed text that carries nothing private, a deep link
  to the item, and nothing runs from the notification.

## Reading live data

`app.ts` already cuts the hosted shapes (`home.glance`, a project's simple
model, `channel.lines`) to the screen's. Increment 2 replaces the bundled
import with fetches of the same values and keeps the cutting code. The
workspace's address is a build setting (`app.json`'s `env`), never committed:
this repository is public and the address is the owner's.

The read model stays one. The app asks for the values the site and
`plates home` already render; it gets no route that computes something the
other two cannot show.

## Signing in

A cookie session cannot be reused in a native app, and a device key cannot
read a private project (it has no GitHub authority, by design). The app needs
its own session.

**Recommended: the app signs in through the hosted site, in the system
browser, and receives its own revocable app session.**

1. The app opens the site's sign-in in the system browser sheet
   (`@exact/oauth`: PKCE, the callback on the app's own scheme). GitHub's page
   is the browser's; the app never sees a GitHub password or token.
2. The site signs the owner in as it does today, then shows one consent
   screen: "Let Plates on this iPhone read your workspace and answer
   decisions, with a preview first."
3. The site creates a second kind of session record, an **app session**: the
   same sealed shape as a web session, with its own GitHub grant (a refresh
   token is single-use, so the phone cannot share the browser's), marked as
   an app session, with the device's name.
4. The app exchanges its one-time code (bound to its PKCE verifier) for an
   opaque bearer token and keeps it in the Keychain. The token is not a
   GitHub token and is useless anywhere but this workspace.

An app session is narrower than a web session, enforced by the server:

- **Reads:** Home, a project's model, the channel.
- **Writes:** an answer's preview, the apply of that preview, the owner's
  channel line, registering for push. Nothing else: no devices, connections,
  settings, jobs, attachment or deploy.
- **Revocable where device keys are.** The Devices page lists each app
  session (its name, when it signed in, when it was last used) with Revoke.
  Revoking the web session does not end it, and the reverse.
- No CSRF value: a bearer token is not sent by a browser on its own. The
  preview-then-apply rule replaces nothing and stays.

The alternative is a pairing code: the signed-in site shows a one-time code
and the phone types or scans it. It avoids a browser sheet on the phone, but
the app session still needs its own GitHub grant, so the site would have to
run that authorization itself on the phone's behalf. It is more to build and
no safer. Not recommended.

## Answering safely

The phone uses the answer path the site uses, and adds nothing to it.

- A card's answer asks for the **preview**. The app shows what will be
  written, to which project, and its door class (reversible, windowed or
  irreversible, from `lib/doors.mjs`), then the owner confirms that preview.
- Not now writes at once, as on the site: it is reversible and hides the item
  until its date.
- An answer whose door is irreversible (a merge) is confirmed in an alert
  that names what cannot be undone, after the device's own check (Face ID or
  the passcode, `@exact/local-auth`).
- An answer the hosted site cannot give (it is written from the owner's
  checkout) stays shown, disabled, with why and the command, as increment 1
  already draws it. Deploy and Assign stay commands for the Mac until the
  hosted site can do them (phases 181 and 196).
- A stale card fails closed: the server answers that the item no longer
  waits, the app reloads Home and says so.

## Push

A native app cannot receive Web Push: that needs a service worker. The two
live side by side.

**Recommended: APNs for the app, Web Push kept for the installed web app,
one notifier.** The notifier that already decides "one notification for this
item" keeps its ledger and sends through each transport the owner has
registered. The app registers its device token (`@exact/push`) against its
app session; revoking the session removes the token.

The rules do not change with the transport:

- Fixed text, nothing private in the notification.
- A deep link to the item: the card on Home, or the item's page.
- **No notification actions.** A notification only opens the app at the
  item; the answer, its preview and its confirmation happen there. Nothing
  irreversible, and nothing at all, runs from the notification.
- At most one per item, on either transport; a phone with both the web app
  and this app installed gets one, from the app.

APNs needs an Apple push key held by the hosted instance (a new secret) and a
store for device tokens (a migration). Both wait for the decisions below.

## What increment 2 would add

Named so the owner can see the size before agreeing; none of it exists.

- Sign-in for the app on the hosted site: the consent screen, the code
  exchange, the app session kind and its rows on the Devices page.
- Bearer authentication on the read routes and the answer routes above, with
  the narrower allowance tested route by route.
- `app.ts` fetching, with loading, failure and signed-out states in
  `app.contract`; the sample stays as the tests' server.
- The preview and confirm steps on a card; the channel's composer.
- Later, on its own: APNs registration, the sender and the token store.

## Owner decisions needed

1. **Sign-in:** the recommended app session through the site's sign-in, or
   the pairing code.
2. **What the phone may write first:** read only; or Not now and walk
   answers; or merges too. The existing decision-write and merge-write
   switches still apply on top.
3. **Irreversible answers:** allowed from the phone after the device check
   and the alert, or kept to the site.
4. **Push:** APNs alongside Web Push (needs an Apple push key on the hosted
   instance), or no native push until the two-week phone walk of phase 152
   says it is needed.
5. **Distribution:** an install by cable with signed over-the-air updates, as
   the owner's other Exact apps do, or TestFlight. Either needs a signing
   team, an update address and a signing key, none of which is in this
   repository.
6. **The app's identity:** the bundle id `com.dalmaer.plates` in `app.json`
   is a placeholder that follows the owner's other apps; changing it after a
   first install leaves the old app on the phone.
7. **The accent:** the platform's blue today. The workspace's cobalt is a
   one-line change once the owner has seen both on the phone.
