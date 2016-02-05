'use babel'
import pull from 'pull-stream'
import moment from 'moment'
import React from 'react'
import ReactCSSTransitionGroup from 'react-addons-css-transition-group'
import ReactDOM from 'react-dom'
import schemas from 'ssb-msg-schemas'
import mlib from 'ssb-msgs'
import threadlib from 'patchwork-threads'
import ReactInfinite from 'react-infinite'
import classNames from 'classnames'
import ComposerCard from './composer/card'
import SimpleInfinite from './simple-infinite'
import ResponsiveElement from './responsive-element'
import Summary from './msg-view/summary'
import Thread from './msg-thread'
import { VerticalFilledContainer, verticalFilled } from './index'
import { isaReplyTo } from '../lib/msg-relation'
import app from '../lib/app'
import u from '../lib/util'

// how many messages to fetch in a batch?
const DEFAULT_BATCH_LOAD_AMT = 60

// what's the avg height a message will be?
// (used in loading calculations, when trying to scroll to a specific spot. doesnt need to be exact)
const AVG_RENDERED_MSG_HEIGHT = 50

// used when live msgs come in, how many msgs, from the top, should we check for deduplication?
const DEDUPLICATE_LIMIT = 100

// how many pixels from the bottom of the screen before we load the next batch?
const LOAD_BOTTOM_DISTANCE = 2000

export default class MsgList extends React.Component {
  constructor(props) {
    super(props)
    this.botcursor = null
    this.state = {
      msgs: [],
      currentOpenMsgKey: null,
      newMsgQueue: [], // used to store message updates that we dont want to render immediately
      selected: null,
      isLoading: false,
      isAtEnd: false,
      containerHeight: window.innerHeight
    }
    this.liveStream = null

    // handlers
    this.handlers = {
      onSelect: msg => {
        this.setState({ currentOpenMsgKey: msg.key }, () => {
          if (!this.refs.currentOpenMsg || !this.refs.container)
            return

          var dest = this.refs.currentOpenMsg.getScrollTop()
          if (dest === false)
            return
          this.refs.container.scrollTo(dest - 15)
        })
      },
      onToggleBookmark: (msg) => {
        // toggle in the DB
        app.ssb.patchwork.toggleBookmark(msg.key, (err, isBookmarked) => {
          if (err)
            return app.issue('Failed to toggle bookmark', err, 'Happened in onToggleBookmark of MsgList')

          // re-render
          msg.isBookmarked = isBookmarked
          incMsgChangeCounter(msg)
          this.setState(this.state)
        })
      },
      onToggleStar: (msg) => {
        // get current state
        msg.votes = msg.votes || {}
        let oldVote = msg.votes[app.user.id]
        let newVote = (oldVote === 1) ? 0 : 1

        // publish new message
        var voteMsg = schemas.vote(msg.key, newVote)
        let done = (err) => {
          if (err)
            return app.issue('Failed to publish vote', err, 'Happened in onToggleStar of MsgList')

          // re-render
          msg.votes[app.user.id] = newVote
          incMsgChangeCounter(msg)
          this.setState(this.state)
        }
        if (msg.plaintext)
          app.ssb.publish(voteMsg, done)
        else {
          let recps = mlib.links(msg.value.content.recps).map(l => l.link)
          app.ssb.private.publish(voteMsg, recps, done)
        }
      },
      onIsread: (e) => {
        // try to find the message
        for (var i=0; i < this.state.msgs.length; i++) {
          let msg = this.state.msgs[i]
          if (msg.key === e.key) {
            msg.hasUnread = !e.value
            incMsgChangeCounter(msg)
            this.setState({ msgs: this.state.msgs })
            return
          }
        }
      },
      onFlag: (msg, reason) => {
        if (!reason)
          throw new Error('reason is required')

        // publish new message
        const voteMsg = (reason === 'unflag') // special case
          ? schemas.vote(msg.key, 0)
          : schemas.vote(msg.key, -1, reason)
        let done = (err) => {
          if (err)
            return app.issue('Failed to publish flag', err, 'Happened in onFlag of MsgList')

          // re-render
          msg.votes = msg.votes || {}
          msg.votes[app.user.id] = (reason === 'unflag') ? 0 : -1
          incMsgChangeCounter(msg)
          this.setState(this.state)
        }
        if (msg.plaintext)
          app.ssb.publish(voteMsg, done)
        else {
          let recps = mlib.links(msg.value.content.recps).map(l => l.link)
          app.ssb.private.publish(voteMsg, recps, done)
        }
      }
    }
  }

  componentDidMount() {
    // load first messages
    var start = Date.now()
    this.loadMore({ amt: DEFAULT_BATCH_LOAD_AMT }, () => console.log(Date.now() - start))

    // setup autoresizing
    this.calcContainerHeight()
    this.resizeListener = this.calcContainerHeight.bind(this)
    window.addEventListener('resize', this.resizeListener)

    // listen to isread changes
    app.on('update:isread', this.handlers.onIsread)

    // setup livestream
    if (this.props.live)
      this.setupLivestream()
  }
  componentWillUnmount() {
    // stop listeners
    window.removeEventListener('resize', this.resizeListener)
    app.removeListener('update:isread', this.handlers.onIsread)
    if (this.liveStream)
      this.liveStream(true, ()=>{})
  }

  loadingElement() {
    return <div className="msg-view summary">
      Loading...
    </div>
  }

  reload(newState) {
    this.setState({ isAtEnd: false, newMsgQueue: [], ...newState }, () => {
      this.botcursor = null
      this.loadMore({ amt: DEFAULT_BATCH_LOAD_AMT, fresh: true })
    })
  }

  // helper to change the actively-viewed message
  // - msg: message object to select
  // - isFreshMsg: bool, was the message loaded in somewhere other than the msg list?
  //   - if true, will splice it into the list
  selectThread(thread, isFreshMsg) {
    // deselect toggle
    if (this.state.selected === thread)
      return this.setState({ selected: false })

    // splice the thread into the list, if it's new
    // that way, operations on the selected message will be reflected in the list
    if (isFreshMsg) {
      for (var i=0; i < this.state.msgs.length; i++) {
        if (this.state.msgs[i].key === thread.key) {
          this.state.msgs.splice(i, 1, thread)
          break
        }
      }
    }

    // update UI
    this.setState({ selected: thread, msgs: this.state.msgs })
  }
  deselectThread() {
    this.setState({ selected: false })
  }

  setupLivestream() {
    let source = this.props.source || app.ssb.createFeedStream
    let opts = (typeof this.props.live == 'object') ? this.props.live : {}
    opts.threads = this.props.threads
    opts.live = true
    opts.old = false
    this.liveStream = source(opts)
    pull(
      this.liveStream,
      pull.filter(msg => !msg.sync),
      pull.asyncMap((msg, cb) => threadlib.decryptThread(app.ssb, msg, cb)), // decrypt the message
      (this.props.filter) ? pull.filter(this.props.filter) : undefined, // run the fixed filter
      pull.asyncMap(this.processMsg.bind(this)), // fetch the thread
      (this.props.searchRegex) ? pull.filter(this.searchQueryFilter.bind(this)) : undefined,
      pull.drain(msg => {

        // do nothing if the thread is currently open
        if (this.state.currentOpenMsgKey === msg.key)
          return

        if (this.props.queueNewMsgs) {
          // suppress if by the local user
          const lastMsg = threadlib.getLastThreadPost(msg)
          if (lastMsg && lastMsg.value.author === app.user.id)
            return this.prependNewMsg(msg)

          // queue the new msgs on the ui
          this.state.newMsgQueue.push(msg)
          this.setState({ newMsgQueue: this.state.newMsgQueue })
        } else {
          // immediately render
          msg.isLiveUpdate = true
          this.prependNewMsg(msg)
        }
      })
    )
  }

  calcContainerHeight() {
    var height = window.innerHeight
    if (this.refs && this.refs.container) {
      var rect = ReactDOM.findDOMNode(this.refs.container).getClientRects()[0]
      if (!rect)
        return
      height = window.innerHeight - rect.top
    }
    this.setState({ containerHeight: height })
  }

  // infinite load call
  onInfiniteLoad(scrollingTo) {
    var amt = DEFAULT_BATCH_LOAD_AMT
    if (scrollingTo) {
      // trying to reach a dest, increase amount to load with a rough guess of how many are needed
      amt = Math.max((scrollingTo / AVG_RENDERED_MSG_HEIGHT)|0, DEFAULT_BATCH_LOAD_AMT)
    }
    this.loadMore({ amt })
  }

  onClickAnything(e) {
    // if the user clicks the background, close the thread
    for (var node = e.target; node; node = node.parentNode) {
      if (!node.classList)
        return
      if (node.classList.contains('msg-view') || node.classList.contains('items'))
        return // abort, it's a click within the messages
      if (node.classList.contains('msg-list')) {
        // reached our toplevel, lets close the thread
        this.setState({ currentOpenMsgKey: null })
        return
      }
    }
  }

  processMsg(msg, cb) {
    // fetch thread data if not already present (using `related` as an indicator of that)
    if (this.props.threads && msg.value && !('related' in msg)) {
      threadlib.getPostSummary(app.ssb, msg.key, cb)
    } else
      cb(null, msg) // noop
  }

  searchQueryFilter(thread) {
    // iterate the thread and its posts, looking for matches
    const regex = this.props.searchRegex
    if (checkMatch(thread))
      return true
    // if (!thread.related)
    //   return false
    // for (var i=0; i < thread.related.length; i++) {
    //   if (checkMatch(thread.related[i]))
    //     return true
    // }
    return false

    function checkMatch (msg) {
      if (msg.value.content.type !== 'post')
        return false
      return regex.test(''+msg.value.content.text)
    }
  }

  // load messages from the bottom of the list
  loadMore({ amt = 50, fresh = false } = {}, done) {
    if (this.state.isLoading || this.state.isAtEnd)
      return

    var lastmsg
    let source = this.props.source || app.ssb.createFeedStream
    let cursor = this.props.cursor || ((msg) => { if (msg) { return msg.value.timestamp } })
    let updatedMsgs = (fresh) ? [] : this.state.msgs

    this.setState({ isLoading: true })
    pull(
      source({ threads: this.props.threads, reverse: true, lt: cursor(this.botcursor) }),
      pull.through(msg => { lastmsg = msg }), // track last message processed
      pull.asyncMap((msg, cb) => threadlib.decryptThread(app.ssb, msg, cb)), // decrypt the message
      (this.props.filter) ? pull.filter(this.props.filter) : undefined, // run the fixed filter
      pull.asyncMap(this.processMsg.bind(this)), // fetch the thread
      (this.props.searchRegex) ? pull.filter(this.searchQueryFilter.bind(this)) : undefined,
      pull.take(amt), // apply limit
      pull.collect((err, msgs) => {
        if (err)
          console.warn('Error while fetching messages', err)

        // add msgs
        if (msgs)
          updatedMsgs = updatedMsgs.concat(msgs)

        // did we reach the end?
        var isAtEnd = false
        if (!lastmsg || (this.botcursor && this.botcursor.key == lastmsg.key))
          isAtEnd = true
        this.botcursor = lastmsg

        // update
        this.setState({ msgs: updatedMsgs, isLoading: false, isAtEnd: isAtEnd }, done)
      })
    )
  }

  // add messages to the top
  prependNewMsg(msgs) {
    var selected = this.state.selected
    msgs = Array.isArray(msgs) ? msgs : [msgs]
    msgs.forEach(msg => {

      // remove any noticeable duplicates...
      // check if the message is already in the first N and remove it if so
      for (var i=0; i < this.state.msgs.length && i < DEDUPLICATE_LIMIT; i++) {
        if (this.state.msgs[i].key === msg.key) {
          // hold onto the change counter
          msg.changeCounter = this.state.msgs[i].changeCounter
          // remove the old message
          this.state.msgs.splice(i, 1)
          break
        }
      }
      // add to start of msgs
      if (selected && selected.key === msg.key)
        selected = msg // update selected, in case we replaced the current msg
      incMsgChangeCounter(msg)
      this.state.msgs.unshift(msg)
    })
    this.setState({ msgs: this.state.msgs, selected: selected })
  }

  // flush queue into the page
  prependQueuedMsgs() {
    this.prependNewMsg(this.state.newMsgQueue)
    this.setState({ newMsgQueue: [] })
  }

  render() {
    const Hero = this.props.Hero
    const LeftNav = this.props.LeftNav
    const RightNav = this.props.RightNav
    const Toolbar = this.props.Toolbar
    const Infinite = this.props.listItemHeight ? ReactInfinite : SimpleInfinite // use SimpleInfinite if we dont know the height of each elem
    const ListItem = this.props.ListItem || Summary
    const currentKey = this.state.currentOpenMsgKey
    const isEmpty = (!this.state.isLoading && this.state.msgs.length === 0)
    const append = (this.state.isAtEnd && this.props.append) ? this.props.append() : ''
    const nQueued = this.state.newMsgQueue.length
    const endOfToday = moment().endOf('day')
    var lastDate = moment().startOf('day').add(1, 'day')
    return <div className="msg-list" onClick={this.onClickAnything.bind(this)}>
      <div className="msg-list-items flex-fill">
        { Toolbar ? <Toolbar/> : '' }
        <Infinite
          id="msg-list-infinite"
          ref="container"
          elementHeight={this.props.listItemHeight||60}
          containerHeight={this.state.containerHeight}
          infiniteLoadBeginBottomOffset={this.state.isAtEnd ? undefined : LOAD_BOTTOM_DISTANCE}
          onInfiniteLoad={this.onInfiniteLoad.bind(this)}
          loadingSpinnerDelegate={this.loadingElement()}
          isInfiniteLoading={this.state.isLoading}>
          <div className="flex">
            { LeftNav ? <LeftNav {...this.props.leftNavProps} /> : '' }
            <div className="flex-fill">
              { Hero ? <Hero/> : '' }
              { nQueued ?
                <a className="new-msg-queue" onClick={this.reload.bind(this)}>{nQueued} new update{u.plural(nQueued)}</a>
                : '' }
              { this.props.composer ? <ComposerCard {...this.props.composerProps} /> : '' }
              { this.state.msgs.length === 0 && this.state.isLoading ? <div style={{fontWeight: 300, textAlign: 'center'}}>Loading...</div> : '' }
              { isEmpty ?
                <div className="empty-msg">
                  { (this.props.emptyMsg || 'No messages.') }
                </div>
                :
                <ResponsiveElement widthStep={250}>
                  <ReactCSSTransitionGroup component="div" transitionName="fade" transitionAppear={true} transitionAppearTimeout={500} transitionEnterTimeout={500} transitionLeaveTimeout={1}>
                    { this.state.msgs.map((m, i) => {
                      // missing value?
                      if (!m.value)
                        return <span key={m.key} /> // dont render

                      // render item
                      const item = (currentKey === m.key)
                        ? <Thread
                            key={m}
                            ref="currentOpenMsg"
                            id={m.key}
                            live />
                        : <ListItem
                            key={m.key}
                            msg={m}
                            selectiveUpdate
                            {...this.handlers}
                            {...this.props.listItemProps}
                            forceRaw={this.props.forceRaw} />

                      // render a date divider if this post is from a different day than the last
                      const oldLastDate = lastDate
                      const lastPost = threadlib.getLastThreadPost(m)
                      lastDate = moment(lastPost.value.timestamp)
                      if (this.props.dateDividers && !lastDate.isSame(oldLastDate, 'day')) {
                        let label = (lastDate.isSame(endOfToday, 'day')) ? 'today' : lastDate.endOf('day').from(endOfToday)
                        return <div key={m.key} className="divider-spot"><hr className="labeled" data-label={label} />{item}</div>
                      }
                      return item
                    }) }
                  </ReactCSSTransitionGroup>
                </ResponsiveElement>
              }
              {append}
            </div>
            { RightNav ? <RightNav {...this.props.rightNavProps} /> : '' }
          </div>
        </Infinite>
      </div>
    </div>
  }
}

// this little hack helps us keep track of when we update a message, and should therefore re-render it
// msg-view/card and msg-view/oneline use this number in shouldComponentUpdate to decide the answer
function incMsgChangeCounter (msg) {
  msg.changeCounter = (msg.changeCounter || 0) + 1
}
