# The band

Tracks played under a battle, looped over in turn. Empty by design: the app
ships with no music in it and works perfectly well that way — the roar and the
drums are synthesised and always there. This folder is where recorded music
goes if you want it.

## Adding tracks

Drop the files here and name them in `index.json`:

```json
{
  "tracks": [
    {
      "file": "marche-consulaire.mp3",
      "title": "Marche Consulaire à Marengo",
      "by": "unknown, 1800",
      "licence": "Public domain",
      "href": "https://musopen.org/..."
    }
  ]
}
```

Every field but `href` is required, and `licence` is not decoration — it is
shown in Settings under the Music switch, because attribution is a condition of
most of the licences worth using.

## Where to get them

Period is the point. This is 1796 and the game is a staff map, so a modern
cinematic score fights the thing rather than serving it.

- **[Musopen](https://musopen.org/music/)** — public-domain recordings of
  classical music, which for this period is the obvious well. Search for
  Beethoven, Haydn, Gossec, Méhul. Public domain means no attribution burden.
- **[IMSLP](https://imslp.org/)** — has recordings as well as scores, much of
  it public domain. French Revolutionary military music is well represented.
- **[Free Music Archive](https://freemusicarchive.org/)** — filter by CC0 or
  CC-BY. Check each track's licence individually; the site hosts several.
- **[ccMixter](https://ccmixter.org/)** — CC-licensed, attribution usually
  required.

Read the licence on each track rather than trusting the site. CC-BY needs the
credit that `index.json` carries; CC-BY-NC is a problem if this ever stops
being a hobby; CC-BY-SA would pull the whole repository along with it.

## Format and size

MP3 or OGG. Nothing here is bundled — the files are streamed from `public/` and
are not downloaded until somebody turns the music on — but they are still
served from your host, so keep them to a few MB each. The whole built app is
about 470KB, so one careless 40MB track is the entire download budget many
times over.
