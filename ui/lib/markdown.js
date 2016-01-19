'use strict'
var emojiNamedCharacters = require('emoji-named-characters')
var marked = require('ssb-marked')
var ssbref = require('ssb-ref')
var mlib   = require('ssb-msgs')

var blockRenderer = new marked.Renderer()
var inlineRenderer = new marked.Renderer()

// override to only allow external links or hashes, and correctly link to ssb objects
blockRenderer.urltransform = function (url) {
  var c = url.charAt(0)
  var hasSigil = (c == '@' || c == '&' || c == '%')

  if (this.options.sanitize && !hasSigil) {
    // sanitize - only allow ssb refs or http/s links
    try {
      var prot = decodeURIComponent(unescape(url.replace(/[^\w:]/g, ''))).toLowerCase();
    } catch (e) {
      return false;
    }
    if (prot.indexOf('http:') !== 0 && prot.indexOf('https:') !== 0 && prot.indexOf('data:') !== 0) {
      return false;
    }
  }

  // is this an ssb ref, or perhaps a ref within an HTTP url?
  var isSsbRef = ssbref.isLink(url)
  if (!isSsbRef) {
    // check if there's a ref inside somewhere
    var ref = ssbref.extract(url)
    if (ref) {
      url = ref
      isSsbRef = true
    }
  }

  // is this an @username mention?
  if (hasSigil && !isSsbRef && this.options.mentionNames) {
    // try a name lookup
    url = this.options.mentionNames[url.slice(1)]
    if (!url)
      return false
    isSsbRef = true
  }

  // use our own link if this is an ssb ref
  if (isSsbRef) {
    if (ssbref.isFeedId(url))
      return '#/profile/'+encodeURIComponent(url)
    else if (ssbref.isMsgId(url))
      return '#/msg/'+encodeURIComponent(url)
    else if (ssbref.isBlobId(url))
      return '/'+encodeURIComponent(url)
  }
  return url
}

// override to make http/s links external
blockRenderer.link = function(href, title, text) {
  href = this.urltransform(href)
  var out
  if (href !== false) {
    if ((href.indexOf('/%26') === 0 || href.indexOf('/&') === 0) && (title || text)) // add ?name param if this is a link to a blob
      href += '?name='+encodeURIComponent(title || text)
    out = '<a href="' + href + '"';
  } else
    out = '<a class="bad"'
  if (title) {
    out += ' title="' + title + '"';
  }

  // make a popup if http/s
  if (href && href.indexOf('http') === 0)
    out += ' target="_blank"'

  out += '>' + text + '</a>';
  return out;
};

blockRenderer.image  = function (href, title, text) {
  href = href.replace(/^&amp;/, '&')
  if (ssbref.isLink(href)) {
    var out = '<img src="/' + href + '?fallback=img" alt="' + text + '"'
    if (title) {
      out += ' title="' + title + '"'
    }
    out += '>'
    return out
  }
  return text
}

// inline renderer just spits out the text of links and images
inlineRenderer.urltransform = function (url) { return false }
inlineRenderer.link = function (href, title, text) { return sanitize(unquote(text)) }
inlineRenderer.image  = function (href, title, text) { return sanitize(unquote(text)) }
inlineRenderer.code = function(code, lang, escaped) { return sanitize(unquote(code)) }
inlineRenderer.blockquote = function(quote) { return sanitize(unquote(quote)) }
inlineRenderer.html = function(html) { return false }
inlineRenderer.heading = function(text, level, raw) { return '<strong>'+sanitize(unquote(text))+'</strong> ' }
inlineRenderer.hr = function() { return ' --- ' }
inlineRenderer.br = function() { return ' ' }
inlineRenderer.list = function(body, ordered) { return sanitize(unquote(body)) }
inlineRenderer.listitem = function(text) { return '- '+sanitize(unquote(text)) }
inlineRenderer.paragraph = function(text) { return sanitize(unquote(text))+' ' }
inlineRenderer.table = function(header, body) { return sanitize(unquote(header + ' ' + body)) }
inlineRenderer.tablerow = function(content) { return sanitize(unquote(content)) }
inlineRenderer.tablecell = function(content, flags) { return sanitize(unquote(content)) }
inlineRenderer.strong = function(text) { return '<strong>'+sanitize(unquote(text))+'</strong>' }
inlineRenderer.em = function(text) { return sanitize(unquote(text)) }
inlineRenderer.codespan = function(text) { return sanitize(unquote(text)) }
inlineRenderer.del = function(text) { return sanitize(unquote(text)) }
inlineRenderer.mention = function(preceding, id) { return sanitize(unquote((preceding||'') + id)) }
function unquote (text) {
  return text.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, '\'')
}
function sanitize (text) {
  return text.replace(/</g, '&lt;').replace(/>/, '&gt;')
}

marked.setOptions({
  gfm: true,
  mentions: true,
  tables: true,
  breaks: true,
  pedantic: false,
  sanitize: true,
  smartLists: true,
  smartypants: false,
  emoji: renderEmoji(16),
  renderer: blockRenderer
})

exports.block = function(text, mentionNames) {
  if (mentionNames && mentionNames.key && mentionNames.value) {
    // is a message, get the mentions links
    mentionNames = mlib.links(mentionNames.value.content.mentions, 'feed')
  }
  if (Array.isArray(mentionNames)) {
    // is an array of links, turn into an object map
    var n = {}
    mentionNames.forEach(function (link) {
      n[link.name] = link.link
    })
    mentionNames = n
  }

  return marked(''+(text||''), { mentionNames: mentionNames })
}

exports.inline = function(text) {
  return marked(''+(text||''), { renderer: inlineRenderer, emoji: renderEmoji(12) })
}

var emojiRegex = /(\s|>|^)?:([A-z0-9_]+):(\s|<|$)/g;
exports.emojis = function (str) {
  return str.replace(emojiRegex, function(full, $1, $2, $3) {
    return ($1||'') + renderEmoji(16)($2) + ($3||'')
  })
}

function renderEmoji (size) {
  size = size||20
  return function (emoji) {
    return emoji in emojiNamedCharacters ?
        '<img src="./img/emoji/' + encodeURI(emoji) + '.png"'
        + ' alt=":' + escape(emoji) + ':"'
        + ' title=":' + escape(emoji) + ':"'
        + ' class="emoji" align="absmiddle" height="'+size+'" width="'+size+'">'
      : ':' + emoji + ':'
    }
}
