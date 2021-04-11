# Patchwork

> A decentralized messaging and sharing app built on top of Secure Scuttlebutt (SSB).

- Connect with friends without depending on any central servers.
- Don't worry about spam, you only get messages from people you follow.
- Use Patchwork online or offline, the data you need is stored on your device.
- Sync messages with friends when you're on the same Wi-Fi network.
- Keep secrets with private messages, which are *always* end-to-end encrypted.
- Change and improve Patchwork however you'd like, it's free and open source.

## Usage

![Screenshot of Patchwork][screenshot]

New to Scuttlebutt? Join the network by connecting to a [pub][pub].

1. Choose a pub from the [pub list][pub-list] and copy an invite code.
2. Open Patchwork and select *Join Pub*.
3. Paste the invite code and select *Redeem Invite*.

You're done! Check out `#new-people` to see who else has recently joined.

## Installation

Most people should **[download Patchwork for Windows, macOS, or Linux][gh-dl]**.

Alternatively, you can install Patchwork with your favorite package manager.

- **[npm][npm]:** `npm install --global ssb-patchwork`
- **[yarn][yarn]:** `yarn global add ssb-patchwork`
- **[brew][brew]:** `brew install --cask patchwork`
- **[yay][yay]:** `yay -S ssb-patchwork`

Building from source? Check out [`INSTALL.md`][install] for more information.

## Contributing

Create a [new issue][new-issue] to report problems or request features. See
[`CONTRIBUTING.md`][contributing] for more information on how to get involved.
You can also support the project via [donations](https://opencollective.com/patchwork/).

Please note that this project is released with a [Contributor Code of
Conduct][conduct]. By participating in this project you agree to abide by its
terms.

## See Also

- [patchbay][patchbay]
- [ssb-server][ssb-server]
- [manyverse][manyverse]

## License

[AGPL-3.0][license]

[brew]: https://brew.sh
[conduct]: docs/CODE_OF_CONDUCT.md
[contributing]: docs/CONTRIBUTING.md
[gh-dl]: https://github.com/ssbc/patchwork/releases/latest
[install]: docs/INSTALL.md
[license]: LICENSE
[manyverse]: https://gitlab.com/staltz/manyverse
[new-issue]: https://github.com/fraction/readme-boilerplate/issues/new
[npm]: https://npmjs.org/
[patchbay]: https://github.com/ssbc/patchbay
[pub-list]: https://github.com/ssbc/ssb-server/wiki/Pub-Servers
[pub]: https://www.scuttlebutt.nz/concepts/pub.html
[screenshot]: assets/screenshot.jpg
[ssb-server]: https://github.com/ssbc/ssb-server
[yarn]: https://yarnpkg.com/en/
[yay]: https://github.com/Jguer/yay
