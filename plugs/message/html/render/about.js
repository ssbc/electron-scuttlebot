var h = require('mutant/h')
var computed = require('mutant/computed')
var nest = require('depnest')
var extend = require('xtend')
var ref = require('ssb-ref')

exports.needs = nest({
  'message.html': {
    decorate: 'reduce',
    layout: 'first',
    markdown: 'first'
  },
  'keys.sync.id': 'first',
  'profile.html.person': 'first',
  'about.obs.name': 'first',
  'blob.sync.url': 'first',
  'intl.sync.format': 'first'
})

exports.gives = nest('message.html.render')

exports.create = function (api) {
  var format = api.intl.sync.format;
  return nest('message.html.render', function about (msg, opts) {
    if (msg.value.content.type !== 'about') return
    if (!ref.isFeed(msg.value.content.about)) return

    var c = msg.value.content
    var self = msg.value.author === c.about
    var content = []

    if (c.name) {
      var target = api.profile.html.person(c.about, c.name)
      content.push(computed([self, api.about.obs.name(c.about), c.name], (self, a, b) => {
        if (self) {
          return [format('selfIdentifiesAs'), ' "', target, '"']
        } else if (a === b) {
          return [format('identified'), ' ', api.profile.html.person(c.about)]
        } else {
          return [format('identifies'), ' ', api.profile.html.person(c.about), ' ', format('as'), ' "', target, '"']
        }
      }))
    }

    if (c.image) {
      if (!content.length) {
        var imageAction = self ? format('selfAssignedImage') : [format('assignedImageTo'), ' ', api.profile.html.person(c.about)]
        content.push(imageAction)
      }

      content.push(h('a AboutImage', {
        href: c.about
      }, [
        h('img', {src: api.blob.sync.url(c.image)})
      ]))
    }

    var elements = []

    if (content.length) {
      var element = api.message.html.layout(msg, extend({
        content, layout: 'mini'
      }, opts))
      elements.push(api.message.html.decorate(element, { msg }))
    }

    if (c.description) {
      elements.push(api.message.html.decorate(api.message.html.layout(msg, extend({
        content: [
          self ? format('selfAssignedDescription') : [format('assignedDescriptionTo'), ' ', api.profile.html.person(c.about)],
          api.message.html.markdown(c.description)
        ],
        layout: 'mini'
      }, opts)), { msg }))
    }

    return elements
  })
}
