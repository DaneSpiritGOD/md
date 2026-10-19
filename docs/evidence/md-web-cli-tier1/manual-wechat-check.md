# Tier 1 manual WeChat check (ticket 07) — PENDING HUMAN CHECK

This is the one manual step of ticket 07. The machine side is done: the
semantic diff reports zero unexplained differences and every default
verifies (see `semantic-diff-report.md` and `defaults-verification.txt`).

## What to paste

Both artifacts are ready to paste into the WeChat 公众号 editor:

- `oracle.html` — the browser copy-flow output (baseline)
- `cli-output.html` — the CLI's WeChat-ready output (under test)

## Steps

1. Open the WeChat 公众号 editor (mp.weixin.qq.com) in a desktop browser.
2. In a text editor, open `cli-output.html`, select all, copy, and paste
   into the WeChat editor body. Screenshot the result.
3. Clear the editor. Repeat with `oracle.html`. Screenshot the result.
4. Compare the two screenshots side by side (or open both in two windows).

## What to look for

- h2 pill: white text on the `#0F4C81` blue background, centered
- blockquote: 4px `#0F4C81` left border, grey `#f7f7f7` background
- code blocks: dark `#0d1117` background, mac-style three-dot title bar
- strong text: `#0F4C81`
- body text: near-black (`rgb(10,10,10)`)
- links: WeChat blue `#576b95`
- image captions: alt text centered under each image
- tables: thin grey borders, no overflow
- overall spacing/rhythm visually identical between the two pastes

## Recording the conclusion

Append the outcome (match / mismatch + notes) to the
"PENDING HUMAN CHECK" section of `semantic-diff-report.md`, replacing the
pending marker with the conclusion and the date. That closes ticket 07's
final acceptance criterion; the coordinator closes the issue.
