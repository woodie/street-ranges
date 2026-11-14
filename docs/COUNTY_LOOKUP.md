# Your own county lookup

A county can run its own address lookup, showing whatever it wants for each precinct (supervisor
district, school and fire districts, a polling place), on a free host. The
lookup reads the street ranges published here, which are rebuilt from the county's own public
layers, so the county keeps its data current and owns the page.

This guide is a first draft. An npm package will replace the script link in step 2 once it's
published.

## 1. Keep two public layers current

On whatever GIS system the county already uses:

- **Precinct boundaries** for the coming election, with each precinct's number.
- **Addresses:** each address point with its house number, street and zipcode. Better still,
  each address with its precinct, as Inyo County's
  [Attributed Addresses](https://gis.inyo.gov/server/rest/services/AttributedAddresses/FeatureServer/0)
  layer has.

Tell us where they are (a [feedback issue](https://github.com/woodie/street-ranges/issues/new)
is fine), and the street ranges for your county will be built from them.

## 2. Copy the sample

Make a folder with two files.

`districts.json` is yours: each of your precincts, by the number your county uses, with what to
show for it (these numbers are made up):

```json
{
  "17001": ["Supervisor District 1", "Lakeport Unified School District"],
  "17002": ["Supervisor District 1", "Kelseyville Unified School District"]
}
```

`index.html` asks for an address, finds its precinct in the published street ranges, and shows
your districts for it:

```html
<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Find your districts</title>
<form id="find">
  <label for="address">Street address</label>
  <input id="address" required>
  <button>Find</button>
</form>
<p id="answer" role="status"></p>
<ul id="districts"></ul>
<script src="https://precinct.netpress.com/main.js"></script>
<script>
  const DATA = 'https://precinct.netpress.com/counties/'
  const get = (path) => fetch(`${DATA}${path}.json`).then((reply) => reply.ok ? reply.json() : {})
  const source = {
    index: () => get('index'),
    file: (county, zip) => get(`${county}/streets/${zip}`),
    mapIndex: () => ({}),
    maps: () => ({ type: 'FeatureCollection', features: [] })
  }
  const districts = fetch('districts.json').then((reply) => reply.json())
  document.getElementById('find').addEventListener('submit', async (event) => {
    event.preventDefault()
    const answer = await StreetRanges.lookup(document.getElementById('address').value, source)
    document.getElementById('answer').textContent = answer.text
    const list = answer.found ? (await districts)[answer.found.number] ?? [] : []
    document.getElementById('districts').replaceChildren(
      ...list.map((name) => Object.assign(document.createElement('li'), { textContent: name })))
  })
</script>
</html>
```

The address never leaves the visitor's browser: the page fetches only the typed zipcode's
street ranges.

## 3. Host it for free

The two files are a static page, so any free host will do. Change `districts.json` and publish
again whenever your districts change.

| Host | Cost | How |
| --- | --- | --- |
| Your county's own website | Already paid for | Put both files in a folder on it |
| [GitHub Pages](https://pages.github.com) | Free for public repositories | A repository with the two files; turn on Pages in its settings |
| [Cloudflare Pages](https://pages.cloudflare.com) | Free plan | Upload the folder, or connect a repository |
| [Netlify](https://www.netlify.com) | Free plan | Drag the folder onto its deploy page |
| [Azure Static Web Apps](https://azure.microsoft.com/products/app-service/static) | Free plan; fits a county already on Microsoft | Create a static web app on the Free plan, then connect a repository or deploy the folder with the SWA CLI |
| [Google App Engine](https://cloud.google.com/appengine) | Free daily quota; Google may ask for a billing account | Below |

Each can use the county's own domain, such as `lookup.lakecounty.gov`.

**App Engine.** Create a project at [console.cloud.google.com](https://console.cloud.google.com),
for example `lake-county-lookup`, install the
[Google Cloud CLI](https://cloud.google.com/sdk/docs/install), and add an `app.yaml` beside the
two files:

```yaml
runtime: python312
handlers:
  - url: /
    static_files: index.html
    upload: index.html
  - url: /(.*)
    static_files: \1
    upload: (.*)
```

Then run `gcloud app create --project=lake-county-lookup --region=us-west2` once, and
`gcloud app deploy --project=lake-county-lookup` to publish. The lookup is live at
`https://lake-county-lookup.appspot.com`.
