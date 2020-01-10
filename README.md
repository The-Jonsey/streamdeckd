
# Streamdeckd  
## A NodeJS Elgato Streamdeck controller daemon with d-bus support  
  
### Installation  
  
As this uses the [Elgato Stream Deck Library](https://www.npmjs.com/package/elgato-stream-deck), you will need to follow   
the installation process for that, which includes setting up allowing node to access the streamdeck via udev. to set this up:  
  
- create the file `/etc/udev/rules.d/50-elgato.rules` with the following config  
```  
SUBSYSTEM=="input", GROUP="input", MODE="0666"  
SUBSYSTEM=="usb", ATTRS{idVendor}=="0fd9", ATTRS{idProduct}=="0060", MODE:="666", GROUP="plugdev"  
SUBSYSTEM=="usb", ATTRS{idVendor}=="0fd9", ATTRS{idProduct}=="0063", MODE:="666", GROUP="plugdev"  
SUBSYSTEM=="usb", ATTRS{idVendor}=="0fd9", ATTRS{idProduct}=="006c", MODE:="666", GROUP="plugdev"  
SUBSYSTEM=="usb", ATTRS{idVendor}=="0fd9", ATTRS{idProduct}=="006d", MODE:="666", GROUP="plugdev"  
```  
  
- run `sudo udevadm control --reload-rules` to reload the udev rules  
  
Then xdotool will be required to simulate keypress. to install this run:  
  
#### Arch  
  
`sudo pacman -S xdotool`  
  
#### Debian based  
  
`sudo apt install xdotool`   
Then to install this package run:  
  
`sudo npm install -g streamdeckd`  
  
### Usage  
  
run `streamdeckd` to start the daemon and add to your desktop environments startup apps to start on login

### Configuration

There are 2 ways to configure streamdeckd

#### Graphical Configuration

You can use the graphical streamdeckd configuration tool found [here](https://github.com/the-jonsey/streamdeck-editor).

#### Manual configuration

The configuration file streamdeckd uses is a JSON file found at `~/.streamdeck-config.json`

An example config would be something like:

```json
[
  [
    {
      "switch_page": 1,
      "icon": "~/icon.png"
    }
  ]
]
```

The outer array is the list of pages, the inner array is the list of button on that page, with the buttons going in a right to left order.

The `switch_page` is the action of the button, to switch the active page to the indicated page, in this case, 1.

The other types of actions you can have on a button are:

- `command`: which is just a native shell command, something like `notify-send "Hello World"`
- `keybind`: which will simulate the indicated keybind via xdtotool
- `url`: which will open a url in your default browser via xdg
- `brightness`: Set the brightness of the streamdeck as a percentage
- `write`: Write out a provided string via xdotool

### D-Bus

There is a D-Bus interface built into the daemon, the service name and interface for D-Bus are `com.thejonsey.streamdeck` and `com/thejonsey/streamdeck` respectively, and is made up of the following methods/signals

#### Methods

- GetConfig  - returns the current running config
- SetConfig  - sets the config, without saving to disk, takes in Stringified json, and returns `SUCCESS` and `ERROR` if something went wrong
- ReloadConfig  - reloads the config from disk
- GetDeckInfo  - Returns information about the active streamdeck in the format of 
```json
{
  "icon_size": 72,
  "rows": 3,
  "cols": 5
}
```
- SetPage - Set the page on the streamdeck to the number passed to it and returns `SUCCESS` and `ERROR` if something went wrong
- CommitConfig  - Commits the currently active config to disk, returns `SUCCESS` and `ERROR` if something went wrong

#### Signals

- Page - sends the number of the page switched to on the StreamDeck
