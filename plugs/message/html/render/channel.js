var h = require('mutant/h')
var nest = require('depnest')
var extend = require('xtend')

exports.needs = nest({
  'message.html': {
    decorate: 'reduce',
    layout: 'first'
  },
  'intl.sync.format':'first'
})

exports.gives = nest('message.html.render')

exports.create = function (api) {
  var format = api.intl.sync.format;
  return nest('message.html.render', function renderMessage (msg, opts) {
    if (msg.value.content.type !== 'channel') return
    var element = api.message.html.layout(msg, extend({
      content: messageContent(msg),
      layout: 'mini'
    }, opts))

    return api.message.html.decorate(element, { msg })
  })

  function messageContent (msg) {
    var channel = `#${msg.value.content.channel}`
    var subscribed = msg.value.content.subscribed
    return [
      subscribed ? format('subscribedTo') : format('unsubscribedFrom'),
      h('a', {href: channel}, channel)
    ]
  }
}
