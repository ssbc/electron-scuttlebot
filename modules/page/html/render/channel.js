var { h } = require('mutant')
var nest = require('depnest')

exports.needs = nest({
  'message.html.compose': 'first',
  'channel.sync.normalize': 'first',
  'channel.html.subscribeToggle': 'first',
  'feed.html.rollup': 'first',
  'feed.html.followWarning': 'first',
  'feed.pull.channel': 'first',
  'sbot.pull.log': 'first',
  'message.async.publish': 'first',
  'keys.sync.id': 'first',
  'intl.sync.i18n': 'first',
  'settings.obs.get': 'first',
  'profile.obs.contact': 'first'
})

exports.gives = nest('page.html.render')

exports.create = function (api) {
  const i18n = api.intl.sync.i18n
  return nest('page.html.render', function channel (path) {
    if (path[0] !== '#') return

    var id = api.keys.sync.id()
    var contact = api.profile.obs.contact(id)

    var channel = api.channel.sync.normalize(path.substr(1))

    var prepend = [
      h('PageHeading', [
        h('h1', `#${channel}`),
        h('div.meta', [
          api.channel.html.subscribeToggle(channel)
        ])
      ]),
      api.message.html.compose({
        meta: { type: 'post', channel },
        location: { path: channel, id: `#${channel}` },
        placeholder: i18n('Write a message in this channel')
      }),
      noVisibleNewPostsWarning()
    ]

    const filters = api.settings.obs.get('filters')
    const channelView = api.feed.html.rollup(
      api.feed.pull.channel(channel), {
        prepend,
        rootFilter: checkFeedFilter,
        displayFilter: mentionFilter,
        bumpFilter: mentionFilter
      })

    // call reload whenever filters changes
    filters(channelView.reload)

    return channelView

    function checkFeedFilter (msg) {
      const filterObj = filters() && filters().channelView
      if (filterObj) {
        const msgType = msg && msg.value && msg.value.content &&
                        msg.value.content.type
        // filter out channel subscription messages
        if (filterObj.subscriptions && msgType === 'channel') { return false }
      }
      return true
    }

    function mentionFilter (msg) {
      // filter out likes
      if (msg.value.content.type === 'vote') return false
      if (api.channel.sync.normalize(msg.value.content.channel) === channel) return true
      if (Array.isArray(msg.value.content.mentions)) {
        if (msg.value.content.mentions.some(mention => {
          return mention && getNormalized(mention.link) === `#${channel}`
        })) {
          return 'channel-mention'
        }
      }
    }

    function getNormalized (link) {
      if (typeof link === 'string' && link.startsWith('#')) {
        return `#${api.channel.sync.normalize(link.slice(1))}`
      }
    }

    function noVisibleNewPostsWarning () {
      var warning = i18n('You may not be able to see new channel content until you follow some users or pubs.')
      return api.feed.html.followWarning(contact.isNotFollowingAnybody, warning)
    }
  })
}
