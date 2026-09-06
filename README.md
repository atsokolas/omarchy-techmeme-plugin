# Techmeme

The tech front page, live on the Omarchy bar. The top headline sits on the
bar; the panel carries the rest of the page, each story a keystroke away from
the publisher or from Techmeme's own cluster of everyone else covering it.

Not affiliated with Techmeme. It reads the site's public RSS feed, the same
one any reader does.

## Features

- **The panel is set as a page.** A serif nameplate, a double rule that prints
  across on every edition, a dateline with the day and the edition number, a
  lead story set large with its cut, and the rest of the wire in a ruled
  column underneath.
- **It is visibly live.** A wire light breathes beside the story count for as
  long as the page is open, and a ticker crawls the headlines along the foot
  of the page, looping seamlessly.
- **It wears your theme.** Ink, paper, rules, and the wire light all come from
  the current Omarchy theme and re-set themselves the moment you change it —
  newsprint in a light theme, a dark broadsheet in a dark one. Nothing is
  hard-coded and no restart is needed.
- The top headline on the bar, trimmed to a word boundary at whatever width
  you give it. When the page turns over, the old line drops away and the new
  one rises into its place.
- A dot on the mark, and a rule in the margin of each story, for anything
  filed since you last had the panel open.
- Enter opens the story at the publisher; `t` opens the Techmeme permalink,
  which is where the rest of the coverage of that story lives.
- Cuts as Techmeme serves them, over https. A story without one starts at the
  text.

## Install

```bash
omarchy plugin add https://github.com/atsokolas/omarchy-techmeme-plugin.git --enable
```

That clones the plugin into `~/.config/omarchy/plugins/atsokolas.techmeme`, validates it against the shell's manifest schema, and puts it on the bar. Move it if it did not land where you want:

```bash
omarchy bar move atsokolas.techmeme --section right --before omarchy.network
```

Pull later changes with:

```bash
omarchy plugin update atsokolas.techmeme
```

## Keys and clicks

| Where | Action |
|---|---|
| Bar, left | Open the panel |
| Bar, middle | Open the top story |
| Bar, right | Refresh |
| Panel, `j` / `k` | Move down and up the page |
| Panel, `enter` or `o` | Read the selected story at the publisher |
| Panel, `t` | Open its Techmeme discussion |
| Panel, `c` | Copy the headline, its credit, and the link |
| Panel, `r` | Refresh |
| Panel, `g` | Back to the top |
| Panel, `s` | Open techmeme.com |
| Panel, click a row | Read it · middle-click copies · right-click opens the discussion |

## Settings

| Key | Default | What it does |
|---|---|---|
| `showHeadline` | `true` | The top headline beside the mark, or just the mark |
| `headlineLength` | `38` | How much of it the bar carries |
| `stories` | `12` | How many stories the panel prints |
| `notify` | `false` | A notification when a new story reaches the top |

## IPC

```bash
omarchy-shell atsokolas.techmeme toggle     # open or close the panel
omarchy-shell atsokolas.techmeme refresh    # fetch the front page now
omarchy-shell atsokolas.techmeme top        # print the top headline
omarchy-shell atsokolas.techmeme read       # open the top story
omarchy-shell atsokolas.techmeme copy       # copy it to the clipboard
omarchy-shell atsokolas.techmeme site       # open techmeme.com
omarchy-shell atsokolas.techmeme status     # what the bar is showing, as JSON
```

The bar is a layer surface, so `status` — not a screenshot — is how you check
what it is currently showing.

## The paper

The page is set in the first serif it finds installed — Liberation Serif, Noto
Serif, Tinos, DejaVu Serif, Georgia, Times New Roman — and falls back to the
generic `serif` rather than letting Qt substitute something sans. Datelines,
bylines, and the colophon stay in the bar's own face, so the panel still reads
as part of the shell rather than a page pasted into it.

## Requirements

- Omarchy Quattro with `omarchy-shell`
- `curl` for the feed, `xdg-open` to open a story, `wl-copy` to copy one
- A network connection; without one the panel keeps the last page it read and
  tries again every two minutes

## Data

Stories come from [Techmeme's RSS feed](https://www.techmeme.com/feed.xml),
fetched every five minutes and identified as `omarchy-techmeme/1.0`. Nothing
about you is sent with the request. Thumbnails load from Techmeme's servers
when a story has one. Nothing is written outside the widget's own entry in
`shell.json`, and nothing is cached to disk.

## Tests

```bash
./tests/run
```

Covers the parts that are pure: parsing the feed, splitting a headline from
its credit, finding the publisher's link among Techmeme's own, decoding
entities, trimming for the bar, relative times, and the unread count.

## Remove

```bash
omarchy plugin disable atsokolas.techmeme
omarchy plugin remove atsokolas.techmeme --yes
```

## License

MIT.
