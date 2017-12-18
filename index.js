process.on('uncaughtException', function (err) {
  console.log(err)
  process.exit()
})

var electron = require('electron')
var openWindow = require('./lib/window')

var Path = require('path')
var defaultMenu = require('electron-default-menu')
var WindowState = require('electron-window-state')
var Menu = electron.Menu
var extend = require('xtend')
var ssbKeys = require('ssb-keys')

var windows = {
  dialogs: new Set()
}
var ssbConfig = null
var quitting = false
var windowVisible = true
// TODO: dependencies for tray settings

electron.app.on('ready', () => {
  setupContext('ssb', {
    server: !(process.argv.includes('-g') || process.argv.includes('--use-global-ssb'))
  }, () => {
    var menu = defaultMenu(electron.app, electron.shell)
    var view = menu.find(x => x.label === 'View')
    view.submenu = [
      { role: 'reload' },
      { role: 'toggledevtools' },
      { type: 'separator' },
      { role: 'resetzoom' },
      { role: 'zoomin' },
      { role: 'zoomout' },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ]
    if (process.platform === 'darwin') {
      var win = menu.find(x => x.label === 'Window')
      win.submenu = [
        { role: 'minimize' },
        { role: 'zoom' },
        { role: 'close', label: 'Close' },
        { type: 'separator' },
        { role: 'front' }
      ]
    }
    Menu.setApplicationMenu(Menu.buildFromTemplate(menu))
    openMainWindow()
  })

  electron.app.on('activate', function (e) {
    if (windows.main) {
      windows.main.show()
    }
  })

  electron.app.on('before-quit', function () {
    quitting = true
  })

  electron.ipcMain.on('open-background-devtools', function (ev, config) {
    if (windows.background) {
      windows.background.webContents.openDevTools({detach: true})
    }
  })

  var tray = new electron.Tray('./assets/icon.png')
  var contextMenu = Menu.buildFromTemplate([
    {label: 'Toggle Visibility', click: function () {
      toggleWindow()
      }
    },
    {label: 'Quit', click: function () {
      quitting = true
      electron.app.quit()
    }}
  ])
  tray.setToolTip('Patchwork')
  tray.setContextMenu(contextMenu)
  tray.on('click', () => {
    toggleWindow()
  })
})

function toggleWindow() {
  if (windowVisible) {
    windowVisible = false
    windows.main.hide()
  } else {
    windowVisible = true
    windows.main.show()
  }
}

function openMainWindow () {
  if (!windows.main) {
    var windowState = WindowState({
      defaultWidth: 1024,
      defaultHeight: 768
    })
    windows.main = openWindow(ssbConfig, Path.join(__dirname, 'main-window.js'), {
      minWidth: 800,
      x: windowState.x,
      y: windowState.y,
      width: windowState.width,
      height: windowState.height,
      titleBarStyle: 'hidden-inset',
      autoHideMenuBar: true,
      title: 'Patchwork',
      show: true,
      backgroundColor: '#EEE',
      icon: './assets/icon.png'
    })
    windowState.manage(windows.main)
    windows.main.setSheetOffset(40)
    windows.main.on('close', function (e) {
      if (!quitting) { // TODO: and darwin or not quit and trayEnabled + minimizeOnClose
        e.preventDefault()
        toggleWindow()
      }
      return false
    })
    windows.main.on('closed', function () {
      windows.main = null
      if (process.platform !== 'darwin') electron.app.quit()
    })

    windows.main.on('minimize', function (e) {
      // TODO: if trayEnabled and minimizeToTray
      e.preventDefault()
      toggleWindow()
    })
  }
}

function setupContext (appName, opts, cb) {
  ssbConfig = require('ssb-config/inject')(appName, extend({
    port: 8008,
    blobsPort: 7777,
    friends: {
      dunbar: 150,
      hops: 2 // down from 3
    }
  }, opts))

  console.log(ssbConfig)

  ssbConfig.keys = ssbKeys.loadOrCreateSync(Path.join(ssbConfig.path, 'secret'))

  // fix offline on windows by specifying 127.0.0.1 instead of localhost (default)
  var id = ssbConfig.keys.id
  ssbConfig.remote = `net:127.0.0.1:${ssbConfig.port}~shs:${id.slice(1).replace('.ed25519', '')}`

  if (opts.server === false) {
    cb && cb()
  } else {
    electron.ipcMain.once('server-started', function (ev, config) {
      ssbConfig = config
      cb && cb()
    })
    windows.background = openWindow(ssbConfig, Path.join(__dirname, 'server-process.js'), {
      connect: false,
      center: true,
      fullscreen: false,
      fullscreenable: false,
      height: 150,
      maximizable: false,
      minimizable: false,
      resizable: false,
      show: false,
      skipTaskbar: true,
      title: 'patchwork-server',
      useContentSize: true,
      width: 150
    })
    // windows.background.on('close', (ev) => {
    //   ev.preventDefault()
    //   windows.background.hide()
    // })
  }
}
