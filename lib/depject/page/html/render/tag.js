const { Value, Array: MutantArray, computed, map, when, h } = require('mutant')
const nest = require('depnest')
const pull = require('pull-stream')
const ScuttleTag = require('scuttle-tag')

exports.needs = nest({
  'about.obs.name': 'first',
  'app.navigate': 'first',
  'intl.sync.i18n': 'first',
  'keys.sync.id': 'first',
  'message.html.render': 'first',
  'message.obs.get': 'first',
  'sbot.obs.connection': 'first',
  'tag.html.tag': 'first'
})

exports.gives = nest('page.html.render')

exports.create = function (api) {
  const i18n = api.intl.sync.i18n
  return nest('page.html.render', function channel (path) {
    const parts = path.split('/')
    if (parts[1] !== 'tags' || !parts[2] || !parts[3]) return
    const tagId = parts[2] === 'all' ? parts[2] : decodeURIComponent(parts[2])
    const author = parts[3] === 'all' ? parts[3] : decodeURIComponent(parts[3])
    const myId = api.keys.sync.id()
    const scuttleTag = ScuttleTag(api.sbot.obs.connection)
    const showMostActive = Value(parts[4] !== 'recent')

    const usedByYou = scuttleTag.obs.allTagsFrom(myId)
    const mostActive = map(scuttleTag.obs.mostActive(), ([id]) => id, {
      comparer: (a, b) => {
        if (Array.isArray(a) && Array.isArray(b)) {
          return a[0] === b[0] && a[1] === b[1]
        }
      }
    })
    const recent = scuttleTag.obs.recent()
    const community = when(showMostActive, mostActive, recent)
    const filteredCommunity = computed([community, usedByYou], (a, b) =>
      a.filter(c => !b.includes(c)))

    const name = tagId === 'all' ? i18n('All Tags') : api.about.obs.name(tagId)
    const taggedMessages = MutantArray([])
    let messageStream
    if (tagId === 'all' && author === 'all') {
      messageStream = scuttleTag.pull.allTags()
    } else if (tagId === 'all' && author !== 'all') {
      messageStream = scuttleTag.pull.tagsFrom(author)
    } else if (tagId !== 'all' && author === 'all') {
      messageStream = scuttleTag.pull.tagsOf(tagId)
    } else {
      messageStream = scuttleTag.pull.tagsOfFrom(tagId, author)
    }
    pull(
      messageStream,
      pull.map((msg) => api.message.obs.get(msg.value.content.message)),
      pull.drain((msg) => taggedMessages.push(msg))
    )

    return h('SplitView -tags', [
      h('div.side', [
        h('h2', i18n('Tags Used By You')),
        map(usedByYou, tag => computed(tag, tagId => api.tag.html.tag(tagId, {
          href: `/tags/${encodeURIComponent(tagId)}/${encodeURIComponent(myId)}`
        }))),
        h('h2', i18n('Community Tags')),
        h('div.tagControls', [
          h('button.mostActive', {
            'ev-click': () => showMostActive.set(true),
            className: computed(showMostActive, mostActive =>
              mostActive ? '-filterSelected' : '-filterUnselected')
          }, i18n('Most Active')),
          h('button.recent', {
            'ev-click': () => showMostActive.set(false),
            className: computed(showMostActive, mostActive =>
              mostActive ? '-filterUnselected' : '-filterSelected')
          }, i18n('Recent'))
        ]),
        map(filteredCommunity, tag => computed([tag, showMostActive], (tagId, mostActive) => api.tag.html.tag(tagId, {
          href: `/tags/${encodeURIComponent(tagId)}/all/${mostActive ? 'active' : 'recent'}`
        })), { maxTime: 5 })
      ]),
      h('div.main', [
        h('Scroller',
          h('div.wrapper', [
            h('TagsHeader', [
              h('h1', name),
              h('div.tagControls', [
                h('button.you', {
                  'ev-click': () => api.app.navigate(
                    `/tags/${encodeURIComponent(tagId)}/${encodeURIComponent(myId)}`),
                  className: author === 'all' ? '-filterUnselected' : '-filterSelected'
                }, i18n('From You')),
                h('button.all', {
                  'ev-click': () => api.app.navigate(`/tags/${encodeURIComponent(tagId)}/all`),
                  className: author === 'all' ? '-filterSelected' : '-filterUnselected'
                }, i18n('From Everyone'))
              ])
            ]),
            h('section.messages', [
              map(taggedMessages, msg => {
                return computed(msg, msg => {
                  if (msg && !msg.value.missing) {
                    return h('FeedEvent', api.message.html.render(msg, {
                      outOfContext: true
                    }))
                  }
                })
              }, { maxTime: 5 })
            ])
          ])
        )
      ])
    ])
  })
}
