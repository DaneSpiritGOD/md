# Manual WeChat check

The gate compares two implementations. Neither has been pasted into a real
WeChat editor by an automated check, so one step is still human: paste each
output into the 公众号 editor and compare what WeChat actually renders.

Do this when a visual change is intentional, when a difference class has just
been resolved, and before a release that matters.

## 1. Produce the two artifacts

```bash
pnpm wcli:verify --fixture full --keep
```

The gate prints where it wrote its artifacts. A red result is expected while
differences remain — the artifacts are produced either way. Note the printed
directory:

```
[verify] artifacts: /tmp/md-verify-XXXX
[verify] oracle: /tmp/md-verify-XXXX/full/oracle.html
[verify] cli:    /tmp/md-verify-XXXX/full/cli.html
```

- `oracle.html` — what the browser's WeChat copy flow puts on the clipboard.
- `cli.html` — what the CLI produces for the same fixture.

## 2. Paste both

1. Open the WeChat 公众号 editor (`mp.weixin.qq.com`) in a desktop browser.
2. Open `cli.html` in a text editor, select all, copy, and paste into the
   editor body. Screenshot the result.
3. Clear the editor. Repeat with `oracle.html`. Screenshot the result.
4. Compare the two screenshots side by side, or open both in two windows.

## 3. What to look for

- **h2 pill:** white text on the `#0F4C81` blue background, centred.
- **blockquote:** 4px `#0F4C81` left border, grey `#f7f7f7` background.
- **code blocks:** dark `#0d1117` background, mac-style three-dot title bar,
  readable syntax colours.
- **strong text:** `#0F4C81`.
- **body text:** near-black (`rgb(10,10,10)`).
- **links:** WeChat blue `#576b95`.
- **image captions:** alt text centred under each image.
- **tables:** thin grey borders, no horizontal overflow.
- **overall rhythm:** spacing between blocks looks the same in both pastes.

The gate's byte comparison cannot answer any of these. WeChat's editor is a
third implementation with its own sanitizer, and it is the only one the reader
ever sees.

## 4. Record the outcome

Comment on the md-web-cli tracking issue ([#1](https://github.com/DaneSpiritGOD/md/issues/1))
with the verdict — match, or mismatch plus which of the points above differed —
and attach both screenshots. If something mismatches, open an issue naming the
element and the observed difference; a screenshot is required.

There is no committed evidence directory any more. The artifacts above are
regenerable output, not source; do not commit them.
