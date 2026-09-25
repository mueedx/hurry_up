# Privacy Policy — Hurry Up! (Timer Skipper & Fast Downloader)

**Last updated:** September 25, 2026

Hurry Up! is a Manifest V3 Chrome extension that speeds up countdown-gated download
pages entirely inside your browser. This policy explains exactly what the extension
does and does not do with your data.

## Short version

- **No data is collected.**
- **No data is transmitted anywhere.** The extension makes no network requests of its own.
- **No analytics, no telemetry, no tracking, no ads, no third-party servers.**
- All settings live in your own browser profile.

## What the extension stores

The extension stores only your own configuration, using Chrome's built-in
`chrome.storage` API:

- Global on/off switch and the list of excluded websites (domains you disabled)
- Timer rules (bypass mode, multiplier, min/max delay, function cloaking)
- Network-hook rules and the list of API URL patterns you chose to watch
- Overlay CSS selectors, auto-click keywords, settling delay, anti-ad filtering
- Local counters (timers skipped, requests accelerated, buttons clicked)

Because this configuration is saved with `chrome.storage.sync`, Chrome may sync it
between your own signed-in browser profiles through your Google account. That
transfer is performed by Chrome itself under Google's terms — the extension has no
server and never uploads anything. Settings backup/export is a local `.json`
download you trigger yourself.

Uninstalling the extension removes its stored data from your browser profile.

## What the extension does on web pages

The extension reads and modifies the page in your active tab in order to skip
wait-gate delays:

- It intercepts JavaScript timing functions and network calls (`fetch`,
  `XMLHttpRequest`) **inside the page**, in memory only, to make client-side
  countdowns resolve sooner.
- It observes the page DOM to hide countdown / "please wait" overlays and to reveal
  a gated download control.
- **Auto-clicking is off by default.** When you enable it, a button is only clicked
  when the page looks like a countdown gate and the button is genuinely visible,
  enabled, and matches one of your keywords.

Page content is processed locally and in memory. It is never stored, logged to a
server, or shared with anyone.

## Permissions and why they are needed

| Permission | Why it is requested |
| --- | --- |
| `storage` | Save the settings listed above in your browser profile. |
| `activeTab` | Apply changes to the tab you are actively viewing when you interact with the extension. |
| Content script match `<all_urls>` | Countdown download pages exist on many domains, so the timer/DOM logic must be able to run on whichever site you are using. It runs only on pages you visit and is inert on pages that are not countdown gates. |

The extension does **not** request host permissions, `webRequest`, `downloads`,
`cookies`, `history`, `tabs` (URL access), or any remote-code capability.

## Data sharing

None. There is no server, no backend, no third-party SDK, and no code delivered from
a remote source (Manifest V3 policy compliant — no `eval`, no remote scripts).

## Children's privacy

The extension collects no personal data from anyone, including children.

## Changes to this policy

Any change to this policy will be committed to this repository, so the full history
of what this extension does is publicly reviewable.

## Contact

Questions or concerns: open an issue at
<https://github.com/mueedx/resume/issues> or email
<mueedmubashar98@gmail.com>.
