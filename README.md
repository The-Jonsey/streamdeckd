
# Streamdeckd
## A NodeJS Elgato Streamdeck controller daemon with d-bus support  

# Deprecated
## Please use [unix-streamdeck/streamdeckd](https://github.com/unix-streamdeck/streamdeckd) instead
  
### Installation  
  
As this uses the [Elgato Stream Deck Library](https://www.npmjs.com/package/elgato-stream-deck), you will need to follow   
the installation process for that, which includes taking steps to allow node to access the streamdeck via udev. these steps include:  
  
- create the file `/etc/udev/rules.d/50-elgato.rules` with the following config  
```  
SUBSYSTEM=="input", GROUP="input", MODE="0666"  
SUBSYSTEM=="usb", ATTRS{idVendor}=="0fd9", ATTRS{idProduct}=="0060", MODE:="666", GROUP="plugdev"  
SUBSYSTEM=="usb", ATTRS{idVendor}=="0fd9", ATTRS{idProduct}=="0063", MODE:="666", GROUP="plugdev"  
SUBSYSTEM=="usb", ATTRS{idVendor}=="0fd9", ATTRS{idProduct}=="006c", MODE:="666", GROUP="plugdev"  
SUBSYSTEM=="usb", ATTRS{idVendor}=="0fd9", ATTRS{idProduct}=="006d", MODE:="666", GROUP="plugdev"  
```  
  
- run `sudo udevadm control --reload-rules` to reload the udev rules  
  
Then xdotool will be required to simulate keypresses, to install this run:  
  
#### Arch  
  
`sudo pacman -S xdotool`  
  
#### Debian based  
  
`sudo apt install xdotool`   


#### Then to install this package run:  

`sudo npm install -g streamdeckd`  
  
### Usage  
  
run `streamdeckd` to start the daemon and add to your desktop environments startup apps to start on login

### Configuration

There are two ways to configure streamdeckd

#### Graphical Configuration

You can use the graphical streamdeckd configuration tool found [here](https://github.com/the-jonsey/streamdeck-editor).

#### Manual configuration

The configuration file streamdeckd uses is a JSON file found at `~/.streamdeck-config.json`

An example config would be something like:

```json
{
  "handlers": {},
  "pages": [
    [
      {
        "switch_page": 1,
        "icon": "~/icon.png"
      }
    ]
  ]
}
```

The outer array is the list of pages, the inner array is the list of button on that page, with the buttons going in a right to left order.

The actions you can have on a button are:

- `command`: runs a native shell command, something like `notify-send "Hello World"`
- `keybind`: simulates the indicated keybind via xdtotool
- `url`: opens a url in your default browser via xdg
- `brightness`: set the brightness of the streamdeck as a percentage
- `write`: Write out a provided string via xdotool
- `switch_page`: change the active page on the streamdeck

#### Handlers

The config for custom handlers can be written as:

```json
{
  "Gif": {
    "script_path": "./gif-handler",
    "types": ["key", "icon"],
    "iconFields": {
      "text": {
        "type": "text"
      },
      "icon": {
        "type": "file",
	    "accept": ".gif"
      }
    },
    "keyFields": {
      "command": {
        "type": "text"
      }
    }
  }
}
```

The fields are as listed below:

- `script_path`: The path of the handler script
- `types`: The types of actions it is available for, `key` is for on keypress, `icon` is for controlling the image shown on the key's screen
- `icon/keyFields`: The fields to show on the editor for if it is being used for key/icon
    - `type`: The type of field to be shown, currently limited to file and text
    - `accept`: Only applicable to file inputs, a comma separated list of file extensions to accept

### D-Bus

There is a D-Bus interface built into the daemon, the service name and interface for D-Bus are `com.thejonsey.streamdeck` and `com/thejonsey/streamdeck` respectively, and is made up of the following methods/signals

#### Methods

- GetConfig  - returns the current running config
- SetConfig  - sets the config, without saving to disk, takes in Stringified json, returns an error if anything breaks
- ReloadConfig  - reloads the config from disk
- GetDeckInfo  - Returns information about the active streamdeck in the format of 
```json
{
  "icon_size": 72,
  "rows": 3,
  "cols": 5,
  "page": 0
}
```
- SetPage - Set the page on the streamdeck to the number passed to it, returns an error if anything breaks
- CommitConfig  - Commits the currently active config to disk, returns an error if anything breaks

#### Signals

- Page - sends the number of the page switched to on the StreamDeck

### Writing custom handlers

To write a custom handler, you create a js file where the module.exports includes (where applicable):

A class under module.exports.icon to handle the icon shown on the streamdeck, the fields passed to the constructor are:

- The current page number
- The index of the button on the page
- Methods to generate an image buffer and set the icon on the screen

A function under module.exports.key to handle the event of a key being pressed, the fields passed to the function are:

- The current page number
- The index of the button on the page
- The object of the key, as defined in the config, it may have additional fields as defined by the icon handler
