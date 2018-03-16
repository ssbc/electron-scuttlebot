var nest = require('depnest')
var { h } = require('mutant')

exports.needs = nest({
  'feed.pull.public': 'first',
  'message.html.compose': 'first',
  'message.async.publish': 'first',
  'feed.html.rollup': 'first',
  'keys.sync.id': 'first',
  'intl.sync.i18n': 'first'
})

exports.gives = nest({
  'page.html.render': true
})

exports.create = function (api) {
  const i18n = api.intl.sync.i18n
  return nest('page.html.render', page)

  function page (path) {
    if (path !== '/all') return // "/" is a sigil for "page"

    var id = api.keys.sync.id()

    var prepend = [
      h('PageHeading', [
        h('h1', [
          i18n('All Posts from Your '),
          h('strong', i18n('Extended Network'))
        ])
      ]),
      api.message.html.compose({ meta: { type: 'post' }, location: { id: id }, placeholder: i18n('Write a public message') })
    ]

    var feedView = api.feed.html.rollup(api.feed.pull.public, {
      bumpFilter: (msg) => {
        if (msg.value.content) {
          // filter out likes
          if (msg.value.content.type === 'vote') return false
          return msg.value.content && typeof msg.value.content === 'object'
        }
      },
      prepend
    })

    var result = h('div.SplitView', [
      h('div.main', feedView)
    ])

    result.pendingUpdates = feedView.pendingUpdates
    result.reload = feedView.reload

    return result
  }
}
