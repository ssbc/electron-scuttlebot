'use babel'
import React from 'react'
import Thread from '../com/msg-thread'
import mlib from 'ssb-msgs'
import app from '../lib/app'
import u from '../lib/util'

export default class Msg extends React.Component {
  render() {
    const id = this.props.params && this.props.params.id
    return <div id="msg"><Thread id={id} live /></div>
  }
}