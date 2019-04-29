const requireConf = requirejs.config({
  context: "index.html",
  paths: {

  }
})

if('serviceWorker' in navigator) {
  navigator.serviceWorker
           .register('sw.js')
           .then(function() { console.log("Service Worker Registered"); });
}

requireConf([
  "https://unpkg.com/pouchdb@7.0.0/dist/pouchdb.min.js",
  "https://unpkg.com/js-yaml@3.12.0/dist/js-yaml.min.js",
], function (PouchDB, yaml) {
  const db = new PouchDB('wiki');

  (async () => {
    populateAuth()

    let index = await db.get('index').catch(e => null)
    if (!index) {
      await sync();
      index = await db.get('index').catch(e => null)
    }

    if (index) {
      renderDoc(index)
    }

    setTimeout(async function() {
      await sync()

      const { rows } = await db.allDocs({
        include_docs: true,
      })

      rows.forEach(({ doc }) => {
        if (doc._id !== 'index') renderDoc(doc)
      })
    }, 100);
  })()

  async function sync() {
    const str = localStorage['couchdb_target']
    if (!str) {
      return
    }

    const config = JSON.parse(str)
    const remoteDb = new PouchDB(config.url, { auth: config.auth })

    await db.sync(remoteDb, {
      live: false, retry: false
    }).on('denied', function (err) {
      console.log('denied', err)
    }).on('error', function (err) {
      console.log('error', err)
    });
  }

  function populateAuth() {
    if (localStorage['couchdb_target']) {
      return
    }
    const result = prompt("replication target")
    if (!result) {
      alert("Unable to authenticate")
      return
    }

    try {
      JSON.parse(result)
      localStorage['couchdb_target'] = result
    } catch(err) {
      console.log(err)
      iphoneDebug(err)
      alert("Unable to authenticate")
      return
    }
  }

  function iphoneDebug(err) {
    var div = document.createElement("pre");
    div.innerHTML = JSON.stringify({msg: err.message, err: err}, null, ' ')
    document.body.appendChild(div);
  }

  function wrapLink(l) {
    return `#L#${l}#L#`
  }

  function wrapAnchor(l) {
    return `#A#${l}#A#`
  }

  function convertRelated(doc) {
    if (doc.related) {
      if (typeof doc.related === "string") {
        doc.related = wrapAnchor(doc.related)
      } else {
        doc.related = doc.related.flatMap(r => wrapAnchor(r))
      }
    }
  }

  function convertLinks(doc) {
    if (doc.links) {
      doc.links = doc.links.flatMap(l => {
        if (typeof l === "string") {
          return wrapLink(l)
        }

        if (l.link) {
          l.link = wrapLink(l.link)
        }

        if (l.search && !l.site) {
          l.search = `<a target="_blank" href="https://google.com/search?q=${encodeURIComponent(l.search)}">${l.search}</a>`
        }

        return l
      })
    }
  }

  function convertThought(doc) {
    convertLinks(doc)
    convertRelated(doc)
    if (doc.more) doc.more.forEach(convertThought)

    if (!doc.src) return

    if (typeof doc.src === "string") {
      if (!doc.src.startsWith("http"))  return
      doc.src = wrapLink(doc.src)
    } else if (doc.src.link) {
      doc.src.link = wrapLink(doc.src.link)
    }
  }

  function convertTopic(doc) {
    convertLinks(doc)
    convertRelated(doc)

    if (doc.books) {
      doc.books.forEach(b => {
        if (b.link) {
          b.link = wrapLink(b.link)
        }
      })
    }

    if (doc.todo) doc.todo.forEach(convertThought)
    if (doc.list) doc.list.forEach(convertThought)
    if (doc.thoughts) doc.thoughts.forEach(convertThought)
    if (doc.topics) {
      doc.topics = doc.topics.flatMap(t => {
        if (typeof t === "string") {
          return wrapAnchor(t)
        } else {
          convertTopic(t)
          return t
        }
      })
    }
  }

  function renderDoc(doc) {
    if (!doc.what) {
      doc.what = `list_of: ${doc.list_of}`
    }

    convertTopic(doc)

    const coded = sortedYaml(doc).
      replace(/#A#(.+?)#A#/g, '<a href="#$1">$1</a>').
      replace(/#L#(.+?)#L#/g, '<a target="_blank" href="$1">$1</a>')

    var node = document.createElement("div");
    node.id = doc._id
    node.innerHTML = `
      ${spanIfNeeded(doc)}
      <h3>${doc.what}</h3>
      <pre>${coded}</pre>
    `

    document.body.appendChild(node);
  }

  function spanIfNeeded(doc) {
    return (doc.what !== doc._id) ? `<span id="${doc.what}"></span>` : ""
  }

  function getWidth() {
    return Math.max(
      document.body.scrollWidth,
      document.documentElement.scrollWidth,
      document.body.offsetWidth,
      document.documentElement.offsetWidth,
      document.documentElement.clientWidth
    );
  }

  function getHeight() {
    return Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight,
      document.body.offsetHeight,
      document.documentElement.offsetHeight,
      document.documentElement.clientHeight
    );
  }

  function stringToList(value) {
    if (typeof value === "string") {
      return [ value ];
    }

    return value || [];
  }

  let widthMem
  const maxPreWidth = 100;
  function getPreWidthMem() {
    if (!widthMem) {
      widthMem = Math.floor((getWidth() - 48)/8)
      widthMem = Math.min(widthMem, maxPreWidth)
    }

    return widthMem
  }


  function sortedYaml(input) {
    return yaml.safeDump(input, {
      lineWidth: getPreWidthMem(),
      sortKeys: function (a, b) {
        const fieldOrder = [
          '_id',
          '_rev',
          'what',
          'list_of',
          'aka',
          'text',
          'search',
          'about',
          'code',
          'quote',
          'src',
          'question',
          'answer',
          'more',
          'date',
          'tags',
          'related',
          'links',
          'books',
          'todo',
          'topics',
          'list',
          'thoughts',
          'title',
          'book',
          'chapter',
          'link'
        ]
        for (var i=0;i<fieldOrder.length;i++) {
          if (a == fieldOrder[i]) {
            return -1
          }
          if (b == fieldOrder[i]) {
            return 1
          }
        }
        return a < b ? 1 : a > b ? -1 : 0;
      }
    })
  }
})
